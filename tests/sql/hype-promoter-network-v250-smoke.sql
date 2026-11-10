-- Executado no postgres descartável do GitHub Actions.
DO $tests$
declare
  a record;
  b record;
  matriz bigint;
  id_filial bigint;
  c bigint;
  t numeric;
begin
  select * into a from public.public_promoter_branch_signup_v250(
    'MATRIZ-ALFA','Filial Exemplo','12345678901','51999999999',''
  );
  if not coalesce(a.ok,false) or a.promoter_code <> 'FIL-12345678901' then
    raise exception 'Falha: cadastro inicial %',row_to_json(a);
  end if;
  select id into matriz from public.promoters_global_v16 where code='MATRIZ-ALFA';
  select p.id into id_filial
    from public.promoters_global_v16 p where p.code='FIL-12345678901';
  if not exists(select 1 from public.promoter_branches_v250
                where matrix_id=matriz and promoter_id=id_filial) then
    raise exception 'Falha: vínculo ausente';
  end if;

  -- Idempotência: repetir o cadastro do mesmo CPF não cria segunda filial.
  select * into a from public.public_promoter_branch_signup_v250(
    'MATRIZ-ALFA','Filial Exemplo','12345678901','51999999999',''
  );
  select count(*) into c from public.promoter_branches_v250;
  if not a.ok or c<>1 then raise exception 'Falha: cadastro repetido'; end if;

  -- CPF já vinculado NÃO pode ser atribuído a outra matriz.
  select * into a from public.public_promoter_branch_signup_v250(
    'MATRIZ-BETA','Filial Exemplo','12345678901','51999999999',''
  );
  if a.ok then raise exception 'Falha: troca indevida de matriz'; end if;

  -- Filial não pode virar uma matriz de segundo nível.
  select * into a from public.public_promoter_branch_signup_v250(
    'FIL-12345678901','Subfilial','99999999999','51999999999',''
  );
  if a.ok then raise exception 'Falha: rede com 3 níveis'; end if;

  -- Eventos inativos não entram na classificação. Pendente não conta receita.
  insert into public.tickets(event_id,promoter_code,payment_status,price)
  values
    (1,'MATRIZ-ALFA','Pago',60),
    (1,'FIL-12345678901','Pago',20),
    (1,'FIL-12345678901','Pendente',30),
    (2,'FIL-12345678901','Pago',100);
  select * into b from public.staff_list_promoter_branches_v250(
    'admin-teste','senha-teste'
  );
  if b.promoter_id<>id_filial or b.paid_count<>1 or b.sales_count<>2 or b.revenue<>20
  then raise exception 'Falha: relatório de filial %',row_to_json(b);
  end if;

  select coalesce(sum(price),0) into t from public.tickets
    where promoter_code='MATRIZ-ALFA'
      and payment_status='Pago' and event_id=1;
  if t + b.revenue<>80 then raise exception 'Falha: faturamento consolidado'; end if;

  -- Convites de matriz válidos; filiais e matrizes inativas são bloqueadas.
  select * into a from public.public_promoter_matrix_invite_v250('MATRIZ-ALFA');
  if not a.ok or a.invite_url not like '%matriz=MATRIZ-ALFA' then
    raise exception 'Falha: convite matriz'; end if;
  select * into a from public.public_promoter_matrix_invite_v250('FIL-12345678901');
  if a.ok then raise exception 'Falha: filial tem convite de matriz'; end if;

  update public.promoters_global_v16 set active=false where id=matriz;
  select * into a from public.public_promoter_branch_signup_v250(
    'MATRIZ-ALFA','Outra pessoa','66666666666','51999999999',''
  );
  if a.ok then raise exception 'Falha: matriz inativa aceita cadastro'; end if;

  if not (select relrowsecurity from pg_class where oid='public.promoter_branches_v250'::regclass)
  then raise exception 'Falha: RLS desligada'; end if;
  if has_table_privilege('anon','public.promoter_branches_v250','SELECT')
  then raise exception 'Falha: tabela acessível a anon'; end if;
  if not has_function_privilege('anon','public.public_promoter_branch_signup_v250(text,text,text,text,text)','EXECUTE')
  then raise exception 'Falha: cadastro indisponível a anon'; end if;
  raise notice 'SUCESSO: vínculo, idempotência, CPF, níveis, ranking, faturamento, bloqueio, permissões';
end $tests$;
