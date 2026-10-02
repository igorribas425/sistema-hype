import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

async function read(name) {
  return readFile(path.join(root, name), "utf8");
}

test("public guest registration validates and stores photos privately", async () => {
  const source = await read("supabase/functions/guest-list-registration/index.ts");

  assert.match(source, /formData\(\)/i);
  assert.match(source, /image\/(?:jpeg|png|webp)/i);
  assert.match(source, /5242880|5\s*\*\s*1024\s*\*\s*1024/i);
  assert.match(source, /photo_consent|consent/i);
  assert.match(source, /hype-guest-photos-v50/i);
  assert.match(source, /guest-list-v50\//i);
  assert.match(source, /\.upload\(/i);
  assert.match(source, /public_guest_registration_submit_v50/i);
  assert.match(source, /remove\(/i);
  assert.doesNotMatch(source, /getPublicUrl/i);
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY[^\n]+return/i);
});

test("admin photo endpoint authenticates staff and returns only a short-lived signed URL", async () => {
  const source = await read("supabase/functions/guest-list-admin-photo/index.ts");

  assert.match(source, /verify_staff/i);
  assert.match(source, /roles?[^\n]+admin/i);
  assert.match(source, /guest_list_simple_v406/i);
  assert.match(source, /createSignedUrl/i);
  assert.match(source, /300|5\s*\*\s*60/i);
  assert.doesNotMatch(source, /getPublicUrl/i);
  assert.doesNotMatch(source, /photo_path[^\n]*return/i);
});

test("photo endpoint has controlled CORS and rejects non-POST requests", async () => {
  const source = await read("supabase/functions/guest-list-registration/index.ts");
  const admin = await read("supabase/functions/guest-list-admin-photo/index.ts");

  assert.match(source + admin, /Access-Control-Allow-Origin/i);
  assert.match(source + admin, /OPTIONS/i);
  assert.match(source + admin, /POST/i);
});
