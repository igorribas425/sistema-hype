import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const migrationPath = path.join(
  root,
  "supabase",
  "migrations",
  "202610010003_hype_portaria_realtime.sql",
);

async function migrationSql() {
  try {
    return await readFile(migrationPath, "utf8");
  } catch (error) {
    assert.fail(`Portaria/realtime migration is required: ${error.message}`);
  }
}

test("all_portaria_and_chat_rpc_contracts_are_implemented", async () => {
  const sql = await migrationSql();
  const manifest = JSON.parse(
    await readFile(path.join(root, "supabase", "rpc-manifest.json"), "utf8"),
  );
  const names = manifest
    .filter(
      (record) =>
        record.group === "portaria-reader" || record.name.startsWith("hype_chat_"),
    )
    .map((record) => record.name);

  for (const name of names) {
    assert.match(
      sql,
      new RegExp(`create (?:or replace )?function public\\.${name}\\s*\\(`, "i"),
      name,
    );
  }
});

test("device_reader_and_pairing_secrets_are_hashed", async () => {
  const sql = (await migrationSql()).toLowerCase();
  for (const table of ["portaria_devices_v18", "portaria_readers_v19", "portaria_reader_links_v20"]) {
    assert.match(sql, new RegExp(`create table public\\.${table}`), table);
  }
  assert.match(sql, /digest\(convert_to\(p_device_key,'utf8'\),'sha256'\)/);
  assert.match(sql, /digest\(convert_to\(p_reader_secret,'utf8'\),'sha256'\)/);
  assert.match(sql, /digest\(convert_to\(p_link_token,'utf8'\),'sha256'\)/);
  const tableBlocks = [...sql.matchAll(/create table public\.[^(]+\(([\s\S]*?)\n\);/g)]
    .map((match) => match[1])
    .join("\n");
  assert.doesNotMatch(tableBlocks, /\bdevice_key\s+text\b/);
  assert.doesNotMatch(tableBlocks, /\breader_secret\s+text\b/);
  assert.doesNotMatch(tableBlocks, /\blink_token\s+text\b/);
});

test("authorization_and_pairing_enforce_revocation_expiry_and_single_claim", async () => {
  const sql = (await migrationSql()).toLowerCase();
  assert.match(sql, /function private\.hype_device_authorized\s*\(/);
  assert.match(sql, /d\.active\s+and\s+d\.revoked_at is null/);
  assert.match(sql, /l\.used_at is null/);
  assert.match(sql, /l\.expires_at\s*>\s*clock_timestamp\(\)/);
  assert.match(sql, /for update/);
  assert.match(sql, /set used_at\s*=\s*now\(\)/);
});

test("ticket entry transitions are locked and reject duplicate direct entry", async () => {
  const sql = (await migrationSql()).toLowerCase();
  assert.match(sql, /where t\.ticket_code\s*=\s*[^;]+for update/);
  assert.match(sql, /v_ticket\.payment_status\s*<>\s*'pago'/);
  assert.match(sql, /v_ticket\.entry_status\s*=\s*'entrada utilizada'/);
  assert.match(sql, /'saída temporária'/);
  assert.match(sql, /'reentrada autorizada'/);
  assert.match(sql, /ingresso já utilizado/);
});

test("door sales reuse atomic pricing and inventory rules", async () => {
  const sql = (await migrationSql()).toLowerCase();
  assert.match(sql, /function public\.portaria_device_create_door_order_v19[\s\S]+private\.hype_device_id/);
  assert.match(sql, /function public\.portaria_device_create_door_order_v19[\s\S]+for update/);
  assert.match(sql, /private\.hype_effective_price\s*\(/);
  assert.match(sql, /case when v_price\s*=\s*0 then 'pago' else 'pendente' end/);
});

test("portaria_chat_tables_are_private_and_realtime_enabled", async () => {
  const sql = (await migrationSql()).toLowerCase();
  for (const table of [
    "portaria_devices_v18",
    "portaria_readers_v19",
    "portaria_reader_links_v20",
    "portaria_scan_queue_v18",
    "portaria_logs_v18",
    "internal_chat_v41",
  ]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`), table);
  }
  assert.match(sql, /revoke all on all tables in schema public from anon, authenticated/);
  assert.match(sql, /alter publication supabase_realtime add table public\.portaria_scan_queue_v18/);
  assert.match(sql, /alter publication supabase_realtime add table public\.internal_chat_v41/);
});
