-- ============================================================
-- HYPE LOUNGE CLUB // SETORES ATIVOS NA VENDA
-- Execute UMA VEZ no SQL Editor do Supabase.
-- ============================================================

create or replace function public.staff_list_sector_configs(
  p_username text,
  p_password text
)
returns table(
  id bigint,
  sector text,
  price_male numeric,
  price_female numeric,
  quantity_total integer,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean,
  sort_order integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users%rowtype;
begin
  select * into v_staff
  from public.staff_users
  where username = trim(p_username)
    and active = true
    and password_hash = crypt(p_password, password_hash);

  if not found or v_staff.role not in ('admin','gerente') then
    raise exception 'Sem permissão';
  end if;

  return query
  select
    l.id,
    l.sector,
    l.price_male,
    l.price_female,
    l.quantity_total,
    l.starts_at,
    l.ends_at,
    l.active,
    l.sort_order
  from public.ticket_lots l
  join public.events e on e.id = l.event_id and e.active = true
  where lower(trim(l.sector)) in ('pista','vip','camarote')
  order by
    case lower(trim(l.sector))
      when 'pista' then 1
      when 'vip' then 2
      when 'camarote' then 3
      else 99
    end,
    l.active desc,
    l.id desc;
end;
$$;

grant execute on function public.staff_list_sector_configs(text,text) to anon, authenticated;

create or replace function public.staff_save_sector_config(
  p_username text,
  p_password text,
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
  v_event_id bigint;
  v_lot public.ticket_lots%rowtype;
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
    raise exception 'Setor inválido';
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

  -- Reaproveita um registro do setor mesmo que esteja inativo.
  select *
  into v_lot
  from public.ticket_lots
  where event_id = v_event_id
    and lower(trim(sector)) = lower(v_sector)
  order by active desc, id desc
  limit 1
  for update;

  if found then
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
      active = coalesce(p_active,false),
      sort_order = coalesce(p_sort_order,sort_order)
    where id = v_lot.id
    returning * into v_lot;

    -- Evita duplicidade de setor ativa de versões anteriores.
    update public.ticket_lots
    set active = false
    where event_id = v_event_id
      and lower(trim(sector)) = lower(v_sector)
      and id <> v_lot.id;
  else
    insert into public.ticket_lots(
      event_id, name, sector, price, price_male, price_female,
      quantity_total, starts_at, ends_at, active, sort_order
    )
    values(
      v_event_id, v_name, v_sector, v_base_price, p_price_male, p_price_female,
      p_quantity_total, p_starts_at, p_ends_at, coalesce(p_active,false), coalesce(p_sort_order,0)
    )
    returning * into v_lot;
  end if;

  return v_lot;
end;
$$;

grant execute on function public.staff_save_sector_config(
  text,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,integer
) to anon, authenticated;
