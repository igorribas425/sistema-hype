import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

async function read(name) {
  return readFile(path.join(root, name), "utf8");
}

test("approval e-mail action is staff-authenticated and loads only approved candidates", async () => {
  const source = await read("supabase/functions/send-ticket-email/index.ts");

  assert.match(source, /guest_list_approved/i);
  assert.match(source, /verifyStaff[\s\S]+admin/i);
  assert.match(source, /guest_list_simple_v406/i);
  assert.match(source, /Liberado|Entrou/i);
  assert.match(source, /email_sent_at/i);
  assert.match(source, /email_error/i);
  assert.match(source, /force|retry|reenvi/i);
});

test("Apps Script has a dedicated approved-list message with event artwork", async () => {
  const source = await read("APPS_SCRIPT_V35_Codigo.gs");

  assert.match(source, /guest_list_approved/i);
  assert.match(source, /GmailApp\.sendEmail/i);
  assert.match(source, /event_cover_image|hypeImageBlob/i);
  assert.match(source, /nome confirmado na lista|lista HYPE/i);
  assert.match(source, /event_name|event_date|venue/i);
});

test("Admin approval refreshes e-mail state and exposes retry only after approval", async () => {
  const source = await read("hype-v49-registration-admin.js");

  assert.match(source, /sendApprovedGuestEmail/);
  assert.match(source, /guest_list_approved/);
  assert.match(source, /email_sent_at|email_error/);
  assert.match(source, /reviewGuest/);
});
