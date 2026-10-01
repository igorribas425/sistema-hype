# HYPE Public Registration and Person Blocking Design

## Goal

Give HYPE one permanent public link that guests can use to add themselves to the existing event guest list. The Admin chooses which event receives registrations. A valid submission is immediately released for that event, while the existing manual Admin workflow remains available.

Give HYPE a second permanent public link where promoters can submit their own details and immediately receive a personal sales link that works for every current and future event. The existing manual promoter workflow remains available.

Add a centralized person-blocking rule so Admin can temporarily or permanently prevent a person from registering for the guest list, buying a ticket, or entering through Portaria.

## Confirmed Product Decisions

- The guest-list registration URL is permanent and shared by everyone.
- Admin selects the event currently receiving public registrations.
- Public registrations are approved immediately; there is no review queue.
- The form requires full name, CPF, WhatsApp, and gender (`Feminino` or `Masculino`).
- One CPF can appear only once in the same event guest list.
- The existing manual list entry remains available in Admin.
- Admin can create temporary blocks with an end date/time or permanent blocks.
- Blocks display and can be searched by both name and CPF.
- An active block applies to public list registration, ticket purchase, and Portaria entry.
- The Portaria page gets an `Entrada` tab and a `Link da lista` tab. The latter shows the permanent URL, QR code, copy, and share actions.
- The promoter registration URL is permanent and shared by all prospective promoters.
- Promoter registration requires full name, CPF, and WhatsApp.
- A successful promoter registration creates a global, immediately active promoter and returns the personal sales link.
- A promoter CPF is unique. Repeating an active promoter CPF returns the existing link without creating another record.
- A disabled or blocked promoter cannot reactivate themselves through the public form.
- Admin continues to create promoters manually and can copy, disable, or delete their links.

## Non-Goals

- Public users do not choose an event.
- Public users do not receive Admin, Portaria, or guest-list read access.
- Public promoters do not receive Admin access or sales/customer data.
- A public registration does not create a paid ticket, QR code, or raffle entry.
- This work does not add SMS or WhatsApp verification.
- This work does not change the existing Admin login or Portaria device authorization model.

## User Flows

### Admin configures the public list

1. Admin opens the existing guest-list panel.
2. Admin selects the event that should receive registrations.
3. Admin opens or closes public registrations.
4. The setting takes effect immediately without changing the public URL.

Only one event can receive public registrations at a time. If registrations are closed or no event is selected, the public page explains that registrations are unavailable and does not show an active submit action.

### Guest registers

1. A guest opens `https://hypeloungeclub.com.br/lista.html`.
2. The page shows the selected event name and the fields name, CPF, WhatsApp, and gender.
3. The database validates the inputs, CPF checksum, active event setting, duplicate CPF, and active person blocks.
4. A successful submission creates a row in the existing guest list with source `Publico` and status `Liberado`.
5. A repeated CPF for that event returns a friendly `Voce ja esta na lista` response and does not create another row.
6. A blocked person receives a generic message directing them to HYPE staff. The public response does not expose the block reason or duration.

### Portaria shares and uses the list

- `Entrada` remains the default tab and preserves the simplified search and three counters.
- `Link da lista` displays the permanent URL and a QR code, with copy and native-share actions.
- Portaria search continues to combine tickets and guest-list records.
- Guest-list results show the saved name, masked CPF, WhatsApp, gender, source, and entry state.
- Confirming guest-list entry checks the centralized block rule again before marking the person as entered.

### Promoter registers and receives a sales link

1. A prospective promoter opens `https://hypeloungeclub.com.br/promoter.html`.
2. The page asks for full name, CPF, and WhatsApp.
3. The database validates the fields, CPF checksum, active person blocks, and existing promoter identity.
4. For a new CPF, the database creates a global promoter with an atomic unique code derived from the name and a collision-safe suffix when necessary.
5. The promoter is active immediately and the page returns `https://hypeloungeclub.com.br/cliente.html?promoter=CODIGO`.
6. The result provides copy and native-share actions.
7. For an already active promoter CPF, the page returns the existing sales link without exposing other profile details.
8. For a disabled or blocked CPF, the page directs the person to HYPE staff and does not reactivate the account.

### Admin blocks a person

1. Admin searches the guest list or blocked-person list by name or CPF.
2. Admin chooses temporary or permanent block and may record a reason.
3. A temporary block requires an end date/time in the future.
4. A permanent block has no end date.
5. Admin can deactivate a block later.

CPF is the primary identity. The normalized full name is stored for display and search, and is used as a fallback only for legacy records or actions that do not contain a CPF. This prevents common names from being blocked when a valid CPF is available.

An active block also prevents public promoter registration. If Admin blocks an existing promoter, their promoter record is kept for sales history but becomes inactive for new purchases until Admin removes the block and explicitly reactivates the promoter.

## Data Model

### `public_guest_registration_settings_v49`

A single-row configuration table:

- `id boolean primary key default true check (id)`
- `event_id bigint null references events(id)`
- `registration_open boolean not null default false`
- `updated_by text not null`
- `updated_at timestamptz not null`

RLS is enabled. The table is not directly readable or writable by `anon` or `authenticated`; all access goes through narrow RPCs.

### `person_blocks_v49`

- identity primary key
- `name`, `name_key`, and normalized 11-digit `cpf`
- `block_type` constrained to `Temporario` or `Permanente`
- `blocked_until` required only for temporary blocks
- optional `reason`
- `active`, `created_by`, `created_at`, `updated_at`

There may be only one active block per CPF. Expired temporary rows remain as history but no longer block actions. RLS is enabled with no direct public table policies.

### Existing `guest_list_simple_v406`

Add:

- normalized `phone`
- `source` constrained to `Admin` or `Publico`
- `updated_at`

The current `cpf` and `gender` columns become populated for public registrations. Replace name-only uniqueness for CPF-backed records with a partial unique index on `(event_id, cpf)` where CPF is present. Manual name-only entries continue to use an explicit duplicate-name check in the staff RPC.

### Existing `promoters_global_v16`

Add:

- normalized 11-digit `cpf`
- normalized `phone`
- `source` constrained to `Admin` or `Publico`

Add a partial unique index on CPF where CPF is present. Existing manually created promoters without CPF remain valid and can be completed later by Admin. Sales history continues to reference the immutable promoter code.

## Database API

Public-facing RPCs expose no list contents:

- `public_guest_registration_context_v49()` returns only whether registration is open and the selected event's public name/date.
- `public_guest_registration_submit_v49(name, cpf, phone, gender, website)` validates and inserts one released guest-list row atomically. `website` is the hidden honeypot value and must be empty.
- `public_promoter_registration_submit_v49(name, cpf, phone, website)` validates the applicant and atomically creates or retrieves their active global promoter link. `website` is the hidden honeypot value and must be empty.

Staff RPCs require existing Admin credentials:

- get and update the selected public-registration event/open state
- create, list, search, and deactivate person blocks
- list guest entries with CPF, WhatsApp, gender, and source
- add manual guest entries with the expanded optional data
- list and manage promoters with CPF, WhatsApp, source, sales totals, and status

A private helper, `private.hype_active_person_block(cpf, name)`, is the single source of truth for block checks. It is called inside all relevant database functions:

- `create_manual_order_v16`
- Portaria door-order creation
- Admin/manual guest-list addition
- public guest-list submission
- ticket entry validation
- guest-list entry confirmation
- public promoter registration and promoter-code validation during purchase

The helper checks exact normalized CPF first. Name fallback is used only when the attempted action has no valid CPF.

## Security and Abuse Controls

- All new tables have RLS enabled and no broad direct-access policies.
- Public RPC execution is granted only to the roles that need it, with other function privileges revoked explicitly.
- Security-definer functions use an empty `search_path`, schema-qualified objects, strict validation, and minimal return fields.
- CPF validation includes length and checksum, not only formatting.
- WhatsApp is normalized to digits and validated for a Brazilian mobile-number length.
- Name and reason fields have explicit maximum lengths.
- Submission is serialized by event and CPF before duplicate checks to prevent concurrent duplicates.
- A short database cooldown limits repeated write attempts for the same CPF and event while preserving the friendly duplicate response for an already registered person.
- Promoter creation is serialized by CPF and code generation is performed inside the database so concurrent requests cannot create duplicates.
- The form includes a hidden honeypot field; the RPC also refuses implausibly fast/repeated attempts without exposing list data.
- Public errors do not confirm whether a CPF is globally blocked or reveal any private Admin notes.
- Admin and Portaria display CPF masked by default; the authorized Admin can reveal it when needed.

## Frontend Changes

### `lista.html` and a focused registration script

The new page uses the existing HYPE visual identity and mobile-first controls. It shows the selected event, four required fields, consent text for operational use of the supplied data, submit progress, success, duplicate, closed, and error states. It does not include marketing content or expose other names.

### `portaria.html`

Add a compact two-tab switch. The link tab uses the existing QR utility and Web Share API where supported. The permanent URL is generated from the official site origin and never contains a secret token.

### Existing Admin list panel

Keep manual multiline entry. Add public-registration settings above the list, richer list rows, and a separate blocked-person view with temporary/permanent controls. Destructive actions require confirmation.

### Existing Admin promoter panel

Keep manual promoter creation. Add the permanent promoter-registration URL with QR, copy, and share actions. Promoter rows include masked CPF, WhatsApp, registration source, sales totals, status, and existing management actions.

### `promoter.html` and a focused registration script

The new mobile-first page uses the existing HYPE identity and asks only for name, CPF, and WhatsApp. On success it shows the promoter's generated sales link with copy and share commands. It never exposes rankings, customer records, or another promoter's personal data.

## Error Handling

- Closed/no-event: show `Cadastros indisponiveis no momento`.
- Invalid fields: identify the field without echoing sensitive data.
- Duplicate same-event CPF: return success-like informational state; do not expose the existing record.
- Active block: show `Cadastro nao permitido. Procure a equipe HYPE`.
- Disabled promoter: show `Cadastro indisponivel. Procure a equipe HYPE` without reactivating the record.
- Network failure: retain typed form values and allow retry.
- Entry or purchase blocked after a prior registration: refuse the action and show an operator-facing blocked status; do not silently mutate the existing record.

## Testing and Verification

Automated tests cover:

- RLS and function grants
- CPF checksum and phone normalization
- open/closed registration context
- successful public registration
- duplicate CPF and concurrent submission handling
- temporary block before and after expiration
- permanent block and unblock
- block enforcement in public registration, purchase, ticket entry, and guest-list entry
- Admin authorization on settings and block management
- frontend contract for the permanent link, tabs, required fields, and current asset versions
- public promoter creation, duplicate-CPF retrieval, code-collision handling, disabled-promoter behavior, and blocked-promoter behavior
- purchase attribution continues to accept only active, unblocked global promoter codes

End-to-end verification uses clearly fictitious CPF-valid test people. It confirms guest appearance in Admin and Portaria search, exercises entry denial under a temporary block, creates a promoter and verifies their sales link attribution, then removes all test data. Desktop and mobile layouts are visually checked before production publication.

## Rollout

1. Add and test the database migration without opening public registrations.
2. Deploy the frontend and verify Admin/Portaria compatibility.
3. Select a real event in Admin and explicitly open registrations.
4. Confirm both permanent production links, their QR codes, and a generated promoter sales link.
5. Monitor initial registrations and database errors; Admin can close registration immediately without changing or removing the public page.
