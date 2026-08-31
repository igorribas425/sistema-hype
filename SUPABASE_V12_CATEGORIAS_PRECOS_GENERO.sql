-- ============================================================
-- HYPE V12 - CATEGORIAS + PREÇO FEMININO / MASCULINO
-- Execute UMA VEZ no Supabase > SQL Editor > New query > Run.
--
-- NÃO apaga ingressos, eventos, usuários ou preços antigos.
-- Ingressos já vendidos continuam com o valor gravado em tickets.price.
-- ============================================================

create extension if not exists pgcrypto;

alter table public.ticket_lots
  add column if not exists price_female numeric(12,2),
  add column if not exists price_male numeric(12,2);

update public.ticket_lots
set price_female = coalesce(price_female, price),
    price_male   = coalesce(price_male, price)
where price_female is null or price_male is null;

alter table public.ticket_lots
  alter column price_female set default 0,
  alter column price_male set default 0;

-- Catálogo público do evento. Só devolve categorias ativas.
drop function if exists public.public_lots_by_event_v12(bigint);
create function public.public_lots_by_event_v12(p_event_id bigint)
returns table(
  id bigint,
  event_id bigint,
  name text,
  sector text,
  price numeric,
  price_female numeric,
  price_male numeric,
  quantity_total integer,
  quantity_sold bigint,
  quantity_available bigint,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean,
  sort_order integer
)
language sql
security definer
set search_path = public
as $$
  select
    l.id, l.event_id, l.name, l.sector,
    coalesce(l.price_female, l.price)::numeric as price,
    coalesce(l.price_female, l.price)::numeric as price_female,
    coalesce(l.price_male, l.price)::numeric as price_male,
    l.quantity_total,
    count(t.id) filter (where t.payment_status in ('Pendente','Pago'))::bigint as quantity_sold,
    case when l.quantity_total = 0 then null
         else greatest(l.quantity_total - count(t.id) filter (where t.payment_status in ('Pendente','Pago')), 0)::bigint
    end as quantity_available,
    l.starts_at, l.ends_at, l.active, l.sort_order
  from public.ticket_lots l
  left join public.tickets t on t.lot_id = l.id
  join public.events e on e.id = l.event_id
  where l.event_id = p_event_id
    and l.active = true
    and e.active = true
  group by l.id
  order by l.sort_order, l.id;
$$;
grant execute on function public.public_lots_by_event_v12(bigint) to anon, authenticated;

-- Lista de categorias do Admin, incluindo categorias inativas.
drop function if exists public.staff_list_lots_v12(text,text,bigint);
create function public.staff_list_lots_v12(p_username text, p_password text, p_event_id bigint)
returns table(
  id bigint,
  event_id bigint,
  name text,
  sector text,
  price numeric,
  price_female numeric,
  price_male numeric,
  quantity_total integer,
  quantity_sold bigint,
  quantity_available bigint,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean,
  sort_order integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_staff public.staff_users%rowtype;
begin
  select s.* into v_staff
  from public.staff_users s
  where s.username = trim(p_username)
    and s.active = true
    and s.password_hash = crypt(p_password, s.password_hash)
  limit 1;

  if not found or v_staff.role not in ('admin','gerente') then
    raise exception 'Sem permissão';
  end if;

  return query
  select
    l.id, l.event_id, l.name, l.sector,
    coalesce(l.price_female, l.price)::numeric,
    coalesce(l.price_female, l.price)::numeric,
    coalesce(l.price_male, l.price)::numeric,
    l.quantity_total,
    count(t.id) filter (where t.payment_status in ('Pendente','Pago'))::bigint,
    case when l.quantity_total = 0 then null
         else greatest(l.quantity_total - count(t.id) filter (where t.payment_status in ('Pendente','Pago')), 0)::bigint
    end,
    l.starts_at, l.ends_at, l.active, l.sort_order
  from public.ticket_lots l
  left join public.tickets t on t.lot_id = l.id
  where l.event_id = p_event_id
  group by l.id
  order by l.sort_order, l.id;
end;
$$;
grant execute on function public.staff_list_lots_v12(text,text,bigint) to anon, authenticated;

-- Cria/edita categoria sem quebrar a função V2 já existente.
drop function if exists public.staff_upsert_lot_v12(text,text,bigint,bigint,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,integer);
create function public.staff_upsert_lot_v12(
  p_username text,
  p_password text,
  p_event_id bigint,
  p_id bigint,
  p_name text,
  p_sector text,
  p_price_female numeric,
  p_price_male numeric,
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
begin
  select s.* into v_staff
  from public.staff_users s
  where s.username = trim(p_username)
    and s.active = true
    and s.password_hash = crypt(p_password, s.password_hash)
  limit 1;

  if not found or v_staff.role not in ('admin','gerente') then
    raise exception 'Sem permissão';
  end if;

  if not exists (select 1 from public.events e where e.id = p_event_id) then
    raise exception 'Evento não encontrado';
  end if;
  if coalesce(trim(p_sector),'') = '' then raise exception 'Informe a categoria/setor'; end if;
  if coalesce(p_price_female,0) < 0 or coalesce(p_price_male,0) < 0 then raise exception 'Preço inválido'; end if;
  if coalesce(p_quantity_total,0) < 0 then raise exception 'Quantidade inválida'; end if;
  if p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at then
    raise exception 'A expiração precisa ser depois do início';
  end if;

  if coalesce(p_id,0) = 0 then
    insert into public.ticket_lots(
      event_id,name,sector,price,price_female,price_male,quantity_total,starts_at,ends_at,active,sort_order
    ) values (
      p_event_id,
      coalesce(nullif(trim(p_name),''),'1º Lote'),
      trim(p_sector),
      coalesce(p_price_female,0),
      coalesce(p_price_female,0),
      coalesce(p_price_male,0),
      coalesce(p_quantity_total,0),
      p_starts_at,p_ends_at,coalesce(p_active,true),coalesce(p_sort_order,0)
    ) returning * into v_lot;
  else
    update public.ticket_lots l
    set name = coalesce(nullif(trim(p_name),''), l.name),
        sector = trim(p_sector),
        price = coalesce(p_price_female,0),
        price_female = coalesce(p_price_female,0),
        price_male = coalesce(p_price_male,0),
        quantity_total = coalesce(p_quantity_total,0),
        starts_at = p_starts_at,
        ends_at = p_ends_at,
        active = coalesce(p_active,true),
        sort_order = coalesce(p_sort_order,l.sort_order)
    where l.id = p_id and l.event_id = p_event_id
    returning * into v_lot;
    if not found then raise exception 'Categoria não encontrada neste evento'; end if;
  end if;

  return v_lot;
end;
$$;
grant execute on function public.staff_upsert_lot_v12(text,text,bigint,bigint,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,integer) to anon, authenticated;

-- Criação do pedido V12: o preço é decidido NO BANCO conforme o gênero.
-- Assim o navegador não consegue forçar outro valor e o Asaas continua lendo tickets.price.
drop function if exists public.create_manual_order_v12(text,text,text,text,text,bigint);
create function public.create_manual_order_v12(
  p_name text,
  p_phone text,
  p_email text,
  p_cpf text,
  p_gender text,
  p_lot_id bigint
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
  v_price numeric(12,2);
  v_id bigint;
  v_code text;
  v_qr text;
  v_purchased timestamptz;
begin
  if coalesce(trim(p_name),'') = '' then raise exception 'Nome do cliente é obrigatório'; end if;
  if coalesce(trim(p_email),'') = '' or position('@' in p_email) = 0 then raise exception 'E-mail inválido'; end if;
  if p_gender not in ('Feminino','Masculino') then raise exception 'Selecione Feminino ou Masculino'; end if;

  select * into v_lot
  from public.ticket_lots
  where ticket_lots.id = p_lot_id
  for update;
  if not found or not v_lot.active then raise exception 'Categoria indisponível'; end if;

  select * into v_event from public.events where events.id = v_lot.event_id;
  if not found or not v_event.active then raise exception 'Evento indisponível'; end if;

  if v_lot.starts_at is not null and now() < v_lot.starts_at then raise exception 'As vendas desta categoria ainda não começaram'; end if;
  if v_lot.ends_at is not null and now() >= v_lot.ends_at then raise exception 'As vendas desta categoria já encerraram'; end if;

  select count(*)::integer into v_used
  from public.tickets t
  where t.lot_id = v_lot.id and t.payment_status in ('Pendente','Pago');
  if v_lot.quantity_total > 0 and v_used >= v_lot.quantity_total then raise exception 'Categoria esgotada'; end if;

  v_price := case when p_gender = 'Masculino'
                  then coalesce(v_lot.price_male, v_lot.price, 0)
                  else coalesce(v_lot.price_female, v_lot.price, 0)
             end;

  loop
    v_code := 'HYPE-' || upper(substr(md5(random()::text || clock_timestamp()::text),1,10));
    exit when not exists (select 1 from public.tickets t where t.ticket_code = v_code);
  end loop;
  v_qr := gen_random_uuid()::text;

  insert into public.tickets(
    event_id,lot_id,customer_name,phone,email,cpf,gender,price,ticket_code,qr_token,payment_status,entry_status
  ) values (
    v_lot.event_id,v_lot.id,trim(p_name),trim(p_phone),lower(trim(p_email)),trim(p_cpf),p_gender,v_price,v_code,v_qr,'Pendente','Não utilizado'
  ) returning tickets.id, tickets.purchased_at into v_id, v_purchased;

  return query select
    v_id, v_lot.event_id, v_code, v_qr, trim(p_name), trim(p_phone), lower(trim(p_email)), trim(p_cpf), p_gender,
    v_lot.id, v_lot.name, v_lot.sector, v_price, 'Pendente'::text, 'Não utilizado'::text, v_purchased;
end;
$$;
grant execute on function public.create_manual_order_v12(text,text,text,text,text,bigint) to anon, authenticated;
