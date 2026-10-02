import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

async function read(name) {
  return readFile(path.join(root, name), "utf8");
}

test("guest review migration stores pending applications with per-event quota data", async () => {
  const sql = await read("supabase/migrations/202610020001_hype_guest_review_v50.sql");

  assert.match(sql, /create table(?: if not exists)? public\.guest_registration_settings_v50/i);
  assert.match(sql, /male_limit\s+integer[^;]+default\s+10/is);
  assert.match(sql, /add column if not exists email\s+text/i);
  assert.match(sql, /add column if not exists instagram\s+text/i);
  assert.match(sql, /add column if not exists photo_path\s+text/i);
  assert.match(sql, /add column if not exists photo_consent\s+boolean/i);
  assert.match(sql, /'Pendente'/i);
  assert.match(sql, /email_sent_at\s+timestamptz/i);
});

test("public registration is event-aware, pending-only, and does not send mail", async () => {
  const sql = await read("supabase/migrations/202610020001_hype_guest_review_v50.sql");

  assert.match(sql, /create or replace function public\.public_guest_registration_events_v50\(\)/i);
  assert.match(sql, /create or replace function public\.public_guest_registration_submit_v50\(/i);
  assert.match(sql, /p_event_id\s+bigint/i);
  assert.match(sql, /p_email\s+text/i);
  assert.match(sql, /p_instagram\s+text/i);
  assert.match(sql, /p_photo_path\s+text/i);
  assert.match(sql, /p_photo_consent\s+boolean/i);
  assert.match(sql, /insert into public\.guest_list_simple_v406/i);
  assert.match(sql, /'Pendente'/i);
  assert.doesNotMatch(sql, /send[-_ ]?mail|apps_script|gmail/i);
  assert.match(sql, /event_id\s*=\s*p_event_id[^;]+cpf\s*=\s*v_cpf/is);
});

test("staff review locks one event and enforces ten approved men", async () => {
  const sql = await read("supabase/migrations/202610020001_hype_guest_review_v50.sql");

  assert.match(sql, /create or replace function public\.staff_guest_registration_review_v50\(/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /count\(\*\)[\s\S]+gender\s*=\s*'Masculino'[\s\S]+status\s*=\s*'Liberado'/i);
  assert.match(sql, /male_limit/i);
  assert.match(sql, /raise exception[^;]+limite[^;]+mascul/i);
  assert.match(sql, /p_decision\s+text/i);
  assert.match(sql, /'Aprovado'|'Liberado'/i);
  assert.match(sql, /'Recusado'|'Cancelado'/i);
});

test("public, staff, and portaria grants keep pending rows out of entry reads", async () => {
  const sql = await read("supabase/migrations/202610020001_hype_guest_review_v50.sql");

  assert.match(sql, /create or replace function public\.staff_guest_registration_settings_v50/i);
  assert.match(sql, /create or replace function public\.staff_set_guest_registration_v50/i);
  assert.match(sql, /status\s+in\s*\('Liberado',\s*'Entrou'\)/i);
  assert.match(sql, /status\s+in\s*\('Liberado',\s*'Entrou'\)/i);
  assert.match(sql, /grant execute on function public\.public_guest_registration_events_v50\(\)\s+to anon, authenticated/i);
  assert.match(sql, /grant execute on function public\.public_guest_registration_submit_v50\([^;]+\)\s+to anon, authenticated/is);
});
