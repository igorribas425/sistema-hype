-- HYPE V50: event-aware guest-list applications with private photo review.

alter table public.guest_list_simple_v406
  add column if not exists email text,
  add column if not exists instagram text,
  add column if not exists photo_path text,
  add column if not exists photo_consent boolean not null default false,
  add column if not exists reviewed_by text,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text not null default '',
  add column if not exists email_sent_at timestamptz,
  add column if not exists email_error text;

alter table public.guest_list_simple_v406
  drop constraint if exists guest_list_simple_v406_status_check;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.guest_list_simple_v406'::regclass
      and conname = 'hype_guest_list_status_v50_check'
  ) then
    alter table public.guest_list_simple_v406
      add constraint hype_guest_list_status_v50_check
      check (status in ('Pendente','Liberado','Entrou','Cancelado'));
  end if;
end;
$$;

create index if not exists hype_guest_list_review_event_v50_idx
  on public.guest_list_simple_v406(event_id, status, gender, created_at desc);

create table if not exists public.guest_registration_settings_v50 (
  event_id bigint primary key references public.events(id) on delete cascade,
  registration_open boolean not null default false,
  male_limit integer not null default 10 check (male_limit between 0 and 10000),
  updated_by text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.guest_registration_settings_v50 enable row level security;
revoke all on public.guest_registration_settings_v50 from public, anon, authenticated;

drop trigger if exists hype_guest_registration_settings_v50_updated_at on public.guest_registration_settings_v50;
create trigger hype_guest_registration_settings_v50_updated_at
before update on public.guest_registration_settings_v50
for each row execute function private.hype_touch_updated_at();

insert into public.guest_registration_settings_v50(event_id, registration_open, male_limit, updated_by)
select e.id,
       coalesce(old.registration_open, false),
       10,
       coalesce(old.updated_by, 'system')
from public.events e
left join public.public_guest_registration_settings_v49 old on old.event_id = e.id
on conflict (event_id) do nothing;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'hype-guest-photos-v50',
  'hype-guest-photos-v50',
  false,
  5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.public_guest_registration_events_v50()
returns table(
  event_id bigint,
  event_name text,
  event_date date,
  artist_name text,
  opening_time time,
  venue text,
  description text,
  cover_image text,
  registration_open boolean,
  male_limit integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select e.id,
         e.name,
         e.event_date,
         e.artist_name,
         e.opening_time,
         e.venue,
         e.description,
         e.cover_image,
         s.registration_open,
         s.male_limit
  from public.events e
  join public.guest_registration_settings_v50 s on s.event_id = e.id
  where e.active is true and s.registration_open is true
  order by e.event_date nulls last, e.sort_order, e.id;
$$;

create or replace function public.public_guest_registration_submit_v50(
  p_event_id bigint,
  p_name text,
  p_cpf text,
  p_phone text,
  p_gender text,
  p_email text,
  p_instagram text,
  p_photo_path text,
  p_photo_consent boolean
)
returns table(ok boolean, message text, list_id bigint, event_id bigint, event_name text, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name, '')), '\s+', ' ', 'g');
  v_name_key text;
  v_cpf text := private.hype_digits_v49(p_cpf);
  v_phone text := private.hype_normalize_phone_v49(p_phone);
  v_email text := lower(trim(coalesce(p_email, '')));
  v_instagram text := trim(coalesce(p_instagram, ''));
  v_photo_path text := trim(coalesce(p_photo_path, ''));
  v_event public.events%rowtype;
  v_settings public.guest_registration_settings_v50%rowtype;
  v_existing public.guest_list_simple_v406%rowtype;
  v_id bigint;
begin
  if length(v_name) < 2 or length(v_name) > 160 then
    raise exception 'Informe o nome completo';
  end if;
  if not private.hype_valid_cpf_v49(v_cpf) then
    raise exception 'CPF invalido';
  end if;
  if length(v_phone) not in (10, 11) then
    raise exception 'WhatsApp invalido';
  end if;
  if p_gender not in ('Feminino', 'Masculino') then
    raise exception 'Selecione Feminino ou Masculino';
  end if;
  if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Informe um e-mail valido';
  end if;
  if length(v_instagram) < 2 or length(v_instagram) > 120 then
    raise exception 'Informe o Instagram';
  end if;
  if not coalesce(p_photo_consent, false) or v_photo_path = '' then
    raise exception 'Envie a foto e aceite o uso para analise';
  end if;
  if v_photo_path !~ '^guest-list-v50/[A-Za-z0-9_-]+/[^[:space:]]+\.(jpg|jpeg|png|webp)$' then
    raise exception 'Foto invalida';
  end if;

  select e.* into v_event
  from public.events e
  where e.id = p_event_id and e.active is true;
  if not found then
    return query select false, 'Evento indisponivel.', null::bigint, p_event_id, null::text, 'Fechado'::text;
    return;
  end if;

  select s.* into v_settings
  from public.guest_registration_settings_v50 s
  where s.event_id = p_event_id;
  if not found or not v_settings.registration_open then
    return query select false, 'Cadastros indisponiveis para este evento.', null::bigint, v_event.id, v_event.name, 'Fechado'::text;
    return;
  end if;
  if private.hype_person_is_blocked_v49(v_cpf, v_name) then
    return query select false, 'Cadastro nao permitido. Procure a equipe HYPE.', null::bigint, v_event.id, v_event.name, 'Recusado'::text;
    return;
  end if;

  v_name_key := private.hype_name_key(v_name);
  perform pg_advisory_xact_lock(hashtextextended('hype-lista-v50:' || p_event_id::text || ':' || v_cpf, 0));

  select g.* into v_existing
  from public.guest_list_simple_v406 g
  where g.event_id = p_event_id
    and g.cpf = v_cpf
    and g.status <> 'Cancelado'
  limit 1;
  if found then
    return query select true, 'Voce ja enviou um cadastro para este evento.', v_existing.id, v_event.id, v_event.name, v_existing.status;
    return;
  end if;

  if exists (
    select 1
    from public.tickets t
    where t.event_id = p_event_id
      and t.cpf = v_cpf
      and t.payment_status in ('Pendente', 'Pago')
  ) then
    return query select true, 'Seu cadastro para este evento ja esta confirmado.', null::bigint, v_event.id, v_event.name, 'Confirmado'::text;
    return;
  end if;

  insert into public.guest_list_simple_v406(
    event_id, name, name_key, cpf, phone, gender, email, instagram,
    photo_path, photo_consent, source, status, added_by
  ) values (
    p_event_id, v_name, v_name_key, v_cpf, v_phone, p_gender, v_email, v_instagram,
    v_photo_path, true, 'Publico', 'Pendente', 'publico'
  ) returning id into v_id;

  return query select true, 'Cadastro recebido e enviado para analise.', v_id, v_event.id, v_event.name, 'Pendente'::text;
exception
  when unique_violation then
    return query select true, 'Voce ja enviou um cadastro para este evento.', null::bigint, p_event_id, v_event.name, 'Pendente'::text;
end;
$$;

create or replace function public.staff_guest_registration_settings_v50(
  p_username text,
  p_password text
)
returns table(
  event_id bigint,
  event_name text,
  event_date date,
  registration_open boolean,
  male_limit integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.hype_require_staff(p_username, p_password, array['admin']);
  return query
  select e.id, e.name, e.event_date,
         coalesce(s.registration_open, false),
         coalesce(s.male_limit, 10),
         s.updated_at
  from public.events e
  left join public.guest_registration_settings_v50 s on s.event_id = e.id
  where e.active is true
  order by e.event_date nulls last, e.sort_order, e.id;
end;
$$;

create or replace function public.staff_set_guest_registration_v50(
  p_username text,
  p_password text,
  p_event_id bigint,
  p_registration_open boolean,
  p_male_limit integer default 10
)
returns table(event_id bigint, event_name text, event_date date, registration_open boolean, male_limit integer, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff_users%rowtype;
  v_event public.events%rowtype;
begin
  v_staff := private.hype_require_staff(p_username, p_password, array['admin']);
  select e.* into v_event from public.events e where e.id = p_event_id and e.active is true;
  if not found then raise exception 'Selecione um evento ativo'; end if;
  if p_male_limit is null or p_male_limit < 0 or p_male_limit > 10000 then
    raise exception 'Limite masculino invalido';
  end if;

  insert into public.guest_registration_settings_v50(event_id, registration_open, male_limit, updated_by)
  values (p_event_id, coalesce(p_registration_open, false), p_male_limit, v_staff.username)
  on conflict (event_id) do update set
    registration_open = excluded.registration_open,
    male_limit = excluded.male_limit,
    updated_by = excluded.updated_by,
    updated_at = now();

  return query
  select e.id, e.name, e.event_date, s.registration_open, s.male_limit, s.updated_at
  from public.events e join public.guest_registration_settings_v50 s on s.event_id = e.id
  where e.id = p_event_id;
end;
$$;

create or replace function public.staff_guest_registration_list_v50(
  p_username text,
  p_password text,
  p_event_id bigint,
  p_status text default null
)
returns table(
  list_id bigint,
  event_id bigint,
  event_name text,
  name text,
  cpf text,
  phone text,
  gender text,
  email text,
  instagram text,
  photo_path text,
  photo_consent boolean,
  status text,
  added_by text,
  created_at timestamptz,
  reviewed_by text,
  reviewed_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  male_limit integer,
  male_slots_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.hype_require_staff(p_username, p_password, array['admin']);
  return query
  with settings as (
    select s.event_id, s.male_limit,
      greatest(0, s.male_limit - count(g.id) filter (where g.gender = 'Masculino' and g.status in ('Liberado','Entrou')))::integer as remaining
    from public.guest_registration_settings_v50 s
    left join public.guest_list_simple_v406 g on g.event_id = s.event_id
    where s.event_id = p_event_id
    group by s.event_id, s.male_limit
  )
  select g.id, g.event_id, e.name, g.name, g.cpf, g.phone, g.gender, g.email,
         g.instagram, g.photo_path, g.photo_consent, g.status, g.added_by, g.created_at,
         g.reviewed_by, g.reviewed_at, g.email_sent_at, g.email_error,
         coalesce(s.male_limit, 10), coalesce(s.remaining, 10)
  from public.guest_list_simple_v406 g
  join public.events e on e.id = g.event_id
  left join settings s on s.event_id = g.event_id
  where g.event_id = p_event_id
    and g.status <> 'Cancelado'
    and (nullif(trim(coalesce(p_status, '')), '') is null or g.status = trim(p_status))
  order by case g.status when 'Pendente' then 0 when 'Liberado' then 1 when 'Entrou' then 2 else 3 end, g.created_at desc;
end;
$$;

create or replace function public.staff_guest_registration_review_v50(
  p_username text,
  p_password text,
  p_list_id bigint,
  p_decision text
)
returns table(
  list_id bigint,
  event_id bigint,
  event_name text,
  name text,
  cpf text,
  phone text,
  gender text,
  email text,
  instagram text,
  photo_path text,
  photo_consent boolean,
  status text,
  reviewed_by text,
  reviewed_at timestamptz,
  email_sent_at timestamptz,
  email_error text,
  male_limit integer,
  male_slots_remaining integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff_users%rowtype;
  v_row public.guest_list_simple_v406%rowtype;
  v_settings public.guest_registration_settings_v50%rowtype;
  v_event public.events%rowtype;
  v_decision text := lower(trim(coalesce(p_decision, '')));
  v_male_count integer := 0;
  v_remaining integer := 0;
begin
  v_staff := private.hype_require_staff(p_username, p_password, array['admin']);
  select g.* into v_row from public.guest_list_simple_v406 g where g.id = p_list_id for update;
  if not found then raise exception 'Cadastro nao encontrado'; end if;
  select e.* into v_event from public.events e where e.id = v_row.event_id;
  select s.* into v_settings from public.guest_registration_settings_v50 s where s.event_id = v_row.event_id for update;
  if not found then raise exception 'Configuracao do evento nao encontrada'; end if;
  perform pg_advisory_xact_lock(hashtextextended('hype-lista-review-v50:' || v_row.event_id::text, 0));

  if v_decision in ('aprovar', 'aprovado', 'approved', 'liberar', 'liberado') then
    if v_row.status = 'Pendente' then
      if v_row.gender = 'Masculino' then
        select count(*)::integer into v_male_count
        from public.guest_list_simple_v406 g
        where g.event_id = v_row.event_id
          and g.gender = 'Masculino'
          and g.status in ('Liberado', 'Entrou')
          and g.id <> v_row.id;
        if v_male_count >= v_settings.male_limit then
          raise exception 'Limite masculino atingido para este evento';
        end if;
      end if;
      update public.guest_list_simple_v406
      set status = 'Liberado', reviewed_by = v_staff.username, reviewed_at = now(), email_error = null
      where id = v_row.id returning * into v_row;
    elsif v_row.status not in ('Liberado', 'Entrou') then
      raise exception 'Cadastro ja foi recusado';
    end if;
  elsif v_decision in ('recusar', 'recusado', 'rejeitar', 'rejeitado', 'reject', 'rejected') then
    if v_row.status = 'Pendente' then
      update public.guest_list_simple_v406
      set status = 'Cancelado', reviewed_by = v_staff.username, reviewed_at = now(), email_sent_at = null
      where id = v_row.id returning * into v_row;
    elsif v_row.status not in ('Cancelado',) then
      raise exception 'Cadastro ja foi aprovado';
    end if;
  else
    raise exception 'Decisao invalida';
  end if;

  select count(*)::integer into v_male_count
  from public.guest_list_simple_v406 g
  where g.event_id = v_row.event_id
    and g.gender = 'Masculino'
    and g.status in ('Liberado', 'Entrou');
  v_remaining := greatest(0, v_settings.male_limit - v_male_count);

  return query select v_row.id, v_row.event_id, v_event.name, v_row.name, v_row.cpf,
    v_row.phone, v_row.gender, v_row.email, v_row.instagram, v_row.photo_path,
    v_row.photo_consent, v_row.status, v_row.reviewed_by, v_row.reviewed_at,
    v_row.email_sent_at, v_row.email_error, v_settings.male_limit, v_remaining;
end;
$$;

create or replace function public.staff_guest_simple_list_v406(p_username text,p_password text,p_event_id bigint)
returns table(list_id bigint,name text,status text,created_at timestamptz,entered_at timestamptz,added_by text)
language plpgsql security definer set search_path='' as $$
begin
  perform private.hype_require_staff(p_username,p_password,array['admin','gerente','caixa','portaria']);
  return query select g.id,g.name,g.status,g.created_at,g.entered_at,g.added_by
  from public.guest_list_simple_v406 g
  where g.event_id=p_event_id and g.status in ('Liberado','Entrou')
  order by g.status,g.created_at desc;
end; $$;

create or replace function public.portaria_guest_simple_search_v406(p_device_key text,p_event_id bigint,p_query text)
returns table(list_id bigint,name text,cpf text,gender text,status text,created_at timestamptz,entered_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_query text:=lower(trim(coalesce(p_query,'')));
begin
  if not private.hype_device_authorized(p_device_key) then raise exception 'Computador não autorizado'; end if;
  if length(v_query)<1 then raise exception 'Digite um nome para buscar'; end if;
  return query select g.id,g.name,coalesce(g.cpf,''),coalesce(g.gender,''),g.status,g.created_at,g.entered_at
  from public.guest_list_simple_v406 g
  where g.event_id=p_event_id and g.status in ('Liberado','Entrou')
    and (lower(g.name) like '%'||v_query||'%' or regexp_replace(coalesce(g.cpf,''),'[^0-9]','','g') like '%'||regexp_replace(v_query,'[^0-9]','','g')||'%')
  order by case when lower(g.name)=v_query then 0 else 1 end,g.status,g.created_at desc limit 30;
end; $$;

create or replace function public.portaria_guest_simple_enter_v406(p_device_key text,p_list_id bigint)
returns table(ok boolean,message text,list_id bigint,name text,status text,entered_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_row public.guest_list_simple_v406%rowtype;
begin
  if not private.hype_device_authorized(p_device_key) then raise exception 'Computador não autorizado'; end if;
  select g.* into v_row from public.guest_list_simple_v406 g where g.id=p_list_id for update;
  if not found then return query select false,'NOME NÃO ENCONTRADO',null::bigint,null::text,null::text,null::timestamptz; return; end if;
  if v_row.status='Pendente' then return query select false,'NOME AINDA ESTÁ EM ANÁLISE',v_row.id,v_row.name,v_row.status,v_row.entered_at; return; end if;
  if v_row.status='Entrou' then return query select false,'NOME JÁ ENTROU',v_row.id,v_row.name,v_row.status,v_row.entered_at; return; end if;
  if v_row.status='Cancelado' then return query select false,'NOME NÃO LIBERADO',v_row.id,v_row.name,v_row.status,v_row.entered_at; return; end if;
  update public.guest_list_simple_v406 set status='Entrou',entered_at=now() where id=v_row.id returning * into v_row;
  return query select true,'ENTRADA DA LISTA LIBERADA',v_row.id,v_row.name,v_row.status,v_row.entered_at;
end; $$;

revoke all on function public.public_guest_registration_events_v50() from public, anon, authenticated;
revoke all on function public.public_guest_registration_submit_v50(bigint,text,text,text,text,text,text,text,boolean) from public, anon, authenticated;
revoke all on function public.staff_guest_registration_settings_v50(text,text) from public, anon, authenticated;
revoke all on function public.staff_set_guest_registration_v50(text,text,bigint,boolean,integer) from public, anon, authenticated;
revoke all on function public.staff_guest_registration_list_v50(text,text,bigint,text) from public, anon, authenticated;
revoke all on function public.staff_guest_registration_review_v50(text,text,bigint,text) from public, anon, authenticated;

grant execute on function public.public_guest_registration_events_v50() to anon, authenticated;
grant execute on function public.public_guest_registration_submit_v50(bigint,text,text,text,text,text,text,text,boolean) to anon, authenticated;
grant execute on function public.staff_guest_registration_settings_v50(text,text) to anon, authenticated;
grant execute on function public.staff_set_guest_registration_v50(text,text,bigint,boolean,integer) to anon, authenticated;
grant execute on function public.staff_guest_registration_list_v50(text,text,bigint,text) to anon, authenticated;
grant execute on function public.staff_guest_registration_review_v50(text,text,bigint,text) to anon, authenticated;

grant execute on function public.staff_guest_simple_list_v406(text,text,bigint) to anon, authenticated;
grant execute on function public.portaria_guest_simple_search_v406(text,bigint,text) to anon, authenticated;
grant execute on function public.portaria_guest_simple_enter_v406(text,bigint) to anon, authenticated;
