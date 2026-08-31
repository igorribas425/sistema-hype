-- ============================================================
-- HYPE LOUNGE CLUB
-- CORREÇÃO: "column reference id is ambiguous" + funções PIX
-- Execute UMA VEZ no SQL Editor do Supabase.
-- ============================================================

create or replace function public.create_ticket(
  p_name text,
  p_phone text,
  p_cpf text,
  p_gender text,
  p_lot_id bigint
)
returns table(
  id bigint,
  ticket_code text,
  qr_token text,
  customer_name text,
  phone text,
  cpf text,
  gender text,
  lot_id bigint,
  lot_name text,
  sector text,
  price numeric,
  payment_status text,
  entry_status text,
  purchased_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_lot public.ticket_lots%rowtype;
  v_event public.events%rowtype;
  v_used integer;
  v_ticket_id bigint;
  v_code text;
  v_qr text;
  v_price numeric;
begin
  if coalesce(trim(p_name),'') = '' then
    raise exception 'Nome do cliente é obrigatório';
  end if;

  select l.*
  into v_lot
  from public.ticket_lots as l
  where l.id = p_lot_id
    and l.active = true
  for update;

  if not found then
    raise exception 'Lote indisponível';
  end if;

  select e.*
  into v_event
  from public.events as e
  where e.id = v_lot.event_id
    and e.active = true;

  if not found then
    raise exception 'Evento indisponível';
  end if;

  if v_lot.starts_at is not null and now() < v_lot.starts_at then
    raise exception 'Este lote ainda não abriu';
  end if;

  if v_lot.ends_at is not null and now() >= v_lot.ends_at then
    raise exception 'Este lote já encerrou';
  end if;

  select count(*)::integer
  into v_used
  from public.tickets as t
  where t.lot_id = v_lot.id
    and t.payment_status in ('Pendente','Pago');

  if v_lot.quantity_total > 0 and v_used >= v_lot.quantity_total then
    raise exception 'Lote esgotado';
  end if;

  if lower(trim(coalesce(p_gender,''))) = 'feminino' then
    v_price := coalesce(v_lot.price_female, v_lot.price);
  elsif lower(trim(coalesce(p_gender,''))) = 'masculino' then
    v_price := coalesce(v_lot.price_male, v_lot.price);
  else
    v_price := v_lot.price;
  end if;

  v_code := 'HYPE-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_qr := gen_random_uuid()::text;

  insert into public.tickets as tk(
    event_id,
    lot_id,
    customer_name,
    phone,
    cpf,
    gender,
    price,
    ticket_code,
    qr_token
  )
  values(
    v_lot.event_id,
    v_lot.id,
    trim(p_name),
    nullif(trim(p_phone),''),
    nullif(trim(p_cpf),''),
    nullif(trim(p_gender),''),
    v_price,
    v_code,
    v_qr
  )
  returning tk.id into v_ticket_id;

  return query
  select
    t.id,
    t.ticket_code,
    t.qr_token,
    t.customer_name,
    t.phone,
    t.cpf,
    t.gender,
    t.lot_id,
    l.name,
    l.sector,
    t.price,
    t.payment_status,
    t.entry_status,
    t.purchased_at
  from public.tickets as t
  join public.ticket_lots as l
    on l.id = t.lot_id
  where t.id = v_ticket_id;
end;
$$;

grant execute on function public.create_ticket(text,text,text,text,bigint)
to anon, authenticated;


create or replace function public.staff_save_pix(
  p_username text,
  p_password text,
  p_pix text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text;
begin
  select vs.role
  into v_role
  from public.verify_staff(p_username,p_password) as vs
  limit 1;

  if v_role is null or v_role not in ('admin','gerente') then
    raise exception 'Sem permissão';
  end if;

  update public.events as e
  set pix_key = coalesce(trim(p_pix),'')
  where e.active = true;

  return true;
end;
$$;

grant execute on function public.staff_save_pix(text,text,text)
to anon, authenticated;


create or replace function public.public_pix_key()
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.pix_key
      from public.events as e
      where e.active = true
      order by e.id
      limit 1
    ),
    ''
  );
$$;

grant execute on function public.public_pix_key()
to anon, authenticated;
