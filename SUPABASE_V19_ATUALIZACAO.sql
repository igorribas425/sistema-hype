-- =============================================================
-- HYPE LOUNGE CLUB // V19 ATUALIZACAO
-- 1) Varios celulares leitores simultaneos na Portaria
-- 2) QR de pareamento renovavel/continuo + lista em tempo real
-- 3) Venda na hora pela Portaria com PIX da chave cadastrada
-- 4) Pagamento de venda na hora confirmado pela Portaria autorizada
-- 5) Toda venda PAGA (site, promoter ou portaria) entra no sorteio do evento
-- 6) Sorteio continua sendo executado SOMENTE pelo Admin
--
-- Execute depois da V18. O arquivo SUPABASE_V19_COMPLETO.sql ja inclui V18+V19.
-- Este patch e aditivo e nao apaga ingressos/eventos/promoters.
-- =============================================================

create extension if not exists pgcrypto;

alter table public.portaria_pairings_v18
  add column if not exists reader_label text;

alter table public.tickets
  add column if not exists sale_origin text not null default 'site',
  add column if not exists door_device_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname='tickets_door_device_v19_fkey'
  ) then
    alter table public.tickets
      add constraint tickets_door_device_v19_fkey
      foreign key (door_device_id) references public.portaria_devices_v18(id) on delete set null;
  end if;
end $$;

create index if not exists idx_tickets_sale_origin_v19
  on public.tickets(event_id,sale_origin,payment_status,purchased_at desc);

-- -------------------------------------------------------------
-- LEITORES: varios celulares + monitor em tempo real
-- -------------------------------------------------------------
create or replace function public.portaria_create_pair_v19(
  p_device_key text,
  p_pair_token text
)
returns table(pairing_id uuid, expires_at timestamptz, pairing_code text)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_device uuid;
  p public.portaria_pairings_v18%rowtype;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;
  if coalesce(length(trim(p_pair_token)),0)<20 then raise exception 'Token de pareamento invalido'; end if;

  -- Invalida somente QRs ainda nao usados e expirados/antigos.
  -- Celulares ja conectados continuam funcionando juntos.
  update public.portaria_pairings_v18 x
  set active=false
  where x.device_id=v_device
    and x.claimed_at is null
    and x.active=true;

  insert into public.portaria_pairings_v18(device_id,pair_token_hash,expires_at,active)
  values(v_device,encode(digest(trim(p_pair_token),'sha256'),'hex'),now()+interval '2 minutes',true)
  returning * into p;

  return query select
    p.id,
    p.expires_at,
    upper(substr(replace(p.id::text,'-',''),1,6));
end;
$$;

grant execute on function public.portaria_create_pair_v19(text,text) to anon, authenticated;

create or replace function public.portaria_claim_pair_v19(
  p_pair_token text,
  p_reader_secret text,
  p_reader_label text default null
)
returns table(ok boolean,message text,reader_id uuid,reader_label text,reader_expires_at timestamptz)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  p public.portaria_pairings_v18%rowtype;
  d public.portaria_devices_v18%rowtype;
  v_label text;
begin
  if coalesce(length(trim(p_reader_secret)),0)<20 then
    return query select false,'Leitor invalido'::text,null::uuid,null::text,null::timestamptz;
    return;
  end if;

  select x.* into p
  from public.portaria_pairings_v18 x
  where x.pair_token_hash=encode(digest(trim(coalesce(p_pair_token,'')),'sha256'),'hex')
    and x.active=true
    and x.claimed_at is null
    and x.expires_at>now()
  for update
  limit 1;

  if not found then
    return query select false,'QR de conexao expirado ou ja utilizado'::text,null::uuid,null::text,null::timestamptz;
    return;
  end if;

  select x.* into d from public.portaria_devices_v18 x where x.id=p.device_id;
  if not found or not d.active or d.revoked_at is not null then
    return query select false,'Computador nao autorizado'::text,null::uuid,null::text,null::timestamptz;
    return;
  end if;

  v_label:=left(coalesce(nullif(trim(p_reader_label),''),'Celular '||upper(substr(replace(p.id::text,'-',''),1,4))),50);

  update public.portaria_pairings_v18 x
  set reader_secret_hash=encode(digest(trim(p_reader_secret),'sha256'),'hex'),
      reader_label=v_label,
      claimed_at=now(),
      reader_expires_at=now()+interval '12 hours',
      last_scan_at=null,
      active=true
  where x.id=p.id
  returning * into p;

  return query select true,'Leitor conectado'::text,p.id,p.reader_label,p.reader_expires_at;
end;
$$;

grant execute on function public.portaria_claim_pair_v19(text,text,text) to anon, authenticated;

create or replace function public.portaria_reader_submit_v19(
  p_reader_secret text,
  p_raw_code text
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  p public.portaria_pairings_v18%rowtype;
  d public.portaria_devices_v18%rowtype;
  v_code text;
begin
  v_code:=left(trim(coalesce(p_raw_code,'')),500);
  if v_code='' then raise exception 'QR vazio'; end if;

  select x.* into p
  from public.portaria_pairings_v18 x
  where x.reader_secret_hash=encode(digest(trim(coalesce(p_reader_secret,'')),'sha256'),'hex')
    and x.active=true
    and x.claimed_at is not null
    and x.reader_expires_at>now()
  limit 1;
  if not found then raise exception 'Sessao do leitor expirada. Conecte novamente pelo computador.'; end if;

  select x.* into d from public.portaria_devices_v18 x where x.id=p.device_id;
  if not found or not d.active or d.revoked_at is not null then raise exception 'Computador nao autorizado'; end if;

  insert into public.portaria_scan_queue_v18(device_id,pairing_id,raw_code)
  values(p.device_id,p.id,v_code);
  update public.portaria_pairings_v18 x set last_scan_at=now() where x.id=p.id;
  return true;
end;
$$;

grant execute on function public.portaria_reader_submit_v19(text,text) to anon, authenticated;

create or replace function public.portaria_device_list_readers_v19(p_device_key text)
returns table(
  reader_id uuid,
  reader_label text,
  connected_at timestamptz,
  last_scan_at timestamptz,
  expires_at timestamptz,
  active boolean
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_device uuid;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;

  return query
  select
    p.id,
    coalesce(p.reader_label,'Celular '||upper(substr(replace(p.id::text,'-',''),1,4))),
    p.claimed_at,
    p.last_scan_at,
    p.reader_expires_at,
    (p.active=true and p.claimed_at is not null and p.reader_expires_at>now())
  from public.portaria_pairings_v18 p
  where p.device_id=v_device
    and p.claimed_at is not null
    and p.created_at>now()-interval '24 hours'
  order by (p.active=true and p.reader_expires_at>now()) desc,p.claimed_at desc;
end;
$$;

grant execute on function public.portaria_device_list_readers_v19(text) to anon, authenticated;

create or replace function public.portaria_device_disconnect_reader_v19(
  p_device_key text,
  p_reader_id uuid
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_device uuid;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;
  update public.portaria_pairings_v18 p
  set active=false
  where p.id=p_reader_id and p.device_id=v_device;
  if not found then raise exception 'Leitor nao encontrado'; end if;
  return true;
end;
$$;

grant execute on function public.portaria_device_disconnect_reader_v19(text,uuid) to anon, authenticated;

-- -------------------------------------------------------------
-- VENDA NA HORA: contexto de evento/lotes + PIX cadastrado
-- -------------------------------------------------------------
create or replace function public.portaria_device_sales_context_v19(
  p_device_key text,
  p_event_id bigint
)
returns table(
  event_id bigint,
  event_name text,
  event_date date,
  pix_key text,
  raffle_enabled boolean,
  raffle_prize text,
  lot_id bigint,
  lot_name text,
  sector text,
  price_female numeric,
  price_male numeric,
  quantity_available bigint,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare v_device uuid;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;

  return query
  select
    e.id,
    e.name,
    e.event_date,
    coalesce(e.pix_key,''),
    coalesce(e.raffle_enabled,false),
    coalesce(e.raffle_prize,''),
    l.id,
    l.name,
    l.sector,
    coalesce(l.price_female,l.price),
    coalesce(l.price_male,l.price),
    case when l.quantity_total=0 then null::bigint
         else greatest(l.quantity_total-count(t.id) filter(where t.payment_status in('Pendente','Pago')),0)::bigint
    end,
    l.starts_at,
    l.ends_at,
    l.active
  from public.events e
  join public.ticket_lots l on l.event_id=e.id
  left join public.tickets t on t.lot_id=l.id
  where e.id=p_event_id
    and e.active=true
  group by e.id,l.id
  order by l.sort_order,l.id;
end;
$$;

grant execute on function public.portaria_device_sales_context_v19(text,bigint) to anon, authenticated;

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
  if v_device is null then raise exception 'Computador nao autorizado'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome da pessoa'; end if;
  if p_gender not in('Feminino','Masculino') then raise exception 'Selecione Feminino ou Masculino'; end if;

  select x.* into l
  from public.ticket_lots x
  where x.id=p_lot_id and x.event_id=p_event_id
  for update;
  if not found or not l.active then raise exception 'Ingresso indisponivel'; end if;

  select x.* into e from public.events x where x.id=p_event_id and x.active=true;
  if not found then raise exception 'Evento indisponivel'; end if;
  if coalesce(trim(e.pix_key),'')='' then raise exception 'Cadastre a chave PIX deste evento no Admin antes de vender na Portaria'; end if;
  if l.starts_at is not null and now()<l.starts_at then raise exception 'Este lote ainda nao abriu'; end if;
  if l.ends_at is not null and now()>=l.ends_at then raise exception 'Este lote ja encerrou'; end if;

  select count(*)::integer into v_used
  from public.tickets t
  where t.lot_id=l.id and t.payment_status in('Pendente','Pago');
  if l.quantity_total>0 and v_used>=l.quantity_total then raise exception 'Ingresso esgotado'; end if;

  v_original:=case when p_gender='Masculino' then coalesce(l.price_male,l.price,0) else coalesce(l.price_female,l.price,0) end;
  if v_original<0 then raise exception 'Preco invalido'; end if;
  v_total:=round(v_original+v_fee,2);

  loop
    v_code:='HYPE-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,10));
    exit when not exists(select 1 from public.tickets t where t.ticket_code=v_code);
  end loop;
  v_qr:=gen_random_uuid()::text;

  insert into public.tickets(
    event_id,lot_id,customer_name,phone,email,cpf,gender,
    price,original_price,discount_amount,service_fee,
    ticket_code,qr_token,payment_status,entry_status,
    sale_origin,door_device_id
  ) values(
    e.id,l.id,trim(p_name),nullif(trim(coalesce(p_phone,'')),''),nullif(lower(trim(coalesce(p_email,''))),''),nullif(trim(coalesce(p_cpf,'')),''),p_gender,
    v_total,v_original,0,v_fee,
    v_code,v_qr,'Pendente','Não utilizado',
    'portaria',v_device
  ) returning tickets.id,tickets.purchased_at into v_id,v_purchased;

  insert into public.portaria_logs_v18(device_id,ticket_id,action,metadata)
  values(v_device,v_id,'DOOR_ORDER_CREATED',jsonb_build_object('event_id',e.id,'lot_id',l.id,'price',v_total));

  return query select
    v_id,e.id,e.name,v_code,v_qr,trim(p_name),nullif(trim(coalesce(p_phone,'')),''),nullif(trim(coalesce(p_cpf,'')),''),nullif(lower(trim(coalesce(p_email,''))),''),p_gender,
    l.id,l.name,l.sector,v_total,'Pendente'::text,coalesce(e.pix_key,''),coalesce(e.raffle_enabled,false),coalesce(e.raffle_prize,''),v_purchased;
end;
$$;

grant execute on function public.portaria_device_create_door_order_v19(text,bigint,bigint,text,text,text,text,text) to anon, authenticated;

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
  if v_device is null then raise exception 'Computador nao autorizado'; end if;

  select x.* into t from public.tickets x where x.id=p_ticket_id for update;
  if not found then raise exception 'Venda nao encontrada'; end if;
  if coalesce(t.sale_origin,'site')<>'portaria' then raise exception 'Este pagamento deve ser confirmado pelo Admin'; end if;
  if t.door_device_id is distinct from v_device then raise exception 'Esta venda foi criada em outro computador da Portaria'; end if;
  if t.payment_status='Cancelado' then raise exception 'Ingresso cancelado'; end if;

  if t.payment_status<>'Pago' then
    update public.tickets x
    set payment_status='Pago',paid_at=coalesce(x.paid_at,now())
    where x.id=t.id
    returning * into t;

    insert into public.portaria_logs_v18(device_id,ticket_id,action,metadata)
    values(v_device,t.id,'DOOR_PAYMENT_CONFIRMED',jsonb_build_object('price',t.price));
  end if;

  select x.* into e from public.events x where x.id=t.event_id;

  return query select
    t.id,t.ticket_code,t.qr_token,t.customer_name,t.payment_status,t.paid_at,
    coalesce(e.raffle_enabled,false),coalesce(e.raffle_prize,'');
end;
$$;

grant execute on function public.portaria_device_confirm_door_payment_v19(text,bigint) to anon, authenticated;

create or replace function public.portaria_device_cancel_door_order_v19(
  p_device_key text,
  p_ticket_id bigint
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_device uuid;
  t public.tickets%rowtype;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;
  select x.* into t from public.tickets x where x.id=p_ticket_id for update;
  if not found then raise exception 'Venda nao encontrada'; end if;
  if coalesce(t.sale_origin,'site')<>'portaria' or t.door_device_id is distinct from v_device then raise exception 'Sem permissao para cancelar esta venda'; end if;
  if t.payment_status='Pago' then raise exception 'Venda ja paga. Cancele pelo Admin se necessario'; end if;
  update public.tickets x set payment_status='Cancelado',canceled_at=now() where x.id=t.id;
  insert into public.portaria_logs_v18(device_id,ticket_id,action) values(v_device,t.id,'DOOR_ORDER_CANCELED');
  return true;
end;
$$;

grant execute on function public.portaria_device_cancel_door_order_v19(text,bigint) to anon, authenticated;

-- A regra do sorteio permanece simples e segura:
-- staff_raffle_participants_v18 e staff_draw_raffle_v18 leem TODOS os tickets
-- do evento com payment_status='Pago'. Portanto site, promoter e portaria entram
-- automaticamente depois da confirmacao do pagamento. O sorteio so pode ser
-- executado pela funcao staff_draw_raffle_v18, que exige perfil Admin.

-- Limpeza leve de tokens antigos. Nao remove leitores ainda validos.
update public.portaria_pairings_v18
set active=false
where active=true
  and claimed_at is null
  and expires_at<now();
