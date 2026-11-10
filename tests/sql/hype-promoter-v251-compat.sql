-- Adapta o PostgreSQL descartável dos testes V250 à estrutura V251.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
alter table public.promoters_global_v16
  add column updated_at timestamptz not null default now();
create function private.hype_normalize_phone_v49(p text)
returns text language sql immutable as $$
  select private.hype_digits_v49(p)
$$;
create function private.hype_valid_cpf_v49(p text)
returns boolean language sql immutable as $$
  select length(private.hype_digits_v49(p))=11
$$;
create function private.hype_person_is_blocked_v49(p_cpf text, p_name text)
returns boolean language sql immutable as $$ select false $$;
