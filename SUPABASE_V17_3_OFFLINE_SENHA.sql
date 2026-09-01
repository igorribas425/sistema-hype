-- =============================================================
-- HYPE V17.3 - OFFLINE PERSISTENTE + SENHA PORTARIA
-- Rode UMA VEZ no Supabase > SQL Editor > New query > Run.
--
-- O que faz:
-- 1) Troca a senha do usuário "portaria" para: cris1212
-- 2) Cria uma leitura V17 própria da Portaria com documento/saída/reentrada.
-- 3) Não apaga ingressos, vendas, eventos, promoters ou histórico.
-- =============================================================

create extension if not exists pgcrypto;

DO $$
DECLARE v_count integer;
BEGIN
  update public.staff_users
     set password_hash = crypt('cris1212', gen_salt('bf'))
   where lower(trim(username)) = 'portaria'
     and role = 'portaria';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  if v_count = 0 then
    raise exception 'Usuario portaria nao encontrado. Confira o nome do usuario em staff_users.';
  end if;
END $$;

create or replace function public.staff_lookup_ticket_v17(
  p_username text,
  p_password text,
  p_code text
)
returns table(
  id bigint,
  event_id bigint,
  ticket_code text,
  qr_token text,
  customer_name text,
  phone text,
  email text,
  cpf text,
  gender text,
  lot_name text,
  sector text,
  price numeric,
  payment_status text,
  entry_status text,
  entry_at timestamptz,
  document_checked boolean,
  temporary_exit boolean,
  reentry_authorized boolean,
  reentry_count integer
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  s public.staff_users%rowtype;
  v_code text := trim(coalesce(p_code,''));
begin
  s := public.hype_staff_v17(p_username,p_password);
  if s.role not in ('admin','portaria') then
    raise exception 'Sem permissao';
  end if;

  return query
  select
    t.id,
    t.event_id,
    t.ticket_code,
    t.qr_token,
    t.customer_name,
    t.phone,
    t.email,
    t.cpf,
    t.gender,
    l.name,
    l.sector,
    t.price,
    t.payment_status,
    t.entry_status,
    t.entry_at,
    t.document_checked,
    t.temporary_exit,
    t.reentry_authorized,
    t.reentry_count
  from public.tickets t
  join public.ticket_lots l on l.id=t.lot_id
  where t.ticket_code=v_code
     or t.qr_token=v_code
     or ('#'||t.ticket_code)=v_code
  limit 1;
end;
$$;

grant execute on function public.staff_lookup_ticket_v17(text,text,text)
to anon,authenticated;

NOTIFY pgrst, 'reload schema';

-- Conferência sem exibir senha/hash:
select id,name,username,role,active
from public.staff_users
where lower(trim(username))='portaria';
