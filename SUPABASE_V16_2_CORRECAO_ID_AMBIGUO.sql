-- HYPE V16.2 - CORRECAO DO ERRO "column reference id is ambiguous"
-- Execute UMA VEZ no Supabase > SQL Editor > New query.
-- Nao apaga eventos, ingressos, lotes, usuarios ou pagamentos.
-- Apenas corrige funcoes V16 e uma duplicacao na consulta do dashboard.

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
begin
  if p_gender not in ('Feminino','Masculino') then
    return query select false,'Selecione Feminino ou Masculino',0::numeric,0::numeric,0::numeric,null::text; return;
  end if;

  select l.* into v_lot from public.ticket_lots l where l.id=p_lot_id and l.active=true;
  if not found then return query select false,'Categoria indisponivel',0::numeric,0::numeric,0::numeric,null::text; return; end if;

  v_original := case when p_gender='Masculino' then coalesce(v_lot.price_male,v_lot.price,0)
                     else coalesce(v_lot.price_female,v_lot.price,0) end;

  if v_code='' then
    return query select true,'Sem cupom',v_original,0::numeric,v_original,null::text; return;
  end if;

  select * into v_coupon
  from public.coupons_v16 c
  where c.event_id=v_lot.event_id and upper(c.code)=v_code and c.active=true
  limit 1;

  if not found then
    return query select false,'Cupom invalido',v_original,0::numeric,v_original,null::text; return;
  end if;
  if v_coupon.starts_at is not null and now()<v_coupon.starts_at then
    return query select false,'Cupom ainda nao iniciou',v_original,0::numeric,v_original,null::text; return;
  end if;
  if v_coupon.ends_at is not null and now()>=v_coupon.ends_at then
    return query select false,'Cupom expirado',v_original,0::numeric,v_original,null::text; return;
  end if;

  select count(*)::bigint into v_used
  from public.tickets t
  where t.event_id=v_lot.event_id
    and upper(coalesce(t.coupon_code,''))=v_code
    and t.payment_status in ('Pendente','Pago');

  if v_coupon.usage_limit>0 and v_used>=v_coupon.usage_limit then
    return query select false,'Limite do cupom atingido',v_original,0::numeric,v_original,null::text; return;
  end if;

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
  v_lot public.ticket_lots%rowtype; v_event public.events%rowtype; v_coupon public.coupons_v16%rowtype; v_promoter public.promoters_v16%rowtype;
  v_used integer; v_previous_open integer:=0; v_original numeric(12,2); v_discount numeric(12,2):=0; v_final numeric(12,2);
  v_coupon_used bigint:=0; v_coupon_code text:=upper(trim(coalesce(p_coupon_code,''))); v_promoter_code text:=upper(trim(coalesce(p_promoter_code,'')));
  v_id bigint; v_code text; v_qr text; v_purchased timestamptz;
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
      and (p.quantity_total=0 or (select count(*) from public.tickets tp where tp.lot_id=p.id and tp.payment_status in ('Pendente','Pago'))<p.quantity_total);
    if v_previous_open>0 then raise exception 'Este lote sera liberado automaticamente quando o anterior esgotar'; end if;
  end if;
  select count(*)::integer into v_used from public.tickets t where t.lot_id=v_lot.id and t.payment_status in ('Pendente','Pago');
  if v_lot.quantity_total>0 and v_used>=v_lot.quantity_total then raise exception 'Categoria esgotada'; end if;
  v_original:=case when p_gender='Masculino' then coalesce(v_lot.price_male,v_lot.price,0) else coalesce(v_lot.price_female,v_lot.price,0) end;
  if v_coupon_code<>'' then
    select * into v_coupon from public.coupons_v16 c where c.event_id=v_lot.event_id and upper(c.code)=v_coupon_code and c.active=true for update;
    if not found then raise exception 'Cupom invalido'; end if;
    if v_coupon.starts_at is not null and now()<v_coupon.starts_at then raise exception 'Cupom ainda nao iniciou'; end if;
    if v_coupon.ends_at is not null and now()>=v_coupon.ends_at then raise exception 'Cupom expirado'; end if;
    select count(*)::bigint into v_coupon_used from public.tickets t where t.event_id=v_lot.event_id and upper(coalesce(t.coupon_code,''))=v_coupon_code and t.payment_status in ('Pendente','Pago');
    if v_coupon.usage_limit>0 and v_coupon_used>=v_coupon.usage_limit then raise exception 'Limite do cupom atingido'; end if;
    if v_coupon.discount_type='percent' then v_discount:=round(v_original*least(v_coupon.discount_value,100)/100,2); else v_discount:=least(v_original,v_coupon.discount_value); end if;
  end if;
  if v_promoter_code<>'' then
    select * into v_promoter from public.promoters_v16 p where p.event_id=v_lot.event_id and upper(p.code)=v_promoter_code and p.active=true limit 1;
    if not found then raise exception 'Codigo de promoter invalido'; end if;
  end if;
  v_final:=greatest(v_original-v_discount,0);
  if v_final<=0 then raise exception 'O desconto precisa deixar um valor maior que zero para pagamento PIX'; end if;
  loop v_code:='HYPE-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,10)); exit when not exists(select 1 from public.tickets t where t.ticket_code=v_code); end loop;
  v_qr:=gen_random_uuid()::text;
  insert into public.tickets(event_id,lot_id,customer_name,phone,email,cpf,gender,price,original_price,discount_amount,coupon_code,promoter_code,ticket_code,qr_token,payment_status,entry_status)
  values(v_lot.event_id,v_lot.id,trim(p_name),trim(p_phone),lower(trim(p_email)),trim(p_cpf),p_gender,v_final,v_original,v_discount,nullif(v_coupon_code,''),nullif(v_promoter_code,''),v_code,v_qr,'Pendente','Não utilizado')
  returning tickets.id,tickets.purchased_at into v_id,v_purchased;
  return query select v_id,v_lot.event_id,v_code,v_qr,trim(p_name),trim(p_phone),lower(trim(p_email)),trim(p_cpf),p_gender,v_lot.id,v_lot.name,v_lot.sector,v_final,v_original,v_discount,nullif(v_coupon_code,''),nullif(v_promoter_code,''),'Pendente'::text,'Não utilizado'::text,v_purchased;
end;
$$;

grant execute on function public.create_manual_order_v16(text,text,text,text,text,bigint,text,text) to anon, authenticated;

create or replace function public.staff_list_promoters_v16(p_username text,p_password text,p_event_id bigint)
returns table(id bigint,event_id bigint,name text,code text,active boolean,sales_count bigint,paid_count bigint,revenue numeric)
language plpgsql security definer set search_path=public,extensions as $$
declare v_staff public.staff_users%rowtype;
begin
  select s.* into v_staff from public.staff_users s where s.username=trim(p_username) and s.active=true and s.password_hash=crypt(p_password,s.password_hash);
  if not found or v_staff.role<>'admin' then raise exception 'Sem permissao'; end if;
  return query
  select p.id,p.event_id,p.name,p.code,p.active,
         count(t.id) filter(where t.payment_status in ('Pendente','Pago'))::bigint,
         count(t.id) filter(where t.payment_status='Pago')::bigint,
         coalesce(sum(t.price) filter(where t.payment_status='Pago'),0)::numeric
  from public.promoters_v16 p
  left join public.tickets t on t.event_id=p.event_id and upper(coalesce(t.promoter_code,''))=upper(p.code)
  where p.event_id=p_event_id
  group by p.id order by p.created_at desc;
end; $$;

grant execute on function public.staff_list_promoters_v16(text,text,bigint) to anon, authenticated;

create or replace function public.staff_list_coupons_v16(p_username text,p_password text,p_event_id bigint)
returns table(id bigint,event_id bigint,code text,discount_type text,discount_value numeric,usage_limit integer,uses_count bigint,starts_at timestamptz,ends_at timestamptz,active boolean)
language plpgsql security definer set search_path=public,extensions as $$
declare v_staff public.staff_users%rowtype;
begin
  select s.* into v_staff from public.staff_users s where s.username=trim(p_username) and s.active=true and s.password_hash=crypt(p_password,s.password_hash);
  if not found or v_staff.role<>'admin' then raise exception 'Sem permissao'; end if;
  return query
  select c.id,c.event_id,c.code,c.discount_type,c.discount_value,c.usage_limit,
         count(t.id) filter(where t.payment_status in ('Pendente','Pago'))::bigint,
         c.starts_at,c.ends_at,c.active
  from public.coupons_v16 c
  left join public.tickets t on t.event_id=c.event_id and upper(coalesce(t.coupon_code,''))=upper(c.code)
  where c.event_id=p_event_id
  group by c.id order by c.created_at desc;
end; $$;

grant execute on function public.staff_list_coupons_v16(text,text,bigint) to anon, authenticated;

create or replace function public.staff_list_tickets_v16(p_username text,p_password text,p_search text default '')
returns table(
  id bigint,event_id bigint,event_name text,ticket_code text,customer_name text,phone text,email text,cpf text,gender text,
  lot_id bigint,lot_name text,sector text,price numeric,original_price numeric,discount_amount numeric,coupon_code text,promoter_code text,
  payment_method text,payment_status text,entry_status text,purchased_at timestamptz,paid_at timestamptz,entry_at timestamptz,email_sent_at timestamptz
)
language plpgsql security definer set search_path=public,extensions as $$
declare v_staff public.staff_users%rowtype;
begin
  select s.* into v_staff from public.staff_users s where s.username=trim(p_username) and s.active=true and s.password_hash=crypt(p_password,s.password_hash);
  if not found or v_staff.role not in ('admin','gerente','caixa') then raise exception 'Sem permissao'; end if;
  return query
  select t.id,t.event_id,e.name,t.ticket_code,t.customer_name,t.phone,t.email,t.cpf,t.gender,t.lot_id,l.name,l.sector,t.price,
         coalesce(t.original_price,t.price),coalesce(t.discount_amount,0),t.coupon_code,t.promoter_code,t.payment_method,t.payment_status,t.entry_status,
         t.purchased_at,t.paid_at,t.entry_at,t.email_sent_at
  from public.tickets t
  join public.ticket_lots l on l.id=t.lot_id
  join public.events e on e.id=t.event_id
  where coalesce(p_search,'')=''
     or lower(t.customer_name) like '%'||lower(p_search)||'%'
     or lower(t.ticket_code) like '%'||lower(p_search)||'%'
     or lower(coalesce(t.phone,'')) like '%'||lower(p_search)||'%'
     or lower(coalesce(t.email,'')) like '%'||lower(p_search)||'%'
     or lower(coalesce(t.promoter_code,'')) like '%'||lower(p_search)||'%'
     or lower(coalesce(t.coupon_code,'')) like '%'||lower(p_search)||'%'
     or lower(coalesce(e.name,'')) like '%'||lower(p_search)||'%'
  order by t.created_at desc;
end; $$;

grant execute on function public.staff_list_tickets_v16(text,text,text) to anon, authenticated;
