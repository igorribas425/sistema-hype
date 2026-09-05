-- ============================================================
-- HYPE LOUNGE CLUB // V34
-- CHECK-IN AO VIVO + PESQUISA POS-EVENTO
-- Execute UMA VEZ depois da V33.
-- Nao apaga eventos, ingressos, promoters, sorteios ou dispositivos.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) CHECK-IN AO VIVO DO ADMIN
-- ------------------------------------------------------------
create or replace function public.staff_live_checkin_v34(
  p_username text,
  p_password text,
  p_event_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  s public.staff_users%rowtype;
  e public.events%rowtype;
  v_paid bigint := 0;
  v_entered bigint := 0;
  v_inside bigint := 0;
  v_temp_out bigint := 0;
  v_remaining bigint := 0;
  v_reentries bigint := 0;
  v_last_log bigint := 0;
  v_timeline jsonb := '[]'::jsonb;
begin
  select u.* into s
  from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;

  if not found or s.role not in ('admin','gerente','caixa') then
    raise exception 'Sem permissao';
  end if;

  select x.* into e from public.events x where x.id=p_event_id limit 1;
  if not found then raise exception 'Evento nao encontrado'; end if;

  select
    count(*) filter(where t.payment_status='Pago'),
    count(*) filter(where t.payment_status='Pago' and t.entry_status='Entrada utilizada'),
    count(*) filter(where t.payment_status='Pago' and t.entry_status='Entrada utilizada' and not coalesce(t.temporary_exit,false)),
    count(*) filter(where t.payment_status='Pago' and t.entry_status='Entrada utilizada' and coalesce(t.temporary_exit,false)),
    count(*) filter(where t.payment_status='Pago' and coalesce(t.entry_status,'')<>'Entrada utilizada'),
    coalesce(sum(coalesce(t.reentry_count,0)) filter(where t.payment_status='Pago'),0)
  into v_paid,v_entered,v_inside,v_temp_out,v_remaining,v_reentries
  from public.tickets t
  where t.event_id=p_event_id;

  select coalesce(max(l.id),0) into v_last_log
  from public.portaria_logs_v18 l
  join public.tickets t on t.id=l.ticket_id
  where t.event_id=p_event_id
    and l.action in ('ENTRY','TEMPORARY_EXIT','REENTRY');

  with event_logs as (
    select
      l.id,
      l.created_at,
      l.action,
      case
        when l.action='ENTRY' then 1
        when l.action='REENTRY' then 1
        when l.action='TEMPORARY_EXIT' then -1
        else 0
      end as delta
    from public.portaria_logs_v18 l
    join public.tickets t on t.id=l.ticket_id
    where t.event_id=p_event_id
      and l.action in ('ENTRY','TEMPORARY_EXIT','REENTRY')
  ), running as (
    select
      id,created_at,action,
      greatest(sum(delta) over(order by created_at,id rows between unbounded preceding and current row),0)::bigint as inside_count
    from event_logs
  ), recent as (
    select * from running order by created_at desc,id desc limit 500
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',r.id,
        'at',r.created_at,
        'action',r.action,
        'inside',r.inside_count
      ) order by r.created_at,r.id
    ),
    '[]'::jsonb
  ) into v_timeline
  from recent r;

  return jsonb_build_object(
    'event_id',e.id,
    'event_name',e.name,
    'event_date',e.event_date,
    'paid_total',coalesce(v_paid,0),
    'entered_total',coalesce(v_entered,0),
    'inside_now',coalesce(v_inside,0),
    'temporary_out',coalesce(v_temp_out,0),
    'remaining',coalesce(v_remaining,0),
    'reentries',coalesce(v_reentries,0),
    'last_log_id',coalesce(v_last_log,0),
    'timeline',coalesce(v_timeline,'[]'::jsonb),
    'server_time',now()
  );
end;
$$;

grant execute on function public.staff_live_checkin_v34(text,text,bigint) to anon,authenticated;

-- ------------------------------------------------------------
-- 2) PESQUISA POS-EVENTO
-- Somente quem realmente entrou no evento recebe convite.
-- ------------------------------------------------------------
create table if not exists public.event_survey_invites_v34 (
  token uuid primary key default gen_random_uuid(),
  event_id bigint not null references public.events(id) on delete cascade,
  ticket_id bigint not null unique references public.tickets(id) on delete cascade,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  sent_count integer not null default 0,
  responded_at timestamptz
);

create index if not exists idx_event_survey_invites_v34_event
  on public.event_survey_invites_v34(event_id,created_at desc);

create table if not exists public.event_survey_responses_v34 (
  id bigserial primary key,
  invite_token uuid not null unique references public.event_survey_invites_v34(token) on delete cascade,
  event_id bigint not null references public.events(id) on delete cascade,
  ticket_id bigint not null unique references public.tickets(id) on delete cascade,
  rating integer not null check(rating between 1 and 5),
  would_return boolean,
  comment text,
  submitted_at timestamptz not null default now()
);

create index if not exists idx_event_survey_responses_v34_event
  on public.event_survey_responses_v34(event_id,submitted_at desc);

alter table public.event_survey_invites_v34 enable row level security;
alter table public.event_survey_responses_v34 enable row level security;
revoke all on public.event_survey_invites_v34 from anon,authenticated;
revoke all on public.event_survey_responses_v34 from anon,authenticated;

-- Gera/retorna os convites somente para ingressos PAGOS que efetivamente entraram.
create or replace function public.staff_survey_attendees_v34(
  p_username text,
  p_password text,
  p_event_id bigint
)
returns table(
  ticket_id bigint,
  customer_name text,
  phone text,
  email text,
  invite_token text,
  sent_at timestamptz,
  sent_count integer,
  responded boolean
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare s public.staff_users%rowtype;
begin
  select u.* into s
  from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;

  if not found or s.role not in ('admin','gerente') then
    raise exception 'Sem permissao';
  end if;

  if not exists(select 1 from public.events e where e.id=p_event_id) then
    raise exception 'Evento nao encontrado';
  end if;

  insert into public.event_survey_invites_v34(event_id,ticket_id)
  select t.event_id,t.id
  from public.tickets t
  where t.event_id=p_event_id
    and t.payment_status='Pago'
    and t.entry_status='Entrada utilizada'
  on conflict(ticket_id) do nothing;

  return query
  select
    t.id,
    t.customer_name,
    coalesce(t.phone,''),
    coalesce(t.email,''),
    i.token::text,
    i.sent_at,
    i.sent_count,
    (i.responded_at is not null)
  from public.event_survey_invites_v34 i
  join public.tickets t on t.id=i.ticket_id
  where i.event_id=p_event_id
  order by coalesce(t.entry_at,t.purchased_at) desc,t.id desc;
end;
$$;

grant execute on function public.staff_survey_attendees_v34(text,text,bigint) to anon,authenticated;

create or replace function public.staff_survey_report_v34(
  p_username text,
  p_password text,
  p_event_id bigint
)
returns jsonb
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  s public.staff_users%rowtype;
  v_eligible bigint:=0;
  v_invited bigint:=0;
  v_answers bigint:=0;
  v_avg numeric:=0;
  v_return_yes bigint:=0;
  v_comments jsonb:='[]'::jsonb;
begin
  select u.* into s
  from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;

  if not found or s.role not in ('admin','gerente') then
    raise exception 'Sem permissao';
  end if;

  select count(*) into v_eligible
  from public.tickets t
  where t.event_id=p_event_id
    and t.payment_status='Pago'
    and t.entry_status='Entrada utilizada';

  select count(*) filter(where i.sent_at is not null) into v_invited
  from public.event_survey_invites_v34 i
  where i.event_id=p_event_id;

  select
    count(*),
    coalesce(round(avg(r.rating)::numeric,2),0),
    count(*) filter(where r.would_return=true)
  into v_answers,v_avg,v_return_yes
  from public.event_survey_responses_v34 r
  where r.event_id=p_event_id;

  select coalesce(jsonb_agg(x.obj order by x.submitted_at desc),'[]'::jsonb)
  into v_comments
  from (
    select
      jsonb_build_object(
        'name',t.customer_name,
        'rating',r.rating,
        'would_return',r.would_return,
        'comment',coalesce(r.comment,''),
        'submitted_at',r.submitted_at
      ) obj,
      r.submitted_at
    from public.event_survey_responses_v34 r
    join public.tickets t on t.id=r.ticket_id
    where r.event_id=p_event_id
    order by r.submitted_at desc
    limit 100
  ) x;

  return jsonb_build_object(
    'eligible_count',coalesce(v_eligible,0),
    'invited_count',coalesce(v_invited,0),
    'response_count',coalesce(v_answers,0),
    'average_rating',coalesce(v_avg,0),
    'would_return_yes',coalesce(v_return_yes,0),
    'comments',coalesce(v_comments,'[]'::jsonb)
  );
end;
$$;

grant execute on function public.staff_survey_report_v34(text,text,bigint) to anon,authenticated;

-- Publico, mas o token e individual e imprevisivel.
create or replace function public.public_survey_open_v34(p_token text)
returns table(
  event_name text,
  event_date date,
  venue text,
  already_responded boolean
)
language sql
security definer
set search_path=public
as $$
  select
    e.name,
    e.event_date,
    coalesce(e.venue,''),
    (i.responded_at is not null)
  from public.event_survey_invites_v34 i
  join public.events e on e.id=i.event_id
  where i.token::text=trim(p_token)
  limit 1;
$$;

grant execute on function public.public_survey_open_v34(text) to anon,authenticated;

create or replace function public.public_survey_submit_v34(
  p_token text,
  p_rating integer,
  p_would_return boolean,
  p_comment text
)
returns boolean
language plpgsql
security definer
set search_path=public
as $$
declare i public.event_survey_invites_v34%rowtype;
begin
  if p_rating is null or p_rating<1 or p_rating>5 then
    raise exception 'Escolha uma nota de 1 a 5';
  end if;

  select x.* into i
  from public.event_survey_invites_v34 x
  where x.token::text=trim(p_token)
  for update;

  if not found then raise exception 'Link da pesquisa invalido'; end if;
  if i.responded_at is not null then raise exception 'Esta pesquisa ja foi respondida'; end if;

  insert into public.event_survey_responses_v34(
    invite_token,event_id,ticket_id,rating,would_return,comment
  ) values (
    i.token,i.event_id,i.ticket_id,p_rating,p_would_return,left(trim(coalesce(p_comment,'')),1200)
  );

  update public.event_survey_invites_v34
  set responded_at=now()
  where token=i.token;

  return true;
end;
$$;

grant execute on function public.public_survey_submit_v34(text,integer,boolean,text) to anon,authenticated;

-- A Edge Function usa service-role para marcar o envio bem sucedido.
-- FIM V34
