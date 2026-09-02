-- =============================================================
-- HYPE V16.10 - REVOGAR LINK DE PROMOTER
-- Execute UMA VEZ no Supabase > SQL Editor > New query > Run.
--
-- Objetivo:
-- - Link de promoter só é aceito se o promoter existir e estiver ATIVO.
-- - Se o Admin excluir ou desativar, o link antigo deixa de validar.
-- - Não apaga ingressos, vendas antigas, eventos, lotes ou pagamentos.
-- =============================================================

drop function if exists public.public_validate_promoter_global_v16(text);

create function public.public_validate_promoter_global_v16(
  p_code text
)
returns table(
  valid boolean,
  code text
)
language sql
stable
security definer
set search_path=public
as $$
  select
    (p.id is not null) as valid,
    case when p.id is not null then upper(trim(p.code)) else null::text end as code
  from (select 1) x
  left join lateral (
    select pg.id, pg.code
    from public.promoters_global_v16 pg
    where upper(trim(pg.code)) = upper(trim(coalesce(p_code,'')))
      and pg.active = true
    limit 1
  ) p on true;
$$;

revoke all on function public.public_validate_promoter_global_v16(text) from public;
grant execute on function public.public_validate_promoter_global_v16(text)
to anon, authenticated;

-- Conferência simples:
-- select * from public.public_validate_promoter_global_v16('CODIGO-DO-PROMOTER');
-- Promoter ativo => valid = true
-- Promoter excluído/desativado => valid = false
