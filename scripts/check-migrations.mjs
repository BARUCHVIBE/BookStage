import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const lock = JSON.parse(
  await readFile(path.join(root, "ops", "migrations-lock.json"), "utf8"),
);
const files = (await readdir(path.join(root, "drizzle")))
  .filter((name) => /^\d{4}_.+\.sql$/.test(name))
  .sort();
const destructive = /\bDROP\s+TABLE\b|\bDROP\s+COLUMN\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|\bPRAGMA\s+foreign_keys\s*=\s*OFF\b/i;
const failures = [];

for (const name of files) {
  const source = await readFile(path.join(root, "drizzle", name), "utf8");
  const hash = createHash("sha256").update(source).digest("hex");
  if (lock.files[name]) {
    if (lock.files[name] !== hash)
      failures.push(`${name}: migration imutável foi alterada`);
  } else if (destructive.test(source)) {
    failures.push(
      `${name}: nova migration destrutiva exige revisão, backup e inclusão explícita no lock`,
    );
  }
}

for (const name of Object.keys(lock.files)) {
  if (!files.includes(name)) failures.push(`${name}: migration bloqueada foi removida`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(
  `Migration gate aprovado: ${files.length} arquivos íntegros; nenhuma migration nova destrutiva.`,
);
