
-- HYPE V230: um aviso por ingresso sobre tentativa de entrar novamente na Lista,
-- preservando dados e QR. Executável exclusivamente pelo serviço interno.
create table if not exists public.hype_ticket_list_notice_v230 (
  ticket_id bigint not null references public.tickets(id) on delete cascade,
  event_id bigint not null references public.events(id),
  status text not null default 'processing' check (status in ('processing','sent','failed')),
  attempted_at timestamptz not null default now(),
  sent_at timestamptz,
  provider_id text,
  error text,
  primary key (ticket_id,event_id)
);
alter table public.hype_ticket_list_notice_v230 enable row level security;
revoke all on table public.hype_ticket_list_notice_v230 from public, anon, authenticated;
grant select,insert,update on public.hype_ticket_list_notice_v230 to service_role;

create or replace function public.hype_claim_ticket_list_notice_v230(
  p_event_id bigint,p_cpf text,p_email text
)
returns table(claimed boolean,ticket_id bigint,destination text,full_name text,event_name text)
language plpgsql security definer set search_path to ''
as $$
declare
  v_ticket public.tickets%rowtype;
  v_event_name text;
  v_cpf text := regexp_replace(coalesce(p_cpf,''),'[^0-9]','','g');
  v_email text := lower(trim(coalesce(p_email,'')));
  v_claimed_id bigint;
begin
  if p_event_id is null or p_event_id<=0 or length(v_cpf)<>11
     or length(v_email)>254 or v_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
  then
    return query select false,null::bigint,null::text,null::text,null::text;
    return;
  end if;

  select t.* into v_ticket
  from public.tickets t
  join public.events e on e.id=t.event_id
  where t.event_id=p_event_id and e.active is true
    and regexp_replace(coalesce(t.cpf,''),'[^0-9]','','g')=v_cpf
    -- Nunca enviar para e-mail informado por terceiro: precisa coincidir com o da compra.
    and lower(trim(coalesce(t.email,'')))=v_email
    and t.payment_status='Pago'
    and t.canceled_at is null and t.refunded_at is null
  order by t.paid_at desc nulls last,t.id desc
  limit 1;

  if not found then
    return query select false,null::bigint,null::text,null::text,null::text;
    return;
  end if;

  select e.name into v_event_name from public.events e where e.id=v_ticket.event_id;
  perform pg_advisory_xact_lock(hashtextextended('hype-list-notice-v230:'||v_ticket.id::text,0));

  insert into public.hype_ticket_list_notice_v230(ticket_id,event_id,status,attempted_at)
  values(v_ticket.id,v_ticket.event_id,'processing',now())
  on conflict (ticket_id,event_id) do update
  set attempted_at=now(),status='processing',error=null
  where public.hype_ticket_list_notice_v230.sent_at is null
    and public.hype_ticket_list_notice_v230.attempted_at < now()-interval '20 minutes'
  returning public.hype_ticket_list_notice_v230.ticket_id into v_claimed_id;

  return query select v_claimed_id is not null,v_ticket.id,v_ticket.email,
      v_ticket.customer_name,coalesce(v_event_name,'Evento HYPE');
end;
$$;
revoke all on function public.hype_claim_ticket_list_notice_v230(bigint,text,text) from public, anon, authenticated;
grant execute on function public.hype_claim_ticket_list_notice_v230(bigint,text,text) to service_role;
