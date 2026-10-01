import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePattern = /(?:sbRpc|rpc|v17rpc)\(\s*["']([A-Za-z0-9_]+)["']/g;

const listFeaturePattern = /(?:guest|raffle|survey)/;
const portariaStaffPattern = /(?:portaria|access_device|access_item|lookup_ticket|validate_entry|temporary_exit|authorize_reentry|mark_document|offline_snapshot|live_checkin)/;

function groupFor(name) {
  if (name.startsWith("hype_chat_") || name.startsWith("staff_system_checkup_")) {
    return "chat-checkup";
  }
  if (listFeaturePattern.test(name)) return "lists-raffles-surveys";
  if (name.startsWith("portaria_") || portariaStaffPattern.test(name)) {
    return "portaria-reader";
  }
  if (name.startsWith("public_") || name === "create_manual_order_v16") {
    return "public-sales";
  }
  return "admin";
}

function exposureFor(name) {
  if (name.startsWith("public_") || name === "create_manual_order_v16" || name === "verify_staff") {
    return "anon";
  }
  if (name.startsWith("portaria_")) return "device";
  return "staff";
}

const entries = await readdir(root, { withFileTypes: true });
const files = entries
  .filter((entry) => entry.isFile() && /\.(?:html|js)$/.test(entry.name))
  .map((entry) => entry.name)
  .sort();
const calls = new Map();

for (const file of files) {
  const source = await readFile(path.join(root, file), "utf8");
  for (const match of source.matchAll(sourcePattern)) {
    const sourceFiles = calls.get(match[1]) ?? new Set();
    sourceFiles.add(file);
    calls.set(match[1], sourceFiles);
  }
}

const manifest = [...calls]
  .sort(([left], [right]) => left.localeCompare(right))
  .map(([name, sourceFiles]) => ({
    name,
    group: groupFor(name),
    exposure: exposureFor(name),
    sourceFiles: [...sourceFiles].sort(),
  }));

await writeFile(
  path.join(root, "supabase", "rpc-manifest.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);
console.log(`Wrote ${manifest.length} RPC contracts.`);
