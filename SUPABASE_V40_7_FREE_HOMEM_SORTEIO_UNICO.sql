-- ============================================================
-- HYPE V40.6 — VOLTAR COMPRA NORMAL + PORTARIA MELHOR + LISTA SIMPLES
-- Execute UMA VEZ no SQL Editor.
-- Nao apaga eventos, vendas, ingressos, pagamentos, sorteios ou historico.
-- ============================================================

create extension if not exists pgcrypto;

-- Mantem a tabela do FREE por horario caso ela seja usada nos lotes.
-- Isso tambem corrige o erro "lot_free_rules_v38 does not exist".
create table if not exists public.lot_free_rules_v38 (
  lot_id bigint primary key references public.ticket_lots(id) on delete cascade,
  female_free_until timestamptz,
  updated_at timestamptz not null default now()
);
revoke all on public.lot_free_rules_v38 from anon,authenticated;

-- ============================================================
-- COMPRA DO CLIENTE VOLTA AO FLUXO NORMAL AUTOMATICO
-- Cliente compra -> PIX Asaas -> webhook confirma -> ingresso libera.
-- Sem etapa manual do Admin para liberar compra.
-- ============================================================
-- Compra do site/promoter respeitando FREE ate horario
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
  v_free_until timestamptz := null;
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

  select r.female_free_until into v_free_until
  from public.lot_free_rules_v38 r
  where r.lot_id=v_lot.id;

  v_is_free := (
    p_gender='Feminino'
    and (
      v_original=0
      or (v_free_until is not null and now()<v_free_until)
    )
  );

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
    v_payment_method := case
      when v_free_until is not null and now()<v_free_until and v_original>0 then 'Feminino FREE ate horario'
      else 'Feminino FREE'
    end;
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

-- ============================================================
-- PORTARIA: confirma entrada pelo QR sem obrigar documento,
-- mas com conferencias fortes: evento certo, pago, cancelado,
-- duplicado e reentrada.
-- ============================================================
create or replace function public.portaria_device_validate_v18(
  p_device_key text,
  p_event_id bigint,
  p_code text
)
returns table(
  ok boolean,message text,ticket_id bigint,event_id bigint,ticket_code text,customer_name text,cpf text,
  lot_name text,sector text,payment_status text,entry_status text,entry_at timestamptz,
  document_checked boolean,temporary_exit boolean,reentry_authorized boolean,reentry_count integer
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_device uuid;
  d public.portaria_devices_v18%rowtype;
  t public.tickets%rowtype;
  l public.ticket_lots%rowtype;
  v_code text;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;
  select x.* into d from public.portaria_devices_v18 x where x.id=v_device;

  v_code:=trim(coalesce(p_code,''));
  if left(v_code,1)='#' then v_code:=substr(v_code,2); end if;

  select x.* into t
  from public.tickets x
  where upper(x.ticket_code)=upper(v_code) or x.qr_token=v_code
  limit 1
  for update;

  if not found then
    return query select false,'INGRESSO NAO ENCONTRADO',null::bigint,null::bigint,null::text,null::text,null::text,null::text,null::text,null::text,null::text,null::timestamptz,false,false,false,0;
    return;
  end if;

  select x.* into l from public.ticket_lots x where x.id=t.lot_id;

  if p_event_id is not null and t.event_id<>p_event_id then
    return query select false,'INGRESSO DE OUTRO EVENTO',t.id,t.event_id,t.ticket_code,t.customer_name,t.cpf,l.name,l.sector,t.payment_status,t.entry_status,t.entry_at,coalesce(t.document_checked,false),coalesce(t.temporary_exit,false),coalesce(t.reentry_authorized,false),coalesce(t.reentry_count,0);
    return;
  end if;

  if coalesce(t.payment_status,'')='Cancelado' then
    return query select false,'INGRESSO CANCELADO',t.id,t.event_id,t.ticket_code,t.customer_name,t.cpf,l.name,l.sector,t.payment_status,t.entry_status,t.entry_at,coalesce(t.document_checked,false),coalesce(t.temporary_exit,false),coalesce(t.reentry_authorized,false),coalesce(t.reentry_count,0);
    return;
  end if;

  if coalesce(t.payment_status,'')<>'Pago' then
    return query select false,'PAGAMENTO NAO CONFIRMADO',t.id,t.event_id,t.ticket_code,t.customer_name,t.cpf,l.name,l.sector,t.payment_status,t.entry_status,t.entry_at,coalesce(t.document_checked,false),coalesce(t.temporary_exit,false),coalesce(t.reentry_authorized,false),coalesce(t.reentry_count,0);
    return;
  end if;

  -- V40.6: sem trava de documento. A Portaria ve os dados na tela e confere visualmente.
  if coalesce(t.entry_status,'')='Entrada utilizada' and not coalesce(t.temporary_exit,false) then
    return query select false,'INGRESSO JA UTILIZADO',t.id,t.event_id,t.ticket_code,t.customer_name,t.cpf,l.name,l.sector,t.payment_status,t.entry_status,t.entry_at,coalesce(t.document_checked,false),coalesce(t.temporary_exit,false),coalesce(t.reentry_authorized,false),coalesce(t.reentry_count,0);
    return;
  end if;

  if coalesce(t.temporary_exit,false) and not coalesce(t.reentry_authorized,false) then
    return query select false,'REENTRADA NAO AUTORIZADA',t.id,t.event_id,t.ticket_code,t.customer_name,t.cpf,l.name,l.sector,t.payment_status,t.entry_status,t.entry_at,coalesce(t.document_checked,false),coalesce(t.temporary_exit,false),coalesce(t.reentry_authorized,false),coalesce(t.reentry_count,0);
    return;
  end if;

  if coalesce(t.temporary_exit,false) and coalesce(t.reentry_authorized,false) then
    update public.tickets x
    set temporary_exit=false,
        reentry_authorized=false,
        reentry_count=coalesce(x.reentry_count,0)+1,
        last_entry_device=d.label
    where x.id=t.id
    returning * into t;

    insert into public.portaria_logs_v18(device_id,ticket_id,action,metadata)
    values(v_device,t.id,'REENTRY',jsonb_build_object('device',d.label,'v','40.6'));

    return query select true,'REENTRADA LIBERADA',t.id,t.event_id,t.ticket_code,t.customer_name,t.cpf,l.name,l.sector,t.payment_status,t.entry_status,t.entry_at,coalesce(t.document_checked,false),coalesce(t.temporary_exit,false),coalesce(t.reentry_authorized,false),coalesce(t.reentry_count,0);
    return;
  end if;

  update public.tickets x
  set entry_status='Entrada utilizada',
      entry_at=coalesce(x.entry_at,now()),
      last_entry_device=d.label
  where x.id=t.id
  returning * into t;

  insert into public.portaria_logs_v18(device_id,ticket_id,action,metadata)
  values(v_device,t.id,'ENTRY',jsonb_build_object('device',d.label,'v','40.6'));

  return query select true,'ENTRADA LIBERADA',t.id,t.event_id,t.ticket_code,t.customer_name,t.cpf,l.name,l.sector,t.payment_status,t.entry_status,t.entry_at,coalesce(t.document_checked,false),coalesce(t.temporary_exit,false),coalesce(t.reentry_authorized,false),coalesce(t.reentry_count,0);
end;
$$;

grant execute on function public.portaria_device_validate_v18(text,bigint,text) to anon,authenticated;

-- ============================================================
-- LISTA SIMPLES DA PORTARIA
-- Separada dos ingressos: nao gera QR, nao gera pagamento,
-- nao vira compra e nao entra no sorteio automaticamente.
-- ============================================================
create table if not exists public.guest_list_simple_v406 (
  id bigint generated by default as identity primary key,
  event_id bigint not null references public.events(id) on delete cascade,
  name text not null,
  cpf text,
  gender text,
  status text not null default 'Liberado' check (status in ('Liberado','Entrou','Cancelado')),
  created_at timestamptz not null default now(),
  entered_at timestamptz,
  added_by text,
  entry_device_id uuid references public.portaria_devices_v18(id) on delete set null,
  notes text
);

create index if not exists idx_guest_list_simple_v406_event_name
  on public.guest_list_simple_v406(event_id,lower(name));

create index if not exists idx_guest_list_simple_v406_event_status
  on public.guest_list_simple_v406(event_id,status,created_at desc);

revoke all on public.guest_list_simple_v406 from anon,authenticated;

create or replace function public.portaria_guest_simple_add_v406(
  p_device_key text,
  p_event_id bigint,
  p_name text
)
returns table(list_id bigint,name text,status text,created_at timestamptz)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_device uuid;
  d public.portaria_devices_v18%rowtype;
  v_name text;
  g public.guest_list_simple_v406%rowtype;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;
  select x.* into d from public.portaria_devices_v18 x where x.id=v_device;

  if not exists(select 1 from public.events e where e.id=p_event_id) then
    raise exception 'Evento nao encontrado';
  end if;

  v_name:=regexp_replace(trim(coalesce(p_name,'')),'\s+',' ','g');
  if length(v_name)<2 then raise exception 'Digite o nome da pessoa'; end if;

  insert into public.guest_list_simple_v406(event_id,name,status,added_by)
  values(p_event_id,v_name,'Liberado',coalesce(d.label,'Portaria'))
  returning * into g;

  insert into public.portaria_logs_v18(device_id,ticket_id,action,metadata)
  values(v_device,null,'SIMPLE_LIST_ADD',jsonb_build_object('event_id',p_event_id,'list_id',g.id,'name',v_name));

  return query select g.id,g.name,g.status,g.created_at;
end;
$$;

grant execute on function public.portaria_guest_simple_add_v406(text,bigint,text) to anon,authenticated;

create or replace function public.portaria_guest_simple_search_v406(
  p_device_key text,
  p_event_id bigint,
  p_query text
)
returns table(list_id bigint,name text,cpf text,gender text,status text,created_at timestamptz,entered_at timestamptz)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_device uuid;
  v_query text;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;

  v_query:=lower(trim(coalesce(p_query,'')));
  if length(v_query)<1 then raise exception 'Digite um nome para buscar'; end if;

  return query
  select g.id,g.name,coalesce(g.cpf,''),coalesce(g.gender,''),g.status,g.created_at,g.entered_at
  from public.guest_list_simple_v406 g
  where g.event_id=p_event_id
    and g.status<>'Cancelado'
    and (
      lower(g.name) like '%'||v_query||'%'
      or (regexp_replace(v_query,'\D','','g')<>'' and regexp_replace(coalesce(g.cpf,''),'\D','','g') like '%'||regexp_replace(v_query,'\D','','g')||'%')
    )
  order by case when lower(g.name)=v_query then 0 else 1 end,g.status,g.created_at desc
  limit 30;
end;
$$;

grant execute on function public.portaria_guest_simple_search_v406(text,bigint,text) to anon,authenticated;

create or replace function public.portaria_guest_simple_enter_v406(
  p_device_key text,
  p_list_id bigint
)
returns table(ok boolean,message text,list_id bigint,name text,status text,entered_at timestamptz)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_device uuid;
  d public.portaria_devices_v18%rowtype;
  g public.guest_list_simple_v406%rowtype;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;
  select x.* into d from public.portaria_devices_v18 x where x.id=v_device;

  select x.* into g
  from public.guest_list_simple_v406 x
  where x.id=p_list_id
  for update;

  if not found then
    return query select false,'NOME NAO ENCONTRADO',null::bigint,null::text,null::text,null::timestamptz;
    return;
  end if;

  if g.status='Cancelado' then
    return query select false,'NOME CANCELADO',g.id,g.name,g.status,g.entered_at;
    return;
  end if;

  if g.status='Entrou' then
    return query select false,'NOME JA ENTROU',g.id,g.name,g.status,g.entered_at;
    return;
  end if;

  update public.guest_list_simple_v406 x
  set status='Entrou',entered_at=now(),entry_device_id=v_device
  where x.id=g.id
  returning * into g;

  insert into public.portaria_logs_v18(device_id,ticket_id,action,metadata)
  values(v_device,null,'SIMPLE_LIST_ENTRY',jsonb_build_object('event_id',g.event_id,'list_id',g.id,'name',g.name,'device',d.label));

  return query select true,'ENTRADA DA LISTA LIBERADA',g.id,g.name,g.status,g.entered_at;
end;
$$;

grant execute on function public.portaria_guest_simple_enter_v406(text,bigint) to anon,authenticated;

-- Admin pode ver a lista simples, se futuramente quiser colocar painel no Admin.
create or replace function public.staff_guest_simple_list_v406(
  p_username text,
  p_password text,
  p_event_id bigint
)
returns table(list_id bigint,name text,status text,created_at timestamptz,entered_at timestamptz,added_by text)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare s public.staff_users%rowtype;
begin
  select u.* into s from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;
  if not found or s.role not in ('admin','gerente','caixa','portaria') then raise exception 'Sem permissao'; end if;

  return query
  select g.id,g.name,g.status,g.created_at,g.entered_at,coalesce(g.added_by,'')
  from public.guest_list_simple_v406 g
  where g.event_id=p_event_id
  order by g.status,g.created_at desc;
end;
$$;

grant execute on function public.staff_guest_simple_list_v406(text,text,bigint) to anon,authenticated;

NOTIFY pgrst, 'reload schema';

-- V40.6 base carregada dentro da V40.7


-- ============================================================
-- HYPE V40.7 — FREE POR GENERO COM HORARIO + SORTEIO SEM REPETIR VENCEDOR
-- Continua com compra normal, lista simples separada e portaria melhor.
-- ============================================================

-- Agora a regra de FREE por horario pode existir para Feminino e Masculino.
alter table public.lot_free_rules_v38
  add column if not exists male_free_until timestamptz;

-- Como o retorno ganhou uma coluna nova, removemos e recriamos as funcoes de leitura.
drop function if exists public.staff_lot_free_rules_v38(text,text,bigint);
drop function if exists public.public_lot_free_rules_v38(bigint);

create or replace function public.staff_lot_free_rules_v38(
  p_username text,
  p_password text,
  p_event_id bigint
)
returns table(
  lot_id bigint,
  female_free_until timestamptz,
  male_free_until timestamptz
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

  if not found or s.role not in ('admin','gerente') then
    raise exception 'Sem permissao';
  end if;

  return query
  select r.lot_id,r.female_free_until,r.male_free_until
  from public.lot_free_rules_v38 r
  join public.ticket_lots l on l.id=r.lot_id
  where l.event_id=p_event_id
  order by l.sort_order,l.id;
end;
$$;

grant execute on function public.staff_lot_free_rules_v38(text,text,bigint)
to anon,authenticated;

create or replace function public.public_lot_free_rules_v38(
  p_event_id bigint
)
returns table(
  lot_id bigint,
  female_free_until timestamptz,
  male_free_until timestamptz
)
language sql
security definer
set search_path=public
as $$
  select r.lot_id,r.female_free_until,r.male_free_until
  from public.lot_free_rules_v38 r
  join public.ticket_lots l on l.id=r.lot_id
  join public.events e on e.id=l.event_id
  where l.event_id=p_event_id
    and l.active=true
    and e.active=true;
$$;

grant execute on function public.public_lot_free_rules_v38(bigint)
to anon,authenticated;

-- Mantem compatibilidade com telas antigas: altera somente o feminino e preserva masculino.
create or replace function public.staff_set_lot_free_until_v38(
  p_username text,
  p_password text,
  p_lot_id bigint,
  p_female_free_until timestamptz
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
declare s public.staff_users%rowtype; v_male timestamptz;
begin
  select u.* into s
  from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;

  if not found or s.role not in ('admin','gerente') then raise exception 'Sem permissao'; end if;
  if not exists(select 1 from public.ticket_lots l where l.id=p_lot_id) then raise exception 'Categoria nao encontrada'; end if;

  select male_free_until into v_male from public.lot_free_rules_v38 where lot_id=p_lot_id;

  if p_female_free_until is null and v_male is null then
    delete from public.lot_free_rules_v38 r where r.lot_id=p_lot_id;
  else
    insert into public.lot_free_rules_v38(lot_id,female_free_until,male_free_until,updated_at)
    values(p_lot_id,p_female_free_until,v_male,now())
    on conflict(lot_id) do update
      set female_free_until=excluded.female_free_until,
          male_free_until=excluded.male_free_until,
          updated_at=now();
  end if;

  return true;
end;
$$;

grant execute on function public.staff_set_lot_free_until_v38(text,text,bigint,timestamptz)
to anon,authenticated;

-- Nova versao usada pela V40.7: salva feminino e masculino no mesmo clique.
create or replace function public.staff_set_lot_free_until_v38(
  p_username text,
  p_password text,
  p_lot_id bigint,
  p_female_free_until timestamptz,
  p_male_free_until timestamptz
)
returns boolean
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

  if not found or s.role not in ('admin','gerente') then raise exception 'Sem permissao'; end if;
  if not exists(select 1 from public.ticket_lots l where l.id=p_lot_id) then raise exception 'Categoria nao encontrada'; end if;

  if p_female_free_until is null and p_male_free_until is null then
    delete from public.lot_free_rules_v38 r where r.lot_id=p_lot_id;
  else
    insert into public.lot_free_rules_v38(lot_id,female_free_until,male_free_until,updated_at)
    values(p_lot_id,p_female_free_until,p_male_free_until,now())
    on conflict(lot_id) do update
      set female_free_until=excluded.female_free_until,
          male_free_until=excluded.male_free_until,
          updated_at=now();
  end if;

  return true;
end;
$$;

grant execute on function public.staff_set_lot_free_until_v38(text,text,bigint,timestamptz,timestamptz)
to anon,authenticated;

-- Catalogo publico: se o horario FREE estiver ativo, o preco daquele genero vira 0.
create or replace function public.public_lots_by_event_v16(p_event_id bigint)
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
  sort_order integer,
  auto_sequence boolean,
  auto_locked boolean
)
language sql
security definer
set search_path = public
as $$
  with lot_stats as (
    select
      l.*,
      count(t.id) filter (where t.payment_status in ('Pendente','Pago'))::bigint as sold
    from public.ticket_lots l
    left join public.tickets t on t.lot_id = l.id
    where l.event_id = p_event_id
    group by l.id
  )
  select
    l.id,
    l.event_id,
    l.name,
    l.sector,
    (case when fr.female_free_until is not null and now() < fr.female_free_until then 0 else coalesce(l.price_female, l.price) end)::numeric as price,
    (case when fr.female_free_until is not null and now() < fr.female_free_until then 0 else coalesce(l.price_female, l.price) end)::numeric as price_female,
    (case when fr.male_free_until is not null and now() < fr.male_free_until then 0 else coalesce(l.price_male, l.price) end)::numeric as price_male,
    l.quantity_total,
    l.sold as quantity_sold,
    case when l.quantity_total = 0 then null
         else greatest(l.quantity_total - l.sold, 0)::bigint
    end as quantity_available,
    l.starts_at,
    l.ends_at,
    l.active,
    l.sort_order,
    coalesce(l.auto_sequence,false) as auto_sequence,
    case
      when coalesce(l.auto_sequence,false) = false then false
      else exists (
        select 1
        from lot_stats p
        where p.event_id = l.event_id
          and lower(coalesce(p.sector,'')) = lower(coalesce(l.sector,''))
          and p.active = true
          and (p.sort_order < l.sort_order or (p.sort_order = l.sort_order and p.id < l.id))
          and (p.quantity_total = 0 or p.sold < p.quantity_total)
      )
    end as auto_locked
  from lot_stats l
  join public.events e on e.id = l.event_id
  left join public.lot_free_rules_v38 fr on fr.lot_id = l.id
  where l.active = true
    and e.active = true
  order by l.sort_order, l.id;
$$;

grant execute on function public.public_lots_by_event_v16(bigint) to anon, authenticated;

create or replace function public.public_quote_v16(p_lot_id bigint, p_gender text, p_coupon_code text default null)
returns table(
  ok boolean,
  message text,
  original_price numeric,
  discount_amount numeric,
  final_price numeric,
  coupon_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot public.ticket_lots%rowtype;
  v_coupon public.coupons_v16%rowtype;
  v_original numeric(12,2);
  v_discount numeric(12,2) := 0;
  v_used bigint := 0;
  v_code text := upper(trim(coalesce(p_coupon_code,'')));
  v_free_until timestamptz := null;
begin
  if p_gender not in ('Feminino','Masculino') then
    return query select false,'Selecione Feminino ou Masculino',0::numeric,0::numeric,0::numeric,null::text; return;
  end if;

  select * into v_lot from public.ticket_lots where id=p_lot_id and active=true;
  if not found then return query select false,'Categoria indisponivel',0::numeric,0::numeric,0::numeric,null::text; return; end if;

  v_original := case when p_gender='Masculino' then coalesce(v_lot.price_male,v_lot.price,0)
                     else coalesce(v_lot.price_female,v_lot.price,0) end;

  select case when p_gender='Masculino' then r.male_free_until else r.female_free_until end
  into v_free_until
  from public.lot_free_rules_v38 r
  where r.lot_id=v_lot.id;

  if v_free_until is not null and now()<v_free_until then
    v_original := 0;
  end if;

  if v_original<=0 then
    return query select true,(case when p_gender='Masculino' then 'Masculino FREE ate o horario configurado' else 'Feminino FREE ate o horario configurado' end),0::numeric,0::numeric,0::numeric,null::text; return;
  end if;

  if v_code='' then
    return query select true,'Sem cupom',v_original,0::numeric,v_original,null::text; return;
  end if;

  select * into v_coupon
  from public.coupons_v16 c
  where c.event_id=v_lot.event_id and upper(c.code)=v_code and c.active=true
  limit 1;

  if not found then return query select false,'Cupom invalido',v_original,0::numeric,v_original,null::text; return; end if;
  if v_coupon.starts_at is not null and now()<v_coupon.starts_at then return query select false,'Cupom ainda nao iniciou',v_original,0::numeric,v_original,null::text; return; end if;
  if v_coupon.ends_at is not null and now()>=v_coupon.ends_at then return query select false,'Cupom expirado',v_original,0::numeric,v_original,null::text; return; end if;

  select count(*)::bigint into v_used
  from public.tickets t
  where t.event_id=v_lot.event_id
    and upper(coalesce(t.coupon_code,''))=v_code
    and t.payment_status in ('Pendente','Pago');

  if v_coupon.usage_limit>0 and v_used>=v_coupon.usage_limit then return query select false,'Limite do cupom atingido',v_original,0::numeric,v_original,null::text; return; end if;

  if v_coupon.discount_type='percent' then
    v_discount := round(v_original * least(v_coupon.discount_value,100) / 100, 2);
  else
    v_discount := least(v_original,v_coupon.discount_value);
  end if;

  if greatest(v_original-v_discount,0) <= 0 then
    return query select false,'O desconto precisa deixar um valor maior que zero para pagamento PIX',v_original,v_discount,v_original,null::text; return;
  end if;
  return query select true,'Cupom aplicado',v_original,v_discount,greatest(v_original-v_discount,0),v_coupon.code;
end;
$$;

grant execute on function public.public_quote_v16(bigint,text,text) to anon, authenticated;

-- Compra do site/promoter: automatico, com FREE por genero e horario.
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
  v_free_until timestamptz := null;
begin
  if coalesce(trim(p_name),'')='' then raise exception 'Nome do cliente e obrigatorio'; end if;
  if coalesce(trim(p_email),'')='' or position('@' in p_email)=0 then raise exception 'E-mail invalido'; end if;
  if p_gender not in ('Feminino','Masculino') then raise exception 'Selecione Feminino ou Masculino'; end if;

  select l.* into v_lot from public.ticket_lots l where l.id=p_lot_id for update;
  if not found or not v_lot.active then raise exception 'Categoria indisponivel'; end if;

  select e.* into v_event from public.events e where e.id=v_lot.event_id;
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
      and (p.quantity_total=0 or (select count(*) from public.tickets tp where tp.lot_id=p.id and tp.payment_status in ('Pendente','Pago')) < p.quantity_total);
    if v_previous_open>0 then raise exception 'Este lote sera liberado automaticamente quando o anterior esgotar'; end if;
  end if;

  select count(*)::integer into v_used from public.tickets t where t.lot_id=v_lot.id and t.payment_status in ('Pendente','Pago');
  if v_lot.quantity_total>0 and v_used>=v_lot.quantity_total then raise exception 'Categoria esgotada'; end if;

  v_original := case when p_gender='Masculino' then coalesce(v_lot.price_male,v_lot.price,0) else coalesce(v_lot.price_female,v_lot.price,0) end;
  if v_original < 0 then raise exception 'Preco invalido'; end if;

  select case when p_gender='Masculino' then r.male_free_until else r.female_free_until end into v_free_until
  from public.lot_free_rules_v38 r where r.lot_id=v_lot.id;

  v_is_free := (v_original=0 or (v_free_until is not null and now()<v_free_until));

  if v_coupon_code<>'' and not v_is_free then
    select c.* into v_coupon from public.coupons_v16 c where c.event_id=v_lot.event_id and upper(c.code)=v_coupon_code and c.active=true for update;
    if not found then raise exception 'Cupom invalido'; end if;
    if v_coupon.starts_at is not null and now()<v_coupon.starts_at then raise exception 'Cupom ainda nao iniciou'; end if;
    if v_coupon.ends_at is not null and now()>=v_coupon.ends_at then raise exception 'Cupom expirado'; end if;

    select count(*)::bigint into v_coupon_used from public.tickets t where t.event_id=v_lot.event_id and upper(coalesce(t.coupon_code,''))=v_coupon_code and t.payment_status in ('Pendente','Pago');
    if v_coupon.usage_limit>0 and v_coupon_used>=v_coupon.usage_limit then raise exception 'Limite do cupom atingido'; end if;

    if v_coupon.discount_type='percent' then v_discount := round(v_original*least(v_coupon.discount_value,100)/100,2);
    else v_discount := least(v_original,v_coupon.discount_value); end if;
  end if;

  if v_promoter_code<>'' then
    select p.* into v_promoter from public.promoters_global_v16 p where upper(p.code)=v_promoter_code and p.active=true limit 1;
    if not found then raise exception 'Codigo de promoter invalido'; end if;
  end if;

  if v_is_free then
    v_discount := 0; v_coupon_code := ''; v_service_fee := 0; v_final := 0; v_payment_status := 'Pago';
    v_payment_method := case
      when p_gender='Masculino' and v_free_until is not null and now()<v_free_until then 'Masculino FREE ate horario'
      when p_gender='Masculino' then 'Masculino FREE'
      when v_free_until is not null and now()<v_free_until then 'Feminino FREE ate horario'
      else 'Feminino FREE'
    end;
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
  ) returning tickets.id,tickets.purchased_at into v_id,v_purchased;

  return query select
    v_id,v_lot.event_id,v_code,v_qr,trim(p_name),trim(p_phone),lower(trim(p_email)),trim(p_cpf),p_gender,
    v_lot.id,v_lot.name,v_lot.sector,v_final,v_original,v_discount,
    nullif(v_coupon_code,''),nullif(v_promoter_code,''),
    v_payment_status::text,'Não utilizado'::text,v_purchased;
end;
$$;

grant execute on function public.create_manual_order_v16(text,text,text,text,text,bigint,text,text)
to anon, authenticated;

-- Venda da Portaria: contexto e FREE por genero/hora.
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
    e.id,e.name,e.event_date,coalesce(e.pix_key,''),coalesce(e.raffle_enabled,false),coalesce(e.raffle_prize,''),
    l.id,l.name,l.sector,
    case when fr.female_free_until is not null and now()<fr.female_free_until then 0 else coalesce(l.price_female,l.price) end,
    case when fr.male_free_until is not null and now()<fr.male_free_until then 0 else coalesce(l.price_male,l.price) end,
    case when l.quantity_total=0 then null::bigint else greatest(l.quantity_total-count(t.id) filter(where t.payment_status in('Pendente','Pago')),0)::bigint end,
    l.starts_at,l.ends_at,l.active
  from public.events e
  join public.ticket_lots l on l.event_id=e.id
  left join public.lot_free_rules_v38 fr on fr.lot_id=l.id
  left join public.tickets t on t.lot_id=l.id
  where e.id=p_event_id
    and e.active=true
    and (
      coalesce(l.auto_sequence,false)=false
      or not exists(
        select 1 from public.ticket_lots p
        where p.event_id=l.event_id
          and lower(coalesce(p.sector,''))=lower(coalesce(l.sector,''))
          and p.active=true
          and (p.sort_order<l.sort_order or (p.sort_order=l.sort_order and p.id<l.id))
          and (p.quantity_total=0 or (select count(*) from public.tickets tp where tp.lot_id=p.id and tp.payment_status in('Pendente','Pago')) < p.quantity_total)
      )
    )
  group by e.id,l.id,fr.female_free_until,fr.male_free_until
  order by l.sort_order,l.id;
end;
$$;

grant execute on function public.portaria_device_sales_context_v19(text,bigint)
to anon,authenticated;

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
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;
  if coalesce(trim(p_name),'')='' then raise exception 'Informe o nome da pessoa'; end if;
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
    where p.event_id=l.event_id and lower(coalesce(p.sector,''))=lower(coalesce(l.sector,'')) and p.active=true
      and (p.sort_order<l.sort_order or (p.sort_order=l.sort_order and p.id<l.id))
      and (p.quantity_total=0 or (select count(*) from public.tickets tp where tp.lot_id=p.id and tp.payment_status in('Pendente','Pago')) < p.quantity_total);
    if v_previous_open>0 then raise exception 'Este lote sera liberado automaticamente quando o anterior esgotar'; end if;
  end if;

  select count(*)::integer into v_used from public.tickets t where t.lot_id=l.id and t.payment_status in('Pendente','Pago');
  if l.quantity_total>0 and v_used>=l.quantity_total then raise exception 'Ingresso esgotado'; end if;

  v_original:=case when p_gender='Masculino' then coalesce(l.price_male,l.price,0) else coalesce(l.price_female,l.price,0) end;
  if v_original<0 then raise exception 'Preco invalido'; end if;

  select case when p_gender='Masculino' then r.male_free_until else r.female_free_until end into v_free_until
  from public.lot_free_rules_v38 r where r.lot_id=l.id;

  v_is_free := (v_original=0 or (v_free_until is not null and now()<v_free_until));
  if v_is_free then
    v_fee:=0; v_total:=0; v_status:='Pago';
    v_method:=case
      when p_gender='Masculino' and v_free_until is not null and now()<v_free_until then 'Masculino FREE ate horario'
      when p_gender='Masculino' then 'Masculino FREE'
      when v_free_until is not null and now()<v_free_until then 'Feminino FREE ate horario'
      else 'Feminino FREE'
    end;
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
  ) returning tickets.id,tickets.purchased_at into v_id,v_purchased;

  insert into public.portaria_logs_v18(device_id,ticket_id,action,metadata)
  values(v_device,v_id,case when v_is_free then 'DOOR_FREE_CREATED' else 'DOOR_ORDER_CREATED' end,
    jsonb_build_object('event_id',e.id,'lot_id',l.id,'gender',p_gender,'price',v_total,'payment_provider',case when v_is_free then 'FREE' else 'ASAAS' end,'v','40.7'));

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

-- Sorteio: depois que uma pessoa ganhou neste evento, ela nao entra de novo.
-- Prioriza CPF. Se nao tiver CPF, usa o nome normalizado como fallback.
create or replace function public.staff_raffle_status_v18(
  p_username text,
  p_password text,
  p_event_id bigint
)
returns table(
  event_id bigint,
  event_name text,
  enabled boolean,
  prize text,
  participant_count bigint,
  last_winner_name text,
  last_winner_code text,
  last_draw_at timestamptz
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare s public.staff_users%rowtype;
begin
  select u.* into s from public.staff_users u
  where u.username=trim(p_username) and u.active=true and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;
  if not found or s.role<>'admin' then raise exception 'Sem permissao'; end if;

  return query
  select e.id,e.name,coalesce(e.raffle_enabled,false),coalesce(e.raffle_prize,''),
         count(t.id) filter(where t.payment_status='Pago' and not exists(
           select 1
           from public.raffle_draws_v18 old
           join public.tickets wt on wt.id=old.winner_ticket_id
           where old.event_id=e.id
             and (
               (regexp_replace(coalesce(t.cpf,''),'\D','','g')<>'' and regexp_replace(coalesce(wt.cpf,''),'\D','','g')=regexp_replace(coalesce(t.cpf,''),'\D','','g'))
               or (regexp_replace(coalesce(t.cpf,''),'\D','','g')='' and regexp_replace(coalesce(wt.cpf,''),'\D','','g')='' and lower(regexp_replace(trim(coalesce(wt.customer_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(coalesce(t.customer_name,'')),'\s+',' ','g')))
             )
         ))::bigint,
         lw.customer_name,lw.ticket_code,rd.drawn_at
  from public.events e
  left join public.tickets t on t.event_id=e.id
  left join lateral (
    select d.winner_ticket_id,d.drawn_at
    from public.raffle_draws_v18 d
    where d.event_id=e.id
    order by d.drawn_at desc,d.id desc
    limit 1
  ) rd on true
  left join public.tickets lw on lw.id=rd.winner_ticket_id
  where e.id=p_event_id
  group by e.id,lw.customer_name,lw.ticket_code,rd.drawn_at;
end;
$$;

grant execute on function public.staff_raffle_status_v18(text,text,bigint) to anon, authenticated;

create or replace function public.staff_raffle_participants_v18(
  p_username text,
  p_password text,
  p_event_id bigint
)
returns table(
  ticket_id bigint,
  customer_name text,
  ticket_code text,
  phone text,
  cpf text,
  promoter_code text,
  purchased_at timestamptz,
  paid_at timestamptz
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare s public.staff_users%rowtype;
begin
  select u.* into s from public.staff_users u
  where u.username=trim(p_username) and u.active=true and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;
  if not found or s.role<>'admin' then raise exception 'Sem permissao'; end if;

  return query
  select t.id,t.customer_name,t.ticket_code,t.phone,t.cpf,t.promoter_code,t.purchased_at,t.paid_at
  from public.tickets t
  where t.event_id=p_event_id
    and t.payment_status='Pago'
    and not exists(
      select 1
      from public.raffle_draws_v18 old
      join public.tickets wt on wt.id=old.winner_ticket_id
      where old.event_id=p_event_id
        and (
          (regexp_replace(coalesce(t.cpf,''),'\D','','g')<>'' and regexp_replace(coalesce(wt.cpf,''),'\D','','g')=regexp_replace(coalesce(t.cpf,''),'\D','','g'))
          or (regexp_replace(coalesce(t.cpf,''),'\D','','g')='' and regexp_replace(coalesce(wt.cpf,''),'\D','','g')='' and lower(regexp_replace(trim(coalesce(wt.customer_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(coalesce(t.customer_name,'')),'\s+',' ','g')))
        )
    )
  order by coalesce(t.paid_at,t.purchased_at) desc,t.id desc;
end;
$$;

grant execute on function public.staff_raffle_participants_v18(text,text,bigint) to anon, authenticated;

create or replace function public.staff_draw_raffle_v18(
  p_username text,
  p_password text,
  p_event_id bigint
)
returns table(
  draw_id bigint,
  winner_ticket_id bigint,
  customer_name text,
  ticket_code text,
  phone text,
  cpf text,
  promoter_code text,
  prize text,
  drawn_at timestamptz
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  s public.staff_users%rowtype;
  e public.events%rowtype;
  w public.tickets%rowtype;
  d public.raffle_draws_v18%rowtype;
begin
  select u.* into s from public.staff_users u
  where u.username=trim(p_username) and u.active=true and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;
  if not found or s.role<>'admin' then raise exception 'Sem permissao'; end if;

  select ev.* into e from public.events ev where ev.id=p_event_id for update;
  if not found then raise exception 'Evento nao encontrado'; end if;
  if not coalesce(e.raffle_enabled,false) then raise exception 'Ative o sorteio antes de sortear'; end if;
  if coalesce(trim(e.raffle_prize),'')='' then raise exception 'Informe o premio do sorteio'; end if;

  select t.* into w
  from public.tickets t
  where t.event_id=p_event_id
    and t.payment_status='Pago'
    and not exists(
      select 1
      from public.raffle_draws_v18 old
      join public.tickets wt on wt.id=old.winner_ticket_id
      where old.event_id=p_event_id
        and (
          (regexp_replace(coalesce(t.cpf,''),'\D','','g')<>'' and regexp_replace(coalesce(wt.cpf,''),'\D','','g')=regexp_replace(coalesce(t.cpf,''),'\D','','g'))
          or (regexp_replace(coalesce(t.cpf,''),'\D','','g')='' and regexp_replace(coalesce(wt.cpf,''),'\D','','g')='' and lower(regexp_replace(trim(coalesce(wt.customer_name,'')),'\s+',' ','g'))=lower(regexp_replace(trim(coalesce(t.customer_name,'')),'\s+',' ','g')))
        )
    )
  order by random()
  limit 1;

  if not found then
    raise exception 'Nenhum participante disponivel. Quem ja ganhou neste evento nao participa de novo';
  end if;

  insert into public.raffle_draws_v18(event_id,winner_ticket_id,prize,drawn_by)
  values(p_event_id,w.id,e.raffle_prize,s.username)
  returning * into d;

  return query select d.id,w.id,w.customer_name,w.ticket_code,w.phone,w.cpf,w.promoter_code,d.prize,d.drawn_at;
end;
$$;

grant execute on function public.staff_draw_raffle_v18(text,text,bigint) to anon, authenticated;

NOTIFY pgrst, 'reload schema';

select 'HYPE V40.7 OK - FREE feminino/masculino por horario + sorteio sem repetir vencedor' as status;
