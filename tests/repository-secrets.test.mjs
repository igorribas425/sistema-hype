import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");

test("public_config_contains_only_publishable_key", async () => {
  const source = await readFile(path.join(root, "supabase-config.js"), "utf8");
  const url = source.match(/url:\s*["']([^"']+)["']/)?.[1] ?? "";
  const key = source.match(/anonKey:\s*["']([^"']+)["']/)?.[1] ?? "";

  assert.match(url, /^https:\/\/[a-z0-9]+\.supabase\.co$/);
  assert.match(key, /^sb_publishable_[A-Za-z0-9_-]+$/);
  assert.doesNotMatch(source, /service[_-]?role|secret[_-]?key|database[_-]?password/i);
});

test("known_default_passwords_are_not_active_setup_credentials", async () => {
  const setupGuide = await readFile(path.join(root, "README_SUPABASE.txt"), "utf8");

  for (const exposedPassword of ["Hype@2026", "portaria2026", "cris1212"]) {
    assert.equal(
      setupGuide.includes(exposedPassword),
      false,
      `${exposedPassword} must not be documented as an active credential`,
    );
  }
});
