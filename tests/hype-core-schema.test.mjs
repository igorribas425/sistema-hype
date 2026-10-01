import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const migrationPath = path.resolve(
  import.meta.dirname,
  "..",
  "supabase",
  "migrations",
  "202610010001_hype_core.sql",
);

async function migrationSql() {
  try {
    return await readFile(migrationPath, "utf8");
  } catch (error) {
    assert.fail(`Core migration is required: ${error.message}`);
  }
}

test("core_tables_are_private_and_rls_enabled", async () => {
  const sql = (await migrationSql()).toLowerCase();
  const tables = ["events", "ticket_lots", "staff_users", "tickets", "audit_logs"];
  for (const table of tables) {
    assert.match(sql, new RegExp(`create table public\\.${table}\\b`));
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /revoke all on all tables in schema public from anon, authenticated/);
  assert.match(sql, /alter default privileges in schema public revoke execute on functions from public, anon, authenticated/);
});

test("staff_credentials_use_bcrypt_and_no_defaults_are_seeded", async () => {
  const sql = await migrationSql();
  assert.match(sql, /create extension if not exists pgcrypto/i);
  assert.match(sql, /password_hash\s*=\s*extensions\.crypt\(p_password,\s*s\.password_hash\)/i);
  assert.match(sql, /extensions\.crypt\([^,]+,\s*extensions\.gen_salt\('bf'/i);
  assert.doesNotMatch(sql, /Hype@2026|portaria2026|cris1212/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.staff_users/i);
});

test("event_cover_and_sale_time_boundaries_are_server_validated", async () => {
  const sql = (await migrationSql()).toLowerCase();
  assert.match(sql, /function private\.hype_valid_cover_image\s*\(/);
  assert.match(sql, /data:image\/\(jpeg\|png\|webp\);base64,/);
  assert.match(sql, /octet_length\(p_value\)\s*>\s*4\s*\*\s*1024\s*\*\s*1024/);
  assert.match(sql, /check\s*\(private\.hype_valid_cover_image\(cover_image\)\)/);
  assert.match(sql, /p_at\s*>=\s*p_lot\.starts_at/);
  assert.match(sql, /p_at\s*<\s*p_lot\.ends_at/);
  assert.match(sql, /where e\.active is true/);
});

test("core_rpc_signatures_match_the_frontend_contract", async () => {
  const sql = await migrationSql();
  const functions = [
    "verify_staff",
    "public_events",
    "public_events_v13",
    "public_pix_key",
    "public_get_ticket",
    "staff_list_events",
    "staff_list_events_v13",
    "staff_save_event_v2",
    "staff_save_event_v13",
    "staff_list_lots_v16",
    "staff_upsert_lot_v16",
    "staff_save_pix",
    "staff_list_tickets",
    "staff_list_tickets_manual",
    "staff_list_tickets_v16",
    "staff_set_payment",
  ];

  for (const name of functions) {
    assert.match(sql, new RegExp(`create (?:or replace )?function public\\.${name}\\s*\\(`, "i"));
  }
  assert.match(sql, /create trigger hype_enforce_ticket_inventory/i);
  assert.match(sql, /for update;/i);
  assert.match(sql, /payment_status in \('Pendente','Pago'\)/i);
});
