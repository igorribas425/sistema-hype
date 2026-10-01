import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const migrationPath = path.join(root, "supabase", "migrations", "202610010002_hype_sales_admin.sql");

async function migrationSql() {
  try {
    return await readFile(migrationPath, "utf8");
  } catch (error) {
    assert.fail(`Sales/admin migration is required: ${error.message}`);
  }
}

test("sales_admin_rpc_groups_are_implemented", async () => {
  const sql = await migrationSql();
  const manifest = JSON.parse(
    await readFile(path.join(root, "supabase", "rpc-manifest.json"), "utf8"),
  );
  const names = manifest
    .filter((record) => ["public-sales", "admin", "lists-raffles-surveys"].includes(record.group))
    .map((record) => record.name);
  const coreNames = new Set([
    "verify_staff", "public_events", "public_events_v13", "public_get_ticket", "public_pix_key",
    "staff_list_events", "staff_list_events_v13", "staff_list_lots_v16", "staff_list_tickets",
    "staff_list_tickets_manual", "staff_list_tickets_v16", "staff_save_event_v2",
    "staff_save_event_v13", "staff_save_pix", "staff_set_payment", "staff_upsert_lot_v16",
  ]);

  for (const name of names.filter((name) => !coreNames.has(name))) {
    assert.match(sql, new RegExp(`create (?:or replace )?function public\\.${name}\\s*\\(`, "i"), name);
  }
  for (const name of ["staff_system_checkup_v43", "staff_system_checkup_v429"]) {
    assert.match(sql, new RegExp(`create (?:or replace )?function public\\.${name}\\s*\\(`, "i"), name);
  }
});

test("pricing_coupon_and_inventory_boundaries_are_atomic", async () => {
  const sql = (await migrationSql()).toLowerCase();
  assert.match(sql, /function private\.hype_effective_price\s*\(/);
  assert.match(sql, /p_at\s*<\s*v_free_until/);
  assert.match(sql, /private\.hype_lot_available_at\(v_lot,\s*clock_timestamp\(\)\)/);
  assert.match(sql, /from public\.ticket_lots l\s+where l\.id\s*=\s*p_lot_id\s+for update/);
  assert.match(sql, /c\.usage_limit\s*>\s*0\s+and\s+v_coupon_used\s*>=\s*c\.usage_limit/);
  assert.match(sql, /payment_status in \('pendente','pago'\)/);
});

test("list_guests_are_isolated_from_tickets_and_raffles", async () => {
  const sql = (await migrationSql()).toLowerCase();
  assert.match(sql, /create table public\.guest_list_simple_v406/);
  assert.match(sql, /unique\s*\(event_id,\s*name_key\)/);
  const guestTable = sql.match(/create table public\.guest_list_simple_v406\s*\(([\s\S]*?)\n\);/)?.[1] ?? "";
  assert.doesNotMatch(guestTable, /ticket_id\s+bigint/);
  assert.match(sql, /function public\.staff_raffle_participants_v18[\s\S]+from public\.tickets t/);
  assert.match(sql, /function public\.staff_draw_raffle_v18[\s\S]+from public\.tickets t/);
});

test("raffle_and_survey_are_single_use", async () => {
  const sql = (await migrationSql()).toLowerCase();
  assert.match(sql, /unique\s*\(event_id,\s*winner_ticket_id\)/);
  assert.match(sql, /winner_cpf text/);
  assert.match(sql, /d\.winner_cpf/);
  assert.match(sql, /winner_code,winner_cpf,winner_phone/);
  assert.match(sql, /not exists\s*\([\s\S]+from public\.raffle_draws_v18/);
  assert.match(sql, /ticket_id bigint not null unique/);
  assert.match(sql, /if v_invite\.responded_at is not null then/);
  assert.match(sql, /where i\.token\s*=\s*p_token::uuid\s+for update/);
});

test("privileged_feature_tables_are_rls_protected", async () => {
  const sql = (await migrationSql()).toLowerCase();
  const tables = [
    "promoters_v16", "promoters_global_v16", "coupons_v16", "lot_free_rules_v38",
    "guest_list_simple_v406", "raffle_draws_v18", "event_survey_invites_v34",
    "event_survey_responses_v34",
  ];
  for (const table of tables) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table);
  }
  assert.match(sql, /revoke all on all tables in schema public from anon, authenticated/);
});
