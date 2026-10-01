# Hype Supabase Separation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the Hype ticketing site on a dedicated Supabase project and verify purchase, administration, lists, images, portaria, and reader flows without touching Aura Beat or completing a real payment.

**Architecture:** A new `sa-east-1` Supabase project owns a clean, versioned Hype schema, its RPC API, and Hype Edge Functions. The static GitHub Pages frontend keeps its existing UI, switches only its publishable project configuration after backend verification, and receives focused error-state fixes where missing backend dependencies currently surface as raw alerts.

**Tech Stack:** Static HTML/CSS/JavaScript, Node.js built-in test runner, Supabase PostgreSQL/RLS/RPC, Supabase Edge Functions (Deno/TypeScript), GitHub Pages, browser-based end-to-end verification.

**Spec:** `docs/superpowers/specs/2026-10-01-hype-supabase-separation-design.md`

## Global Constraints

- Do not add, remove, or alter any table, function, secret, or Edge Function in Aura Beat project `axkbfrljohpkjnbotqnf`.
- Create the dedicated project as `Hype Ingressos` in `sa-east-1`; the confirmed project cost is R$ 0 per month.
- Keep all service-role, Asaas, webhook, email, and push secrets out of Git and browser-delivered files.
- Do not seed or document the public passwords `Hype@2026`, `portaria2026`, or `cris1212` as active credentials.
- Do not point `hypeloungeclub.com.br` at the new project until backend and local contract checks pass.
- Do not complete a real payment. Prefer FREE test lots; generating any external payment charge requires action-time confirmation.
- Preserve the current Hype visual design and existing URLs.

## Review Focus

- Missing versioned RPCs must fail contract tests before deployment and never leave the customer page half-loaded.
- Simultaneous purchases at the final stock unit must create at most one valid order/ticket.
- Sale start/end times and gender-specific FREE windows must switch price and availability at exact boundaries.
- A paid/FREE ticket must enter once, reject duplicate entry, and preserve temporary-exit/reentry state.
- Empty, oversized, corrupt, or unsupported event-cover uploads must be rejected without damaging the saved event.

---

### Task 1: Backend Contract Inventory And Safety Tests

**Files:**
- Create: `supabase/rpc-manifest.json`
- Create: `tests/rpc-contracts.test.mjs`
- Create: `tests/repository-secrets.test.mjs`
- Create: `scripts/verify-public-rpcs.mjs`
- Modify: `README_SUPABASE.txt`

**Interfaces:**
- Consumes: RPC call names in `app.js`, `admin*.js`, `portaria*.js`, `leitor*.js`, `hype*.js`, and HTML inline scripts.
- Produces: `rpc-manifest.json` with `{name, group, exposure, sourceFiles}` records and a public smoke command that later tasks run against `supabase-config.js`.

- [ ] **Step 1: Write failing contract and secret tests**

Add Node tests named `all_frontend_rpcs_are_manifested`, `all_manifested_rpcs_exist_in_migrations`, `public_config_contains_only_publishable_key`, and `known_default_passwords_are_not_active_setup_credentials`. Assert the five Review Focus RPC groups are present: public sales, admin, portaria/reader, lists/raffles/surveys, and chat/checkup.

- [ ] **Step 2: Run tests and verify the baseline fails**

Run: `node --test tests/rpc-contracts.test.mjs tests/repository-secrets.test.mjs`

Expected: FAIL because the manifest and canonical migrations do not exist and active setup documentation contains default passwords.

- [ ] **Step 3: Add the RPC manifest, public smoke script, and safe setup documentation**

`scripts/verify-public-rpcs.mjs` must read the project URL/key from `supabase-config.js`, call `public_events_v13`, `public_pix_key`, and `verify_staff` with deliberately invalid credentials, and exit nonzero on an HTTP/PostgREST error. It must never print keys or credentials.

- [ ] **Step 4: Run the task tests**

Run: `node --test tests/rpc-contracts.test.mjs tests/repository-secrets.test.mjs`

Expected: secret test PASS; migration coverage remains FAIL until Tasks 2-4.

- [ ] **Step 5: Commit**

Run: `git add supabase/rpc-manifest.json tests scripts/verify-public-rpcs.mjs README_SUPABASE.txt && git commit -m "test: define Hype backend contracts"`

### Task 2: Dedicated Project And Core Ticketing Schema

**Files:**
- Create: `supabase/migrations/202610010001_hype_core.sql`
- Create: `tests/hype-core-schema.test.mjs`

**Interfaces:**
- Consumes: project name/region constraints and the core contracts in `rpc-manifest.json`.
- Produces: new Supabase `project_id`; tables `events`, `ticket_lots`, `staff_users`, `tickets`, and `audit_logs`; RPCs `verify_staff`, `public_events`, `public_events_v13`, `public_pix_key`, `public_get_ticket`, `staff_list_events`, `staff_list_events_v13`, `staff_save_event_v2`, `staff_save_event_v13`, `staff_list_lots_v16`, `staff_upsert_lot_v16`, `staff_save_pix`, `staff_list_tickets`, `staff_list_tickets_manual`, `staff_list_tickets_v16`, and `staff_set_payment`.

- [ ] **Step 1: Write failing core schema tests**

Test required tables, RLS enablement, explicit grants/revokes, bcrypt credential validation, no seeded default password, event-cover size/type validation, and the public/admin RPC signatures. Add boundary assertions for inactive events, sale start/end equality, and invalid cover data.

- [ ] **Step 2: Run the core schema tests**

Run: `node --test tests/hype-core-schema.test.mjs`

Expected: FAIL because the core migration is absent.

- [ ] **Step 3: Create the new project after the native cost confirmation**

Use organization `jadglkcistpwmgywrpbp`, name `Hype Ingressos`, region `sa-east-1`, and the returned cost-confirmation ID. Record the new project ID only in session state until frontend cutover.

- [ ] **Step 4: Implement and apply the core migration**

Build the canonical schema from `supabase_schema.sql` and current frontend contracts, not by modifying the old Aura Beat project. Use an applied migration named `hype_core` and create no production event or order data.

- [ ] **Step 5: Verify core behavior on the new project**

Query `information_schema`, `pg_proc`, `pg_policies`, and grants. In a transaction that rolls back, assert two concurrent-style attempts cannot oversell a quantity-one lot and that event-cover validation rejects invalid/oversized payloads.

- [ ] **Step 6: Run tests and advisors**

Run: `node --test tests/hype-core-schema.test.mjs`

Then run Supabase security and performance advisors. Expected: tests PASS; no critical security advisor remains unresolved.

- [ ] **Step 7: Commit**

Run: `git add supabase/migrations/202610010001_hype_core.sql tests/hype-core-schema.test.mjs && git commit -m "feat: add isolated Hype core schema"`

### Task 3: Sales, Lists, Promotions, Raffles, And Surveys

**Files:**
- Create: `supabase/migrations/202610010002_hype_sales_admin.sql`
- Create: `tests/hype-sales-admin.test.mjs`

**Interfaces:**
- Consumes: core tables/RPCs from Task 2.
- Produces: promoter/coupon, guest-list, raffle, survey, free-window, quote, manual-order, checkup, and admin dashboard RPC contracts from `rpc-manifest.json`.

- [ ] **Step 1: Write failing feature-contract tests**

Cover `public_quote_v16`, `create_manual_order_v16`, promoter/coupon limits, `staff_guest_simple_*`, raffle uniqueness, survey single submission, checkup fallback contracts, and exact start/end/FREE-window boundaries. Include a quantity-one oversell regression test and assert list-only guests never become paid tickets or raffle entries.

- [ ] **Step 2: Run the feature tests**

Run: `node --test tests/hype-sales-admin.test.mjs`

Expected: FAIL because the feature migration is absent.

- [ ] **Step 3: Implement and apply `hype_sales_admin`**

Consolidate the compatible behavior from versions 13 through 41 and reconstruct missing 42.x/43 contracts from their frontend call sites. Provide compatibility wrappers only when an older RPC name remains in active code.

- [ ] **Step 4: Verify behavior in rolled-back SQL fixtures**

Assert pricing by gender, coupons, stock, FREE windows, list isolation, raffle winner exclusion, and survey idempotency without leaving production-like data.

- [ ] **Step 5: Run contract tests and advisors**

Run: `node --test tests/rpc-contracts.test.mjs tests/hype-sales-admin.test.mjs`

Expected: PASS for public/admin/list/raffle/survey groups.

- [ ] **Step 6: Commit**

Run: `git add supabase/migrations/202610010002_hype_sales_admin.sql tests/hype-sales-admin.test.mjs && git commit -m "feat: restore Hype sales and event operations"`

### Task 4: Portaria, Reader, Chat, And Realtime Contracts

**Files:**
- Create: `supabase/migrations/202610010003_hype_portaria_realtime.sql`
- Create: `tests/hype-portaria.test.mjs`

**Interfaces:**
- Consumes: tickets, events, lots, staff, and guest-list records from Tasks 2-3.
- Produces: device authorization, reader links, lookup, validation, duplicate-entry protection, temporary exit/reentry, quick door sale, chat, access cleanup, and realtime/checkup RPCs from `rpc-manifest.json`.

- [ ] **Step 1: Write failing portaria tests**

Cover device request/approval/revocation, reader-link claim, permanent reader status, ticket search, paid/FREE entry, unpaid rejection, duplicate-entry rejection, temporary exit/reentry, guest-list entry, quick-door FREE order, and revoked-device denial.

- [ ] **Step 2: Run the portaria tests**

Run: `node --test tests/hype-portaria.test.mjs`

Expected: FAIL because portaria/realtime migration is absent.

- [ ] **Step 3: Implement and apply `hype_portaria_realtime`**

Use hashed device/reader secrets, time-bound one-use pairing links where the UI expects them, revocation checks on every privileged RPC, and least-privilege grants.

- [ ] **Step 4: Verify state transitions in rolled-back fixtures**

Prove the exact entry-state sequence `Não utilizado -> Entrada utilizada -> Saída temporária -> Reentrada autorizada/Entrada utilizada` and confirm a second direct entry is rejected.

- [ ] **Step 5: Run all database contract tests and advisors**

Run: `node --test tests/rpc-contracts.test.mjs tests/hype-core-schema.test.mjs tests/hype-sales-admin.test.mjs tests/hype-portaria.test.mjs`

Expected: PASS; RPC manifest has no uncovered active call.

- [ ] **Step 6: Commit**

Run: `git add supabase/migrations/202610010003_hype_portaria_realtime.sql tests/hype-portaria.test.mjs && git commit -m "feat: restore Hype portaria and reader flows"`

### Task 5: Edge Functions And Payment Safety

**Files:**
- Create: `supabase/functions/asaas-pix/index.ts`
- Create: `supabase/functions/asaas-webhook/index.ts`
- Create: `supabase/functions/send-ticket-email/index.ts`
- Create: `supabase/functions/hype-chat-push/index.ts`
- Create: `tests/edge-functions.test.mjs`

**Interfaces:**
- Consumes: new project ID, ticket/order RPCs from Tasks 2-4, and secrets supplied only through the new project's secret manager.
- Produces: deployed `asaas-pix`, `asaas-webhook`, `send-ticket-email`, and `hype-chat-push` endpoints compatible with current frontend requests.

- [ ] **Step 1: Write failing Edge Function safety tests**

Assert no hardcoded secrets, explicit request validation, restricted CORS origin for browser-facing functions, idempotent webhook handling, ticket ownership/order validation before Pix creation, and no paid status update before a verified webhook.

- [ ] **Step 2: Run the function tests**

Run: `node --test tests/edge-functions.test.mjs`

Expected: FAIL because normalized function directories do not exist.

- [ ] **Step 3: Normalize and harden the existing function sources**

Port behavior from `index.ts`, `index (1).ts`, `ASAAS_WEBHOOK_EMAIL_AUTOMATICO_V11.ts`, and the current old-project function sources. Preserve webhook `verify_jwt=false` only where custom Asaas token validation is present; require JWT or equivalent custom authorization elsewhere.

- [ ] **Step 4: Deploy functions to the new project**

Deploy code first. Configure Asaas/email/push secrets through a secure Supabase secret surface; never print or commit them. If payment secrets are unavailable, do not cut over the live frontend.

- [ ] **Step 5: Run function tests and nonfinancial smoke checks**

Run: `node --test tests/edge-functions.test.mjs`

Verify OPTIONS, malformed request, missing-secret, and invalid-webhook-token responses. Do not create a real Asaas charge.

- [ ] **Step 6: Commit**

Run: `git add supabase/functions tests/edge-functions.test.mjs && git commit -m "feat: deploy Hype payment and notification functions"`

### Task 6: Frontend Cutover And Resilient Error States

**Files:**
- Modify: `supabase-config.js`
- Modify: `app.js`
- Modify: `cliente.html`
- Modify: `admin.html`
- Modify: `portaria.html`
- Modify: `leitor.html`
- Modify: `sw.js`
- Modify: `service-worker.js`
- Create: `tests/frontend-integration.test.mjs`

**Interfaces:**
- Consumes: new project URL, active publishable key, verified RPC/Edge Function endpoints.
- Produces: all public pages using the new project with visible loading/empty/error states and refreshed cache versions.

- [ ] **Step 1: Write failing frontend integration tests**

Assert every page loads the same config version, service-worker caches use the new version, raw PostgREST errors are not passed to `alert`, empty event/catalog states are explicit, and the configured project ref is not `axkbfrljohpkjnbotqnf`.

- [ ] **Step 2: Run the frontend tests**

Run: `node --test tests/frontend-integration.test.mjs tests/repository-secrets.test.mjs`

Expected: FAIL while the old project configuration and raw alerts remain.

- [ ] **Step 3: Apply the project configuration and focused UI fixes**

Use the new publishable key, preserve current layout/design, show actionable Portuguese messages for backend outages, and update asset/config cache versions consistently.

- [ ] **Step 4: Run local static and public RPC checks**

Run: `node --test tests/*.test.mjs`

Run: `node scripts/verify-public-rpcs.mjs`

Expected: all tests PASS and public smoke returns only successful HTTP responses.

- [ ] **Step 5: Commit**

Run: `git add supabase-config.js app.js cliente.html admin.html portaria.html leitor.html sw.js service-worker.js tests/frontend-integration.test.mjs && git commit -m "fix: connect Hype site to isolated backend"`

### Task 7: Full Browser Verification, GitHub Deployment, And Handoff

**Files:**
- Modify only when a verified browser failure requires a focused fix.

**Interfaces:**
- Consumes: complete new backend and frontend from Tasks 1-6.
- Produces: verified public URLs and a clean deployment commit on `main`.

- [ ] **Step 1: Create isolated verification data**

Create a private administrator outside Git, an active test event, one FREE lot, one paid-price lot without issuing a charge, one coupon, one promoter, and one list entry. Use `logo-hype.png` as the event-cover upload fixture. Obtain action-time confirmation immediately before UI submissions that publish or delete test content.

- [ ] **Step 2: Verify the admin surface**

Test login, event creation/edit, image preview/upload, theme rendering, lot dates, gender prices, FREE windows, coupon, promoter, list add/search, orders table, raffle, chat/checkup, CSV export, and responsive layout. Confirm corrupt/oversized image validation without saving bad data.

- [ ] **Step 3: Verify customer purchase without a real payment**

Test event carousel, uploaded image, countdown, gender price, coupon, promoter attribution, validation, FREE order completion, ticket display, and duplicate form submission protection. Stop before any real Asaas charge unless the user gives action-time confirmation and a sandbox environment is confirmed.

- [ ] **Step 4: Verify portaria and reader flows**

Test device request/approval, list lookup/entry, FREE ticket lookup, first entry, duplicate rejection, temporary exit/reentry, reader link, invalid/revoked device behavior, dashboard counters, and mobile-sized reader layout. Camera permission is tested only with explicit action-time approval.

- [ ] **Step 5: Run the final automated verification**

Run: `node --test tests/*.test.mjs`

Run: `node scripts/verify-public-rpcs.mjs`

Run: `git diff --check && git status --short`

Expected: tests PASS, public smoke PASS, no whitespace errors, and only intentional verification fixes remain.

- [ ] **Step 6: Push and wait for GitHub Pages deployment**

Run: `git push origin main`

Verify deployment completion through the public URLs; do not assume push means the site is live.

- [ ] **Step 7: Retest the live site and review logs**

Repeat customer, admin, list, cover-image, portaria, and reader smoke flows at `hypeloungeclub.com.br`. Check browser console and Supabase logs for errors and run security/performance advisors one final time.

- [ ] **Step 8: Clean verification state and hand off**

Deactivate test event/data without removing operational configuration, confirm the permanent admin credential is private, and provide the three verified links plus any remaining secure manual secret step.

- [ ] **Step 9: Commit any final verified fix**

Run: `git add <focused-files> && git commit -m "fix: resolve production verification findings" && git push origin main`
