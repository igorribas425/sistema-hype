-- =============================================================
-- HYPE V16.7 - EXCLUIR PROMOTER PELO ADMIN
-- Execute UMA VEZ no Supabase > SQL Editor > New query > Run.
-- NÃO apaga ingressos nem vendas antigas.
-- Apenas permite ao ADMIN remover o cadastro do promoter.
-- O promoter_code já gravado nos ingressos antigos permanece para histórico.
-- =============================================================

create or replace function public.staff_delete_promoter_v16(
  p_username text,
  p_password text,
  p_event_id bigint,
  p_id bigint
)
returns boolean
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
    and s.password_hash = crypt(p_password, s.password_hash)
  limit 1;

  if not found or v_staff.role <> 'admin' then
    raise exception 'Sem permissao';
  end if;

  delete from public.promoters_v16 p
  where p.id = p_id
    and p.event_id = p_event_id;

  if not found then
    raise exception 'Promoter nao encontrado';
  end if;

  return true;
end;
$$;

grant execute on function public.staff_delete_promoter_v16(text,text,bigint,bigint)
to anon, authenticated;
