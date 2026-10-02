# Lista HYPE com Foto e Aprovação Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transformar o link permanente da lista em uma candidatura por evento, com foto/Instagram, análise manual do Admin, limite de 10 homens por evento e Gmail somente após aprovação.

**Architecture:** A configuração pública passa a ser por evento. Candidaturas ficam `Pendente` até aprovação; somente `Liberado` chega à Portaria. Fotos ficam em bucket privado e são exibidas ao Admin por URL assinada emitida por Edge Function autenticada com as credenciais de staff.

**Tech Stack:** HTML/JavaScript existente, Supabase Postgres/RPC, Supabase Storage privado, Supabase Edge Functions, Google Apps Script/Gmail.

**Spec:** `docs/superpowers/specs/2026-10-01-lista-foto-aprovacao-design.md`

## Global Constraints

- Gmail somente depois de aprovação; cadastro pendente ou recusado nunca envia e-mail.
- Limite inicial de 10 homens aprovados por evento; eventos têm limites independentes.
- Link público único lista os eventos ativos e grava a escolha feita pela pessoa.
- Foto é privada, com consentimento explícito; não haverá reconhecimento facial automático nem template biométrico.
- Portaria consulta somente cadastros liberados/entrados e nunca recebe a foto.
- Nenhuma chave `service_role` ou segredo deve ir para HTML/JavaScript público.

## Review Focus

- Duas pessoas submetem simultaneamente como 10º/11º homem: a aprovação deve ser atômica por evento.
- Cadastro pendente aparece no Admin, mas não na Portaria.
- Upload inválido, grande ou sem consentimento: rejeitar sem criar candidatura.
- Falha no Gmail após aprovação: manter aprovação, mostrar falha e permitir reenvio.
- Link público com dois eventos: CPF duplicado é bloqueado somente dentro do evento escolhido.

### Task 1: Database model and secured RPCs

**Files:**
- Create: `supabase/migrations/202610020001_hype_guest_review_v50.sql`
- Test: `tests/hype-guest-review.test.mjs`

**Interfaces:**
- `public_guest_registration_events_v50()` returns active events with `registration_open` and `male_limit`.
- `public_guest_registration_submit_v50(p_event_id, p_name, p_cpf, p_phone, p_gender, p_email, p_instagram, p_photo_path, p_photo_consent)` returns a pending row.
- `staff_guest_registration_review_v50(p_username, p_password, p_list_id, p_decision)` atomically approves/rejects and returns the row plus `male_slots_remaining`.
- `staff_guest_registration_settings_v50(p_username, p_password)` and `staff_set_guest_registration_v50(...)` manage event-specific open state and male limit.

- [ ] **Step 1: Write the failing database contract test** in `tests/hype-guest-review.test.mjs` for pending submission, per-event CPF uniqueness, approval/rejection, event isolation and the 10-male quota.
- [ ] **Step 2: Run `node --test --test-isolation=none tests/hype-guest-review.test.mjs` and verify it fails** on the new RPC names/statuses.
- [ ] **Step 3: Add the migration** with per-event settings (`male_limit = 10`), e-mail/Instagram/photo/consent/review columns, `Pendente` status, and the exact RPC interfaces above.
- [ ] **Step 4: Implement atomic review** using a transaction/advisory lock so the 11th approved male returns a quota error; make staff/list and Portaria reads exclude `Pendente`.
- [ ] **Step 5: Run the contract test again and verify it passes**, including two concurrent approval attempts for the final male slot.
- [ ] **Step 6: Commit** the migration and database tests with `feat: add guest list review schema`.

### Task 2: Private photo storage and registration Edge Function

**Files:**
- Create: `supabase/functions/guest-list-registration/index.ts`
- Create: `supabase/functions/guest-list-admin-photo/index.ts`
- Modify: `supabase/migrations/202610020001_hype_guest_review_v50.sql`
- Test: `tests/hype-guest-photo.test.mjs`

**Interfaces:**
- Public function accepts multipart registration data, validates image type/size, stores under an unguessable private path and calls the public submit RPC.
- Admin photo function accepts staff credentials and `list_id`, returns a short-lived signed URL only for authorized staff.

- [ ] **Step 1: Write the failing photo/function tests** in `tests/hype-guest-photo.test.mjs` for valid upload, invalid MIME/size, missing consent, cleanup after insert failure and unauthorized signed-URL access.
- [ ] **Step 2: Run `node --test --test-isolation=none tests/hype-guest-photo.test.mjs` and verify it fails** before the functions and bucket exist.
- [ ] **Step 3: Implement `guest-list-registration/index.ts`** with multipart validation, bounded image type/size/dimensions, honeypot/consent checks, private object path generation and the public submit RPC call.
- [ ] **Step 4: Implement `guest-list-admin-photo/index.ts`** with staff authentication and short-lived signed URLs; configure a private bucket and policies in the migration.
- [ ] **Step 5: Delete the object when the RPC insert fails, run the photo tests, and verify they pass** without exposing a public URL.
- [ ] **Step 6: Commit** the functions, storage migration and tests with `feat: add private guest photo review functions`.

### Task 3: Public list page with event selection and application fields

**Files:**
- Modify: `lista.html`
- Modify: `lista-v49.js`
- Modify: `style.css`
- Test: `tests/hype-public-registration-links.test.mjs`

- [ ] **Step 1: Extend `tests/hype-public-registration-links.test.mjs`** with assertions for active-event choice, required e-mail/Instagram/photo/consent fields, `Em análise` copy and the absent promoter footer link.
- [ ] **Step 2: Run the focused public-page test and verify it fails** against the current single-event form.
- [ ] **Step 3: Update `lista.html` and `style.css`** with active event cards, selected-event details, e-mail/Instagram/photo/consent controls and accessible validation states.
- [ ] **Step 4: Update `lista-v49.js`** to load `public_guest_registration_events_v50`, submit multipart data to `guest-list-registration`, preserve CPF/phone formatting and show `Em análise` without any mail call.
- [ ] **Step 5: Run `node --test --test-isolation=none tests/hype-public-registration-links.test.mjs` and verify it passes** for both Friday and Saturday choices.
- [ ] **Step 6: Commit** the public page and tests with `feat: add event-aware guest list application form`.

### Task 4: Admin review and per-event quota UI

**Files:**
- Modify: `admin.html`
- Modify: `hype-v49-registration-admin.js`
- Modify: `hype-v408-lista-admin.js`
- Modify: `app.js`
- Test: `tests/hype-admin-guest-review.test.mjs`

- [ ] **Step 1: Write the failing Admin/Portaria test** in `tests/hype-admin-guest-review.test.mjs` for pending-row rendering, signed-photo access, approve/reject, remaining slots, e-mail status and Portaria filtering.
- [ ] **Step 2: Run `node --test --test-isolation=none tests/hype-admin-guest-review.test.mjs` and verify it fails** before the review UI exists.
- [ ] **Step 3: Update `admin.html` and `hype-v49-registration-admin.js`** with event toggles, male-limit input (default 10), pending rows, private photo preview, Instagram/contact data and approve/reject controls.
- [ ] **Step 4: Update `hype-v408-lista-admin.js` and `app.js`** to keep manual entries working, show remaining slots/e-mail state, allow resend only after approval and keep `Pendente` out of Portaria data.
- [ ] **Step 5: Run the Admin/Portaria test and verify it passes** with no pending photo URL or row in the Portaria payload.
- [ ] **Step 6: Commit** the review UI and tests with `feat: add admin guest list review controls`.

### Task 5: Approval e-mail and Apps Script integration

**Files:**
- Modify: `supabase/functions/send-ticket-email/index.ts`
- Modify: `APPS_SCRIPT_V35_Codigo.gs`
- Test: `tests/hype-guest-approval-email.test.mjs`

- [ ] **Step 1: Write the failing e-mail tests** in `tests/hype-guest-approval-email.test.mjs` for approval-only delivery, event cover/details, missing e-mail, Apps Script failure and retry.
- [ ] **Step 2: Run `node --test --test-isolation=none tests/hype-guest-approval-email.test.mjs` and verify it fails** before the new action exists.
- [ ] **Step 3: Extend `send-ticket-email/index.ts`** with staff-authenticated `guest_list_approved`, loading the approved candidate/event and calling Apps Script only after approval.
- [ ] **Step 4: Extend `APPS_SCRIPT_V35_Codigo.gs`** to send the “nome confirmado na lista” Gmail with event cover/details and return a positive/negative response.
- [ ] **Step 5: Persist `email_sent_at` only on success and expose retry** for approved candidates; run the e-mail tests and verify they pass.
- [ ] **Step 6: Commit** the approval e-mail flow and tests with `feat: email approved guest list candidates`.

### Task 6: Verification and deployment

**Files:**
- Modify: `README_SUPABASE.txt` (setup notes only if needed)

- [ ] **Step 1: Run syntax checks, every focused test, and `git diff --check`**; fix any failure before deployment.
- [ ] **Step 2: Apply migration `202610020001_hype_guest_review_v50.sql`** to project `txxoqfcwqncqyiqgzboz` and deploy both Edge Functions.
- [ ] **Step 3: Run a controlled end-to-end check** covering Friday/Saturday selection, pending Admin review, 10-male quota, approval, Portaria visibility and Gmail status.
- [ ] **Step 4: Commit deployment/setup notes** with `chore: verify guest list approval flow` and push the implementation to `main`.
