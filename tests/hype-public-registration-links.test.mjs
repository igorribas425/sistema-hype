import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

async function read(name) {
  return readFile(path.join(root, name), "utf8");
}

test("guest registration database contract is private and idempotent", async () => {
  const sql = await read("supabase/migrations/20261001213000_hype_public_registration_links.sql");

  assert.match(sql, /create table public\.public_guest_registration_settings_v49/i);
  assert.match(sql, /alter table public\.public_guest_registration_settings_v49 enable row level security/i);
  assert.match(sql, /create unique index[^;]+guest_list_simple_v406[^;]+event_id[^;]+cpf/is);
  assert.match(sql, /create or replace function private\.hype_valid_cpf_v49/i);
  assert.match(sql, /create or replace function public\.public_guest_registration_context_v49/i);
  assert.match(sql, /create or replace function public\.public_guest_registration_submit_v49/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /source[^;]+Publico/is);
  assert.match(sql, /revoke all on function public\.public_guest_registration_submit_v49/i);
  assert.match(sql, /grant execute on function public\.public_guest_registration_submit_v49[^;]+to anon, authenticated/i);
});

test("promoter registration database contract returns one permanent sales link", async () => {
  const sql = await read("supabase/migrations/20261001213000_hype_public_registration_links.sql");

  assert.match(sql, /alter table public\.promoters_global_v16[\s\S]+add column if not exists cpf/i);
  assert.match(sql, /create unique index[^;]+promoters_global_v16[^;]+cpf/is);
  assert.match(sql, /create or replace function public\.public_promoter_registration_submit_v49/i);
  assert.match(sql, /https:\/\/hypeloungeclub\.com\.br\/cliente\.html\?promoter=/i);
  assert.match(sql, /disabled|inativ|indisponivel/i);
  assert.match(sql, /revoke all on function public\.public_promoter_registration_submit_v49/i);
  assert.match(sql, /grant execute on function public\.public_promoter_registration_submit_v49[^;]+to anon, authenticated/i);
});

test("admin keeps manual flows and adds one link tab to each area", async () => {
  const admin = await read("admin.html");
  const controller = await read("hype-v49-registration-admin.js");

  assert.match(admin, /id="v49PromoterTabManage"/);
  assert.match(admin, /id="v49PromoterTabLink"/);
  assert.match(admin, /id="v49PromoterLinkPanel"/);
  assert.match(admin, /https:\/\/hypeloungeclub\.com\.br\/promoter\.html/);
  assert.match(admin, /id="v49ListTabManual"/);
  assert.match(admin, /id="v49ListTabLink"/);
  assert.match(admin, /id="v49ListLinkPanel"/);
  assert.match(admin, /https:\/\/hypeloungeclub\.com\.br\/lista\.html/);
  assert.match(controller, /staff_guest_registration_settings_v49/);
  assert.match(controller, /staff_set_guest_registration_v49/);
  assert.match(controller, /navigator\.share/);
  assert.match(controller, /HypeQRCode\.toDataUrl/);
  assert.match(admin, /hype-v49-registration-admin\.js\?v=20261001-v49/);
});

test("portaria stays focused on entry and does not expose public registration links", async () => {
  const [html, js] = await Promise.all([
    read("portaria.html"),
    read("portaria-v20.js")
  ]);

  assert.doesNotMatch(html + js, /https:\/\/hypeloungeclub\.com\.br\/(?:lista|promoter)\.html/i);
  assert.doesNotMatch(html + js, /public_(?:guest|promoter)_registration_(?:context|submit)_v49/i);
});

test("public guest page requires only the approved identity fields", async () => {
  const [html, js] = await Promise.all([read("lista.html"), read("lista-v49.js")]);

  assert.match(html, /id="guestName"[^>]+required/i);
  assert.match(html, /id="guestCpf"[^>]+required/i);
  assert.match(html, /id="guestPhone"[^>]+required/i);
  assert.match(html, /id="guestGender"[^>]+required/i);
  assert.match(html, /id="guestWebsite"[^>]+tabindex="-1"/i);
  assert.match(js, /public_guest_registration_context_v49/);
  assert.match(js, /public_guest_registration_submit_v49/);
  assert.doesNotMatch(html + js, /p_username|p_password|service_role/i);
});

test("public promoter page returns copyable and shareable sales link", async () => {
  const [html, js] = await Promise.all([read("promoter.html"), read("promoter-v49.js")]);

  assert.match(html, /id="promoterName"[^>]+required/i);
  assert.match(html, /id="promoterCpf"[^>]+required/i);
  assert.match(html, /id="promoterPhone"[^>]+required/i);
  assert.match(html, /id="promoterWebsite"[^>]+tabindex="-1"/i);
  assert.match(html, /id="promoterSalesLink"/i);
  assert.match(js, /public_promoter_registration_submit_v49/);
  assert.match(js, /navigator\.share/);
  assert.match(js, /navigator\.clipboard/);
  assert.doesNotMatch(html + js, /p_username|p_password|service_role/i);
});
