-- =========================================================
-- HYPE V9 - PORTARIA: QR -> DADOS -> CONFIRMAR ENTRADA
--         + ADMIN: APAGAR INGRESSOS ANTIGOS DE VERDADE
-- Execute ESTE ARQUIVO UMA VEZ no Supabase > SQL Editor > Run.
-- Não apaga eventos, lotes, preços nem usuários da equipe.
-- =========================================================

-- 1) Consulta somente-leitura do QR para a Portaria.
--    NÃO marca entrada. Apenas devolve os dados para conferência.
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

  if v_staff.role not in ('admin','gerente','portaria') then
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


-- 2) Limpeza total dos ingressos para começar a próxima festa zerado.
--    Remove registros de auditoria ligados a ingressos e depois os ingressos.
--    NÃO remove events, ticket_lots ou staff_users.
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

  if v_staff.role not in ('admin','gerente') then
    raise exception 'Sem permissão';
  end if;

  delete from public.audit_logs
  where ticket_id in (select id from public.tickets);

  delete from public.tickets;
  get diagnostics v_count = row_count;

  return v_count;
end;
$$;

grant execute on function public.staff_purge_all_tickets(text,text)
to anon, authenticated;

-- Garante que a validação existente encontre crypt().
alter function public.staff_validate_entry(text,text,text,text)
set search_path = public, extensions;
