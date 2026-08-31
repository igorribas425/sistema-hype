-- ============================================================
-- HYPE V11 - STATUS DO E-MAIL NA TELA DO CLIENTE
-- Execute UMA VEZ no Supabase > SQL Editor > New query > Run.
--
-- Este SQL NÃO apaga ingressos, eventos, lotes, preços ou usuários.
-- Ele apenas garante as colunas de e-mail e atualiza a consulta
-- pública do pedido para informar se o e-mail já foi enviado.
-- ============================================================

alter table public.tickets
  add column if not exists email text;

alter table public.tickets
  add column if not exists email_sent_at timestamptz;

-- O tipo de retorno foi ampliado; por isso é necessário recriar a função.
drop function if exists public.public_get_ticket(text);

create function public.public_get_ticket(p_code text)
returns table(
  id bigint,
  ticket_code text,
  customer_name text,
  phone text,
  gender text,
  lot_name text,
  sector text,
  price numeric,
  payment_status text,
  entry_status text,
  purchased_at timestamptz,
  paid_at timestamptz,
  entry_at timestamptz,
  email_sent boolean
)
language sql
security definer
set search_path = public
as $$
  select
    t.id,
    t.ticket_code,
    t.customer_name,
    t.phone,
    t.gender,
    l.name as lot_name,
    l.sector,
    t.price,
    t.payment_status,
    t.entry_status,
    t.purchased_at,
    t.paid_at,
    t.entry_at,
    (t.email_sent_at is not null) as email_sent
  from public.tickets t
  join public.ticket_lots l on l.id = t.lot_id
  where lower(t.ticket_code) = lower(trim(p_code))
  limit 1;
$$;

grant execute on function public.public_get_ticket(text) to anon, authenticated;
