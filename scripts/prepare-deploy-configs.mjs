import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "wrangler.jsonc");
const buildEntry = path.join(root, "dist", "server", "index.js");
const source = JSON.parse(await readFile(sourcePath, "utf8"));
const outputDirectory = path.join(root, "dist", "deploy");

await readFile(buildEntry, "utf8");
await mkdir(outputDirectory, { recursive: true });

for (const environment of ["staging", "production"]) {
  const selected = source.env?.[environment];
  if (!selected) {
    throw new Error(`Ambiente ${environment} ausente em wrangler.jsonc.`);
  }

  const config = {
    $schema: "../../node_modules/wrangler/config-schema.json",
    name: selected.name,
    main: "../server/index.js",
    compatibility_date: source.compatibility_date,
    compatibility_flags: source.compatibility_flags,
    no_bundle: true,
    assets: { directory: "../client" },
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    vars: selected.vars,
    d1_databases: selected.d1_databases,
    r2_buckets: selected.r2_buckets,
    observability: selected.observability ?? source.observability,
  };

  const outputPath = path.join(outputDirectory, `wrangler.${environment}.json`);
  await writeFile(outputPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  console.log(`Configuração de deploy gerada: ${path.relative(root, outputPath)}`);
}
