-- ============================================================
-- HYPE LOUNGE CLUB // PORTARIA + PIX ASAAS
-- Execute UMA VEZ no SQL Editor do Supabase.
--
-- Objetivo:
-- 1) A venda feita na Portaria continua registrada como sale_origin='portaria'
-- 2) A Portaria NÃO depende mais da chave PIX salva no evento/Admin
-- 3) O frontend chama a Edge Function asaas-pix com o ticket_id
-- 4) SOMENTE o webhook do Asaas transforma o ingresso em PAGO
-- 5) O antigo botão/RPC de confirmação manual deixa de liberar pagamento
--
-- Este patch NÃO apaga eventos, ingressos, promoters, leitores ou sorteios.
-- ============================================================

create extension if not exists pgcrypto;

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
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then
    raise exception 'Computador nao autorizado';
  end if;

  if coalesce(trim(p_name),'')='' then
    raise exception 'Informe o nome da pessoa';
  end if;

  if p_gender not in('Feminino','Masculino') then
    raise exception 'Selecione Feminino ou Masculino';
  end if;

  select x.* into l
  from public.ticket_lots x
  where x.id=p_lot_id
    and x.event_id=p_event_id
  for update;

  if not found or not l.active then
    raise exception 'Ingresso indisponivel';
  end if;

  select x.* into e
  from public.events x
  where x.id=p_event_id
    and x.active=true;

  if not found then
    raise exception 'Evento indisponivel';
  end if;

  -- IMPORTANTE:
  -- não exige mais e.pix_key. O PIX será criado pela Edge Function asaas-pix.
  if l.starts_at is not null and now()<l.starts_at then
    raise exception 'Este lote ainda nao abriu';
  end if;

  if l.ends_at is not null and now()>=l.ends_at then
    raise exception 'Este lote ja encerrou';
  end if;

  select count(*)::integer into v_used
  from public.tickets t
  where t.lot_id=l.id
    and t.payment_status in('Pendente','Pago');

  if l.quantity_total>0 and v_used>=l.quantity_total then
    raise exception 'Ingresso esgotado';
  end if;

  v_original :=
    case
      when p_gender='Masculino' then coalesce(l.price_male,l.price,0)
      else coalesce(l.price_female,l.price,0)
    end;

  if v_original<0 then
    raise exception 'Preco invalido';
  end if;

  -- Mantém a mesma taxa que a venda na Portaria já utilizava.
  v_total:=round(v_original+v_fee,2);

  loop
    v_code:='HYPE-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,10));
    exit when not exists(
      select 1 from public.tickets t where t.ticket_code=v_code
    );
  end loop;

  v_qr:=gen_random_uuid()::text;

  insert into public.tickets(
    event_id,
    lot_id,
    customer_name,
    phone,
    email,
    cpf,
    gender,
    price,
    original_price,
    discount_amount,
    service_fee,
    ticket_code,
    qr_token,
    payment_status,
    entry_status,
    sale_origin,
    door_device_id
  )
  values(
    e.id,
    l.id,
    trim(p_name),
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(lower(trim(coalesce(p_email,''))),''),
    nullif(trim(coalesce(p_cpf,'')),''),
    p_gender,
    v_total,
    v_original,
    0,
    v_fee,
    v_code,
    v_qr,
    'Pendente',
    'Não utilizado',
    'portaria',
    v_device
  )
  returning tickets.id,tickets.purchased_at
  into v_id,v_purchased;

  insert into public.portaria_logs_v18(
    device_id,
    ticket_id,
    action,
    metadata
  )
  values(
    v_device,
    v_id,
    'DOOR_ORDER_CREATED',
    jsonb_build_object(
      'event_id',e.id,
      'lot_id',l.id,
      'price',v_total,
      'payment_provider','ASAAS'
    )
  );

  return query
  select
    v_id,
    e.id,
    e.name,
    v_code,
    v_qr,
    trim(p_name),
    nullif(trim(coalesce(p_phone,'')),''),
    nullif(trim(coalesce(p_cpf,'')),''),
    nullif(lower(trim(coalesce(p_email,''))),''),
    p_gender,
    l.id,
    l.name,
    l.sector,
    v_total,
    'Pendente'::text,
    ''::text, -- compatibilidade com a coluna antiga pix_key; não é mais usada
    coalesce(e.raffle_enabled,false),
    coalesce(e.raffle_prize,''),
    v_purchased;
end;
$$;

grant execute on function public.portaria_device_create_door_order_v19(
  text,bigint,bigint,text,text,text,text,text
) to anon,authenticated;

-- ============================================================
-- BLOQUEIA A CONFIRMAÇÃO MANUAL ANTIGA.
-- Este RPC continua existindo apenas por compatibilidade com cache/telas antigas.
-- Agora ele SOMENTE retorna sucesso se o webhook do Asaas já marcou o ticket PAGO.
-- ============================================================

create or replace function public.portaria_device_confirm_door_payment_v19(
  p_device_key text,
  p_ticket_id bigint
)
returns table(
  ticket_id bigint,
  ticket_code text,
  qr_token text,
  customer_name text,
  payment_status text,
  paid_at timestamptz,
  raffle_enabled boolean,
  raffle_prize text
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_device uuid;
  t public.tickets%rowtype;
  e public.events%rowtype;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);

  if v_device is null then
    raise exception 'Computador nao autorizado';
  end if;

  select x.* into t
  from public.tickets x
  where x.id=p_ticket_id
  for update;

  if not found then
    raise exception 'Venda nao encontrada';
  end if;

  if coalesce(t.sale_origin,'site')<>'portaria' then
    raise exception 'Este pagamento nao pertence a uma venda da Portaria';
  end if;

  if t.door_device_id is distinct from v_device then
    raise exception 'Esta venda foi criada em outro computador da Portaria';
  end if;

  if t.payment_status='Cancelado' then
    raise exception 'Ingresso cancelado';
  end if;

  if t.payment_status<>'Pago' then
    raise exception 'Pagamento ainda nao confirmado pelo Asaas';
  end if;

  select x.* into e
  from public.events x
  where x.id=t.event_id;

  return query
  select
    t.id,
    t.ticket_code,
    t.qr_token,
    t.customer_name,
    t.payment_status,
    t.paid_at,
    coalesce(e.raffle_enabled,false),
    coalesce(e.raffle_prize,'');
end;
$$;

grant execute on function public.portaria_device_confirm_door_payment_v19(
  text,bigint
) to anon,authenticated;

select 'HYPE PORTARIA + PIX ASAAS OK' as status;
