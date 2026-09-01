-- =============================================================
-- HYPE V16.9 - PORTARIA PRO
-- Contador ao vivo + últimas entradas por evento
-- Não apaga ingressos, eventos, promoters, usuários ou pagamentos.
-- =============================================================

create or replace function public.staff_portaria_dashboard_v16_9(
  p_username text,
  p_password text,
  p_event_id bigint default null
)
returns table(
  event_id bigint,
  event_name text,
  event_date date,
  total_paid bigint,
  entered_count bigint,
  remaining_count bigint,
  female_entered bigint,
  male_entered bigint,
  sector_stats jsonb,
  recent_entries jsonb
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users%rowtype;
  v_event public.events%rowtype;
  v_today date := (now() at time zone 'America/Sao_Paulo')::date;
  v_total_paid bigint := 0;
  v_entered bigint := 0;
  v_female bigint := 0;
  v_male bigint := 0;
  v_sector_stats jsonb := '[]'::jsonb;
  v_recent jsonb := '[]'::jsonb;
begin
  select s.* into v_staff
  from public.staff_users s
  where s.username = trim(p_username)
    and s.active = true
    and s.password_hash = crypt(p_password, s.password_hash)
  limit 1;

  if not found then
    raise exception 'Acesso negado';
  end if;

  if v_staff.role not in ('admin','portaria') then
    raise exception 'Sem permissão';
  end if;

  if p_event_id is not null then
    select e.* into v_event
    from public.events e
    where e.id = p_event_id
    limit 1;
  else
    select e.* into v_event
    from public.events e
    where e.active = true
    order by
      case
        when e.event_date = v_today then 0
        when e.event_date is not null and e.event_date > v_today then 1
        when e.event_date is not null and e.event_date < v_today then 2
        else 3
      end,
      case when e.event_date >= v_today then e.event_date end asc nulls last,
      case when e.event_date < v_today then e.event_date end desc nulls last,
      e.id desc
    limit 1;
  end if;

  if not found then
    return;
  end if;

  select
    count(*) filter (where t.payment_status = 'Pago')::bigint,
    count(*) filter (where t.payment_status = 'Pago' and t.entry_status = 'Entrada utilizada')::bigint,
    count(*) filter (where t.payment_status = 'Pago' and t.entry_status = 'Entrada utilizada' and t.gender = 'Feminino')::bigint,
    count(*) filter (where t.payment_status = 'Pago' and t.entry_status = 'Entrada utilizada' and t.gender = 'Masculino')::bigint
  into v_total_paid, v_entered, v_female, v_male
  from public.tickets t
  where t.event_id = v_event.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'sector', s.sector,
    'paid', s.paid,
    'entered', s.entered
  ) order by s.sector), '[]'::jsonb)
  into v_sector_stats
  from (
    select
      coalesce(nullif(trim(l.sector),''), 'Ingresso') as sector,
      count(*) filter (where t.payment_status = 'Pago')::bigint as paid,
      count(*) filter (where t.payment_status = 'Pago' and t.entry_status = 'Entrada utilizada')::bigint as entered
    from public.tickets t
    join public.ticket_lots l on l.id = t.lot_id
    where t.event_id = v_event.id
    group by coalesce(nullif(trim(l.sector),''), 'Ingresso')
  ) s;

  select coalesce(jsonb_agg(to_jsonb(r) order by r.entry_at desc), '[]'::jsonb)
  into v_recent
  from (
    select
      t.customer_name,
      t.gender,
      t.ticket_code,
      t.entry_at,
      l.name as lot_name,
      l.sector
    from public.tickets t
    join public.ticket_lots l on l.id = t.lot_id
    where t.event_id = v_event.id
      and t.payment_status = 'Pago'
      and t.entry_status = 'Entrada utilizada'
      and t.entry_at is not null
    order by t.entry_at desc
    limit 10
  ) r;

  return query
  select
    v_event.id,
    v_event.name,
    v_event.event_date,
    v_total_paid,
    v_entered,
    greatest(v_total_paid - v_entered, 0)::bigint,
    v_female,
    v_male,
    v_sector_stats,
    v_recent;
end;
$$;

grant execute on function public.staff_portaria_dashboard_v16_9(text,text,bigint)
to anon, authenticated;
