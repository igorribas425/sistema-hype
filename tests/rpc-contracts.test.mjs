import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, "supabase", "rpc-manifest.json");
const sourcePattern = /(?:sbRpc|rpc|v17rpc)\(\s*["']([A-Za-z0-9_]+)["']/g;

async function readManifest() {
  try {
    return JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    assert.fail(`RPC manifest is required: ${error.message}`);
  }
}

async function frontendFiles() {
  const entries = await readdir(root, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && /\.(?:html|js)$/.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

async function activeRpcCalls() {
  const calls = new Map();
  for (const file of await frontendFiles()) {
    const source = await readFile(path.join(root, file), "utf8");
    for (const match of source.matchAll(sourcePattern)) {
      const files = calls.get(match[1]) ?? [];
      files.push(file);
      calls.set(match[1], files);
    }
  }
  return calls;
}

test("all_frontend_rpcs_are_manifested", async () => {
  const manifest = await readManifest();
  const calls = await activeRpcCalls();
  const records = new Map(manifest.map((record) => [record.name, record]));
  const missing = [...calls.keys()].filter((name) => !records.has(name));

  assert.deepEqual(missing, [], `Unmanifested RPCs: ${missing.join(", ")}`);
  assert.equal(records.size, manifest.length, "RPC names must be unique");

  const requiredGroups = [
    "public-sales",
    "admin",
    "portaria-reader",
    "lists-raffles-surveys",
    "chat-checkup",
  ];
  const groups = new Set(manifest.map((record) => record.group));
  assert.deepEqual(
    requiredGroups.filter((group) => !groups.has(group)),
    [],
    "Every active product area needs a contract group",
  );

  for (const [name, files] of calls) {
    const record = records.get(name);
    assert.ok(["anon", "staff", "device", "internal"].includes(record.exposure));
    assert.deepEqual(
      [...new Set(record.sourceFiles)].sort(),
      [...new Set(files)].sort(),
      `${name} sourceFiles must match active call sites`,
    );
  }
});

test("all_manifested_rpcs_exist_in_migrations", async (t) => {
  const manifest = await readManifest();
  const migrationsDir = path.join(root, "supabase", "migrations");
  let migrationFiles = [];
  try {
    migrationFiles = (await readdir(migrationsDir)).filter((file) => file.endsWith(".sql"));
  } catch {
    t.skip("Canonical migrations are created in Tasks 2-4");
    return;
  }
  if (migrationFiles.length === 0) {
    t.skip("Canonical migrations are created in Tasks 2-4");
    return;
  }

  const sql = (
    await Promise.all(
      migrationFiles.map((file) => readFile(path.join(migrationsDir, file), "utf8")),
    )
  ).join("\n");
  const portariaMigrationExists = migrationFiles.some((file) => file.startsWith("202610010003_"));
  const expected = manifest.filter(
    (record) =>
      portariaMigrationExists ||
      (record.group !== "portaria-reader" && !record.name.startsWith("hype_chat_")),
  );
  const missing = expected
    .map((record) => record.name)
    .filter((name) => !new RegExp(`function\\s+(?:public\\.)?${name}\\s*\\(`, "i").test(sql));

  assert.deepEqual(missing, [], `RPCs missing from canonical migrations: ${missing.join(", ")}`);
});
