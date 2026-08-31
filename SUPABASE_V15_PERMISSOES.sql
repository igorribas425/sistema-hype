-- =========================================================
-- HYPE V15 - PERMISSÕES POR PERFIL
-- Objetivo:
--   ADMIN     -> acesso total
--   PORTARIA  -> somente leitura/validação de ingressos na Portaria
--   GERENTE   -> painel administrativo, SEM acesso à Portaria/Equipe/Limpeza total
--   CAIXA     -> pedidos/pagamentos conforme regras já existentes
--
-- Este arquivo NÃO apaga eventos, lotes, ingressos, pagamentos ou usuários.
-- Execute UMA VEZ no Supabase > SQL Editor > Run.
-- =========================================================

-- 1) PORTARIA: somente ADMIN ou PORTARIA podem consultar o QR/dados.
create or replace function public.staff_lookup_ticket(
  p_username text,
  p_password text,
  p_code text
)
returns table(
  id bigint,
  event_id bigint,
  ticket_code text,
  customer_name text,
  phone text,
  gender text,
  lot_name text,
  sector text,
  price numeric,
  payment_status text,
  entry_status text,
  entry_at timestamptz,
  event_name text,
  event_date date
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users%rowtype;
begin
  select s.*
  into v_staff
  from public.staff_users s
  where s.username = trim(p_username)
    and s.active = true
    and s.password_hash = crypt(p_password, s.password_hash)
  limit 1;

  if not found then
    raise exception 'Acesso negado';
  end if;

  if v_staff.role not in ('admin','portaria') then
    raise exception 'Sem permissão';
  end if;

  return query
  select
    t.id,
    t.event_id,
    t.ticket_code,
    t.customer_name,
    t.phone,
    t.gender,
    l.name as lot_name,
    l.sector,
    t.price,
    t.payment_status,
    t.entry_status,
    t.entry_at,
    e.name as event_name,
    e.event_date
  from public.tickets t
  join public.ticket_lots l on l.id = t.lot_id
  join public.events e on e.id = t.event_id
  where lower(t.ticket_code) = lower(trim(p_code))
     or lower(t.qr_token) = lower(trim(p_code))
  limit 1;
end;
$$;

grant execute on function public.staff_lookup_ticket(text,text,text)
to anon, authenticated;


-- 2) PORTARIA: somente ADMIN ou PORTARIA podem confirmar entrada.
create or replace function public.staff_validate_entry(
  p_username text,
  p_password text,
  p_code text,
  p_device text default null
)
returns table(
  ok boolean,
  message text,
  ticket_id bigint,
  ticket_code text,
  customer_name text,
  lot_name text,
  sector text,
  price numeric,
  payment_status text,
  entry_status text,
  entry_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users%rowtype;
  v_ticket public.tickets%rowtype;
  v_lot text;
begin
  select * into v_staff
  from public.staff_users
  where username = trim(p_username)
    and active = true
    and password_hash = crypt(p_password, password_hash);

  if not found then
    raise exception 'Acesso negado';
  end if;

  if v_staff.role not in ('admin','portaria') then
    raise exception 'Sem permissão';
  end if;

  select t.* into v_ticket
  from public.tickets t
  where lower(t.ticket_code) = lower(trim(p_code))
     or lower(t.qr_token) = lower(trim(p_code))
  for update;

  if not found then
    return query select false,'INGRESSO NÃO ENCONTRADO',null::bigint,null::text,null::text,null::text,null::text,null::numeric,null::text,null::text,null::timestamptz;
    return;
  end if;

  select name into v_lot from public.ticket_lots where id = v_ticket.lot_id;

  if v_ticket.payment_status = 'Cancelado' then
    return query select false,'INGRESSO CANCELADO',v_ticket.id,v_ticket.ticket_code,v_ticket.customer_name,v_lot,
      (select sector from public.ticket_lots where id=v_ticket.lot_id),v_ticket.price,v_ticket.payment_status,v_ticket.entry_status,v_ticket.entry_at;
    return;
  end if;

  if v_ticket.payment_status <> 'Pago' then
    return query select false,'PAGAMENTO NÃO CONFIRMADO',v_ticket.id,v_ticket.ticket_code,v_ticket.customer_name,v_lot,
      (select sector from public.ticket_lots where id=v_ticket.lot_id),v_ticket.price,v_ticket.payment_status,v_ticket.entry_status,v_ticket.entry_at;
    return;
  end if;

  if v_ticket.entry_status = 'Entrada utilizada' then
    return query select false,'INGRESSO JÁ UTILIZADO',v_ticket.id,v_ticket.ticket_code,v_ticket.customer_name,v_lot,
      (select sector from public.ticket_lots where id=v_ticket.lot_id),v_ticket.price,v_ticket.payment_status,v_ticket.entry_status,v_ticket.entry_at;
    return;
  end if;

  update public.tickets
  set entry_status='Entrada utilizada',
      entry_at=now(),
      entry_by=v_staff.id,
      entry_device=coalesce(nullif(trim(p_device),''),'Portaria')
  where id=v_ticket.id;

  insert into public.audit_logs(staff_user_id, action, ticket_id, metadata)
  values(v_staff.id,'ENTRADA_LIBERADA',v_ticket.id,jsonb_build_object('device',p_device));

  return query
  select true,'ENTRADA LIBERADA',v_ticket.id,v_ticket.ticket_code,v_ticket.customer_name,v_lot,
    (select sector from public.ticket_lots where id=v_ticket.lot_id),v_ticket.price,'Pago','Entrada utilizada',now();
end;
$$;

grant execute on function public.staff_validate_entry(text,text,text,text)
to anon, authenticated;


-- 3) Limpeza definitiva de todos os ingressos: somente ADMIN.
create or replace function public.staff_purge_all_tickets(
  p_username text,
  p_password text
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users%rowtype;
  v_count integer := 0;
begin
  select s.*
  into v_staff
  from public.staff_users s
  where s.username = trim(p_username)
    and s.active = true
    and s.password_hash = crypt(p_password, s.password_hash)
  limit 1;

  if not found then
    raise exception 'Acesso negado';
  end if;

  if v_staff.role <> 'admin' then
    raise exception 'Sem permissão';
  end if;

  select count(*)::integer into v_count from public.tickets;
  truncate table public.tickets restart identity cascade;
  return v_count;
end;
$$;

grant execute on function public.staff_purge_all_tickets(text,text)
to anon, authenticated;


-- 4) Gestão da equipe: somente ADMIN.
create or replace function public.staff_add_user(
  p_username text,
  p_password text,
  p_name text,
  p_new_username text,
  p_new_password text,
  p_role text
)
returns public.staff_users
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users%rowtype;
  v_new public.staff_users%rowtype;
begin
  select * into v_staff
  from public.staff_users
  where username=trim(p_username)
    and active=true
    and password_hash=crypt(p_password,password_hash);

  if not found or v_staff.role <> 'admin' then
    raise exception 'Sem permissão';
  end if;

  if p_role not in ('admin','gerente','caixa','portaria') then
    raise exception 'Perfil inválido';
  end if;

  insert into public.staff_users(name,username,password_hash,role)
  values(trim(p_name),trim(p_new_username),crypt(p_new_password,gen_salt('bf')),p_role)
  returning * into v_new;

  return v_new;
exception when unique_violation then
  raise exception 'Usuário já existe';
end;
$$;

grant execute on function public.staff_add_user(text,text,text,text,text,text)
to anon, authenticated;

create or replace function public.staff_list_users(
  p_username text,
  p_password text
)
returns table(
  id bigint,
  name text,
  username text,
  role text,
  active boolean,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.verify_staff(p_username,p_password)
  limit 1;

  if v_role is null or v_role <> 'admin' then
    raise exception 'Sem permissão';
  end if;

  return query
  select s.id,s.name,s.username,s.role,s.active,s.created_at
  from public.staff_users s
  order by s.created_at;
end;
$$;

grant execute on function public.staff_list_users(text,text)
to anon, authenticated;

create or replace function public.staff_delete_user(
  p_username text,
  p_password text,
  p_user_id bigint
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select role into v_role
  from public.verify_staff(p_username,p_password)
  limit 1;

  if v_role is null or v_role <> 'admin' then
    raise exception 'Sem permissão';
  end if;

  update public.staff_users
  set active=false
  where id=p_user_id;

  return true;
end;
$$;

grant execute on function public.staff_delete_user(text,text,bigint)
to anon, authenticated;

-- FIM V15
