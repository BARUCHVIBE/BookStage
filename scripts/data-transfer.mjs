import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const root = process.cwd();
const workspace = path.join(root, ".bookstage-migration");
const snapshots = path.join(workspace, "snapshots");
const backups = path.join(workspace, "backups");
const transientTables = new Set([
  "auth_login_attempts",
  "public_request_attempts",
  "sessions",
]);
const validationTables = [
  "organizations",
  "users",
  "auth_credentials",
  "memberships",
  "artists",
  "artist_sales_assignments",
  "booking_collaborator_artist_access",
  "booking_commercial_profiles",
  "calendar_entries",
  "customers",
  "commercial_requests",
  "opportunities",
  "opportunity_activities",
  "opportunity_approvals",
  "opportunity_financial_items",
  "proposals",
  "contracts",
  "shows",
  "payments",
  "show_commissions",
];
const relationshipQueries = {
  multiOrganizationUsers:
    "SELECT user_id,organization_id,role,COALESCE(professional_role,'') AS professional_role,status FROM memberships WHERE user_id IN (SELECT user_id FROM memberships WHERE status='ACTIVE' GROUP BY user_id HAVING COUNT(DISTINCT organization_id)>1) ORDER BY user_id,organization_id",
  bookingArtistAccess:
    "SELECT organization_id,user_id,artist_id,status FROM booking_collaborator_artist_access ORDER BY organization_id,user_id,artist_id",
  primaryCommercials:
    "SELECT organization_id,artist_id,user_id FROM artist_sales_assignments WHERE is_primary=1 ORDER BY organization_id,artist_id,user_id",
  opportunityRelations:
    "SELECT id,organization_id,artist_id,customer_id,COALESCE(originator_user_id,'') AS originator_user_id,COALESCE(commercial_validator_user_id,'') AS commercial_validator_user_id FROM opportunities ORDER BY organization_id,id",
  contractRelations:
    "SELECT id,organization_id,opportunity_id,artist_id,customer_id,COALESCE(show_id,'') AS show_id FROM contracts ORDER BY organization_id,id",
  showRelations:
    "SELECT id,organization_id,opportunity_id,artist_id,customer_id FROM shows ORDER BY organization_id,id",
};

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function run(command, args, options = {}) {
  const usesWrangler = command === "npx" && args[0] === "wrangler";
  const executable = usesWrangler ? process.execPath : command;
  const commandArgs = usesWrangler
    ? [path.join(root, "node_modules", "wrangler", "bin", "wrangler.js"), ...args.slice(1)]
    : args;
  const result = spawnSync(executable, commandArgs, {
    cwd: root,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    ...options,
  });
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} falhou.${result.error ? `\n${result.error.message}` : ""}${result.stdout ? `\n${result.stdout}` : ""}${result.stderr ? `\n${result.stderr}` : ""}`,
    );
  return result.stdout || "";
}

function localD1Path() {
  if (process.env.BOOKSTAGE_LOCAL_D1_PATH) {
    const explicit = path.resolve(process.env.BOOKSTAGE_LOCAL_D1_PATH);
    if (!existsSync(explicit)) throw new Error("BOOKSTAGE_LOCAL_D1_PATH não existe.");
    return explicit;
  }
  const folder = path.join(
    root,
    ".wrangler",
    "state",
    "v3",
    "d1",
    "miniflare-D1DatabaseObject",
  );
  const candidates = readdirSync(folder)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => path.join(folder, name));
  const ranked = candidates
    .map((file) => {
      try {
        const db = new DatabaseSync(file, { readOnly: true });
        const exists = db
          .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='d1_migrations'")
          .get();
        const migrations = exists
          ? Number(db.prepare("SELECT COUNT(*) AS count FROM d1_migrations").get().count)
          : 0;
        db.close();
        return { file, migrations, modified: statSync(file).mtimeMs };
      } catch {
        return { file, migrations: -1, modified: 0 };
      }
    })
    .sort((a, b) => b.migrations - a.migrations || b.modified - a.modified);
  if (!ranked[0] || ranked[0].migrations < 1)
    throw new Error("Banco D1 local ativo não foi encontrado.");
  return ranked[0].file;
}

function sqlIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number" || typeof value === "bigint") return String(value);
  if (value instanceof Uint8Array)
    return `X'${Buffer.from(value).toString("hex")}'`;
  return `'${String(value).replaceAll("'", "''")}'`;
}

function orderedTables(db) {
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' AND name<>'d1_migrations' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name))
    .filter((name) => !transientTables.has(name));
  const tableSet = new Set(tables);
  const dependencies = new Map(
    tables.map((table) => [
      table,
      new Set(
        db
          .prepare(`PRAGMA foreign_key_list(${sqlIdentifier(table)})`)
          .all()
          .map((row) => String(row.table))
          .filter((parent) => parent !== table && tableSet.has(parent)),
      ),
    ]),
  );
  const ordered = [];
  const remaining = new Set(tables);
  while (remaining.size) {
    const ready = [...remaining].filter((table) =>
      [...dependencies.get(table)].every((parent) => !remaining.has(parent)),
    );
    if (!ready.length)
      throw new Error(`Ciclo de foreign keys entre: ${[...remaining].join(", ")}`);
    for (const table of ready.sort()) {
      ordered.push(table);
      remaining.delete(table);
    }
  }
  return ordered;
}

function referencedR2Keys(db) {
  const keys = new Set();
  const add = (value) => {
    if (!value) return;
    const text = String(value);
    const publicAsset = text.match(/^\/api\/public\/branding-assets\/([^/?#]+)/);
    const artistAsset = text.match(/^\/api\/public\/artist-assets\/([^/?#]+)/);
    if (publicAsset) keys.add(`public-branding/${publicAsset[1]}`);
    else if (artistAsset) keys.add(`public-artists/${artistAsset[1]}`);
    else if (!/^https?:\/\//i.test(text)) keys.add(text);
  };
  const sources = [
    ["organizations", ["logo"]],
    ["organization_branding", ["favicon_url", "catalog_cover_url"]],
    ["artists", ["photo_url", "cover_url"]],
    ["booking_commercial_profiles", ["avatar_url"]],
    ["contract_templates", ["file_key"]],
    ["contracts", ["file_key", "template_file_key_snapshot"]],
    ["shows", ["rider_file_key", "stage_map_file_key"]],
  ];
  for (const [table, columns] of sources) {
    const exists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!exists) continue;
    const available = new Set(
      db.prepare(`PRAGMA table_info(${sqlIdentifier(table)})`).all().map((row) => row.name),
    );
    const selected = columns.filter((column) => available.has(column));
    if (!selected.length) continue;
    for (const row of db
      .prepare(
        `SELECT ${selected.map(sqlIdentifier).join(",")} FROM ${sqlIdentifier(table)}`,
      )
      .all())
      for (const column of selected) add(row[column]);
  }
  return keys;
}

function externalAssets(db) {
  const output = [];
  for (const table of ["organizations", "artists", "booking_commercial_profiles"]) {
    const exists = db
      .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?")
      .get(table);
    if (!exists) continue;
    const columns = db
      .prepare(`PRAGMA table_info(${sqlIdentifier(table)})`)
      .all()
      .map((row) => String(row.name))
      .filter((name) => /url$|^logo$/.test(name));
    if (!columns.length) continue;
    const idColumn = table === "booking_commercial_profiles" ? "user_id" : "id";
    for (const row of db
      .prepare(
        `SELECT ${sqlIdentifier(idColumn)},${columns.map(sqlIdentifier).join(",")} FROM ${sqlIdentifier(table)}`,
      )
      .all())
      for (const column of columns)
        if (/^https?:\/\//i.test(String(row[column] || "")))
          output.push({ table, id: row[idColumn], column, url: row[column] });
  }
  return output;
}

function r2Database() {
  const folder = path.join(
    root,
    ".wrangler",
    "state",
    "v3",
    "r2",
    "miniflare-R2BucketObject",
  );
  const candidates = readdirSync(folder)
    .filter((name) => name.endsWith(".sqlite") && name !== "metadata.sqlite")
    .map((name) => path.join(folder, name));
  const ranked = candidates
    .map((file) => {
      try {
        const db = new DatabaseSync(file, { readOnly: true });
        const count = Number(db.prepare("SELECT COUNT(*) AS count FROM _mf_objects").get().count);
        db.close();
        return { file, count };
      } catch {
        return { file, count: -1 };
      }
    })
    .sort((a, b) => b.count - a.count);
  if (!ranked[0] || ranked[0].count < 0)
    throw new Error("Metadados do R2 local não foram encontrados.");
  return ranked[0].file;
}

function exportLocal() {
  mkdirSync(snapshots, { recursive: true });
  const output = path.join(snapshots, stamp());
  mkdirSync(output, { recursive: true });
  const d1Path = localD1Path();
  const db = new DatabaseSync(d1Path, { readOnly: true });
  const integrity = db.prepare("PRAGMA integrity_check").all();
  const foreignKeys = db.prepare("PRAGMA foreign_key_check").all();
  if (integrity.some((row) => row.integrity_check !== "ok") || foreignKeys.length)
    throw new Error("O banco local falhou nas verificações de integridade.");
  const tables = orderedTables(db);
  const counts = Object.fromEntries(
    tables.map((table) => [
      table,
      Number(db.prepare(`SELECT COUNT(*) AS count FROM ${sqlIdentifier(table)}`).get().count),
    ]),
  );
  const relationships = Object.fromEntries(
    Object.entries(relationshipQueries).map(([name, query]) => [
      name,
      db.prepare(query).all(),
    ]),
  );
  const lines = [
    "-- BookStage staging data snapshot for an empty, fully migrated D1. IDs and hashed credentials are preserved; sessions are excluded.",
    "PRAGMA defer_foreign_keys=TRUE;",
  ];
  for (const table of tables) {
    const columns = db
      .prepare(`PRAGMA table_info(${sqlIdentifier(table)})`)
      .all()
      .map((row) => String(row.name));
    for (const row of db.prepare(`SELECT * FROM ${sqlIdentifier(table)}`).all())
      lines.push(
        `INSERT INTO ${sqlIdentifier(table)} (${columns.map(sqlIdentifier).join(",")}) VALUES (${columns.map((column) => sqlValue(row[column])).join(",")});`,
      );
  }
  lines.push("PRAGMA foreign_keys=ON;");
  const dataFile = path.join(output, "data.sql");
  writeFileSync(dataFile, `${lines.join("\n")}\n`, "utf8");

  const referenced = referencedR2Keys(db);
  const r2DbPath = r2Database();
  const r2 = new DatabaseSync(r2DbPath, { readOnly: true });
  const objects = r2.prepare("SELECT * FROM _mf_objects ORDER BY key").all();
  const blobFolders = [
    path.join(root, ".wrangler", "state", "v3", "r2", "bookstage-staging-files", "blobs"),
    path.join(path.dirname(r2DbPath), "blobs"),
  ];
  const objectFolder = path.join(output, "r2", "objects");
  mkdirSync(objectFolder, { recursive: true });
  const r2Manifest = objects.map((object, index) => {
    const source = blobFolders
      .map((folder) => path.join(folder, String(object.blob_id)))
      .find(existsSync);
    if (!source) throw new Error(`Blob local ausente para ${object.key}.`);
    const file = `${String(index + 1).padStart(4, "0")}.bin`;
    copyFileSync(source, path.join(objectFolder, file));
    return {
      key: object.key,
      file: `r2/objects/${file}`,
      size: Number(object.size),
      etag: object.etag,
      contentType: JSON.parse(String(object.http_metadata || "{}")).contentType || null,
      customMetadata: JSON.parse(String(object.custom_metadata || "{}")),
      referenced: referenced.has(String(object.key)),
    };
  });
  const available = new Set(r2Manifest.map((item) => String(item.key)));
  const missingR2Keys = [...referenced].filter((key) => !available.has(key));
  if (missingR2Keys.length)
    throw new Error(`Referências R2 sem arquivo local: ${missingR2Keys.join(", ")}`);
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    source: {
      d1Path: path.relative(root, d1Path),
      migrations: db.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => row.name),
    },
    excludedTables: [...transientTables],
    counts,
    relationships,
    integrity: { sqlite: "ok", foreignKeyViolations: 0 },
    r2: {
      objects: r2Manifest,
      referenced: r2Manifest.filter((item) => item.referenced).length,
      orphaned: r2Manifest.filter((item) => !item.referenced).map((item) => item.key),
    },
    externalAssets: externalAssets(db),
    dataSha256: createHash("sha256").update(readFileSync(dataFile)).digest("hex"),
  };
  writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  writeFileSync(path.join(snapshots, "latest.txt"), path.basename(output));
  db.close();
  r2.close();
  console.log(`Snapshot criado: ${output}`);
  console.log(
    `${tables.length} tabelas, ${r2Manifest.length} objetos R2, ${manifest.externalAssets.length} URLs externas inventariadas.`,
  );
  return output;
}

function latestSnapshot() {
  const pointer = path.join(snapshots, "latest.txt");
  if (!existsSync(pointer)) throw new Error("Execute staging:data:export primeiro.");
  const folder = path.join(snapshots, readFileSync(pointer, "utf8").trim());
  if (!existsSync(path.join(folder, "manifest.json")))
    throw new Error("Snapshot local incompleto.");
  return folder;
}

function parseWranglerJson(output) {
  const start = output.indexOf("[\n");
  if (start < 0) throw new Error("Resposta JSON do Wrangler não encontrada.");
  return JSON.parse(output.slice(start));
}

function backupStaging() {
  mkdirSync(backups, { recursive: true });
  const file = path.join(backups, `staging-${stamp()}.sql`);
  run("npx", [
    "wrangler",
    "d1",
    "export",
    "DB",
    "--env",
    "staging",
    "--remote",
    "--skip-confirmation",
    "--output",
    file,
  ]);
  if (!existsSync(file) || statSync(file).size < 100)
    throw new Error("Backup remoto não foi criado corretamente.");
  console.log(`Backup de staging criado em ${file}`);
  return file;
}

function uploadR2(snapshot, manifest) {
  for (const object of manifest.r2.objects) {
    const args = [
      "wrangler",
      "r2",
      "object",
      "put",
      `bookstage-staging-files/${object.key}`,
      "--remote",
      "--file",
      path.join(snapshot, object.file),
    ];
    if (object.contentType) args.push("--content-type", object.contentType);
    run("npx", args);
  }
}

function validationQuery(manifest) {
  const tables = validationTables.filter((table) => table in manifest.counts);
  return tables.map(
    (table) =>
      `SELECT '${table}' AS name,COUNT(*) AS count FROM ${sqlIdentifier(table)}`,
  );
}

function validateStaging(snapshot = latestSnapshot()) {
  const manifest = JSON.parse(readFileSync(path.join(snapshot, "manifest.json"), "utf8"));
  const countQueries = validationQuery(manifest);
  const relationshipEntries = Object.entries(relationshipQueries);
  const output = run(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--env",
      "staging",
      "--remote",
      "--command",
      `${countQueries.map((query) => `${query};`).join(" ")} ${relationshipEntries.map(([, query]) => `${query};`).join(" ")} PRAGMA foreign_key_check; SELECT COUNT(*) AS missing_hashes FROM auth_credentials WHERE password_hash IS NULL OR password_hash='';`,
    ],
    { capture: true },
  );
  const response = parseWranglerJson(output);
  const rows = response
    .slice(0, countQueries.length)
    .flatMap((item) => item?.results || []);
  const mismatches = rows.filter(
    (row) => Number(row.count) !== Number(manifest.counts[row.name]),
  );
  const relationshipMismatches = relationshipEntries
    .map(([name], index) => ({
      name,
      expected: manifest.relationships[name],
      actual: response[countQueries.length + index]?.results || [],
    }))
    .filter(({ expected, actual }) => JSON.stringify(expected) !== JSON.stringify(actual));
  const foreignKeyIndex = countQueries.length + relationshipEntries.length;
  const foreignKeyViolations = response[foreignKeyIndex]?.results || [];
  const missingHashes = Number(
    response[foreignKeyIndex + 1]?.results?.[0]?.missing_hashes || 0,
  );
  if (
    mismatches.length ||
    relationshipMismatches.length ||
    foreignKeyViolations.length ||
    missingHashes
  )
    throw new Error(
      `Validação falhou. Contagens: ${JSON.stringify(mismatches)}; relações: ${relationshipMismatches.map((item) => item.name).join(",")}; FKs: ${foreignKeyViolations.length}; hashes ausentes: ${missingHashes}`,
    );
  console.log(
    `Staging validado: ${rows.length} contagens, ${relationshipEntries.length} relações críticas, foreign keys e credenciais íntegras.`,
  );
}

function importStaging() {
  if (!process.argv.includes("--confirm-staging-replace"))
    throw new Error(
      "Importação bloqueada. Use --confirm-staging-replace após revisar o snapshot.",
    );
  const snapshot = latestSnapshot();
  const manifest = JSON.parse(readFileSync(path.join(snapshot, "manifest.json"), "utf8"));
  const data = readFileSync(path.join(snapshot, "data.sql"));
  if (createHash("sha256").update(data).digest("hex") !== manifest.dataSha256)
    throw new Error("O snapshot foi alterado após a exportação.");
  run("node", ["scripts/check-migrations.mjs"]);
  run("npx", [
    "wrangler",
    "d1",
    "migrations",
    "apply",
    "DB",
    "--env",
    "staging",
    "--remote",
  ]);
  backupStaging();
  const emptinessOutput = run(
    "npx",
    [
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--env",
      "staging",
      "--remote",
      "--command",
      "SELECT COUNT(*) AS count FROM organizations;",
    ],
    { capture: true },
  );
  const targetCount = Number(
    parseWranglerJson(emptinessOutput)[0]?.results?.[0]?.count ?? -1,
  );
  if (targetCount !== 0)
    throw new Error(
      `Importação integral exige D1 de staging vazio; destino possui ${targetCount} organizações. Use blue/green em vez de sobrescrever dados.`,
    );
  uploadR2(snapshot, manifest);
  run("npx", [
    "wrangler",
    "d1",
    "execute",
    "DB",
    "--env",
    "staging",
    "--remote",
    "--file",
    path.join(snapshot, "data.sql"),
  ]);
  validateStaging(snapshot);
}

const command = process.argv[2];
try {
  if (command === "export-local") exportLocal();
  else if (command === "backup-staging") backupStaging();
  else if (command === "import-staging") importStaging();
  else if (command === "validate-staging") validateStaging();
  else
    throw new Error(
      "Comando esperado: export-local | backup-staging | import-staging | validate-staging",
    );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
