-- HYPE LOUNGE CLUB
-- Correção: column reference "active" is ambiguous

create or replace function public.staff_list_sector_configs(
  p_username text,
  p_password text
)
returns table(
  id bigint,
  sector text,
  price_male numeric,
  price_female numeric,
  quantity_total integer,
  starts_at timestamptz,
  ends_at timestamptz,
  active boolean,
  sort_order integer
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users%rowtype;
begin
  select s.* into v_staff
  from public.staff_users s
  where s.username = trim(p_username)
    and s.active = true
    and s.password_hash = crypt(p_password, s.password_hash);

  if not found or v_staff.role not in ('admin','gerente') then
    raise exception 'Sem permissão';
  end if;

  return query
  select
    l.id,
    l.sector,
    l.price_male,
    l.price_female,
    l.quantity_total,
    l.starts_at,
    l.ends_at,
    l.active,
    l.sort_order
  from public.ticket_lots l
  join public.events e
    on e.id = l.event_id
   and e.active = true
  where lower(trim(l.sector)) in ('pista','vip','camarote')
  order by
    case lower(trim(l.sector))
      when 'pista' then 1
      when 'vip' then 2
      when 'camarote' then 3
      else 99
    end,
    l.active desc,
    l.id desc;
end;
$$;

grant execute on function public.staff_list_sector_configs(text,text)
to anon, authenticated;
