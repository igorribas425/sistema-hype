# HYPE Public Registration and Blocking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add permanent public guest-list and promoter-registration links, plus centralized temporary/permanent person blocking across registration, sales, and entry.

**Architecture:** A new additive Supabase migration owns identity normalization, public-registration configuration, person blocks, and narrow RPCs. Two focused public pages call only those RPCs; existing Admin and Portaria surfaces manage and consume the same records. Blocking is enforced in database write/entry functions so it cannot be bypassed by frontend changes.

**Tech Stack:** Static HTML/CSS/JavaScript, Supabase Postgres/RPC/RLS, `supabase-js` v2 CDN, Node.js built-in test runner, existing HYPE QR helper and service workers.

**Spec:** `docs/superpowers/specs/2026-10-01-hype-public-registration-blocking-design.md`

## Global Constraints

- Permanent public URLs are `https://hypeloungeclub.com.br/lista.html` and `https://hypeloungeclub.com.br/promoter.html`.
- Guest registration requires full name, valid CPF, WhatsApp, and `Feminino` or `Masculino`; it enters the Admin-selected event as `Liberado`.
- Promoter registration requires full name, valid CPF, and WhatsApp; it creates an immediately active global promoter link.
- Existing manual guest and promoter workflows remain functional.
- Active blocks prevent public list registration, promoter registration, ticket purchase, guest-list entry, and ticket entry.
- CPF is the primary match; normalized name is fallback only when a valid CPF is unavailable.
- New public callers receive no list, customer, sales, block-reason, or Admin data.
- Every exposed table has RLS enabled; public access is through narrow RPC grants only.
- Never expose a Supabase secret/service-role key in browser code.
- Asset/cache release after implementation is `20261001-v49` / `hype-v49-offline`.

## Review Focus

- Double click or concurrent submission with the same CPF must create one row and return the existing outcome; Task 2 and Task 4 pin this with uniqueness/lock tests.
- A temporary block at its exact `blocked_until` boundary must expire according to `timestamptz` and `clock_timestamp()`; Task 1 tests before/at/after behavior.
- Two people with the same normalized name but different valid CPFs must not block or deduplicate each other; Task 1 and Task 2 test CPF-first matching.
- A disabled or newly blocked promoter code must stop receiving new sale attribution while preserving historical sales; Task 3 and Task 4 test both states.
- A network retry must preserve entered form values and must not create duplicate guest/promoter records; Task 5 tests retry UI and Task 2/4 enforce idempotent data behavior.

## File Structure

- Create one migration with `supabase migration new hype_public_registration`; use the generated `supabase/migrations/<timestamp>_hype_public_registration.sql` for all additive schema and RPC changes.
- Create `tests/hype-public-registration.test.mjs` for migration security, RPC, normalization, deduplication, and blocking contracts.
- Create `tests/sql/hype-public-registration.sql` for transactional live-database boundary and concurrency checks; every fixture runs inside a transaction and rolls back.
- Create `hype-public-v49.css` for the two public registration pages only.
- Create `lista.html` and `lista-v49.js` for guest self-registration.
- Create `promoter.html` and `promoter-v49.js` for promoter self-registration and personal-link output.
- Create `hype-v49-registration-admin.js` for Admin registration settings, permanent link tools, and block management.
- Create `hype-v49-registration-admin.js` for the Admin-only permanent guest/promoter link tabs, QR/share controls, and guest-list open/block state.
- Modify `hype-v408-lista-admin.js` only for richer guest-list RPCs and block actions.
- Modify `promoter-global-v16-8.js` only for richer promoter RPCs and block actions.
- Modify `hype-v406-lista-simples.js` only for richer Portaria list search/entry results.
- Modify `admin.html`, `portaria.html`, service workers, registration, manifest contracts, and frontend tests to wire and cache release v49.

---

### Task 1: Identity Validation and Person Blocks

**Files:**
- Create: `supabase/migrations/<generated>_hype_public_registration.sql`
- Create: `tests/hype-public-registration.test.mjs`
- Create: `tests/sql/hype-public-registration.sql`

**Interfaces:**
- Produces: `private.hype_cpf_digits(text) -> text`, `private.hype_cpf_valid(text) -> boolean`, `private.hype_phone_digits(text) -> text`, and `private.hype_active_person_block(text,text) -> bigint|null`.
- Produces: `staff_person_block_upsert_v49(text,text,bigint,text,text,text,timestamptz,text,boolean) -> table(block_id bigint,name text,cpf text,block_type text,blocked_until timestamptz,reason text,active boolean)`.
- Produces: `staff_person_blocks_v49(text,text,text) -> table(block_id bigint,name text,cpf text,block_type text,blocked_until timestamptz,reason text,active boolean,created_at timestamptz)`.
- Consumes: existing `private.hype_name_key(text) -> text` and `private.hype_require_staff(text,text,text[]) -> public.staff_users`.

- [ ] **Step 1: Verify current Supabase guidance before writing SQL**

Read `https://supabase.com/changelog.md`, the current RLS guide, and current database-function security guidance. Record any relevant breaking change in the plan execution notes; proceed only with primary Supabase documentation.

- [ ] **Step 2: Write failing schema/security tests**

Add Node tests named `person_blocks_are_private_and_cpf_first`, `temporary_blocks_use_clock_timestamp_boundary`, and `block_admin_rpcs_require_admin`. Assert the new table has RLS, no direct anon table grant, one active block per CPF, CPF checksum logic, `clock_timestamp() < blocked_until`, and an Admin-only `hype_require_staff` call. Add transactional SQL cases for active-before, inactive-at, and inactive-after the exact expiry plus two equal names with different valid CPFs.

- [ ] **Step 3: Run the new test file and verify red**

Run: `node --test --test-isolation=none tests/hype-public-registration.test.mjs`

Expected: FAIL because the migration and functions do not exist.

- [ ] **Step 4: Create the migration through the Supabase CLI**

Run: `supabase migration new hype_public_registration`

Expected: one generated migration file under `supabase/migrations/`; use that exact file for Tasks 1-4.

- [ ] **Step 5: Implement normalized identity and the private block table**

Create `public.person_blocks_v49` with the fields and constraints from the spec, RLS, timestamps, one active CPF index, and no public table policies. Implement the four private helpers with schema-qualified references and an empty `search_path`; CPF matching wins, with name fallback only when CPF is invalid/missing.

- [ ] **Step 6: Implement Admin block RPCs**

`staff_person_block_upsert_v49` accepts Admin credentials, id, name, CPF, `Temporario|Permanente`, optional end time/reason, and active state. It validates future temporary expiry and deactivates a matching promoter when a block becomes active. `staff_person_blocks_v49` returns masked/searchable management rows without granting table access.

- [ ] **Step 7: Run the focused tests and commit**

Run: `node --test --test-isolation=none tests/hype-public-registration.test.mjs`

Expected: PASS for Task 1 tests.

Commit: `feat: add person blocking foundation`

---

### Task 2: Public Guest-List Registration

**Files:**
- Modify: `supabase/migrations/<generated>_hype_public_registration.sql`
- Modify: `tests/hype-public-registration.test.mjs`

**Interfaces:**
- Consumes: Task 1 normalization and block helpers.
- Produces: `public_guest_registration_context_v49() -> table(registration_open boolean,event_id bigint,event_name text,event_date date)`.
- Produces: `public_guest_registration_submit_v49(text,text,text,text,text) -> table(ok boolean,message text,list_id bigint,event_name text,status text)`.
- Produces: `staff_guest_registration_settings_v49(text,text) -> table(event_id bigint,event_name text,registration_open boolean,updated_at timestamptz)` and `staff_set_guest_registration_v49(text,text,bigint,boolean)` with the same return columns.
- Produces: `staff_guest_simple_add_v49(text,text,bigint,text,text,text,text) -> table(list_id bigint,name text,already_exists boolean,message text,status text)` and `staff_guest_simple_list_v49(text,text,bigint) -> table(list_id bigint,name text,cpf text,phone text,gender text,source text,status text,created_at timestamptz,entered_at timestamptz,added_by text)`.
- Produces: `portaria_guest_simple_search_v49(text,bigint,text)` with the same guest detail columns except `added_by`, and `portaria_guest_simple_enter_v49(text,bigint) -> table(ok boolean,message text,list_id bigint,name text,status text,entered_at timestamptz)`.

- [ ] **Step 1: Write failing guest-registration tests**

Add tests named `guest_registration_is_closed_by_default`, `guest_submission_requires_valid_fields_and_empty_honeypot`, `guest_submission_is_atomic_by_event_and_cpf`, `same_name_different_cpf_is_allowed`, and `public_guest_rpc_returns_no_private_list_data`. Assert the exact signatures above, `Liberado`/`Publico`, event+CPF uniqueness, and the generic blocked response.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `node --test --test-isolation=none tests/hype-public-registration.test.mjs`

Expected: FAIL on the missing settings and guest RPC contracts.

- [ ] **Step 3: Extend the guest-list schema and registration settings**

Add `phone`, `source`, and `updated_at` to `guest_list_simple_v406`; replace unconditional event/name uniqueness with event/CPF uniqueness for CPF-backed rows while retaining explicit name duplicate checks for legacy manual rows. Create the singleton settings table with RLS and default `registration_open=false`.

- [ ] **Step 4: Implement public and staff guest RPCs**

The public context returns only open state and selected event id/name/date. The submit RPC validates name length, CPF checksum, Brazilian WhatsApp digits, gender, empty honeypot, selected active event, block state, and duplicate CPF under an advisory transaction lock. Staff RPCs read/update settings and preserve manual entry with optional CPF/phone/gender.

- [ ] **Step 5: Implement v49 Portaria guest RPCs**

Search returns name, masked CPF, phone, gender, source, status, and timestamps only after device authorization. Entry locks the row, rechecks the active block, rejects duplicate entry, and records the device id.

- [ ] **Step 6: Run focused tests and commit**

Run: `node --test --test-isolation=none tests/hype-public-registration.test.mjs`

Expected: PASS for Tasks 1-2.

Commit: `feat: add public guest registration contracts`

---

### Task 3: Enforce Blocks in Sales and Entry

**Files:**
- Modify: `supabase/migrations/<generated>_hype_public_registration.sql`
- Modify: `tests/hype-public-registration.test.mjs`
- Modify: `tests/hype-portaria.test.mjs`
- Modify: `tests/hype-sales-admin.test.mjs`

**Interfaces:**
- Consumes: `private.hype_active_person_block(cpf,name)` from Task 1.
- Produces: block-aware replacements of existing sale and entry RPCs without changing their frontend parameter or result contracts.

- [ ] **Step 1: Write failing enforcement tests**

Assert the migration replaces `create_manual_order_v16`, `portaria_device_create_door_order_v19`, `portaria_device_validate_v18`, `staff_validate_entry_v17`, and legacy manual guest addition with calls to the block helper before mutation. Add assertions that lookup/search remains available so operators can see why entry is denied.

- [ ] **Step 2: Run sales and Portaria tests and verify red**

Run: `node --test --test-isolation=none tests/hype-public-registration.test.mjs tests/hype-sales-admin.test.mjs tests/hype-portaria.test.mjs`

Expected: FAIL on missing block enforcement.

- [ ] **Step 3: Replace purchase functions without changing signatures**

Add the block check before ticket insertion in website/manual checkout and Portaria door sale. Validate that a supplied global promoter is active and its CPF is not blocked before attaching `promoter_code`; rejected attribution must not alter historical tickets.

- [ ] **Step 4: Replace entry functions without changing signatures**

After row locking and before any entry-state update, block ticket entry by ticket CPF/name. Keep lookup/search readable and return a clear operator-facing denial. Apply the same rule to v49 guest entry.

- [ ] **Step 5: Preserve legacy manual workflows under the same rule**

Keep existing RPC names callable, but make manual guest insertion and other new-person creation consult CPF first and normalized name only when CPF is absent.

- [ ] **Step 6: Run focused tests and commit**

Run: `node --test --test-isolation=none tests/hype-public-registration.test.mjs tests/hype-sales-admin.test.mjs tests/hype-portaria.test.mjs`

Expected: PASS.

Commit: `feat: enforce person blocks across sales and entry`

---

### Task 4: Public Promoter Registration

**Files:**
- Modify: `supabase/migrations/<generated>_hype_public_registration.sql`
- Modify: `tests/hype-public-registration.test.mjs`

**Interfaces:**
- Consumes: Task 1 normalization/block helpers and existing `promoters_global_v16` sales attribution.
- Produces: `public_promoter_registration_submit_v49(text,text,text,text) -> table(ok boolean,message text,promoter_code text,sales_url text)`.
- Produces: `staff_list_promoters_global_v49(text,text) -> table(id bigint,name text,code text,cpf text,phone text,source text,active boolean,created_at timestamptz,sales_count bigint,paid_count bigint,revenue numeric)`.
- Produces: `staff_upsert_promoter_global_v49(text,text,bigint,text,text,text,text,boolean) -> table(id bigint,name text,code text,cpf text,phone text,source text,active boolean)`.

- [ ] **Step 1: Write failing promoter tests**

Add tests named `public_promoter_is_active_and_global`, `promoter_cpf_is_unique_under_concurrency`, `active_duplicate_returns_same_code`, `disabled_or_blocked_promoter_cannot_self_reactivate`, and `promoter_code_collision_gets_stable_suffix`.

- [ ] **Step 2: Run the new tests and verify red**

Run: `node --test --test-isolation=none tests/hype-public-registration.test.mjs`

Expected: FAIL on missing promoter schema/RPC contracts.

- [ ] **Step 3: Extend the global promoter model**

Add normalized `cpf`, `phone`, and `source` with a partial unique CPF index. Preserve all existing records and immutable codes; existing manual records may keep null CPF/phone.

- [ ] **Step 4: Implement atomic public promoter registration**

Validate fields and empty honeypot, check the centralized block, lock by CPF, return an existing active code, refuse disabled/blocked rows, or insert a new active row. Generate an uppercase name-derived code with a collision-safe suffix entirely inside the transaction. Return only `ok`, message, code, and official sales URL.

- [ ] **Step 5: Add richer staff promoter RPCs and run tests**

The list RPC returns Admin-only CPF/phone/source plus existing paid count, order count, revenue, and status. The upsert RPC preserves manual creation and never auto-reactivates a blocked CPF.

Run: `node --test --test-isolation=none tests/hype-public-registration.test.mjs`

Expected: PASS for Tasks 1-4.

Commit: `feat: add public promoter registration contracts`

---

### Task 5: Build the Two Public Registration Pages

**Files:**
- Create: `hype-public-v49.css`
- Create: `lista.html`
- Create: `lista-v49.js`
- Create: `promoter.html`
- Create: `promoter-v49.js`
- Modify: `tests/frontend-integration.test.mjs`

**Interfaces:**
- Consumes: Task 2 public guest context/submit RPCs and Task 4 public promoter submit RPC.
- Produces: two mobile-first public forms and promoter copy/share actions.

- [ ] **Step 1: Write failing frontend contract tests**

Assert both pages load only the publishable Supabase config, require the approved fields, include a hidden `website` honeypot, retain values on network error, disable duplicate submits, expose accessible status text, and never contain Admin credentials or service-role secrets.

- [ ] **Step 2: Run the frontend test and verify red**

Run: `node --test --test-isolation=none tests/frontend-integration.test.mjs`

Expected: FAIL because the pages and scripts do not exist.

- [ ] **Step 3: Build `lista.html` and `lista-v49.js`**

Load the selected public event, show closed/no-event state, apply CPF/WhatsApp masks, submit the four required fields plus honeypot, preserve values on retry, and show success/duplicate/blocked states without exposing other records.

- [ ] **Step 4: Build `promoter.html` and `promoter-v49.js`**

Submit name/CPF/WhatsApp plus honeypot, show the returned personal sales link, and implement copy/native share with a clipboard fallback. Disabled/blocked results show only the generic staff-contact message.

- [ ] **Step 5: Style and visually verify both pages**

Use the existing logo and HYPE visual identity in `hype-public-v49.css`; ensure controls fit at 375x812 and 1440x900 with no overlap or horizontal scroll.

- [ ] **Step 6: Run frontend tests and commit**

Run: `node --test --test-isolation=none tests/frontend-integration.test.mjs`

Expected: PASS.

Commit: `feat: add public Hype registration pages`

---

### Task 6: Add Admin Registration and Blocking Controls

**Files:**
- Create: `hype-v49-registration-admin.js`
- Modify: `admin.html`
- Modify: `hype-v408-lista-admin.js`
- Modify: `promoter-global-v16-8.js`
- Modify: `tests/frontend-integration.test.mjs`

**Interfaces:**
- Consumes: Task 1 staff block RPCs, Task 2 settings/list RPCs, and Task 4 staff promoter RPCs.
- Produces: `window.HypeV49RegistrationAdmin` with `loadSettings`, `saveSettings`, `copyGuestLink`, `shareGuestLink`, `copyPromoterSignupLink`, `sharePromoterSignupLink`, `openBlock`, `saveBlock`, `deactivateBlock`, and `loadBlocks`.

- [ ] **Step 1: Write failing Admin UI tests**

Assert Admin has selected-event/open controls, permanent guest and promoter URLs, QR/copy/share actions, richer guest/promoter rows, block search, temporary end-time input, permanent mode, reason, and deactivate action. Assert all calls include current Admin credentials.

- [ ] **Step 2: Run frontend tests and verify red**

Run: `node --test --test-isolation=none tests/frontend-integration.test.mjs`

Expected: FAIL on missing Admin controls/controller.

- [ ] **Step 3: Add public guest settings and link tools**

Place the settings inside the existing guest-list panel. Default closed, require an event before opening, persist through staff RPCs, and render the fixed `lista.html` URL and QR without any secret token.

- [ ] **Step 4: Add centralized block management**

Create a compact Admin-only section searchable by name/CPF. `openBlock` pre-fills known guest/promoter identity; `saveBlock` enforces future time for temporary mode; deactivate requires confirmation. Mask CPF in rows by default.

- [ ] **Step 5: Upgrade guest and promoter rows**

Switch to v49 list RPCs, display WhatsApp/gender/source or promoter sales totals/status, and add block buttons. Preserve manual multiline guest addition and manual promoter creation.

- [ ] **Step 6: Run frontend tests and commit**

Run: `node --test --test-isolation=none tests/frontend-integration.test.mjs`

Expected: PASS.

Commit: `feat: manage registrations and blocks in admin`

---

### Task 7: Keep Public Links in Admin and Block-Aware Guest Results

**Files:**
- Modify: `admin.html`
- Modify: `hype-v49-registration-admin.js`
- Modify: `portaria.html`
- Modify: `hype-v406-lista-simples.js`
- Modify: `tests/frontend-integration.test.mjs`

**Interfaces:**
- Consumes: Task 2 v49 Portaria guest RPCs and existing `HypeQR` utility.
- Produces: `window.HypeV49ListLink` with `show(tab)`, `copy()`, and `share()`.

- [ ] **Step 1: Write failing Admin/Portaria UI tests**

Assert Admin exposes the permanent list/promoter links with QR, copy, and share controls, while Portaria keeps only Vendas/Feminino/Masculino plus unified search and contains no public registration links.

- [ ] **Step 2: Run frontend tests and verify red**

Run: `node --test --test-isolation=none tests/frontend-integration.test.mjs`

Expected: FAIL on missing tabs and controller.

- [ ] **Step 3: Implement the tab controller and link tools**

Keep the current Portaria entry panel visible by default. Render the fixed official guest URL and QR only in Admin, use native share when supported, and fall back to clipboard. Do not add event controls or a secret to either public URL.

- [ ] **Step 4: Upgrade Portaria guest search and entry**

Use v49 RPCs, show masked CPF, WhatsApp, gender, source, and entry state in the unified result area, and render blocked entry as an operator-facing denial without hiding the person.

- [ ] **Step 5: Run frontend tests, visually verify, and commit**

Run: `node --test --test-isolation=none tests/frontend-integration.test.mjs`

Expected: PASS and no desktop/mobile overlap.

Commit: `feat: add guest registration link to portaria`

---

### Task 8: Wire Release v49, Deploy, and Verify End to End

**Files:**
- Modify: `admin.html`
- Modify: `cliente.html`
- Modify: `index.html`
- Modify: `leitor.html`
- Modify: `pesquisa.html`
- Modify: `portaria.html`
- Modify: `lista.html`
- Modify: `promoter.html`
- Modify: `register-sw.js`
- Modify: `sw.js`
- Modify: `service-worker.js`
- Modify: `supabase/rpc-manifest.json`
- Modify: `tests/frontend-integration.test.mjs`
- Modify: `tests/rpc-contracts.test.mjs`

**Interfaces:**
- Consumes: all Tasks 1-7.
- Produces: release `20261001-v49`, deployed database RPCs, production pages, and clean test state.

- [ ] **Step 1: Write failing release/manifest tests**

Assert every page loads `supabase-config.js?v=20261001-v49`, service workers use `hype-v49-offline`, new pages/assets are cached, and all frontend RPC calls appear in the generated manifest with correct `anon`, `staff`, or `device` exposure.

- [ ] **Step 2: Regenerate contracts and wire v49 assets**

Run: `node scripts/generate-rpc-manifest.mjs`

Update service-worker registration/cache lists and all relevant asset query versions. Do not cache submitted form data or responses containing personal data.

- [ ] **Step 3: Run the complete local suite**

Run: `node --test --test-isolation=none tests/*.test.mjs`

Expected: all tests pass with zero failures.

Run: `git diff --check`

Expected: exit 0.

- [ ] **Step 4: Apply the migration and run database verification**

Apply the generated migration to Supabase project `txxoqfcwqncqyiqgzboz` using the authenticated Supabase MCP/CLI workflow. Run security/performance advisors, resolve new warnings caused by this migration, and execute `tests/sql/hype-public-registration.sql` for closed/open registration, duplicate CPF, exact block expiry, promoter reuse, and disabled promoter. Confirm the transaction rolls back.

- [ ] **Step 5: Run browser end-to-end tests with fictitious data**

Create a temporary test event and valid fictitious CPFs. Verify guest registration appears in Admin and Portaria, temporary block denies entry, promoter registration returns a working attributed sales URL, retry does not duplicate, and desktop/mobile layouts remain usable. Do not create a real paid Asaas charge.

- [ ] **Step 6: Remove all test data and verify clean state**

Delete fictitious guests, promoters, blocks, tickets, lots, and the temporary event. Confirm production contains no test records and leave public guest registration closed unless the user explicitly selects a real event to open.

- [ ] **Step 7: Commit, publish, and verify production assets**

Commit: `feat: launch public registration and blocking`

Push the feature branch to `main`, wait for GitHub Pages propagation, and verify both permanent URLs serve v49 and the public Supabase functions respond with expected closed/open states.

- [ ] **Step 8: Final full verification**

Run: `node --test --test-isolation=none tests/*.test.mjs`

Expected: zero failures after deployment and cleanup.

Report the two permanent public links, the Admin/Portaria changes, test count, migration status, and any external-provider limitation that remains.
