-- ============================================================
-- HYPE LOUNGE CLUB // V36
-- CORREÇÃO iPHONE/iOS: LINK DO LEITOR REUTILIZÁVEL
--
-- Problema corrigido:
-- - o link antigo durava 15 minutos e só podia ser usado 1 vez;
-- - Gmail/Safari no iPhone pode abrir em contextos diferentes e perder o
--   armazenamento local, fazendo o mesmo link aparecer como expirado/usado.
--
-- Nova regra:
-- - o MESMO link pode ser reaberto por até 7 dias;
-- - cada reabertura renova a sessão do leitor por 30 horas;
-- - se o Admin desconectar/revogar o leitor, o link continua bloqueado;
-- - não apaga ingressos, eventos, vendas ou dispositivos.
-- ============================================================

create extension if not exists pgcrypto;

-- Recupera links JÁ usados que ainda estão ativos e amplia a janela.
-- Não reativa links que o Admin já desligou (active=false).
update public.portaria_pairings_v18
set expires_at = greatest(coalesce(expires_at, now()), now() + interval '7 days'),
    reader_expires_at = greatest(coalesce(reader_expires_at, now()), now() + interval '30 hours')
where active = true
  and claimed_at is not null;

-- Novos links: validade de 7 dias em vez de 15 minutos.
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
    now()+interval '7 days',
    true,
    v_label
  )
  returning * into p;

  return query select p.id,coalesce(p.reader_label,v_label),p.expires_at;
end;
$$;

grant execute on function public.portaria_device_create_reader_link_v20(text,text,text)
to anon, authenticated;

-- Mesmo link pode ser usado novamente enquanto estiver ativo e dentro dos 7 dias.
-- Cada nova abertura troca a credencial local por segurança e renova a sessão.
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
    and x.expires_at>now()
  for update
  limit 1;

  if not found then
    return query select false,'Link expirado ou bloqueado. Gere um novo link na Portaria.'::text,null::uuid,null::text,null::timestamptz;
    return;
  end if;

  select x.* into d
  from public.portaria_devices_v18 x
  where x.id=p.device_id;

  if not found or not d.active or d.revoked_at is not null then
    return query select false,'Computador da Portaria nao autorizado'::text,null::uuid,null::text,null::timestamptz;
    return;
  end if;

  v_label:=left(coalesce(nullif(trim(p.reader_label),''),nullif(trim(p_reader_label),''),'Celular leitor'),50);

  update public.portaria_pairings_v18 x
  set reader_secret_hash=encode(digest(trim(p_reader_secret),'sha256'),'hex'),
      reader_label=v_label,
      claimed_at=coalesce(x.claimed_at,now()),
      reader_expires_at=now()+interval '30 hours',
      last_scan_at=null,
      active=true
  where x.id=p.id
  returning * into p;

  return query select true,'Leitor autorizado'::text,p.id,p.reader_label,p.reader_expires_at;
end;
$$;

grant execute on function public.portaria_claim_reader_link_v20(text,text,text)
to anon, authenticated;

select 'HYPE V36 OK - link do leitor reutilizavel no iPhone por 7 dias' as status;
