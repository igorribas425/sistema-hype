-- =============================================================
-- HYPE V17.4 - PIX DIRETO PELA CHAVE
-- Rode somente se o campo Chave PIX do Admin não estiver salvando/lendo.
-- É seguro executar novamente: não apaga eventos, ingressos ou usuários.
-- =============================================================

alter table public.events
  add column if not exists pix_key text not null default '';

create or replace function public.staff_save_pix(
  p_username text,
  p_password text,
  p_pix text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_role text;
begin
  select vs.role
  into v_role
  from public.verify_staff(p_username, p_password) as vs
  limit 1;

  if v_role is null or v_role not in ('admin','gerente') then
    raise exception 'Sem permissão';
  end if;

  if coalesce(trim(p_pix),'') = '' then
    raise exception 'Informe uma chave PIX';
  end if;

  update public.events as e
  set pix_key = trim(p_pix)
  where e.active = true;

  if not found then
    raise exception 'Nenhum evento ativo para receber a chave PIX';
  end if;

  return true;
end;
$$;

grant execute on function public.staff_save_pix(text,text,text) to anon, authenticated;

create or replace function public.public_pix_key()
returns text
language sql
security definer
set search_path = public
as $$
  select coalesce(
    (
      select e.pix_key
      from public.events as e
      where e.active = true
        and coalesce(trim(e.pix_key),'') <> ''
      order by e.sort_order nulls last, e.id
      limit 1
    ),
    ''
  );
$$;

grant execute on function public.public_pix_key() to anon, authenticated;
