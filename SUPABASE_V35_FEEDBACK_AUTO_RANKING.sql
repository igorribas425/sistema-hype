-- ============================================================
-- HYPE LOUNGE CLUB // V35
-- FEEDBACK AUTOMATICO POS-EVENTO + RANKING NO ADMIN
-- Execute DEPOIS da V34.
-- Nao apaga ingressos, eventos, respostas ou configuracoes existentes.
-- ============================================================

create extension if not exists pgcrypto;

-- Controle idempotente do disparo automatico quando a Portaria vira para o proximo evento.
create table if not exists public.event_feedback_dispatch_v35 (
  event_id bigint primary key references public.events(id) on delete cascade,
  status text not null default 'processing',
  triggered_at timestamptz not null default now(),
  completed_at timestamptz,
  email_sent integer not null default 0,
  whatsapp_sent integer not null default 0,
  failed integer not null default 0,
  last_error text
);

alter table public.event_feedback_dispatch_v35 enable row level security;
revoke all on public.event_feedback_dispatch_v35 from anon, authenticated;

-- Canais separados por convite. Mantemos sent_at para compatibilidade com a V34.
alter table public.event_survey_invites_v34
  add column if not exists email_sent_at timestamptz,
  add column if not exists whatsapp_sent_at timestamptz,
  add column if not exists whatsapp_message_id text,
  add column if not exists whatsapp_error text;

-- Migra o que ja havia sido enviado por e-mail na V34.
update public.event_survey_invites_v34
set email_sent_at = coalesce(email_sent_at, sent_at)
where sent_at is not null and email_sent_at is null;

-- A Portaria pode solicitar o disparo somente para um evento realmente encerrado.
-- Se p_event_id vier null, escolhe o evento encerrado mais recente que ainda nao concluiu o feedback.
create or replace function public.portaria_feedback_claim_v35(
  p_device_key text,
  p_event_id bigint default null
)
returns table(
  ok boolean,
  event_id bigint,
  event_name text,
  event_date date,
  already_completed boolean,
  reason text
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_device uuid;
  v_event public.events%rowtype;
  v_now timestamp without time zone;
  v_dispatch public.event_feedback_dispatch_v35%rowtype;
begin
  v_device := public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;

  v_now := timezone('America/Sao_Paulo', now());

  if p_event_id is not null then
    select e.* into v_event from public.events e where e.id=p_event_id limit 1;
  else
    select e.* into v_event
    from public.events e
    where e.event_date is not null
      and v_now >= (e.event_date::timestamp + interval '1 day 8 hours')
      and exists (
        select 1 from public.tickets t
        where t.event_id=e.id
          and t.payment_status='Pago'
          and t.entry_status='Entrada utilizada'
      )
      and not exists (
        select 1 from public.event_feedback_dispatch_v35 d
        where d.event_id=e.id and d.status='completed'
      )
    order by e.event_date desc,e.id desc
    limit 1;
  end if;

  if not found then
    return query select false,null::bigint,null::text,null::date,false,'Nenhum evento encerrado aguardando feedback'::text;
    return;
  end if;

  if v_event.event_date is null or v_now < (v_event.event_date::timestamp + interval '1 day 8 hours') then
    return query select false,v_event.id,v_event.name,v_event.event_date,false,'Evento ainda nao encerrou a janela da Portaria ate 08:00'::text;
    return;
  end if;

  select d.* into v_dispatch from public.event_feedback_dispatch_v35 d where d.event_id=v_event.id;
  if found and v_dispatch.status='completed' then
    return query select false,v_event.id,v_event.name,v_event.event_date,true,'Feedback automatico ja concluido para este evento'::text;
    return;
  end if;

  insert into public.event_feedback_dispatch_v35(event_id,status,triggered_at,last_error)
  values(v_event.id,'processing',now(),null)
  on conflict(event_id) do update
    set status='processing',triggered_at=now(),last_error=null;

  return query select true,v_event.id,v_event.name,v_event.event_date,false,'Disparo liberado'::text;
end;
$$;

grant execute on function public.portaria_feedback_claim_v35(text,bigint) to anon,authenticated;

-- Relatorio V35: mantem os campos da V34 e acrescenta ranking 1..5 + canais automaticos.
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
  v_r1 bigint:=0; v_r2 bigint:=0; v_r3 bigint:=0; v_r4 bigint:=0; v_r5 bigint:=0;
  v_email bigint:=0; v_whatsapp bigint:=0;
  v_dispatch jsonb:='{}'::jsonb;
begin
  select u.* into s
  from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;

  if not found or s.role not in ('admin','gerente') then raise exception 'Sem permissao'; end if;

  select count(*) into v_eligible
  from public.tickets t
  where t.event_id=p_event_id
    and t.payment_status='Pago'
    and t.entry_status='Entrada utilizada';

  select
    count(*) filter(where coalesce(i.email_sent_at,i.sent_at) is not null or i.whatsapp_sent_at is not null),
    count(*) filter(where coalesce(i.email_sent_at,i.sent_at) is not null),
    count(*) filter(where i.whatsapp_sent_at is not null)
  into v_invited,v_email,v_whatsapp
  from public.event_survey_invites_v34 i
  where i.event_id=p_event_id;

  select
    count(*),
    coalesce(round(avg(r.rating)::numeric,2),0),
    count(*) filter(where r.would_return=true),
    count(*) filter(where r.rating=1),
    count(*) filter(where r.rating=2),
    count(*) filter(where r.rating=3),
    count(*) filter(where r.rating=4),
    count(*) filter(where r.rating=5)
  into v_answers,v_avg,v_return_yes,v_r1,v_r2,v_r3,v_r4,v_r5
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

  select coalesce(to_jsonb(d),'{}'::jsonb)
  into v_dispatch
  from public.event_feedback_dispatch_v35 d
  where d.event_id=p_event_id;

  return jsonb_build_object(
    'eligible_count',coalesce(v_eligible,0),
    'invited_count',coalesce(v_invited,0),
    'email_sent_count',coalesce(v_email,0),
    'whatsapp_sent_count',coalesce(v_whatsapp,0),
    'response_count',coalesce(v_answers,0),
    'average_rating',coalesce(v_avg,0),
    'would_return_yes',coalesce(v_return_yes,0),
    'rating_1',coalesce(v_r1,0),
    'rating_2',coalesce(v_r2,0),
    'rating_3',coalesce(v_r3,0),
    'rating_4',coalesce(v_r4,0),
    'rating_5',coalesce(v_r5,0),
    'comments',coalesce(v_comments,'[]'::jsonb),
    'dispatch',coalesce(v_dispatch,'{}'::jsonb)
  );
end;
$$;

grant execute on function public.staff_survey_report_v34(text,text,bigint) to anon,authenticated;

select 'HYPE V35 OK - feedback automatico + ranking + canais' as status;

-- Lista V35 com status separado de Gmail e WhatsApp.
create or replace function public.staff_survey_attendees_v35(
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
  email_sent_at timestamptz,
  whatsapp_sent_at timestamptz,
  whatsapp_error text,
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
  if not found or s.role not in ('admin','gerente') then raise exception 'Sem permissao'; end if;

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
    i.email_sent_at,
    i.whatsapp_sent_at,
    coalesce(i.whatsapp_error,''),
    (i.responded_at is not null)
  from public.event_survey_invites_v34 i
  join public.tickets t on t.id=i.ticket_id
  where i.event_id=p_event_id
  order by coalesce(t.entry_at,t.purchased_at) desc,t.id desc;
end;
$$;

grant execute on function public.staff_survey_attendees_v35(text,text,bigint) to anon,authenticated;
