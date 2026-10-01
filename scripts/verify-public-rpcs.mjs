import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configSource = await readFile(path.join(root, "supabase-config.js"), "utf8");

function readConfigValue(name) {
  const match = configSource.match(new RegExp(`${name}\\s*:\\s*["']([^"']+)["']`));
  if (!match) throw new Error(`Missing ${name} in supabase-config.js`);
  return match[1];
}

const url = readConfigValue("url").replace(/\/$/, "");
const anonKey = readConfigValue("anonKey");
const checks = [
  ["public_events_v13", {}],
  ["public_pix_key", {}],
  ["verify_staff", { p_username: "__hype_smoke_invalid__", p_password: "__invalid__" }],
];

let failed = false;
for (const [name, body] of checks) {
  try {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    const payload = await response.text();
    if (!response.ok) {
      failed = true;
      console.error(`${name}: HTTP ${response.status} (${payload.slice(0, 180)})`);
      continue;
    }
    try {
      JSON.parse(payload);
      console.log(`${name}: OK`);
    } catch {
      failed = true;
      console.error(`${name}: response was not valid JSON`);
    }
  } catch (error) {
    failed = true;
    console.error(`${name}: ${error.message}`);
  }
}

if (failed) process.exitCode = 1;
