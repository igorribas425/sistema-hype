import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const slugs = [
  "asaas-pix",
  "asaas-webhook",
  "asaas-refund",
  "send-ticket-email",
  "hype-chat-push",
];

async function source(slug) {
  const file = path.join(root, "supabase", "functions", slug, "index.ts");
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    assert.fail(`${slug} source is required: ${error.message}`);
  }
}

test("edge_functions_keep_secrets_out_of_source_and_restrict_cors", async () => {
  for (const slug of slugs) {
    const text = await source(slug);
    assert.doesNotMatch(text, /access_token\s*[:=]\s*["'][^"']{16,}/i, slug);
    assert.doesNotMatch(text, /service_role[^\n]*["']eyJ/i, slug);
    assert.doesNotMatch(text, /Access-Control-Allow-Origin["']?\s*:\s*["']\*["']/i, slug);
    assert.match(text, /Deno\.env\.get\(/, slug);
    assert.match(text, /req\.method\s*===\s*["']OPTIONS["']/, slug);
  }
});

test("asaas_pix_validates_ticket_ownership_and_never_marks_paid", async () => {
  const text = await source("asaas-pix");
  assert.match(text, /ticket_token/);
  assert.match(text, /qr_token/);
  assert.match(text, /payment_status\s*!==\s*["']Pendente["']/);
  assert.match(text, /externalReference/);
  assert.doesNotMatch(text, /payment_status\s*:\s*["']Pago["']/);
  assert.doesNotMatch(text, /\.update\(\{[^}]*payment_status/s);
});

test("webhook_requires_token_and_claims_an_idempotency_key_before_paid_update", async () => {
  const text = await source("asaas-webhook");
  assert.match(text, /ASAAS_WEBHOOK_TOKEN/);
  assert.match(text, /if\s*\(!webhookToken\)/);
  assert.match(text, /timingSafeEqual|constantTimeEqual/);
  assert.match(text, /payment_webhook_events/);
  assert.match(text, /provider_event_id/);
  assert.match(text, /isPaidEvent/);
  assert.match(text, /payment_status\s*:\s*["']Pago["']/);
  assert.ok(
    text.indexOf("isPaidEvent") < text.lastIndexOf('payment_status: "Pago"'),
    "paid update must happen only after event verification",
  );
});

test("email_push_and_refund_require_context_specific_authorization", async () => {
  const email = await source("send-ticket-email");
  assert.match(email, /verify_staff/);
  assert.match(email, /portaria_device_status_v18/);
  assert.match(email, /ticket_id/);

  const push = await source("hype-chat-push");
  assert.match(push, /verify_staff/);
  assert.match(push, /portaria_device_status_v18/);
  assert.match(push, /hype_chat_push_subscriptions_v42/);

  const refund = await source("asaas-refund");
  assert.match(refund, /verify_staff/);
  assert.match(refund, /role[^\n]+admin/i);
  assert.match(refund, /ASAAS_API_KEY/);
});

test("edge_support_schema_is_private_and_idempotent", async () => {
  const migration = await readFile(
    path.join(root, "supabase", "migrations", "202610010004_hype_edge_support.sql"),
    "utf8",
  );
  assert.match(migration, /create table public\.payment_webhook_events/);
  assert.match(migration, /provider_event_id text not null unique/);
  assert.match(migration, /create table public\.hype_chat_push_subscriptions_v42/);
  assert.match(migration, /alter table public\.payment_webhook_events enable row level security/);
  assert.match(migration, /revoke all on all tables in schema public from anon, authenticated/);
});
