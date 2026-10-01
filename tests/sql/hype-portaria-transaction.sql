begin;

do $$
declare
  v_admin text;
  v_password text := 'HypeTransactionTestOnly!2026';
  v_event bigint;
  v_lot bigint;
  v_ticket_one bigint;
  v_ticket_two bigint;
  v_device_key text := 'matrix-device-0123456789abcdef';
  v_pair_one text := 'matrix-pair-token-one-0123456789';
  v_pair_two text := 'matrix-pair-token-two-0123456789';
  v_link text := 'matrix-reader-link-0123456789abcdefghijklmnopqrstuvwxyz';
  v_request record;
  v_device_id uuid;
  v_reader record;
  v_door record;
  v_cancel record;
begin
  select s.username into v_admin from public.staff_users s
  where s.role='admin' and s.active order by s.id limit 1;
  if v_admin is null then raise exception 'O teste precisa de um admin ativo'; end if;
  update public.staff_users s
  set password_hash=extensions.crypt(v_password,extensions.gen_salt('bf'))
  where s.username=v_admin;

  insert into public.events(name,event_date,opening_time,venue,pix_key,active)
  values('Matriz Portaria',current_date,time '21:00','Hype','pix@matrix',true)
  returning id into v_event;
  insert into public.ticket_lots(event_id,name,sector,price_female,price_male,quantity_total)
  values(v_event,'Lote','Pista',20,30,20) returning id into v_lot;
  insert into public.tickets(event_id,lot_id,customer_name,gender,price,original_price,ticket_code,qr_token,payment_status,payment_method,paid_at)
  values(v_event,v_lot,'Teste Um','Feminino',20,20,'MATRIX-1',extensions.gen_random_uuid()::text,'Pago','Teste',now())
  returning id into v_ticket_one;
  insert into public.tickets(event_id,lot_id,customer_name,gender,price,original_price,ticket_code,qr_token,payment_status,payment_method,paid_at)
  values(v_event,v_lot,'Teste Dois','Masculino',30,30,'MATRIX-2',extensions.gen_random_uuid()::text,'Pago','Teste',now())
  returning id into v_ticket_two;

  select * into v_request from public.portaria_device_request_v18(v_device_key,'Matriz');
  perform public.staff_approve_portaria_device_v18(v_admin,v_password,v_request.request_code,null);
  v_device_id:=private.hype_device_id(v_device_key);
  perform public.portaria_device_status_v18(v_device_key);
  perform public.portaria_current_event_v32(v_device_key);

  perform public.portaria_create_pair_v18(v_device_key,v_pair_one);
  if not exists(select 1 from public.portaria_claim_pair_v18(v_pair_one,'matrix-reader-one-0123456789') x where x.ok) then
    raise exception 'V18 claim falhou';
  end if;
  perform public.portaria_reader_submit_v18('matrix-reader-one-0123456789','MATRIX-1');
  if not exists(select 1 from public.portaria_device_pull_scan_v18(v_device_key) x where x.raw_code='MATRIX-1') then
    raise exception 'V18 pull falhou';
  end if;

  perform public.portaria_create_pair_v19(v_device_key,v_pair_two);
  if not exists(select 1 from public.portaria_claim_pair_v19(v_pair_two,'matrix-reader-two-0123456789','Android') x where x.ok) then
    raise exception 'V19 claim falhou';
  end if;
  perform public.portaria_reader_submit_v19('matrix-reader-two-0123456789','MATRIX-2');
  if not exists(select 1 from public.portaria_device_pull_scan_v29(v_device_key,v_event) x where x.raw_code='MATRIX-2') then
    raise exception 'V29 pull falhou';
  end if;

  perform public.portaria_device_create_reader_link_v20(v_device_key,v_link,'iPhone');
  if not exists(select 1 from public.portaria_claim_reader_link_v20(v_link,'matrix-reader-three-0123456789','iPhone') x where x.ok) then
    raise exception 'V20 claim falhou';
  end if;
  perform public.portaria_reader_submit_v31('matrix-reader-three-0123456789','MATRIX-1');
  if not exists(select 1 from public.portaria_device_pull_scan_v31(v_device_key) x where x.raw_code='MATRIX-1') then
    raise exception 'V31 pull falhou';
  end if;
  perform public.portaria_reader_status_v25('matrix-reader-three-0123456789');
  perform public.portaria_device_list_readers_v19(v_device_key);

  perform public.portaria_device_lookup_v18(v_device_key,'MATRIX-1');
  perform public.portaria_device_lookup_event_v26(v_device_key,v_event,'MATRIX-1');
  perform public.portaria_device_qr_event_v30(v_device_key,'MATRIX-1');
  perform public.portaria_device_search_v18(v_device_key,v_event,'Teste');
  perform public.portaria_device_snapshot_v18(v_device_key,v_event);
  perform public.portaria_device_dashboard_v18(v_device_key,v_event);
  perform public.portaria_device_document_v18(v_device_key,v_ticket_one,true);
  perform public.portaria_device_sales_context_v19(v_device_key,v_event);

  perform public.staff_lookup_ticket(v_admin,v_password,'MATRIX-1');
  perform public.staff_lookup_ticket_v17(v_admin,v_password,'MATRIX-1');
  perform public.staff_offline_snapshot_v17(v_admin,v_password,v_event);
  perform public.staff_portaria_dashboard_v16_9(v_admin,v_password,v_event);
  perform public.staff_live_checkin_v34(v_admin,v_password,v_event);
  perform public.staff_list_portaria_devices_v18(v_admin,v_password);
  perform public.staff_list_portaria_readers_v20(v_admin,v_password);
  perform public.staff_list_access_devices_v23(v_admin,v_password);

  if not exists(select 1 from public.staff_validate_entry(v_admin,v_password,'MATRIX-2','matrix') x where x.ok) then
    raise exception 'staff_validate_entry falhou';
  end if;
  perform public.staff_temporary_exit_v17(v_admin,v_password,v_ticket_two);
  perform public.staff_authorize_reentry_v17(v_admin,v_password,v_ticket_two,true);
  if not exists(select 1 from public.staff_validate_entry_v17(v_admin,v_password,'MATRIX-2','matrix',false) x where x.ok) then
    raise exception 'staff reentry falhou';
  end if;
  perform public.staff_mark_document_v17(v_admin,v_password,v_ticket_two,true);

  select * into v_door from public.portaria_device_create_door_order_v19(
    v_device_key,v_event,v_lot,'Venda Porta 1',null,null,null,'Feminino'
  );
  if v_door.payment_status<>'Pendente' then raise exception 'Venda paga deveria nascer pendente'; end if;
  perform public.portaria_device_confirm_door_payment_v19(v_device_key,v_door.ticket_id);
  select * into v_cancel from public.portaria_device_create_door_order_v19(
    v_device_key,v_event,v_lot,'Venda Porta 2',null,null,null,'Masculino'
  );
  perform public.portaria_device_cancel_door_order_v19(v_device_key,v_cancel.ticket_id);

  select * into v_reader from public.portaria_device_list_readers_v19(v_device_key) limit 1;
  perform public.portaria_device_disconnect_reader_v19(v_device_key,v_reader.reader_id);
  perform public.staff_revoke_portaria_reader_v20(v_admin,v_password,v_reader.reader_id);
  perform public.staff_clear_access_devices_v42_5(v_admin,v_password,'inactive');
  perform public.portaria_device_end_readers_v18(v_device_key);
  perform public.staff_revoke_portaria_device_v18(v_admin,v_password,v_device_id);
end $$;

rollback;
