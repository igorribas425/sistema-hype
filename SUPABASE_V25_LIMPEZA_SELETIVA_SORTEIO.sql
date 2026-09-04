-- ============================================================
-- HYPE LOUNGE CLUB // V25
-- LIMPEZA SELETIVA DE TESTES + RECOLOCAR NO SORTEIO
-- Execute UMA VEZ no Supabase > SQL Editor.
--
-- O que faz:
-- 1) Cria exclusao de UM ingresso/teste por vez (somente Admin).
-- 2) Preserva os demais ingressos, inclusive clientes PAGOS.
-- 3) Permite apagar UM resultado de teste do historico do sorteio.
-- 4) Garante que ingressos PAGOS continuem elegiveis em todos os sorteios.
-- 5) Ao excluir um ingresso que ja apareceu em sorteio, preserva o snapshot
--    do historico e solta o vinculo antes de apagar o ingresso.
-- ============================================================

create extension if not exists pgcrypto;

-- V24 precisa existir para snapshots e sorteios multiplos.
do $$
begin
  if to_regclass('public.raffle_draws_v18') is null then
    raise exception 'Tabela raffle_draws_v18 nao encontrada. Execute primeiro a atualizacao de sorteios V24.';
  end if;
end $$;

-- Compatibilidade: garante as colunas de snapshot usadas para preservar historico.
alter table public.raffle_draws_v18
  alter column winner_ticket_id drop not null;

alter table public.raffle_draws_v18
  add column if not exists winner_manual_id bigint,
  add column if not exists winner_name text,
  add column if not exists winner_code text,
  add column if not exists winner_phone text,
  add column if not exists winner_promoter_code text,
  add column if not exists winner_source text not null default 'ticket';

-- Troca somente a FK winner_ticket_id para SET NULL ao apagar um ingresso.
-- Assim um teste pode ser removido sem destruir um historico real de sorteio.
do $$
declare
  v_att smallint;
  r record;
begin
  select a.attnum::smallint into v_att
  from pg_attribute a
  where a.attrelid='public.raffle_draws_v18'::regclass
    and a.attname='winner_ticket_id'
    and not a.attisdropped;

  for r in
    select c.conname
    from pg_constraint c
    where c.conrelid='public.raffle_draws_v18'::regclass
      and c.confrelid='public.tickets'::regclass
      and c.contype='f'
      and v_att = any(c.conkey)
  loop
    execute format('alter table public.raffle_draws_v18 drop constraint %I',r.conname);
  end loop;
end $$;

alter table public.raffle_draws_v18
  add constraint raffle_draws_v18_winner_ticket_id_fkey
  foreign key (winner_ticket_id) references public.tickets(id) on delete set null;

-- ------------------------------------------------------------
-- EXCLUIR UM TESTE / INGRESSO POR VEZ
-- ------------------------------------------------------------
create or replace function public.staff_purge_ticket_v25(
  p_username text,
  p_password text,
  p_ticket_id bigint
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  s public.staff_users%rowtype;
  t public.tickets%rowtype;
begin
  select u.* into s
  from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;

  if not found or s.role<>'admin' then
    raise exception 'Sem permissao';
  end if;

  select x.* into t
  from public.tickets x
  where x.id=p_ticket_id
  for update;

  if not found then
    raise exception 'Ingresso nao encontrado';
  end if;

  -- Se apareceu em um sorteio, salva nome/codigo antes de soltar o ticket_id.
  update public.raffle_draws_v18 d
  set winner_name=coalesce(nullif(d.winner_name,''),t.customer_name),
      winner_code=coalesce(nullif(d.winner_code,''),t.ticket_code),
      winner_phone=coalesce(nullif(d.winner_phone,''),t.phone),
      winner_promoter_code=coalesce(nullif(d.winner_promoter_code,''),t.promoter_code),
      winner_source=coalesce(nullif(d.winner_source,''),'ticket'),
      winner_ticket_id=null
  where d.winner_ticket_id=t.id;

  delete from public.tickets x where x.id=t.id;

  return true;
exception
  when foreign_key_violation then
    raise exception 'Este ingresso ainda possui um vinculo protegido no banco. Nao apague outro cliente; envie a mensagem deste erro para corrigirmos somente este registro.';
end;
$$;

grant execute on function public.staff_purge_ticket_v25(text,text,bigint)
to anon,authenticated;

-- ------------------------------------------------------------
-- APAGAR SOMENTE UM RESULTADO DE TESTE DO SORTEIO
-- Não altera ticket nem pagamento.
-- ------------------------------------------------------------
create or replace function public.staff_delete_raffle_draw_v25(
  p_username text,
  p_password text,
  p_draw_id bigint
)
returns boolean
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  s public.staff_users%rowtype;
begin
  select u.* into s
  from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;

  if not found or s.role<>'admin' then
    raise exception 'Sem permissao';
  end if;

  delete from public.raffle_draws_v18 d where d.id=p_draw_id;
  if not found then raise exception 'Sorteio nao encontrado'; end if;
  return true;
end;
$$;

grant execute on function public.staff_delete_raffle_draw_v25(text,text,bigint)
to anon,authenticated;

-- ------------------------------------------------------------
-- GARANTIA V25: SORTEIO MULTIPLO
-- Não existe bloqueio por ter vencido antes.
-- Todo ticket PAGO do evento continua no pool em cada novo sorteio.
-- ------------------------------------------------------------
create or replace function public.staff_draw_raffle_v24(
  p_username text,
  p_password text,
  p_event_id bigint,
  p_prize text
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
  drawn_at timestamptz,
  source text
)
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  s public.staff_users%rowtype;
  e public.events%rowtype;
  d public.raffle_draws_v18%rowtype;
  v_source text;
  v_ticket_id bigint;
  v_manual_id bigint;
  v_name text;
  v_code text;
  v_phone text;
  v_cpf text;
  v_promoter text;
  v_prize text;
begin
  select u.* into s
  from public.staff_users u
  where u.username=trim(p_username)
    and u.active=true
    and u.password_hash=crypt(p_password,u.password_hash)
  limit 1;
  if not found or s.role<>'admin' then raise exception 'Sem permissao'; end if;

  select ev.* into e from public.events ev where ev.id=p_event_id for update;
  if not found then raise exception 'Evento nao encontrado'; end if;
  if not coalesce(e.raffle_enabled,false) then raise exception 'Ative o sorteio antes de sortear'; end if;

  v_prize:=coalesce(nullif(trim(p_prize),''),nullif(trim(e.raffle_prize),''));
  if coalesce(v_prize,'')='' then raise exception 'Informe o premio do sorteio'; end if;

  select pool.source,pool.ticket_id,pool.manual_id,pool.customer_name,pool.ticket_code,
         pool.phone,pool.cpf,pool.promoter_code
  into v_source,v_ticket_id,v_manual_id,v_name,v_code,v_phone,v_cpf,v_promoter
  from (
    select 'ticket'::text as source,t.id::bigint as ticket_id,null::bigint as manual_id,
           t.customer_name::text,t.ticket_code::text,t.phone::text,t.cpf::text,
           t.promoter_code::text,1::integer as chance_no
    from public.tickets t
    where t.event_id=p_event_id and t.payment_status='Pago'

    union all

    select 'manual'::text,null::bigint,m.id::bigint,m.customer_name::text,
           ('MANUAL-'||m.id::text)::text,m.phone::text,null::text,null::text,gs::integer
    from public.raffle_manual_participants_v24 m
    cross join lateral generate_series(1,m.chances) gs
    where m.event_id=p_event_id and m.active=true
  ) pool
  order by random()
  limit 1;

  if not found then raise exception 'Nenhum participante disponivel para o sorteio'; end if;

  update public.events ev set raffle_prize=v_prize where ev.id=p_event_id;

  insert into public.raffle_draws_v18(
    event_id,winner_ticket_id,winner_manual_id,winner_name,winner_code,
    winner_phone,winner_promoter_code,winner_source,prize,drawn_by
  ) values(
    p_event_id,v_ticket_id,v_manual_id,v_name,v_code,v_phone,v_promoter,
    v_source,v_prize,s.username
  ) returning * into d;

  return query select d.id,v_ticket_id,v_name,v_code,v_phone,v_cpf,v_promoter,
                      d.prize,d.drawn_at,v_source;
end;
$$;

grant execute on function public.staff_draw_raffle_v24(text,text,bigint,text)
to anon,authenticated;

select 'HYPE V25 OK - exclusao seletiva + sorteio restaurado' as status;
