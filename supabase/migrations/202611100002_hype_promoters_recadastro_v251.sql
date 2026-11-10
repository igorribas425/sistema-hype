-- HYPE V251 — nova temporada de matrizes, sem excluir promoters nem ingressos.
-- NUNCA executar staff_reiniciar_matrizes_v251 automaticamente durante a instalação.
-- A função de reinício depende de autorização administrativa e confirmação explícita.
create table if not exists public.promoter_matriz_recadastro_v251 (
  promoter_id bigint primary key references public.promoters_global_v16(id) on delete restrict,
  was_active boolean not null,
  archived_at timestamptz not null default now(),
  reenrolled_at timestamptz
);
-- Convite privado: somente quem recebeu o link do ADM pode criar/recadastrar matriz.
-- Token aleatório gerado pelo banco, nunca embutido nos arquivos públicos do site.
create table if not exists private.hype_matriz_signup_invite_v251 (
  id smallint primary key check(id=1),
  invite_token text not null unique default encode(extensions.gen_random_bytes(32),'hex'),
  created_at timestamptz not null default now()
);
alter table private.hype_matriz_signup_invite_v251 enable row level security;
revoke all on table private.hype_matriz_signup_invite_v251 from public, anon, authenticated;
insert into private.hype_matriz_signup_invite_v251(id) values(1)
on conflict(id) do nothing;

alter table public.promoter_matriz_recadastro_v251 enable row level security;
revoke all on table public.promoter_matriz_recadastro_v251 from public, anon, authenticated;

-- Lista para esconder da tela de gestão os registros da temporada anterior,
-- sem perder históricos, IDs, CPF e relatórios antigos.
create or replace function public.staff_matrizes_pendentes_v251(
  p_username text, p_password text
)
returns table(promoter_id bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.hype_require_staff(p_username,p_password,array['admin']);
  return query
  select r.promoter_id from public.promoter_matriz_recadastro_v251 r
  where r.reenrolled_at is null;
end;
$$;
revoke all on function public.staff_matrizes_pendentes_v251(text,text) from public;
grant execute on function public.staff_matrizes_pendentes_v251(text,text) to anon, authenticated;

-- O link de convite é fornecido apenas ao admin autenticado no ADM.
create or replace function public.staff_matriz_link_cadastro_v251(
  p_username text, p_password text
) returns text language plpgsql security definer set search_path = '' as $
declare v_token text;
begin
  perform private.hype_require_staff(p_username,p_password,array['admin']);
  select invite_token into v_token from private.hype_matriz_signup_invite_v251 where id=1;
  if v_token is null then raise exception 'Convite indisponível'; end if;
  return 'https://hypeloungeclub.com.br/promoter.html?convite='||v_token;
end;
$;
revoke all on function public.staff_matriz_link_cadastro_v251(text,text) from public;
grant execute on function public.staff_matriz_link_cadastro_v251(text,text)
  to anon, authenticated;

-- Cadastro ou recadastro de MATRIZ. As filiais continuam usando o fluxo V250.
-- Retornar link antigo só depois da validação de CPF, nome e WhatsApp.
-- Reativação permitida APENAS quando houve reinício planejado e o promoter
-- estava ativo antes dele. Promoters desativados manualmente não são reativados.
create or replace function public.public_matriz_cadastro_v251(
  p_name text, p_cpf text, p_phone text, p_website text default '',
  p_invite_token text default ''
)
returns table(ok boolean, message text, promoter_code text, sales_url text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g');
  v_cpf text := private.hype_digits_v49(p_cpf);
  v_phone text := private.hype_normalize_phone_v49(p_phone);
  v_existing public.promoters_global_v16%rowtype;
  v_archive public.promoter_matriz_recadastro_v251%rowtype;
begin
  if not exists (
    select 1 from private.hype_matriz_signup_invite_v251 i
    where i.id=1 and i.invite_token=trim(coalesce(p_invite_token,''))
  ) then
    return query select false,'Use o convite oficial de matriz enviado pela HYPE.',null::text,null::text;
    return;
  end if;
  if trim(coalesce(p_website,''))<>'' then
    return query select false,'Não foi possível concluir o cadastro.',null::text,null::text;
    return;
  end if;
  if length(v_name)<2 or length(v_name)>120 or not private.hype_valid_cpf_v49(v_cpf)
     or length(v_phone) not in (10,11) then
    return query select false,'Confira nome, CPF e WhatsApp.',null::text,null::text;
    return;
  end if;
  if private.hype_person_is_blocked_v49(v_cpf,v_name) then
    return query select false,'Cadastro bloqueado. Fale com a equipe HYPE.',null::text,null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('hype-promoter-cpf:'||v_cpf,0));
  select p.* into v_existing from public.promoters_global_v16 p
  where p.cpf=v_cpf for update;

  if found then
    -- Confere a identidade com os dados que já estavam registrados,
    -- sem expor o link de terceiros que conheçam apenas um CPF.
    if coalesce(lower(trim(v_existing.name)) <> lower(trim(v_name)),true)
       or coalesce(v_existing.phone <> v_phone,true) then
      return query select false,
        'Dados diferentes do cadastro anterior. Solicite atualização ao administrador.',
        null::text,null::text;
      return;
    end if;
    if exists(select 1 from public.promoter_branches_v250 b
              where b.promoter_id=v_existing.id) then
      return query select false,
        'Este CPF pertence a uma filial. Use o convite de sua matriz.',
        null::text,null::text;
      return;
    end if;
    if v_existing.active then
      return query select true, 'Cadastro de matriz encontrado. Seus links estão prontos.',
        v_existing.code::text,
        ('https://hypeloungeclub.com.br/cliente.html?promoter='||v_existing.code)::text;
      return;
    end if;
    select r.* into v_archive from public.promoter_matriz_recadastro_v251 r
    where r.promoter_id=v_existing.id for update;
    if not found or not v_archive.was_active or v_archive.reenrolled_at is not null then
      return query select false,
        'Cadastro inativo. Solicite autorização à administração.',
        null::text,null::text;
      return;
    end if;
    update public.promoters_global_v16 p set active=true,updated_at=now()
    where p.id=v_existing.id;
    update public.promoter_matriz_recadastro_v251 r
    set reenrolled_at=now() where r.promoter_id=v_existing.id;
    return query select true, 'Matriz recadastrada. Seus links estão prontos.',
      v_existing.code::text,
      ('https://hypeloungeclub.com.br/cliente.html?promoter='||v_existing.code)::text;
    return;
  end if;

  -- Novo CPF continua sob todas as validações originais da HYPE.
  return query
  select r.ok,r.message,r.promoter_code,r.sales_url
  from public.public_promoter_registration_submit_v49(p_name,p_cpf,p_phone,p_website) r;
end;
$$;
revoke all on function public.public_matriz_cadastro_v251(text,text,text,text,text) from public;
grant execute on function public.public_matriz_cadastro_v251(text,text,text,text,text)
  to anon, authenticated;

-- A filial antiga pode se recadastrar com o mesmo CPF quando convidada.
-- Promoter independente da temporada anterior também pode virar filial,
-- sem perder o código de vendas nem os ingressos históricos.
create or replace function public.public_filial_cadastro_v251(
  p_matrix_code text, p_name text, p_cpf text, p_phone text,
  p_website text default ''
)
returns table(ok boolean, message text, promoter_code text, sales_url text)
language plpgsql security definer set search_path = ''
as $
declare
  v_name text := regexp_replace(trim(coalesce(p_name,'')), '\s+', ' ', 'g');
  v_cpf text := private.hype_digits_v49(p_cpf);
  v_phone text := private.hype_normalize_phone_v49(p_phone);
  v_matrix_id bigint;
  v_existing public.promoters_global_v16%rowtype;
  v_archive public.promoter_matriz_recadastro_v251%rowtype;
begin
  if trim(coalesce(p_website,''))<>'' then
    return query select false,'Não foi possível concluir o cadastro.',null::text,null::text;
    return;
  end if;
  if length(v_name)<2 or length(v_name)>120
     or not private.hype_valid_cpf_v49(v_cpf) or length(v_phone) not in(10,11)
     or private.hype_person_is_blocked_v49(v_cpf,v_name) then
    return query select false,'Dados inválidos ou cadastro bloqueado.',null::text,null::text;
    return;
  end if;
  select p.id into v_matrix_id from public.promoters_global_v16 p
  where p.code=upper(trim(coalesce(p_matrix_code,''))) and p.active
    and not exists(select 1 from public.promoter_branches_v250 b where b.promoter_id=p.id);
  if v_matrix_id is null then
    return query select false,'Matriz não encontrada ou não recadastrada.',null::text,null::text;
    return;
  end if;

  perform pg_advisory_xact_lock(hashtextextended('hype-promoter-cpf:'||v_cpf,0));
  select p.* into v_existing from public.promoters_global_v16 p where p.cpf=v_cpf for update;
  if not found then
    return query select r.ok,r.message,r.promoter_code,r.sales_url
    from public.public_promoter_branch_signup_v250(p_matrix_code,p_name,p_cpf,p_phone,p_website) r;
    return;
  end if;

  if coalesce(lower(trim(v_existing.name))<>lower(trim(v_name)),true)
      or coalesce(v_existing.phone<>v_phone,true) then
    return query select false,'Dados diferentes do cadastro anterior. Fale com o ADM.',
      null::text,null::text;
    return;
  end if;
  if exists(select 1 from public.promoter_branches_v250 b
            where b.promoter_id=v_existing.id and b.matrix_id<>v_matrix_id)
     or exists(select 1 from public.promoter_branches_v250 b
               where b.matrix_id=v_existing.id) then
    return query select false,'Este vínculo deve ser atualizado pelo administrador.',
      null::text,null::text;
    return;
  end if;
  if v_existing.active then
    if exists(select 1 from public.promoter_branches_v250 b
              where b.promoter_id=v_existing.id and b.matrix_id=v_matrix_id) then
      return query select true,'Filial já cadastrada. Seu link está pronto.',
        v_existing.code::text,
        ('https://hypeloungeclub.com.br/cliente.html?promoter='||v_existing.code)::text;
    else
      return query select false,'CPF já cadastrado como matriz. Fale com o ADM.',
        null::text,null::text;
    end if;
    return;
  end if;

  select r.* into v_archive from public.promoter_matriz_recadastro_v251 r
  where r.promoter_id=v_existing.id for update;
  if not found or not v_archive.was_active or v_archive.reenrolled_at is not null then
    return query select false,'Cadastro inativo. Fale com o ADM.',
      null::text,null::text;
    return;
  end if;
  insert into public.promoter_branches_v250(matrix_id,promoter_id)
    values(v_matrix_id,v_existing.id)
    on conflict(promoter_id) do nothing;
  update public.promoters_global_v16 p
    set active=true,updated_at=now() where p.id=v_existing.id;
  update public.promoter_matriz_recadastro_v251 r
    set reenrolled_at=now() where r.promoter_id=v_existing.id;
  return query select true,'Filial recadastrada. Seu link está pronto.',
    v_existing.code::text,
    ('https://hypeloungeclub.com.br/cliente.html?promoter='||v_existing.code)::text;
end;
$;
revoke all on function public.public_filial_cadastro_v251(text,text,text,text,text)
  from public;
grant execute on function public.public_filial_cadastro_v251(text,text,text,text,text)
  to anon, authenticated;

-- Reinício somente pelo ADM, nunca na instalação da migração.
-- Mantém código/ID de cada promoter e histórico de vendas intocados.
create or replace function public.staff_reiniciar_matrizes_v251(
  p_username text, p_password text, p_confirmacao text
)
returns table(arquivados bigint, ingressos_preservados bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare v_total bigint;
begin
  perform private.hype_require_staff(p_username,p_password,array['admin']);
  if p_confirmacao is distinct from 'REINICIAR MATRIZES' then
    raise exception 'Confirmação incorreta. Nenhum cadastro foi alterado.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('hype-v251-reinicio',0));
  if exists(select 1 from public.promoter_matriz_recadastro_v251) then
    raise exception 'Reinício já executado. Não repetir nem apagar a temporada atual.';
  end if;
  insert into public.promoter_matriz_recadastro_v251(promoter_id,was_active,archived_at,reenrolled_at)
  select p.id,p.active,now(),null::timestamptz
    from public.promoters_global_v16 p
  on conflict(promoter_id) do update
    set was_active=excluded.was_active,archived_at=now(),reenrolled_at=null;

  update public.promoters_global_v16 p
  set active=false,updated_at=now()
  where p.active=true;
  select count(*) into v_total from public.promoter_matriz_recadastro_v251;
  return query
  select v_total,(select count(*) from public.tickets)::bigint;
end;
$$;
revoke all on function public.staff_reiniciar_matrizes_v251(text,text,text)
  from public, anon, authenticated;
-- Só o operador do banco poderá iniciar o encerramento da temporada.
-- Nenhum site público recebe permissão para invocar o reset.
