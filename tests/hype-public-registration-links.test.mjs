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

test("admin synchronizes manual guest-list view with the public-registration event", async () => {
  const controller = await read("hype-v49-registration-admin.js");

  assert.match(controller, /v408ListEvent/);
  assert.match(controller, /HypeListaAdmin\.load/);
  assert.match(controller, /staff_guest_registration_settings_v49/);
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
  assert.doesNotMatch(html, /Já é promoter|Cadastre-se aqui|promoter\.html/i);
});

test("public promoter page returns copyable and shareable sales link", async () => {
  const [html, js] = await Promise.all([read("promoter.html"), read("promoter-v49.js")]);

  assert.match(html, /id="promoterName"[^>]+required/i);
  assert.match(html, /id="promoterCpf"[^>]+required/i);
  assert.match(html, /id="promoterPhone"[^>]+required/i);
  assert.match(html, /id="promoterWebsite"[^>]+tabindex="-1"/i);
  assert.match(html, /id="promoterSalesLink"/i);
  assert.match(html, /id="promoterOpenSales"/i);
  assert.match(js, /public_promoter_registration_submit_v49/);
  assert.match(js, /navigator\.share/);
  assert.match(js, /navigator\.clipboard/);
  assert.match(js, /promoterOpenSales|window\.open|location\.href/i);
  assert.doesNotMatch(html + js, /p_username|p_password|service_role/i);
  assert.doesNotMatch(html, /Quer entrar na lista|lista\.html/i);
});

test("admin promoter rows can open the linked ticket catalog", async () => {
  const js = await read("promoter-global-v16-8.js");

  assert.match(js, /cliente\.html\?promoter=/i);
  assert.match(js, /openPromoterSalesV168|ABRIR INGRESSOS/i);
});

test("admin client list includes public guest-list names without treating them as payments", async () => {
  const app = await read("app.js");

  assert.match(app, /staff_guest_simple_list_v406/);
  assert.match(app, /guest_list/);
  assert.match(app, /Lista HYPE|LISTA HYPE/);
  assert.match(app, /record_type/);
});

test("portaria keeps public guest-list search scoped to the selected event", async () => {
  const js = await read("hype-v406-lista-simples.js");
  const portaria = await read("portaria-v18.js");

  assert.match(js, /portaria_guest_simple_search_v406/);
  assert.match(js, /portaria_guest_simple_enter_v406/);
  assert.match(js, /public_guest_registration_context_v49/);
  assert.match(js, /event_id/);
  assert.match(portaria, /HypeListaSimples\.search/);
  assert.match(portaria, /state\.eventId/);
});
