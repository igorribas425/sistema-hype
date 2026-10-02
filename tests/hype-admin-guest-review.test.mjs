import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

async function read(name) {
  return readFile(path.join(root, name), "utf8");
}

test("Admin exposes per-event registration controls and male limit", async () => {
  const [html, js] = await Promise.all([read("admin.html"), read("hype-v49-registration-admin.js")]);

  assert.match(html, /id="v50MaleLimit"/i);
  assert.match(html, /id="v50ListQuota"/i);
  assert.match(html, /id="v50GuestReviewList"/i);
  assert.match(js, /staff_guest_registration_settings_v50/);
  assert.match(js, /staff_set_guest_registration_v50/);
  assert.match(js, /p_male_limit/);
  assert.match(js, /male_limit/);
});

test("Admin review shows private photo metadata and approval actions", async () => {
  const [html, js] = await Promise.all([read("admin.html"), read("hype-v49-registration-admin.js")]);

  assert.match(html, /id="v50PhotoPreview"/i);
  assert.match(js, /staff_guest_registration_list_v50/);
  assert.match(js, /guest-list-admin-photo/);
  assert.match(js, /staff_guest_registration_review_v50/);
  assert.match(js, /aprovar|aprovação|APROVAR/i);
  assert.match(js, /recusar|rejeitar|RECUSAR/i);
  assert.match(js, /instagram/i);
  assert.match(js, /email_sent_at|email_error/i);
});

test("Admin review never writes a public photo URL and Portaria stays release-only", async () => {
  const [admin, list, portaria] = await Promise.all([
    read("hype-v49-registration-admin.js"),
    read("hype-v408-lista-admin.js"),
    read("portaria-v20.js"),
  ]);

  assert.doesNotMatch(admin, /getPublicUrl/i);
  assert.match(list, /staff_guest_simple_list_v406/);
  assert.doesNotMatch(portaria, /guest-list-admin-photo|photo_path|photo_consent/i);
});

test("Admin link control is global and review aggregates every event", async () => {
  const [html, js] = await Promise.all([read("admin.html"), read("hype-v49-registration-admin.js")]);

  assert.doesNotMatch(html, /id="v49ListEvent"/i);
  assert.match(js, /Promise\.all|listSettings\.map|for\s*\(.*listSettings/i);
  assert.match(js, /staff_guest_registration_list_v50/);
  assert.match(js, /registration_open/);
});
