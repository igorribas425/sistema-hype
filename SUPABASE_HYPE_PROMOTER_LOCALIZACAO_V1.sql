-- HYPE LOUNGE CLUB — Mapa de promoters (GPS somente com consentimento explícito)
-- Banco: Supabase exclusivo Hype. Depende de promoters_global_v16 e private.hype_require_staff.
-- GPS é opt-in; ausência de consentimento nunca cria registro de localização.
create table if not exists public.hype_promoter_location_invites_v1 (
 promoter_id bigint primary key references public.promoters_global_v16(id) on delete cascade,
 token_hash text not null unique,
 created_by text not null,
 issued_at timestamptz not null default now(),
 valid_until timestamptz not null
);
create table if not exists public.hype_promoter_live_v1 (
 promoter_id bigint primary key references public.promoters_global_v16(id) on delete cascade,
 token_hash text not null,
 consent_at timestamptz not null,
 expires_at timestamptz not null,
 latitude double precision,
 longitude double precision,
 accuracy_m double precision,
 last_seen timestamptz,
 constraint hype_live_lat_range check (latitude is null or latitude between -90 and 90),
 constraint hype_live_lon_range check (longitude is null or longitude between -180 and 180),
 constraint hype_live_accuracy_range check (accuracy_m is null or accuracy_m between 0 and 5000)
);
create index if not exists hype_promoter_live_v1_expiry_idx on public.hype_promoter_live_v1(expires_at);
alter table public.hype_promoter_location_invites_v1 enable row level security;
alter table public.hype_promoter_live_v1 enable row level security;
revoke all on public.hype_promoter_location_invites_v1 from public,anon,authenticated;
revoke all on public.hype_promoter_live_v1 from public,anon,authenticated;

CREATE OR REPLACE FUNCTION public.hype_promoter_location_admin_list_v1(p_username text, p_password text)
 RETURNS TABLE(promoter_id bigint, promoter_name text, promoter_code text, role_name text, latitude double precision, longitude double precision, accuracy_m double precision, last_seen timestamp with time zone, sharing boolean, expires_at timestamp with time zone, invite_issued boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.hype_require_staff(p_username,p_password,array['admin']);
 delete from public.hype_promoter_live_v1 l where l.expires_at < now();
 delete from public.hype_promoter_location_invites_v1 where valid_until<now()
   and not exists(select 1 from public.hype_promoter_live_v1 l
       where l.promoter_id=hype_promoter_location_invites_v1.promoter_id);
 return query
 select p.id,p.name,p.code,
    case when b.promoter_id is null then 'Matriz' else 'Filial' end::text,
    case when l.expires_at>now() and l.last_seen>now()-interval '2 minutes' then l.latitude else null::double precision end,
    case when l.expires_at>now() and l.last_seen>now()-interval '2 minutes' then l.longitude else null::double precision end,
    case when l.expires_at>now() and l.last_seen>now()-interval '2 minutes' then l.accuracy_m else null::double precision end,
    l.last_seen,
    (l.expires_at>now() and l.last_seen>now()-interval '2 minutes') is true,
    l.expires_at,
    (i.valid_until>now()) is true
 from public.promoters_global_v16 p
 left join public.promoter_branches_v250 b on b.promoter_id=p.id
 left join public.hype_promoter_live_v1 l on l.promoter_id=p.id
 left join public.hype_promoter_location_invites_v1 i on i.promoter_id=p.id
 where p.active
 order by 4, p.name;
end;
$function$


CREATE OR REPLACE FUNCTION public.hype_promoter_location_admin_revoke_v1(p_username text, p_password text, p_promoter_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 perform private.hype_require_staff(p_username,p_password,array['admin']);
 delete from public.hype_promoter_live_v1 where promoter_id=p_promoter_id;
 delete from public.hype_promoter_location_invites_v1 where promoter_id=p_promoter_id;
 return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.hype_promoter_location_invite_info_v1(p_token text)
 RETURNS TABLE(ok boolean, promoter_name text, valid_until timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_hash text;
begin
 if p_token !~ '^[a-f0-9]{48}$' then
    return query select false,null::text,null::timestamptz; return;
 end if;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 return query
 select true,p.name,i.valid_until from public.hype_promoter_location_invites_v1 i
 join public.promoters_global_v16 p on p.id=i.promoter_id
 where i.token_hash=v_hash and i.valid_until>now() and p.active
 limit 1;
 if not found then return query select false,null::text,null::timestamptz; end if;
end;
$function$


CREATE OR REPLACE FUNCTION public.hype_promoter_location_new_invite_v1(p_username text, p_password text, p_promoter_id bigint)
 RETURNS TABLE(ok boolean, invite_url text, valid_until timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 v_staff public.staff_users%rowtype;
 v_token text := encode(extensions.gen_random_bytes(24),'hex');
 v_hash text := encode(extensions.digest(v_token,'sha256'),'hex');
 v_until timestamptz := now() + interval '7 days';
begin
 v_staff := private.hype_require_staff(p_username,p_password,array['admin']);
 if not exists(select 1 from public.promoters_global_v16 p where p.id=p_promoter_id and p.active) then
    return query select false,null::text,null::timestamptz; return;
 end if;
 delete from public.hype_promoter_live_v1 where promoter_id=p_promoter_id;
 insert into public.hype_promoter_location_invites_v1(promoter_id,token_hash,created_by,issued_at,valid_until)
 values(p_promoter_id,v_hash,v_staff.username,now(),v_until)
 on conflict(promoter_id) do update set token_hash=excluded.token_hash, created_by=excluded.created_by,
   issued_at=excluded.issued_at, valid_until=excluded.valid_until;
 return query select true,
   ('https://hypeloungeclub.com.br/equipe-hype.html?chave='||v_token)::text,
   v_until;
end;
$function$


CREATE OR REPLACE FUNCTION public.hype_promoter_location_start_v1(p_token text, p_consent boolean)
 RETURNS TABLE(ok boolean, expires_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_id bigint;v_expires timestamptz;v_hash text;
begin
 if p_consent is distinct from true or p_token !~ '^[a-f0-9]{48}$' then
   return query select false,null::timestamptz;return;
 end if;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 select i.promoter_id,least(now()+interval '3 hours',i.valid_until)
   into v_id,v_expires
 from public.hype_promoter_location_invites_v1 i
 join public.promoters_global_v16 p on p.id=i.promoter_id and p.active
 where i.token_hash=v_hash and i.valid_until>now() for update of i;
 if not found then return query select false,null::timestamptz;return; end if;
 insert into public.hype_promoter_live_v1(promoter_id,token_hash,consent_at,expires_at)
 values(v_id,v_hash,now(),v_expires)
 on conflict(promoter_id) do update set token_hash=excluded.token_hash,
    consent_at=excluded.consent_at,expires_at=excluded.expires_at,
    latitude=null,longitude=null,accuracy_m=null,last_seen=null;
 return query select true,v_expires;
end;
$function$


CREATE OR REPLACE FUNCTION public.hype_promoter_location_stop_v1(p_token text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_hash text;v_id bigint;
begin
 if p_token !~ '^[a-f0-9]{48}$' then return false; end if;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 select i.promoter_id into v_id from public.hype_promoter_location_invites_v1 i
 where i.token_hash=v_hash for update;
 if not found then return false; end if;
 delete from public.hype_promoter_live_v1 where promoter_id=v_id and token_hash=v_hash;
 delete from public.hype_promoter_location_invites_v1 where promoter_id=v_id and token_hash=v_hash;
 return true;
end;
$function$


CREATE OR REPLACE FUNCTION public.hype_promoter_location_update_v1(p_token text, p_latitude double precision, p_longitude double precision, p_accuracy_m double precision)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_hash text;
begin
 if p_token !~ '^[a-f0-9]{48}$'
   or p_latitude is null or p_latitude not between -90 and 90
   or p_longitude is null or p_longitude not between -180 and 180
   or p_accuracy_m is null or p_accuracy_m not between 0 and 5000
 then return false; end if;
 v_hash:=encode(extensions.digest(p_token,'sha256'),'hex');
 update public.hype_promoter_live_v1 l
 set latitude=p_latitude,longitude=p_longitude,accuracy_m=p_accuracy_m,last_seen=now()
 from public.hype_promoter_location_invites_v1 i
 join public.promoters_global_v16 p on p.id=i.promoter_id
 where l.promoter_id=i.promoter_id
   and p.active and l.token_hash=v_hash and i.token_hash=v_hash
   and l.expires_at>now() and i.valid_until>now();
 return found;
end;
$function$


CREATE OR REPLACE FUNCTION private.hype_promoter_location_purge_v1()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 delete from public.hype_promoter_live_v1 l where l.expires_at <= now();
 delete from public.hype_promoter_location_invites_v1 i where i.valid_until <= now();
end;
$function$


-- Somente RPCs são acessíveis ao navegador; tabelas GPS não têm SELECT público.
revoke all on function public.hype_promoter_location_new_invite_v1(text,text,bigint) from public;
revoke all on function public.hype_promoter_location_invite_info_v1(text) from public;
revoke all on function public.hype_promoter_location_start_v1(text,boolean) from public;
revoke all on function public.hype_promoter_location_update_v1(text,double precision,double precision,double precision) from public;
revoke all on function public.hype_promoter_location_stop_v1(text) from public;
revoke all on function public.hype_promoter_location_admin_list_v1(text,text) from public;
revoke all on function public.hype_promoter_location_admin_revoke_v1(text,text,bigint) from public;
revoke all on function private.hype_promoter_location_purge_v1() from public,anon,authenticated;

grant execute on function public.hype_promoter_location_new_invite_v1(text,text,bigint) to anon,authenticated;
grant execute on function public.hype_promoter_location_invite_info_v1(text) to anon,authenticated;
grant execute on function public.hype_promoter_location_start_v1(text,boolean) to anon,authenticated;
grant execute on function public.hype_promoter_location_update_v1(text,double precision,double precision,double precision) to anon,authenticated;
grant execute on function public.hype_promoter_location_stop_v1(text) to anon,authenticated;
grant execute on function public.hype_promoter_location_admin_list_v1(text,text) to anon,authenticated;
grant execute on function public.hype_promoter_location_admin_revoke_v1(text,text,bigint) to anon,authenticated;

-- pg_cron precisa existir no projeto Supabase.
select cron.schedule('hype-promoter-location-expiry-v1','*/10 * * * *',
                    'select private.hype_promoter_location_purge_v1()');
