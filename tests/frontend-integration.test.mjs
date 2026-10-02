import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const CONFIG_VERSION = "20261001-v48";
const NEW_PROJECT_REF = "txxoqfcwqncqyiqgzboz";
const pages = ["cliente.html", "admin.html", "portaria.html", "leitor.html", "index.html", "pesquisa.html"];

async function read(name) {
  return readFile(path.join(root, name), "utf8");
}

test("all_pages_load_the_same_new_supabase_config", async () => {
  const versions = [];
  for (const page of pages) {
    const source = await read(page);
    const version = source.match(/supabase-config\.js\?v=([^"']+)/)?.[1];
    assert.ok(version, `${page} must load the versioned Supabase config`);
    versions.push(version);
  }
  assert.deepEqual([...new Set(versions)], [CONFIG_VERSION]);

  const config = await read("supabase-config.js");
  assert.match(config, new RegExp(`https://${NEW_PROJECT_REF}\\.supabase\\.co`));
  assert.doesNotMatch(config, /axkbfrljohpkjnbotqnf/);
  assert.match(config, /sb_publishable_dLUCTdk5joZpsHlMtpfTyA_TXF7ujCT/);
});

test("service_workers_and_registration_use_the_current_release", async () => {
  const [offlineWorker, pushWorker, registration] = await Promise.all([
    read("sw.js"),
    read("service-worker.js"),
    read("register-sw.js"),
  ]);
  assert.match(offlineWorker, /const CACHE='hype-v48-offline'/);
  assert.match(offlineWorker, new RegExp(`supabase-config\\.js\\?v=${CONFIG_VERSION}`));
  assert.match(offlineWorker, /app\.js\?v=20261001-v48/);
  assert.match(pushWorker, /HYPE_CHAT_URL = '\.\/admin\.html\?v=48'/);
  assert.match(registration, /sw\.js\?v=20261001-v48/);
});

test("browser_errors_are_translated_and_empty_states_are_explicit", async () => {
  const [app, admin] = await Promise.all([read("app.js"), read("admin.html")]);
  assert.match(app, /function hypeUserMessage\(/);
  assert.doesNotMatch(app, /alert\s*\(\s*err\??\.message/);
  assert.doesNotMatch(app, /alert\s*\([^)]*\+\s*err\??\.message/);
  assert.match(app, /Nenhum evento disponível no momento\./);
  assert.match(app, /Não foi possível carregar o catálogo\. Verifique sua conexão e tente novamente\./);
  assert.match(app, /Nenhum evento cadastrado/);
  assert.match(app, /Nenhum evento ativo/);
  assert.match(admin, /Nenhum evento cadastrado para sorteio/);
  assert.doesNotMatch(admin, /if\(!list\.length\) throw new Error\('Nenhum evento retornado/);
});

test("pix_and_push_requests_include_context_specific_proof", async () => {
  const [app, portaria, chat, pushConfig] = await Promise.all([
    read("app.js"),
    read("portaria-v20.js"),
    read("hype-v38-chat.js"),
    read("hype-push-config.js"),
  ]);
  assert.match(app, /ticket_token:\s*String\(ticketToken/);
  assert.match(portaria, /ticket_token:\s*String\(ticketToken/);
  assert.match(chat, /device_key/);
  assert.match(chat, /username/);
  assert.match(chat, /password/);
  assert.match(pushConfig, new RegExp(`https://${NEW_PROJECT_REF}\\.supabase\\.co/functions/v1/hype-chat-push`));
  assert.doesNotMatch(pushConfig, /axkbfrljohpkjnbotqnf/);
});

test("portaria_focuses_on_sales_gender_counts_and_one_people_search", async () => {
  const [portaria, portariaApp, guestList] = await Promise.all([
    read("portaria.html"),
    read("portaria-v18.js"),
    read("hype-v406-lista-simples.js"),
  ]);
  const stats = portaria.match(/<div id="portariaCoreStats"[\s\S]*?<\/div>\s*<\/div>/)?.[0] ?? "";

  assert.match(stats, /id="paidCount"/);
  assert.match(stats, /id="femaleCount"/);
  assert.match(stats, /id="maleCount"/);
  assert.doesNotMatch(stats, /id="enteredCount"|id="remainingCount"/);
  assert.match(portaria, /id="searchInput"[^>]*placeholder="Buscar por nome, CPF, WhatsApp ou código HYPE"/);
  assert.doesNotMatch(portaria, />📷 CÂMERA DO PC</);
  assert.match(portaria, /class="v19-readers portaria-extra"/);
  assert.match(portaria, /id="v19DoorSale"[^>]*class="v19-door portaria-extra"/);
  assert.match(portariaApp, /HypeListaSimples\.search\(q,'results',scoped\.length>0\)/);
  assert.match(guestList, /function search\(query,targetId='v406ListResult',append=false\)/);
  assert.match(portaria, /hype-v406-lista-simples\.js\?v=20261001-v50/);
});

test("admin_login_defaults_to_the_new_username_without_embedding_a_password", async () => {
  const admin = await read("admin.html");

  assert.match(admin, /id=["']adminUser["'][^>]*value=["']hype["']/);
  assert.doesNotMatch(admin, /id=["']adminPass["'][^>]*value=/);
});

test("admin_never_falls_back_to_a_stale_supabase_project", async () => {
  const app = await read("app.js");

  assert.match(app, /HYPE_EXPECTED_SUPABASE_URL\s*=\s*["']https:\/\/txxoqfcwqncqyiqgzboz\.supabase\.co["']/);
  assert.match(app, /cfg\.url\s*!==\s*HYPE_EXPECTED_SUPABASE_URL/);
  assert.match(app, /sb_publishable_dLUCTdk5joZpsHlMtpfTyA_TXF7ujCT/);
});
