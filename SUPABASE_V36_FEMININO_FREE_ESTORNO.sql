-- ============================================================
-- HYPE LOUNGE CLUB // V36
-- FEMININO FREE + ESTORNO ASAAS MANTENDO O INGRESSO VALIDO
-- Execute DEPOIS da V35.
-- Nao apaga eventos, ingressos, feedbacks ou vendas existentes.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) CAMPOS DE CONTROLE DO ESTORNO
-- ------------------------------------------------------------
alter table public.tickets
  add column if not exists refund_status text,
  add column if not exists refund_amount numeric(12,2) not null default 0,
  add column if not exists refund_requested_at timestamptz,
  add column if not exists refunded_at timestamptz,
  add column if not exists refund_asaas_payment_id text,
  add column if not exists free_after_refund boolean not null default false,
  add column if not exists free_reason text;

-- Colunas ja usadas pelas versoes atuais; os IF NOT EXISTS deixam o patch seguro.
alter table public.tickets
  add column if not exists payment_method text,
  add column if not exists paid_at timestamptz,
  add column if not exists service_fee numeric(12,2) not null default 0,
  add column if not exists original_price numeric(12,2),
  add column if not exists discount_amount numeric(12,2) not null default 0;

-- ------------------------------------------------------------
-- 2) COMPRA DO SITE / LINK DE PROMOTER
--    Se o preco feminino do lote for 0, vira FREE:
--    - nao cobra taxa
--    - nao gera PIX
--    - ja nasce PAGO/liberado
-- ------------------------------------------------------------
create or replace function public.create_manual_order_v16(
  p_name text,
  p_phone text,
  p_email text,
  p_cpf text,
  p_gender text,
  p_lot_id bigint,
  p_coupon_code text default null,
  p_promoter_code text default null
)
returns table(
  id bigint,event_id bigint,ticket_code text,qr_token text,customer_name text,phone text,email text,cpf text,gender text,
  lot_id bigint,lot_name text,sector text,price numeric,original_price numeric,discount_amount numeric,coupon_code text,promoter_code text,
  payment_status text,entry_status text,purchased_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_lot public.ticket_lots%rowtype;
  v_event public.events%rowtype;
  v_coupon public.coupons_v16%rowtype;
  v_promoter public.promoters_global_v16%rowtype;
  v_used integer;
  v_previous_open integer := 0;
  v_original numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_ticket_value numeric(12,2);
  v_service_fee numeric(12,2) := 1.98;
  v_final numeric(12,2);
  v_coupon_used bigint := 0;
  v_coupon_code text := upper(trim(coalesce(p_coupon_code,'')));
  v_promoter_code text := upper(trim(coalesce(p_promoter_code,'')));
  v_id bigint;
  v_code text;
  v_qr text;
  v_purchased timestamptz;
  v_payment_status text := 'Pendente';
  v_payment_method text := 'PIX Asaas';
  v_paid_at timestamptz := null;
  v_is_free boolean := false;
begin
  if coalesce(trim(p_name),'')='' then raise exception 'Nome do cliente e obrigatorio'; end if;
  if coalesce(trim(p_email),'')='' or position('@' in p_email)=0 then raise exception 'E-mail invalido'; end if;
  if p_gender not in ('Feminino','Masculino') then raise exception 'Selecione Feminino ou Masculino'; end if;

  select l.* into v_lot
  from public.ticket_lots l
  where l.id=p_lot_id
  for update;

  if not found or not v_lot.active then raise exception 'Categoria indisponivel'; end if;

  select e.* into v_event
  from public.events e
  where e.id=v_lot.event_id;

  if not found or not v_event.active then raise exception 'Evento indisponivel'; end if;
  if v_lot.starts_at is not null and now()<v_lot.starts_at then raise exception 'As vendas desta categoria ainda nao comecaram'; end if;
  if v_lot.ends_at is not null and now()>=v_lot.ends_at then raise exception 'As vendas desta categoria ja encerraram'; end if;

  if coalesce(v_lot.auto_sequence,false) then
    select count(*)::integer into v_previous_open
    from public.ticket_lots p
    where p.event_id=v_lot.event_id
      and lower(coalesce(p.sector,''))=lower(coalesce(v_lot.sector,''))
      and p.active=true
      and (p.sort_order<v_lot.sort_order or (p.sort_order=v_lot.sort_order and p.id<v_lot.id))
      and (
        p.quantity_total=0
        or (
          select count(*) from public.tickets tp
          where tp.lot_id=p.id and tp.payment_status in ('Pendente','Pago')
        ) < p.quantity_total
      );
    if v_previous_open>0 then raise exception 'Este lote sera liberado automaticamente quando o anterior esgotar'; end if;
  end if;

  select count(*)::integer into v_used
  from public.tickets t
  where t.lot_id=v_lot.id and t.payment_status in ('Pendente','Pago');

  if v_lot.quantity_total>0 and v_used>=v_lot.quantity_total then raise exception 'Categoria esgotada'; end if;

  v_original := case
    when p_gender='Masculino' then coalesce(v_lot.price_male,v_lot.price,0)
    else coalesce(v_lot.price_female,v_lot.price,0)
  end;

  if v_original < 0 then raise exception 'Preco invalido'; end if;
  v_is_free := (p_gender='Feminino' and v_original=0);

  -- Cupom continua funcionando para ingressos pagos. No FREE ele nao altera nada.
  if v_coupon_code<>'' and not v_is_free then
    select c.* into v_coupon
    from public.coupons_v16 c
    where c.event_id=v_lot.event_id
      and upper(c.code)=v_coupon_code
      and c.active=true
    for update;

    if not found then raise exception 'Cupom invalido'; end if;
    if v_coupon.starts_at is not null and now()<v_coupon.starts_at then raise exception 'Cupom ainda nao iniciou'; end if;
    if v_coupon.ends_at is not null and now()>=v_coupon.ends_at then raise exception 'Cupom expirado'; end if;

    select count(*)::bigint into v_coupon_used
    from public.tickets t
    where t.event_id=v_lot.event_id
      and upper(coalesce(t.coupon_code,''))=v_coupon_code
      and t.payment_status in ('Pendente','Pago');

    if v_coupon.usage_limit>0 and v_coupon_used>=v_coupon.usage_limit then raise exception 'Limite do cupom atingido'; end if;

    if v_coupon.discount_type='percent' then
      v_discount := round(v_original*least(v_coupon.discount_value,100)/100,2);
    else
      v_discount := least(v_original,v_coupon.discount_value);
    end if;
  end if;

  -- Promoter global: preserva a regra das versoes atuais.
  if v_promoter_code<>'' then
    select p.* into v_promoter
    from public.promoters_global_v16 p
    where upper(p.code)=v_promoter_code
      and p.active=true
    limit 1;
    if not found then raise exception 'Codigo de promoter invalido'; end if;
  end if;

  if v_is_free then
    v_discount := 0;
    v_coupon_code := '';
    v_service_fee := 0;
    v_final := 0;
    v_payment_status := 'Pago';
    v_payment_method := 'Feminino FREE';
    v_paid_at := now();
  else
    v_ticket_value := greatest(v_original-v_discount,0);
    if v_ticket_value<=0 then raise exception 'O desconto precisa deixar um valor maior que zero para pagamento PIX'; end if;
    v_final := round(v_ticket_value + v_service_fee, 2);
  end if;

  loop
    v_code := 'HYPE-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,10));
    exit when not exists(select 1 from public.tickets t where t.ticket_code=v_code);
  end loop;

  v_qr := gen_random_uuid()::text;

  insert into public.tickets(
    event_id,lot_id,customer_name,phone,email,cpf,gender,
    price,original_price,discount_amount,service_fee,
    coupon_code,promoter_code,ticket_code,qr_token,payment_status,entry_status,
    payment_method,paid_at
  ) values(
    v_lot.event_id,v_lot.id,trim(p_name),trim(p_phone),lower(trim(p_email)),trim(p_cpf),p_gender,
    v_final,v_original,v_discount,v_service_fee,
    nullif(v_coupon_code,''),nullif(v_promoter_code,''),v_code,v_qr,v_payment_status,'Não utilizado',
    v_payment_method,v_paid_at
  )
  returning tickets.id,tickets.purchased_at into v_id,v_purchased;

  return query select
    v_id,v_lot.event_id,v_code,v_qr,trim(p_name),trim(p_phone),lower(trim(p_email)),trim(p_cpf),p_gender,
    v_lot.id,v_lot.name,v_lot.sector,v_final,v_original,v_discount,
    nullif(v_coupon_code,''),nullif(v_promoter_code,''),
    v_payment_status::text,'Não utilizado'::text,v_purchased;
end;
$$;

grant execute on function public.create_manual_order_v16(text,text,text,text,text,bigint,text,text)
to anon, authenticated;

-- Compatibilidade com navegadores antigos.
create or replace function public.create_manual_order_v12(
  p_cpf text,
  p_email text,
  p_gender text,
  p_lot_id bigint,
  p_name text,
  p_phone text
)
returns table(
  id bigint,event_id bigint,ticket_code text,qr_token text,customer_name text,phone text,email text,cpf text,gender text,
  lot_id bigint,lot_name text,sector text,price numeric,original_price numeric,discount_amount numeric,coupon_code text,promoter_code text,
  payment_status text,entry_status text,purchased_at timestamptz
)
language sql
security definer
set search_path = public, extensions
as $$
  select * from public.create_manual_order_v16(
    p_name,p_phone,p_email,p_cpf,p_gender,p_lot_id,null,null
  );
$$;

grant execute on function public.create_manual_order_v12(text,text,text,bigint,text,text)
to anon, authenticated;

-- ------------------------------------------------------------
-- 3) VENDA NA PORTARIA
--    Feminino com preco 0 ja nasce FREE/PAGO; qualquer outro valor usa Asaas.
-- ------------------------------------------------------------
create or replace function public.portaria_device_create_door_order_v19(
  p_device_key text,
  p_event_id bigint,
  p_lot_id bigint,
  p_name text,
  p_phone text default null,
  p_cpf text default null,
  p_email text default null,
  p_gender text default 'Feminino'
)
returns table(
  ticket_id bigint,
  event_id bigint,
  event_name text,
  ticket_code text,
  qr_token text,
  customer_name text,
  phone text,
  cpf text,
  email text,
  gender text,
  lot_id bigint,
  lot_name text,
  sector text,
  price numeric,
  payment_status text,
  pix_key text,
  raffle_enabled boolean,
  raffle_prize text,
  purchased_at timestamptz
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_device uuid;
  l public.ticket_lots%rowtype;
  e public.events%rowtype;
  v_used integer;
  v_original numeric(12,2);
  v_fee numeric(12,2):=1.98;
  v_total numeric(12,2);
  v_id bigint;
  v_code text;
  v_qr text;
  v_purchased timestamptz;
  v_is_free boolean:=false;
  v_status text:='Pendente';
  v_method text:='PIX Asaas';
  v_paid_at timestamptz:=null;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome da pessoa'; end if;
  if p_gender not in('Feminino','Masculino') then raise exception 'Selecione Feminino ou Masculino'; end if;

  select x.* into l
  from public.ticket_lots x
  where x.id=p_lot_id and x.event_id=p_event_id
  for update;
  if not found or not l.active then raise exception 'Ingresso indisponivel'; end if;

  select x.* into e
  from public.events x
  where x.id=p_event_id and x.active=true;
  if not found then raise exception 'Evento indisponivel'; end if;

  if l.starts_at is not null and now()<l.starts_at then raise exception 'Este lote ainda nao abriu'; end if;
  if l.ends_at is not null and now()>=l.ends_at then raise exception 'Este lote ja encerrou'; end if;

  select count(*)::integer into v_used
  from public.tickets t
  where t.lot_id=l.id and t.payment_status in('Pendente','Pago');
  if l.quantity_total>0 and v_used>=l.quantity_total then raise exception 'Ingresso esgotado'; end if;

  v_original:=case when p_gender='Masculino' then coalesce(l.price_male,l.price,0) else coalesce(l.price_female,l.price,0) end;
  if v_original<0 then raise exception 'Preco invalido'; end if;

  v_is_free := (p_gender='Feminino' and v_original=0);
  if v_is_free then
    v_fee:=0;
    v_total:=0;
    v_status:='Pago';
    v_method:='Feminino FREE';
    v_paid_at:=now();
  else
    v_total:=round(v_original+v_fee,2);
  end if;

  loop
    v_code:='HYPE-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,10));
    exit when not exists(select 1 from public.tickets t where t.ticket_code=v_code);
  end loop;
  v_qr:=gen_random_uuid()::text;

  insert into public.tickets(
    event_id,lot_id,customer_name,phone,email,cpf,gender,
    price,original_price,discount_amount,service_fee,
    ticket_code,qr_token,payment_status,entry_status,sale_origin,door_device_id,
    payment_method,paid_at
  ) values(
    e.id,l.id,trim(p_name),nullif(trim(coalesce(p_phone,'')),''),nullif(lower(trim(coalesce(p_email,''))),''),nullif(trim(coalesce(p_cpf,'')),''),p_gender,
    v_total,v_original,0,v_fee,
    v_code,v_qr,v_status,'Não utilizado','portaria',v_device,
    v_method,v_paid_at
  )
  returning tickets.id,tickets.purchased_at into v_id,v_purchased;

  insert into public.portaria_logs_v18(device_id,ticket_id,action,metadata)
  values(v_device,v_id,case when v_is_free then 'DOOR_FREE_FEMALE_CREATED' else 'DOOR_ORDER_CREATED' end,
    jsonb_build_object('event_id',e.id,'lot_id',l.id,'price',v_total,'payment_provider',case when v_is_free then 'FREE' else 'ASAAS' end));

  return query select
    v_id,e.id,e.name,v_code,v_qr,trim(p_name),
    nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_cpf,'')),''),nullif(lower(trim(coalesce(p_email,''))),''),
    p_gender,l.id,l.name,l.sector,v_total,v_status::text,''::text,
    coalesce(e.raffle_enabled,false),coalesce(e.raffle_prize,''),v_purchased;
end;
$$;

grant execute on function public.portaria_device_create_door_order_v19(
  text,bigint,bigint,text,text,text,text,text
) to anon,authenticated;

-- ------------------------------------------------------------
-- 4) LISTA SEGURA PARA O PAINEL DE ESTORNO
--    Somente ADMIN pode visualizar/acionar este fluxo.
-- ------------------------------------------------------------
create or replace function public.staff_female_refund_list_v36(
  p_username text,
  p_password text,
  p_event_id bigint
)
returns table(
  ticket_id bigint,
  customer_name text,
  ticket_code text,
  email text,
  price numeric,
  payment_method text,
  refund_status text,
  refund_amount numeric,
  refund_requested_at timestamptz,
  refunded_at timestamptz,
  free_after_refund boolean,
  eligible boolean
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare s public.staff_users%rowtype;
begin
  select u.* into s
  from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;

  if not found or s.role<>'admin' then raise exception 'Somente Admin pode acessar estornos'; end if;

  return query
  select
    t.id,
    t.customer_name,
    t.ticket_code,
    coalesce(t.email,''),
    t.price,
    coalesce(t.payment_method,''),
    coalesce(t.refund_status,''),
    coalesce(t.refund_amount,0),
    t.refund_requested_at,
    t.refunded_at,
    coalesce(t.free_after_refund,false),
    (
      t.payment_status='Pago'
      and t.gender='Feminino'
      and t.price>0
      and coalesce(t.payment_method,'') ilike '%Asaas%'
      and coalesce(t.free_after_refund,false)=false
      and upper(coalesce(t.refund_status,'')) not in ('REFUND_REQUESTED','REFUND_IN_PROGRESS','REFUNDED','PARTIALLY_REFUNDED')
    ) as eligible
  from public.tickets t
  where t.event_id=p_event_id
    and t.gender='Feminino'
    and t.payment_status='Pago'
    and (
      t.price>0
      or coalesce(t.refund_amount,0)>0
      or coalesce(t.free_after_refund,false)=true
    )
  order by coalesce(t.refund_requested_at,t.purchased_at) desc,t.id desc;
end;
$$;

grant execute on function public.staff_female_refund_list_v36(text,text,bigint) to anon,authenticated;

select 'HYPE V36 OK - feminino FREE + estorno Asaas mantendo ingresso valido' as status;
