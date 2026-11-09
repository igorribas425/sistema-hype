# HYPE — Registro de preservação de 09/11/2026

## Código
- Repositório original: igorribas425/sistema-hype
- Branch de produção: main (NÃO ALTERAR para clonagem)
- Commit preservado: `720f2a64be5b52ef84fa066ef90d63a2a03fd0d0`
- Backup de referência: `backup/hype-frozen-2026-11-09`
- Bases separadas: `clone/rogue-hype-base-2026-11-09` e `clone/malibu-hype-base-2026-11-09`.

## Estado observado do banco de PRODUÇÃO (somente leitura)
- Supabase: Hype Ingressos (ref txxoqfcwqncqyiqgzboz)
- Tabelas public: 38
- Edge Functions: 28
- Os totais de linhas são estimativas do provedor e NÃO representam um backup de dados.
- Tabelas: public.events, public.ticket_lots, public.staff_users, public.tickets, public.audit_logs, public.promoters_v16, public.promoters_global_v16, public.coupons_v16, public.lot_free_rules_v38, public.guest_list_simple_v406, public.raffle_draws_v18, public.event_survey_invites_v34, public.event_survey_responses_v34, public.portaria_devices_v18, public.portaria_readers_v19, public.portaria_pairings_v18, public.portaria_reader_links_v20, public.portaria_scan_queue_v18, public.portaria_logs_v18, public.internal_chat_v41, public.internal_chat_state_v41, public.payment_webhook_events, public.hype_chat_push_subscriptions_v42, public.public_guest_registration_settings_v49, public.person_blocks_v49, public.guest_registration_settings_v50, public.portaria_observations_v59, public.portaria_exit_feedback_v60, public.portaria_guest_exit_feedback_v77, public.customer_registry_v103, public.customer_registry_activity_v103, public.hype_admin_calls_v108, public.hype_minor_authorizations_v120, public.hype_minor_demo_v127, public.promoters_invite_v207, public.hype_finance_movements_v210, public.hype_ticket_list_notice_v230, public.malibu_minor_authorizations_v1
- Edge Functions: asaas-pix, asaas-webhook, asaas-refund, send-ticket-email, hype-chat-push, guest-list-registration, guest-list-admin-photo, guest-list-admin-delete, stone-ticket-email, asaas-sync, asaas-reconcile, event-cover, hype-admin-call-push, hype-minors-authorization, hype-minors-demo, hype-minors-checkout, hype-minor-email, hype-minor-notify, hype-minor-pdf, hype-resend-ticket, promoter-guest-registration, promoter-guest-delete, hype-auto-listas-v262, malibu-minor-pdf, malibu-minor-notify, malibu-minor-email, malibu-minors-authorization, hype-auto-listas-v263

## Limites e cuidados
- Este documento e a branch preservam a versão do CÓDIGO, não os dados de clientes, pagamentos, imagens, objetos de Storage, autenticação, segredos ou configurações externas.
- Não houve modificação na Hype, banco de produção ou dados reais.
- Antes de qualquer migração de dados, faça snapshot/exportação do banco e Storage pelo painel oficial do Supabase.
- Não instalar os clones sobre `main` nem conectar Vercel dos clones ao domínio da Hype.
