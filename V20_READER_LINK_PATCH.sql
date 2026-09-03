-- =============================================================
-- HYPE LOUNGE CLUB // V20 - LINK EXCLUSIVO DO LEITOR
-- Execute depois da V18 ou V19. Nao apaga ingressos/eventos/promoters.
-- =============================================================

create extension if not exists pgcrypto;

alter table public.portaria_pairings_v18
  add column if not exists reader_label text;

-- Gera um link individual de ativacao a partir do computador autorizado.
-- Nao invalida outros links ainda nao usados, permitindo preparar varios celulares.
create or replace function public.portaria_device_create_reader_link_v20(
  p_device_key text,
  p_link_token text,
  p_reader_label text default null
)
returns table(
  reader_id uuid,
  reader_label text,
  link_expires_at timestamptz
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  v_device uuid;
  p public.portaria_pairings_v18%rowtype;
  v_label text;
begin
  v_device:=public.portaria_device_id_v18(p_device_key);
  if v_device is null then raise exception 'Computador nao autorizado'; end if;
  if coalesce(length(trim(p_link_token)),0)<40 then raise exception 'Token do link invalido'; end if;

  v_label:=left(coalesce(nullif(trim(p_reader_label),''),'Celular leitor'),50);

  update public.portaria_pairings_v18 x
  set active=false
  where x.device_id=v_device
    and x.active=true
    and x.claimed_at is null
    and x.expires_at<=now();

  insert into public.portaria_pairings_v18(
    device_id,pair_token_hash,expires_at,active,reader_label
  ) values(
    v_device,
    encode(digest(trim(p_link_token),'sha256'),'hex'),
    now()+interval '15 minutes',
    true,
    v_label
  )
  returning * into p;

  return query select p.id,coalesce(p.reader_label,v_label),p.expires_at;
end;
$$;

grant execute on function public.portaria_device_create_reader_link_v20(text,text,text) to anon, authenticated;

-- O link pode ser ativado apenas uma vez. Depois o token some da URL e
-- o celular guarda apenas uma credencial secreta local por ate 16 horas.
create or replace function public.portaria_claim_reader_link_v20(
  p_link_token text,
  p_reader_secret text,
  p_reader_label text default null
)
returns table(
  ok boolean,
  message text,
  reader_id uuid,
  reader_label text,
  reader_expires_at timestamptz
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  p public.portaria_pairings_v18%rowtype;
  d public.portaria_devices_v18%rowtype;
  v_label text;
begin
  if coalesce(length(trim(p_reader_secret)),0)<40 then
    return query select false,'Leitor invalido'::text,null::uuid,null::text,null::timestamptz;
    return;
  end if;

  select x.* into p
  from public.portaria_pairings_v18 x
  where x.pair_token_hash=encode(digest(trim(coalesce(p_link_token,'')),'sha256'),'hex')
    and x.active=true
    and x.claimed_at is null
    and x.expires_at>now()
  for update
  limit 1;

  if not found then
    return query select false,'Link expirado, ja utilizado ou bloqueado. Gere um novo link na Portaria.'::text,null::uuid,null::text,null::timestamptz;
    return;
  end if;

  select x.* into d from public.portaria_devices_v18 x where x.id=p.device_id;
  if not found or not d.active or d.revoked_at is not null then
    return query select false,'Computador da Portaria nao autorizado'::text,null::uuid,null::text,null::timestamptz;
    return;
  end if;

  v_label:=left(coalesce(nullif(trim(p.reader_label),''),nullif(trim(p_reader_label),''),'Celular leitor'),50);

  update public.portaria_pairings_v18 x
  set reader_secret_hash=encode(digest(trim(p_reader_secret),'sha256'),'hex'),
      reader_label=v_label,
      claimed_at=now(),
      reader_expires_at=now()+interval '16 hours',
      last_scan_at=null,
      active=true
  where x.id=p.id
  returning * into p;

  return query select true,'Leitor autorizado'::text,p.id,p.reader_label,p.reader_expires_at;
end;
$$;

grant execute on function public.portaria_claim_reader_link_v20(text,text,text) to anon, authenticated;

-- Admin enxerga os leitores de todos os computadores autorizados.
create or replace function public.staff_list_portaria_readers_v20(
  p_username text,
  p_password text
)
returns table(
  reader_id uuid,
  device_id uuid,
  device_label text,
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
declare s public.staff_users%rowtype;
begin
  select u.* into s
  from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;

  if not found or s.role<>'admin' then raise exception 'Sem permissao'; end if;

  return query
  select
    p.id,
    d.id,
    d.label,
    coalesce(p.reader_label,'Celular leitor'),
    p.claimed_at,
    p.last_scan_at,
    p.reader_expires_at,
    (p.active=true and p.claimed_at is not null and p.reader_expires_at>now() and d.active=true and d.revoked_at is null)
  from public.portaria_pairings_v18 p
  join public.portaria_devices_v18 d on d.id=p.device_id
  where p.claimed_at is not null
    and p.created_at>now()-interval '7 days'
  order by
    (p.active=true and p.reader_expires_at>now()) desc,
    p.claimed_at desc;
end;
$$;

grant execute on function public.staff_list_portaria_readers_v20(text,text) to anon, authenticated;

create or replace function public.staff_revoke_portaria_reader_v20(
  p_username text,
  p_password text,
  p_reader_id uuid
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

  if not found or s.role<>'admin' then raise exception 'Sem permissao'; end if;

  update public.portaria_pairings_v18 p
  set active=false
  where p.id=p_reader_id;

  if not found then raise exception 'Leitor nao encontrado'; end if;
  return true;
end;
$$;

grant execute on function public.staff_revoke_portaria_reader_v20(text,text,uuid) to anon, authenticated;

-- Limpeza leve de links de ativacao vencidos. Nao remove leitores validos.
update public.portaria_pairings_v18
set active=false
where active=true
  and claimed_at is null
  and expires_at<=now();

-- IMPORTANTE SOBRE VENDA NA HORA:
-- As funcoes V19 reaplicadas no patch V20 mantem a regra:
-- 1) a Portaria cria sale_origin='portaria' e grava door_device_id;
-- 2) portaria_device_confirm_door_payment_v19 recusa qualquer venda do site/promoter;
-- 3) o mesmo RPC recusa venda criada em outro computador da Portaria;
-- 4) ao ficar PAGO, o ingresso passa a integrar o sorteio do evento automaticamente;
-- 5) o sorteio continua exigindo perfil Admin.
