-- ============================================================
-- HYPE LOUNGE CLUB // PREÇOS POR GÊNERO
-- Execute UMA VEZ no SQL Editor do Supabase.
-- ============================================================

alter table public.ticket_lots
  add column if not exists price_male numeric(12,2),
  add column if not exists price_female numeric(12,2);

update public.ticket_lots
set
  price_male = coalesce(price_male, price),
  price_female = coalesce(price_female, price);

alter table public.ticket_lots
  alter column price_male set default 0,
  alter column price_female set default 0;

alter table public.ticket_lots
  alter column price_male set not null,
  alter column price_female set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ticket_lots_price_male_nonnegative'
  ) then
    alter table public.ticket_lots
      add constraint ticket_lots_price_male_nonnegative check (price_male >= 0);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'ticket_lots_price_female_nonnegative'
  ) then
    alter table public.ticket_lots
      add constraint ticket_lots_price_female_nonnegative check (price_female >= 0);
  end if;
end $$;

-- Padroniza os nomes dos três setores principais.
update public.ticket_lots
set name = case
  when lower(trim(sector)) = 'pista' then 'Pista'
  when lower(trim(sector)) = 'vip' then 'VIP'
  when lower(trim(sector)) = 'camarote' then 'Camarote'
  else name
end
where lower(trim(sector)) in ('pista','vip','camarote');

-- Consulta pública usada pelo site.
create or replace function public.public_lots_gender()
returns table(
  id bigint,
  name text,
  sector text,
  price numeric,
  price_male numeric,
  price_female numeric,
  quantity_total integer,
  quantity_sold bigint,
  quantity_available bigint,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean
)
language sql
security definer
set search_path = public
as $$
  select
    l.id,
    l.name,
    l.sector,
    l.price,
    l.price_male,
    l.price_female,
    l.quantity_total,
    count(t.id) filter (where t.payment_status in ('Pendente','Pago'))::bigint as quantity_sold,
    case when l.quantity_total = 0 then null
         else greatest(l.quantity_total - count(t.id) filter (where t.payment_status in ('Pendente','Pago')), 0)::bigint
    end as quantity_available,
    l.starts_at,
    l.ends_at,
    l.active
  from public.ticket_lots l
  left join public.tickets t on t.lot_id = l.id
  join public.events e on e.id = l.event_id and e.active = true
  where l.active = true
  group by l.id
  order by l.sort_order, l.id;
$$;

grant execute on function public.public_lots_gender() to anon, authenticated;

-- Salva/cria Pista, VIP ou Camarote com preço Masculino e Feminino.
create or replace function public.staff_upsert_lot_gender(
  p_username text,
  p_password text,
  p_id bigint,
  p_sector text,
  p_price_male numeric,
  p_price_female numeric,
  p_quantity_total integer,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_active boolean,
  p_sort_order integer
)
returns public.ticket_lots
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users%rowtype;
  v_lot public.ticket_lots%rowtype;
  v_event_id bigint;
  v_sector text;
  v_name text;
  v_base_price numeric;
begin
  select * into v_staff
  from public.staff_users
  where username = trim(p_username)
    and active = true
    and password_hash = crypt(p_password, password_hash);

  if not found or v_staff.role not in ('admin','gerente') then
    raise exception 'Sem permissão';
  end if;

  select id into v_event_id
  from public.events
  where active = true
  order by id
  limit 1;

  if v_event_id is null then
    raise exception 'Nenhum evento ativo';
  end if;

  v_sector := lower(trim(coalesce(p_sector,'')));

  if v_sector = 'pista' then
    v_sector := 'Pista';
    v_name := 'Pista';
  elsif v_sector = 'vip' then
    v_sector := 'VIP';
    v_name := 'VIP';
  elsif v_sector = 'camarote' then
    v_sector := 'Camarote';
    v_name := 'Camarote';
  else
    raise exception 'Setor inválido. Escolha Pista, VIP ou Camarote';
  end if;

  if p_price_male is null or p_price_female is null
     or p_price_male < 0 or p_price_female < 0 then
    raise exception 'Preços inválidos';
  end if;

  if p_quantity_total is null or p_quantity_total < 0 then
    raise exception 'Quantidade inválida';
  end if;

  if p_starts_at is not null and p_ends_at is not null
     and p_ends_at <= p_starts_at then
    raise exception 'Horários inválidos';
  end if;

  v_base_price := least(p_price_male, p_price_female);

  if coalesce(p_id,0) = 0 then
    if exists (
      select 1 from public.ticket_lots
      where event_id = v_event_id
        and lower(trim(sector)) = lower(v_sector)
        and active = true
    ) then
      raise exception 'Este setor já está cadastrado. Edite o setor existente abaixo.';
    end if;

    insert into public.ticket_lots(
      event_id, name, sector, price, price_male, price_female,
      quantity_total, starts_at, ends_at, active, sort_order
    )
    values(
      v_event_id, v_name, v_sector, v_base_price, p_price_male, p_price_female,
      p_quantity_total, p_starts_at, p_ends_at, coalesce(p_active,true), coalesce(p_sort_order,0)
    )
    returning * into v_lot;
  else
    update public.ticket_lots
    set
      name = v_name,
      sector = v_sector,
      price = v_base_price,
      price_male = p_price_male,
      price_female = p_price_female,
      quantity_total = p_quantity_total,
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      active = coalesce(p_active,true),
      sort_order = coalesce(p_sort_order,sort_order)
    where id = p_id
    returning * into v_lot;

    if not found then
      raise exception 'Setor não encontrado';
    end if;
  end if;

  return v_lot;
end;
$$;

grant execute on function public.staff_upsert_lot_gender(
  text,text,bigint,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,integer
) to anon, authenticated;

-- A compra grava o preço conforme o gênero escolhido.
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

  select * into v_lot
  from public.ticket_lots
  where id = p_lot_id and active = true
  for update;

  if not found then
    raise exception 'Lote indisponível';
  end if;

  select * into v_event
  from public.events
  where id = v_lot.event_id and active = true;

  if not found then
    raise exception 'Evento indisponível';
  end if;

  if v_lot.starts_at is not null and now() < v_lot.starts_at then
    raise exception 'Este lote ainda não abriu';
  end if;

  if v_lot.ends_at is not null and now() >= v_lot.ends_at then
    raise exception 'Este lote já encerrou';
  end if;

  select count(*)::integer into v_used
  from public.tickets
  where lot_id = v_lot.id
    and payment_status in ('Pendente','Pago');

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

  insert into public.tickets(
    event_id, lot_id, customer_name, phone, cpf, gender,
    price, ticket_code, qr_token
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
  returning tickets.id into v_ticket_id;

  return query
  select
    t.id, t.ticket_code, t.qr_token, t.customer_name, t.phone, t.cpf, t.gender,
    t.lot_id, l.name, l.sector, t.price, t.payment_status, t.entry_status, t.purchased_at
  from public.tickets t
  join public.ticket_lots l on l.id = t.lot_id
  where t.id = v_ticket_id;
end;
$$;

grant execute on function public.create_ticket(text,text,text,text,bigint) to anon, authenticated;
