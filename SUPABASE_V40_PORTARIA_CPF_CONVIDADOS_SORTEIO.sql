-- ============================================================
-- HYPE LOUNGE CLUB // V40
-- PORTARIA CPF + CORTESIA ADMIN + CONFERENCIA DO SORTEIO
-- Rode DEPOIS da V38/V39.
-- NAO apaga eventos, ingressos, pagamentos, check-ins, chat ou feedbacks.
-- ============================================================

create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- 1) VENDA RAPIDA NA PORTARIA
--    CPF passa a ser o unico dado pessoal obrigatorio no balcao.
--    Mantem a mesma assinatura da funcao para nao quebrar versoes antigas.
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
  v_previous_open integer:=0;
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
  v_free_until timestamptz:=null;
  v_cpf text;
  v_name text;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;

  v_cpf:=regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
  if length(v_cpf)<>11 then raise exception 'Informe um CPF com 11 numeros'; end if;
  v_name:=coalesce(nullif(trim(p_name),''),'Cliente Portaria - CPF final '||right(v_cpf,4));

  if p_gender not in('Feminino','Masculino') then raise exception 'Selecione Feminino ou Masculino'; end if;

  select x.* into l from public.ticket_lots x where x.id=p_lot_id and x.event_id=p_event_id for update;
  if not found or not l.active then raise exception 'Ingresso indisponivel'; end if;

  select x.* into e from public.events x where x.id=p_event_id and x.active=true;
  if not found then raise exception 'Evento indisponivel'; end if;

  if l.starts_at is not null and now()<l.starts_at then raise exception 'Este lote ainda nao abriu'; end if;
  if l.ends_at is not null and now()>=l.ends_at then raise exception 'Este lote ja encerrou'; end if;

  if coalesce(l.auto_sequence,false) then
    select count(*)::integer into v_previous_open
    from public.ticket_lots p
    where p.event_id=l.event_id
      and lower(coalesce(p.sector,''))=lower(coalesce(l.sector,''))
      and p.active=true
      and (p.sort_order<l.sort_order or (p.sort_order=l.sort_order and p.id<l.id))
      and (
        p.quantity_total=0
        or (select count(*) from public.tickets tp where tp.lot_id=p.id and tp.payment_status in('Pendente','Pago')) < p.quantity_total
      );
    if v_previous_open>0 then raise exception 'Este lote sera liberado automaticamente quando o anterior esgotar'; end if;
  end if;

  select count(*)::integer into v_used from public.tickets t where t.lot_id=l.id and t.payment_status in('Pendente','Pago');
  if l.quantity_total>0 and v_used>=l.quantity_total then raise exception 'Ingresso esgotado'; end if;

  v_original:=case when p_gender='Masculino' then coalesce(l.price_male,l.price,0) else coalesce(l.price_female,l.price,0) end;
  if v_original<0 then raise exception 'Preco invalido'; end if;

  select r.female_free_until into v_free_until from public.lot_free_rules_v38 r where r.lot_id=l.id;
  v_is_free := (p_gender='Feminino' and (v_original=0 or (v_free_until is not null and now()<v_free_until)));

  if v_is_free then
    v_fee:=0; v_total:=0; v_status:='Pago'; v_paid_at:=now();
    v_method:=case when v_free_until is not null and now()<v_free_until and v_original>0 then 'Feminino FREE ate horario' else 'Feminino FREE' end;
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
    e.id,l.id,v_name,null,null,v_cpf,p_gender,
    v_total,v_original,0,v_fee,
    v_code,v_qr,v_status,'Não utilizado','portaria',v_device,
    v_method,v_paid_at
  )
  returning tickets.id,tickets.purchased_at into v_id,v_purchased;

  insert into public.portaria_logs_v18(device_id,ticket_id,action,metadata)
  values(v_device,v_id,case when v_is_free then 'DOOR_FREE_FEMALE_CREATED' else 'DOOR_ORDER_CREATED' end,
    jsonb_build_object('event_id',e.id,'lot_id',l.id,'price',v_total,'payment_provider',case when v_is_free then 'FREE' else 'ASAAS' end,'cpf_only_sale',true));

  return query select
    v_id,e.id,e.name,v_code,v_qr,v_name,
    null::text,v_cpf,null::text,p_gender,l.id,l.name,l.sector,v_total,v_status::text,''::text,
    coalesce(e.raffle_enabled,false),coalesce(e.raffle_prize,''),v_purchased;
end;
$$;

grant execute on function public.portaria_device_create_door_order_v19(text,bigint,bigint,text,text,text,text,text)
to anon,authenticated;

-- ------------------------------------------------------------
-- 2) ADICIONAR PESSOA / CORTESIA PELO ADMIN
--    Cria ingresso real, QR valido e payment_status='Pago'.
--    Como o sorteio usa ingressos PAGOS, entra automaticamente no sorteio.
-- ------------------------------------------------------------
create or replace function public.staff_add_guest_ticket_v40(
  p_username text,
  p_password text,
  p_event_id bigint,
  p_lot_id bigint,
  p_name text,
  p_gender text,
  p_cpf text default null
)
returns table(
  ticket_id bigint,
  event_id bigint,
  event_name text,
  ticket_code text,
  qr_token text,
  customer_name text,
  cpf text,
  gender text,
  lot_id bigint,
  lot_name text,
  sector text,
  payment_status text,
  payment_method text,
  purchased_at timestamptz
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  s public.staff_users%rowtype;
  e public.events%rowtype;
  l public.ticket_lots%rowtype;
  v_id bigint;
  v_code text;
  v_qr text;
  v_purchased timestamptz;
  v_cpf text:=nullif(regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g'),'');
  v_used integer;
begin
  select u.* into s from public.staff_users u
  where u.username=trim(p_username) and u.active=true and u.password_hash=crypt(p_password,u.password_hash) limit 1;
  if not found or s.role not in('admin','gerente','caixa') then raise exception 'Sem permissao'; end if;

  if length(trim(coalesce(p_name,'')))<2 then raise exception 'Informe o nome da pessoa'; end if;
  if p_gender not in('Feminino','Masculino') then raise exception 'Selecione Feminino ou Masculino'; end if;
  if v_cpf is not null and length(v_cpf)<>11 then raise exception 'CPF precisa ter 11 numeros'; end if;

  select x.* into e from public.events x where x.id=p_event_id;
  if not found then raise exception 'Evento nao encontrado'; end if;
  select x.* into l from public.ticket_lots x where x.id=p_lot_id and x.event_id=p_event_id for update;
  if not found or not l.active then raise exception 'Ingresso/lote indisponivel'; end if;

  select count(*)::integer into v_used from public.tickets t where t.lot_id=l.id and t.payment_status in('Pendente','Pago');
  if l.quantity_total>0 and v_used>=l.quantity_total then raise exception 'Este lote esta esgotado. Crie/seleciona outro lote para a cortesia'; end if;

  loop
    v_code:='HYPE-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,10));
    exit when not exists(select 1 from public.tickets t where t.ticket_code=v_code);
  end loop;
  v_qr:=gen_random_uuid()::text;

  insert into public.tickets(
    event_id,lot_id,customer_name,cpf,gender,
    price,original_price,discount_amount,service_fee,
    ticket_code,qr_token,payment_status,entry_status,payment_method,paid_at
  ) values(
    e.id,l.id,trim(p_name),v_cpf,p_gender,
    0,0,0,0,
    v_code,v_qr,'Pago','Não utilizado','Cortesia Admin',now()
  ) returning tickets.id,tickets.purchased_at into v_id,v_purchased;

  return query select
    v_id,e.id,e.name,v_code,v_qr,trim(p_name),v_cpf,p_gender,
    l.id,l.name,l.sector,'Pago'::text,'Cortesia Admin'::text,v_purchased;
end;
$$;

grant execute on function public.staff_add_guest_ticket_v40(text,text,bigint,bigint,text,text,text)
to anon,authenticated;

notify pgrst,'reload schema';

-- ------------------------------------------------------------
-- 3) CONFERENCIA DO SORTEIO (somente leitura)
--    Se tudo estiver OK, as quatro colunas abaixo aparecem como OK.
-- ------------------------------------------------------------
select
  case when to_regprocedure('public.staff_raffle_status_v18(text,text,bigint)') is not null then 'OK' else 'FALTANDO' end as status_sorteio,
  case when to_regprocedure('public.staff_raffle_participants_v18(text,text,bigint)') is not null then 'OK' else 'FALTANDO' end as participantes_sorteio,
  case when to_regprocedure('public.staff_draw_raffle_v18(text,text,bigint)') is not null then 'OK' else 'FALTANDO' end as realizar_sorteio,
  case when to_regprocedure('public.staff_add_guest_ticket_v40(text,text,bigint,bigint,text,text,text)') is not null then 'OK' else 'FALTANDO' end as adicionar_cortesia;
