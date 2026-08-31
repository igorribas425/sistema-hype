-- ============================================================
-- HYPE V12 - CATEGORIAS + PREÇOS FEMININO / MASCULINO
-- Execute UMA VEZ no Supabase > SQL Editor > New query > Run.
--
-- NÃO apaga ingressos, eventos, usuários nem valores já vendidos.
-- Ingressos antigos continuam com o preço gravado no momento da compra.
-- ============================================================

create extension if not exists pgcrypto;

-- 1) Cada categoria/lote passa a ter dois preços.
alter table public.ticket_lots
  add column if not exists price_male numeric(12,2),
  add column if not exists price_female numeric(12,2);

-- Mantém os preços atuais como padrão inicial para não alterar a operação existente.
update public.ticket_lots
set
  price_male = coalesce(price_male, price),
  price_female = coalesce(price_female, price);

alter table public.ticket_lots
  alter column price_male set default 0,
  alter column price_female set default 0,
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

-- Garante e-mail no ticket mesmo se a atualização anterior ainda não tiver criado a coluna.
alter table public.tickets
  add column if not exists email text;

-- 2) Consulta V12 dos lotes por evento, com os dois preços.
create or replace function public.public_lots_by_event_v12(p_event_id bigint)
returns table(
  id bigint,
  event_id bigint,
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
  active boolean,
  sort_order integer
)
language sql
security definer
set search_path = public
as $$
  select
    l.id,
    l.event_id,
    l.name,
    l.sector,
    l.price,
    l.price_male,
    l.price_female,
    l.quantity_total,
    count(t.id) filter (where t.payment_status in ('Pendente','Pago'))::bigint as quantity_sold,
    case
      when l.quantity_total = 0 then null
      else greatest(
        l.quantity_total - count(t.id) filter (where t.payment_status in ('Pendente','Pago')),
        0
      )::bigint
    end as quantity_available,
    l.starts_at,
    l.ends_at,
    l.active,
    l.sort_order
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

-- 3) Admin: cria/edita qualquer categoria do evento selecionado.
-- Exemplos: Pista, VIP, Camarote, Backstage, Open Bar etc.
create or replace function public.staff_upsert_lot_v12(
  p_username text,
  p_password text,
  p_event_id bigint,
  p_id bigint,
  p_name text,
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
  v_name text;
  v_sector text;
  v_base_price numeric;
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

  v_sector := trim(coalesce(p_sector,''));
  v_name := trim(coalesce(p_name,''));

  if v_sector = '' then
    raise exception 'Informe a categoria/setor';
  end if;

  if v_name = '' then
    v_name := v_sector;
  end if;

  if p_price_male is null or p_price_female is null
     or p_price_male < 0 or p_price_female < 0 then
    raise exception 'Preços inválidos';
  end if;

  if coalesce(p_quantity_total,0) < 0 then
    raise exception 'Quantidade inválida';
  end if;

  if p_starts_at is not null and p_ends_at is not null
     and p_ends_at <= p_starts_at then
    raise exception 'A expiração precisa ser depois do início';
  end if;

  -- Campo price continua preenchido para compatibilidade com partes antigas do sistema.
  v_base_price := least(p_price_male, p_price_female);

  if coalesce(p_id,0) = 0 then
    insert into public.ticket_lots(
      event_id, name, sector, price, price_male, price_female,
      quantity_total, starts_at, ends_at, active, sort_order
    )
    values(
      p_event_id,
      v_name,
      v_sector,
      v_base_price,
      p_price_male,
      p_price_female,
      coalesce(p_quantity_total,0),
      p_starts_at,
      p_ends_at,
      coalesce(p_active,true),
      coalesce(p_sort_order,0)
    )
    returning * into v_lot;
  else
    update public.ticket_lots l
    set
      name = v_name,
      sector = v_sector,
      price = v_base_price,
      price_male = p_price_male,
      price_female = p_price_female,
      quantity_total = coalesce(p_quantity_total,0),
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      active = coalesce(p_active,true),
      sort_order = coalesce(p_sort_order,l.sort_order)
    where l.id = p_id
      and l.event_id = p_event_id
    returning * into v_lot;

    if not found then
      raise exception 'Categoria/lote não encontrado neste evento';
    end if;
  end if;

  insert into public.audit_logs(staff_user_id, action, metadata)
  values(
    v_staff.id,
    case when coalesce(p_id,0)=0 then 'LOTE_V12_CRIADO' else 'LOTE_V12_ATUALIZADO' end,
    jsonb_build_object(
      'event_id', p_event_id,
      'lot_id', v_lot.id,
      'name', v_lot.name,
      'sector', v_lot.sector,
      'price_male', v_lot.price_male,
      'price_female', v_lot.price_female
    )
  );

  return v_lot;
end;
$$;

grant execute on function public.staff_upsert_lot_v12(
  text,text,bigint,bigint,text,text,numeric,numeric,integer,timestamptz,timestamptz,boolean,integer
) to anon, authenticated;

-- 4) Compra V12: grava no ticket o preço exato conforme o gênero escolhido.
-- A V12 grava o valor escolhido em tickets.price, mantendo a integração PIX baseada no ticket_id.
create or replace function public.create_gender_order_v12(
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
  lot_id bigint,
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
  v_gender text;
begin
  if coalesce(trim(p_name),'') = '' then
    raise exception 'Nome do cliente é obrigatório';
  end if;

  if coalesce(trim(p_email),'') = '' then
    raise exception 'E-mail é obrigatório';
  end if;

  select l.* into v_lot
  from public.ticket_lots l
  where l.id = p_lot_id
    and l.active = true
  for update;

  if not found then
    raise exception 'Ingresso indisponível';
  end if;

  select e.* into v_event
  from public.events e
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

  select count(*)::integer into v_used
  from public.tickets t
  where t.lot_id = v_lot.id
    and t.payment_status in ('Pendente','Pago');

  if v_lot.quantity_total > 0 and v_used >= v_lot.quantity_total then
    raise exception 'Lote esgotado';
  end if;

  v_gender := lower(trim(coalesce(p_gender,'')));

  if v_gender = 'feminino' then
    v_price := coalesce(v_lot.price_female, v_lot.price);
  elsif v_gender = 'masculino' then
    v_price := coalesce(v_lot.price_male, v_lot.price);
  else
    raise exception 'Escolha Feminino ou Masculino';
  end if;

  v_code := 'HYPE-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  v_qr := gen_random_uuid()::text;

  insert into public.tickets(
    event_id,
    lot_id,
    customer_name,
    phone,
    email,
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
    lower(trim(p_email)),
    nullif(trim(p_cpf),''),
    initcap(v_gender),
    v_price,
    v_code,
    v_qr
  )
  returning tickets.id into v_ticket_id;

  return query
  select
    t.id,
    t.event_id,
    t.lot_id,
    t.ticket_code,
    t.qr_token,
    t.customer_name,
    t.phone,
    t.email,
    t.cpf,
    t.gender,
    l.name as lot_name,
    l.sector,
    t.price,
    t.payment_status,
    t.entry_status,
    t.purchased_at
  from public.tickets t
  join public.ticket_lots l on l.id = t.lot_id
  where t.id = v_ticket_id;
end;
$$;

grant execute on function public.create_gender_order_v12(text,text,text,text,text,bigint)
to anon, authenticated;
