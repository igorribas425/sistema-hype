# Hype Supabase Separation Design

## Goal

Restore the Hype ticketing site as an operational, independently managed system without changing or risking the Aura Beat database that currently occupies the Supabase project referenced by the live site.

Success means the public purchase page, the administrative panel, and the door/reader flow use a dedicated Hype database and pass end-to-end verification. The public site must not be switched until the replacement project is ready.

## Current State

- `hypeloungeclub.com.br` is online and serves the frontend from the `sistema-hype` GitHub repository.
- `supabase-config.js` points to project `axkbfrljohpkjnbotqnf`.
- That project now contains Aura Beat data and migrations, not the Hype ticketing tables or RPC functions.
- The Hype Edge Functions still exist in the old project, but the database contracts they call are absent.
- The repository contains a baseline schema and many incremental SQL scripts, but the SQL files referenced by versions 21, 42.9, and 43 are missing.
- Default staff credentials are committed in repository documentation and seed SQL and must not be reused.
- No Hype event, order, or ticket tables remain in the connected project, and no recoverable Hype production data was found during inspection. The replacement starts empty unless the owner supplies a separate backup.

## Chosen Approach

Create a dedicated Supabase project named `Hype Ingressos` in `sa-east-1`. Keep the current Aura Beat project untouched.

Build a clean, consolidated Hype schema from the repository's existing SQL contracts instead of replaying every historical script blindly. Missing late-version contracts will be reconstructed from the frontend and Edge Function call sites. The consolidated migration will be idempotent where practical and committed to the repository as the canonical database definition.

This approach was selected over sharing the Aura Beat database because it removes table-name collisions, separates operational risk, and gives Hype independent migrations, logs, functions, and credentials.

## Database Design

The dedicated project will contain only Hype-owned data:

- events and event presentation settings;
- ticket lots, gender-specific prices, stock, sale windows, and free-entry windows;
- customers, orders, tickets, payment state, check-in state, and audit history;
- promoters, coupons, guest lists, raffles, surveys, and chat records required by the current frontend;
- staff accounts and door/reader authorization records.

Public tables will use row-level security. The browser will access data only through the minimum public RPC surface required by the existing application. Privileged staff RPCs will validate staff credentials and will not expose tables directly to anonymous clients.

No Hype table or function will be added to the Aura Beat project.

## Authentication And Secrets

The public default credentials in the repository will be removed from active setup instructions and will not be seeded into the new database.

An initial administrator will be created outside committed SQL with a unique temporary password stored only for the owner. Passwords remain bcrypt-hashed in the database to preserve compatibility with the current frontend. The final verification will include changing or replacing that temporary credential.

Only the Supabase publishable key may be stored in `supabase-config.js`. Service-role keys, Asaas credentials, webhook tokens, email credentials, and other secrets must remain in Supabase Edge Function secrets and must never be committed or pasted into public frontend files.

## Payments And Edge Functions

The current Asaas payment flow will be moved to the dedicated project:

- `asaas-pix` creates a Pix charge for a valid Hype order;
- `asaas-webhook` validates Asaas callbacks and updates payment state;
- `send-ticket-email` delivers the released ticket when configured;
- other Hype-specific functions are moved only when their database dependencies are present and verified.

Supabase automatically provides project URL and service-role variables to its own Edge Functions. The Asaas API key and webhook token must be configured in the new project through a secure secret-management surface. If those credentials cannot be transferred during implementation, the site will remain unpublished or clearly held in maintenance mode rather than presenting automatic payment as operational.

## Frontend And Deployment

The frontend structure and current Hype visual design will be preserved. Changes will be limited to:

- pointing `supabase-config.js` to the dedicated project and its publishable key;
- correcting RPC contract mismatches found during integration;
- removing obsolete public credential guidance;
- adding explicit loading and failure states where a missing backend dependency currently produces a raw alert.

The new database and Edge Functions will be verified before the GitHub Pages configuration is changed. The live site will be switched in one controlled frontend update and then retested at the public URLs.

## Verification

Verification will cover:

1. Customer page loads an event and available lots without console errors.
2. Quote calculation respects gender price, coupon, stock, sale dates, and free-entry windows.
3. An isolated test event and order can be created without completing a real financial transaction; test records remain inactive or are removed before handoff.
4. Admin login works with the new private credential and loads events, orders, totals, and lot management.
5. Portaria can request/receive authorization, locate a test ticket, and reject duplicate entry.
6. Edge Functions respond from the new project and webhook configuration is checked without triggering a real charge.
7. Security and performance advisors are reviewed after schema deployment.
8. The three public URLs are retested on desktop and mobile-sized viewports after deployment.

## Rollback

The public frontend will keep pointing at the current project until the dedicated project passes verification. If the final switch fails, the frontend configuration commit can be reverted without touching Aura Beat or deleting the new Hype project. No destructive operation will be performed on the existing project.

## Known Manual Step

The owner may need to enter the existing Asaas secret and webhook token into the new Supabase project's secret settings. Those values cannot be recovered from the public repository and must not be shared in chat or committed to GitHub.
