-- ============================================================
-- HYPE V13 - TEMA / COR DINÂMICA POR EVENTO
-- Execute UMA VEZ no Supabase > SQL Editor > New query > Run.
--
-- NÃO apaga eventos, lotes, ingressos, usuários ou pagamentos.
-- Apenas adiciona a cor visual do evento e RPCs V13.
-- ============================================================

create extension if not exists pgcrypto;

alter table public.events
  add column if not exists theme_color text not null default '';

-- Compatibilidade caso uma versão antiga ainda não tenha estes campos.
alter table public.events
  add column if not exists artist_name text not null default '',
  add column if not exists description text not null default '',
  add column if not exists cover_image text not null default '',
  add column if not exists sort_order integer not null default 0;

-- Eventos públicos com a cor do tema.
drop function if exists public.public_events_v13();
create function public.public_events_v13()
returns table(
  id bigint,
  name text,
  artist_name text,
  event_date date,
  opening_time time,
  closing_time time,
  venue text,
  description text,
  cover_image text,
  active boolean,
  sort_order integer,
  theme_color text
)
language sql
security definer
set search_path = public
as $$
  select
    e.id,
    e.name,
    e.artist_name,
    e.event_date,
    e.opening_time,
    e.closing_time,
    e.venue,
    e.description,
    e.cover_image,
    e.active,
    e.sort_order,
    coalesce(e.theme_color, '')
  from public.events e
  where e.active = true
  order by e.sort_order, e.event_date nulls last, e.id;
$$;

grant execute on function public.public_events_v13() to anon, authenticated;

-- Lista administrativa, inclusive eventos inativos.
drop function if exists public.staff_list_events_v13(text,text);
create function public.staff_list_events_v13(p_username text, p_password text)
returns table(
  id bigint,
  name text,
  artist_name text,
  event_date date,
  opening_time time,
  closing_time time,
  venue text,
  description text,
  cover_image text,
  active boolean,
  sort_order integer,
  theme_color text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare v_staff public.staff_users%rowtype;
begin
  select s.* into v_staff
  from public.staff_users s
  where s.username = trim(p_username)
    and s.active = true
    and s.password_hash = crypt(p_password, s.password_hash)
  limit 1;

  if not found or v_staff.role not in ('admin','gerente') then
    raise exception 'Sem permissão';
  end if;

  return query
  select
    e.id,
    e.name,
    e.artist_name,
    e.event_date,
    e.opening_time,
    e.closing_time,
    e.venue,
    e.description,
    e.cover_image,
    e.active,
    e.sort_order,
    coalesce(e.theme_color, '')
  from public.events e
  order by e.sort_order, e.event_date nulls last, e.id;
end;
$$;

grant execute on function public.staff_list_events_v13(text,text) to anon, authenticated;

-- Cria ou edita um evento e salva a cor visual.
drop function if exists public.staff_save_event_v13(text,text,bigint,text,text,date,time,time,text,text,text,boolean,integer,text);
create function public.staff_save_event_v13(
  p_username text,
  p_password text,
  p_event_id bigint,
  p_name text,
  p_artist_name text,
  p_event_date date,
  p_opening_time time,
  p_closing_time time,
  p_venue text,
  p_description text,
  p_cover_image text,
  p_active boolean,
  p_sort_order integer,
  p_theme_color text
)
returns public.events
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_staff public.staff_users%rowtype;
  v_event public.events%rowtype;
  v_color text;
begin
  select s.* into v_staff
  from public.staff_users s
  where s.username = trim(p_username)
    and s.active = true
    and s.password_hash = crypt(p_password, s.password_hash)
  limit 1;

  if not found or v_staff.role not in ('admin','gerente') then
    raise exception 'Sem permissão';
  end if;

  if coalesce(trim(p_name), '') = '' then
    raise exception 'Nome do evento é obrigatório';
  end if;

  v_color := upper(trim(coalesce(p_theme_color, '')));
  if v_color <> '' and v_color !~ '^#[0-9A-F]{6}$' then
    raise exception 'Cor do evento inválida. Use o formato #RRGGBB';
  end if;

  if coalesce(p_event_id, 0) = 0 then
    insert into public.events(
      name, artist_name, event_date, opening_time, closing_time,
      venue, description, cover_image, active, sort_order, theme_color
    ) values (
      trim(p_name),
      coalesce(trim(p_artist_name), ''),
      p_event_date,
      p_opening_time,
      p_closing_time,
      coalesce(trim(p_venue), ''),
      coalesce(trim(p_description), ''),
      coalesce(p_cover_image, ''),
      coalesce(p_active, true),
      coalesce(p_sort_order, 0),
      v_color
    ) returning * into v_event;
  else
    update public.events e
    set
      name = trim(p_name),
      artist_name = coalesce(trim(p_artist_name), ''),
      event_date = p_event_date,
      opening_time = p_opening_time,
      closing_time = p_closing_time,
      venue = coalesce(trim(p_venue), ''),
      description = coalesce(trim(p_description), ''),
      cover_image = case
        when coalesce(p_cover_image, '') = '' then e.cover_image
        else p_cover_image
      end,
      active = coalesce(p_active, true),
      sort_order = coalesce(p_sort_order, e.sort_order),
      theme_color = v_color
    where e.id = p_event_id
    returning * into v_event;

    if not found then raise exception 'Evento não encontrado'; end if;
  end if;

  begin
    insert into public.audit_logs(staff_user_id, action, metadata)
    values(
      v_staff.id,
      'EVENTO_TEMA_V13_SALVO',
      jsonb_build_object('event_id', v_event.id, 'theme_color', v_event.theme_color)
    );
  exception when others then
    null;
  end;

  return v_event;
end;
$$;

grant execute on function public.staff_save_event_v13(
  text,text,bigint,text,text,date,time,time,text,text,text,boolean,integer,text
) to anon, authenticated;
