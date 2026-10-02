-- HYPE V51: admin-only permanent deletion for public guest-list registrations.

create or replace function public.staff_guest_registration_delete_v51(
  p_username text,
  p_password text,
  p_list_id bigint
)
returns table(
  ok boolean,
  message text,
  list_id bigint,
  event_id bigint,
  name text,
  photo_path text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff public.staff_users%rowtype;
  v_row public.guest_list_simple_v406%rowtype;
begin
  v_staff := private.hype_require_staff(p_username, p_password, array['admin']);
  select g.* into v_row
  from public.guest_list_simple_v406 g
  where g.id = p_list_id
  for update;

  if not found then
    return query select false, 'Cadastro não encontrado.'::text, p_list_id, null::bigint, null::text, null::text;
    return;
  end if;

  delete from public.guest_list_simple_v406 where id = v_row.id;
  return query select true, 'Cadastro excluído.'::text, v_row.id, v_row.event_id, v_row.name, v_row.photo_path;
end;
$$;

revoke all on function public.staff_guest_registration_delete_v51(text,text,bigint) from public, anon, authenticated;
grant execute on function public.staff_guest_registration_delete_v51(text,text,bigint) to anon, authenticated;
