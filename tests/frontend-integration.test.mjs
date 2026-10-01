import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const CONFIG_VERSION = "20261001-v44";
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
  assert.match(offlineWorker, /const CACHE='hype-v44-offline'/);
  assert.match(offlineWorker, new RegExp(`supabase-config\\.js\\?v=${CONFIG_VERSION}`));
  assert.match(offlineWorker, /app\.js\?v=20261001-v44/);
  assert.match(pushWorker, /HYPE_CHAT_URL = '\.\/admin\.html\?v=44'/);
  assert.match(registration, /sw\.js\?v=20261001-v44/);
});

test("browser_errors_are_translated_and_empty_states_are_explicit", async () => {
  const app = await read("app.js");
  assert.match(app, /function hypeUserMessage\(/);
  assert.doesNotMatch(app, /alert\s*\(\s*err\??\.message/);
  assert.doesNotMatch(app, /alert\s*\([^)]*\+\s*err\??\.message/);
  assert.match(app, /Nenhum evento disponível no momento\./);
  assert.match(app, /Não foi possível carregar o catálogo\. Verifique sua conexão e tente novamente\./);
  assert.match(app, /Nenhum evento cadastrado/);
  assert.match(app, /Nenhum evento ativo/);
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
