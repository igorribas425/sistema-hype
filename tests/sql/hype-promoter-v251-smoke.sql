-- Verificação com dados FICTÍCIOS, sem Supabase oficial.
DO $smoke$
declare
  result record;
  archived record;
  count_before bigint;
  count_after bigint;
  id_a bigint;
  count_pending bigint;
  v_invite_token text;
begin
  select invite_token into v_invite_token from private.hype_matriz_signup_invite_v251 where id=1;
  if length(v_invite_token) < 48 then raise exception 'Convite privado não gerado'; end if;
  if public.staff_matriz_link_cadastro_v251('admin-teste','senha-teste') not like '%convite='||v_invite_token
  then raise exception 'ADM não obteve o link de convite'; end if;
  select count(*) into count_before from public.tickets;
  select id into id_a from public.promoters_global_v16 where code='MATRIZ-ALFA';
  update public.promoters_global_v16 set active=true where id=id_a;
  -- Matriz Beta foi bloqueada manualmente ANTES da nova temporada.
  update public.promoters_global_v16 set active=false where code='MATRIZ-BETA';

  begin
    perform 1 from public.staff_reiniciar_matrizes_v251(
      'admin-teste','senha-teste','CONFIRMACAO_ERRADA'
    );
    raise exception 'Reinício sem confirmação foi aceito';
  exception when sqlstate 'P0001' then
    if SQLERRM='Reinício sem confirmação foi aceito' then raise; end if;
  end;
  select * into archived from public.staff_reiniciar_matrizes_v251(
    'admin-teste','senha-teste','REINICIAR MATRIZES'
  );
  if archived.arquivados<>3 or archived.ingressos_preservados<>count_before
  then raise exception 'O reinício não preservou os dados: %',row_to_json(archived);
  end if;
  select count(*) into count_after from public.promoters_global_v16 where active;
  if count_after<>0 then raise exception 'Promoters antigos ainda ativos: %',count_after; end if;
  select count(*) into count_pending from public.staff_matrizes_pendentes_v251('admin-teste','senha-teste');
  if count_pending<>3 then raise exception 'Lista de pendentes incorreta: %',count_pending; end if;

  -- Convite inválido não permite cadastrar nem reativar matriz.
  select * into result from public.public_matriz_cadastro_v251(
    'Matriz Alfa','11111111111','55001111111','','invalido'
  );
  if result.ok then raise exception 'Cadastro sem convite autorizado'; end if;

  -- Recadastro da matriz com os MESMOS dados, código estável e histórico intacto.
  select * into result from public.public_matriz_cadastro_v251(
    'Matriz Alfa','11111111111','55001111111','',v_invite_token
  );
  if not coalesce(result.ok,false) or result.promoter_code<>'MATRIZ-ALFA'
  then raise exception 'Recadastro Alfa falhou: %',row_to_json(result); end if;
  if not (select active from public.promoters_global_v16 where id=id_a)
  then raise exception 'Matriz Alfa não foi reativada'; end if;
  if not exists(select 1 from public.promoter_matriz_recadastro_v251
    where promoter_id=id_a and reenrolled_at is not null)
  then raise exception 'Data de recadastro ausente'; end if;
  select count(*) into count_pending from public.staff_matrizes_pendentes_v251('admin-teste','senha-teste');
  if count_pending<>2 then raise exception 'Pendentes após recadastro incorretos'; end if;

  -- Quem conhecer apenas o CPF não consegue assumir a conta.
  select * into result from public.public_matriz_cadastro_v251(
    'Matriz Alfa','11111111111','51912345678','',v_invite_token
  );
  if result.ok then raise exception 'CPF sem WhatsApp original aceito'; end if;
  select * into result from public.public_matriz_cadastro_v251(
    'Pessoa Diferente','11111111111','55001111111','',v_invite_token
  );
  if result.ok then raise exception 'Nome divergente aceito'; end if;

  -- A filial histórica volta pela mesma matriz sem perder seu código.
  select * into result from public.public_filial_cadastro_v251(
    'MATRIZ-ALFA','Filial Exemplo','12345678901','51999999999',''
  );
  if not result.ok or result.promoter_code<>'FIL-12345678901' then
    raise exception 'Filial antiga não recadastrou: %',row_to_json(result);
  end if;
  if not (select active from public.promoters_global_v16 where code='FIL-12345678901')
  then raise exception 'Filial não reativada'; end if;
  select count(*) into count_pending from public.staff_matrizes_pendentes_v251('admin-teste','senha-teste');
  if count_pending<>1 then raise exception 'Pendentes depois da filial incorretos'; end if;

  -- CPF bloqueado/desativado antes da migração não é reativado.
  select * into result from public.public_matriz_cadastro_v251(
    'Matriz Beta','22222222222','55002222222','',v_invite_token
  );
  if result.ok then raise exception 'Promoter já suspenso foi reativado'; end if;

  -- Filial não pode se passar por matriz.
  select * into result from public.public_matriz_cadastro_v251(
    'Filial Exemplo','12345678901','51999999999','',v_invite_token
  );
  if result.ok then raise exception 'Filial tornou-se matriz'; end if;

  -- Cancelamento manual após o recadastro não pode ser revertido pelo público.
  update public.promoters_global_v16 set active=false where id=id_a;
  select * into result from public.public_matriz_cadastro_v251(
    'Matriz Alfa','11111111111','55001111111','',v_invite_token
  );
  if result.ok then raise exception 'Suspensão posterior ao recadastro foi desfeita'; end if;

  -- A API pública antiga não pode cadastrar matrizes sem convite.
  if has_function_privilege('anon','public.public_promoter_registration_submit_v49(text,text,text,text)','EXECUTE') then
    raise exception 'Cadastro antigo ainda público'; end if;
  if not has_function_privilege('service_role','public.public_promoter_registration_submit_v49(text,text,text,text)','EXECUTE') then
    raise exception 'Service role perdeu acesso'; end if;

  -- Integridade e permissões.
  if (select count(*) from public.tickets)<>count_before
  then raise exception 'Histórico de ingressos alterado'; end if;
  if has_table_privilege('anon','public.promoter_matriz_recadastro_v251','SELECT')
    or not (select relrowsecurity from pg_class where oid='public.promoter_matriz_recadastro_v251'::regclass)
  then raise exception 'Tabela de arquivo exposta'; end if;
  if has_table_privilege('anon','private.hype_matriz_signup_invite_v251','SELECT')
  then raise exception 'Convite privado exposto no banco'; end if;
  if not has_function_privilege('anon','public.public_filial_cadastro_v251(text,text,text,text,text)','EXECUTE')
  then raise exception 'Filial sem permissão de cadastro'; end if;
  if has_function_privilege('anon','public.staff_reiniciar_matrizes_v251(text,text,text)','EXECUTE')
  then raise exception 'Reinício exposto a visitante'; end if;
  raise notice 'V251: reinício, histórico, recadastro, bloqueios, filiais, suspensões e RLS aprovados';
end $smoke$;
