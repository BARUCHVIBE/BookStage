import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  canManageArtistAssignments,
  canViewArtist,
  validateCommercialAssignments,
} from "../app/lib/artist-access";

const memberships = [
  {
    organizationId: "org-a",
    userId: "owner-a",
    role: "OWNER" as const,
    status: "ACTIVE",
  },
  {
    organizationId: "org-a",
    userId: "sales-a1",
    role: "SALES" as const,
    status: "ACTIVE",
  },
  {
    organizationId: "org-a",
    userId: "sales-a2",
    role: "SALES" as const,
    status: "ACTIVE",
  },
  {
    organizationId: "org-b",
    userId: "sales-b",
    role: "SALES" as const,
    status: "ACTIVE",
  },
  {
    organizationId: "org-a",
    userId: "booking-a",
    role: "BOOKING_AGENT" as const,
    status: "ACTIVE",
  },
  {
    organizationId: "org-a",
    userId: "sales-inactive",
    role: "SALES" as const,
    status: "INACTIVE",
  },
];

test("atribui responsável principal", () => {
  const result = validateCommercialAssignments(
    "org-a",
    "sales-a1",
    [],
    memberships,
  );
  assert.equal(result.primaryUserId, "sales-a1");
});

test("mantém múltiplos comerciais autorizados sem duplicar o principal", () => {
  const result = validateCommercialAssignments(
    "org-a",
    "sales-a1",
    ["sales-a1", "sales-a2", "sales-a2"],
    memberships,
  );
  assert.deepEqual(result.authorizedUserIds, ["sales-a2"]);
});

test("permite trocar o responsável principal", () => {
  const result = validateCommercialAssignments(
    "org-a",
    "sales-a2",
    ["sales-a1"],
    memberships,
  );
  assert.equal(result.primaryUserId, "sales-a2");
  assert.deepEqual(result.authorizedUserIds, ["sales-a1"]);
});

test("rejeita atribuição entre organizações", () => {
  assert.throws(
    () => validateCommercialAssignments("org-a", "sales-b", [], memberships),
    /inválido/,
  );
});

test("Booking não pode ser responsável comercial interno", () => {
  assert.throws(
    () => validateCommercialAssignments("org-a", "booking-a", [], memberships),
    /inválido/,
  );
});

test("membro inativo não pode ser responsável comercial principal", () => {
  assert.throws(
    () =>
      validateCommercialAssignments(
        "org-a",
        "sales-inactive",
        [],
        memberships,
      ),
    /inválido/,
  );
});

test("listagem e detalhe usam a mesma fonte de verdade do responsável", async () => {
  const [domain, list, detail, shell] = await Promise.all([
    readFile(new URL("../app/lib/artist-sales.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/artists/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/artists/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/bookstage-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(domain, /primaryCommercialQuery/);
  assert.match(domain, /membership\.status='ACTIVE'/);
  assert.match(domain, /membership\.professional_role IS NULL/);
  assert.match(domain, /membership\.role IN \('OWNER','MANAGER','SALES'\)/);
  assert.match(list, /getOrganizationPrimaryCommercials/);
  assert.match(list, /primaryCommercial,/);
  assert.doesNotMatch(list, /primary_user\.id AS primaryUserId/);
  assert.match(detail, /getArtistPrimaryCommercial/);
  assert.match(detail, /primaryCommercial,/);
  assert.match(shell, /d\.primaryCommercial\?\.userId/);
  assert.match(shell, /props\.selected\.primaryCommercial\.name/);
});

test("artista ativo exige principal na criação e na alteração", async () => {
  const [collection, assignment, shell] = await Promise.all([
    readFile(new URL("../app/api/artists/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/artists/[id]/sales-team/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/bookstage-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(collection, /body\.primaryUserId/);
  assert.match(collection, /Todo artista ativo precisa/);
  assert.match(collection, /INSERT INTO artist_sales_assignments/);
  assert.match(assignment, /artist\.status === "ACTIVE"/);
  assert.match(assignment, /Todo artista ativo precisa/);
  assert.match(shell, /Responsável principal do novo artista/);
});

test("Opportunity e Approval preservam o principal resolvido no momento da negociação", async () => {
  const [domain, opportunity, intake, publicRequest, approval, repair] = await Promise.all([
    readFile(new URL("../app/lib/artist-sales.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/opportunities/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/commercial-requests/[id]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/public/catalog/[organizationSlug]/[artistSlug]/requests/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/api/opportunities/[id]/approvals/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL(
        "../drizzle/0021_backfill_opportunity_commercial_validator.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  ]);
  assert.match(opportunity, /getArtistPrimaryCommercial/);
  assert.match(intake, /getArtistPrimaryCommercial/);
  assert.match(publicRequest, /getArtistPrimaryCommercial/);
  assert.match(approval, /commercial_validator_user_id AS commercialValidatorUserId/);
  assert.match(approval, /commercialValidatorUserId === contextResult\.user\.id/);
  assert.match(domain, /ensureOpportunityCommercialValidator/);
  assert.match(domain, /commercial_validator_user_id IS NULL/);
  assert.match(approval, /ensureOpportunityCommercialValidator/);
  assert.match(repair, /WHERE commercial_validator_user_id IS NULL/);
  assert.match(repair, /assignment\.organization_id = opportunities\.organization_id/);
  assert.match(repair, /membership\.professional_role IS NULL/);
  assert.match(repair, /membership\.role IN \('OWNER', 'MANAGER', 'SALES'\)/);
});

test("backfill associa somente o comercial principal válido do mesmo tenant", async () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    CREATE TABLE memberships (
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      professional_role TEXT
    );
    CREATE TABLE artist_sales_assignments (
      organization_id TEXT NOT NULL,
      artist_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      is_primary INTEGER NOT NULL
    );
    CREATE TABLE opportunities (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      artist_id TEXT NOT NULL,
      commercial_validator_user_id TEXT,
      updated_at TEXT
    );
    INSERT INTO memberships VALUES
      ('org-a','sales-a','SALES','ACTIVE',NULL),
      ('org-b','sales-b','SALES','ACTIVE',NULL),
      ('org-a','booking-a','SALES','ACTIVE','BOOKING_AGENT'),
      ('org-a','inactive-a','SALES','INACTIVE',NULL);
    INSERT INTO artist_sales_assignments VALUES
      ('org-a','artist-a','sales-a',1),
      ('org-b','artist-b','sales-b',1),
      ('org-a','artist-booking','booking-a',1),
      ('org-a','artist-inactive','inactive-a',1);
    INSERT INTO opportunities VALUES
      ('op-a','org-a','artist-a',NULL,NULL),
      ('op-b','org-b','artist-b',NULL,NULL),
      ('op-existing','org-a','artist-a','original-sales',NULL),
      ('op-booking','org-a','artist-booking',NULL,NULL),
      ('op-inactive','org-a','artist-inactive',NULL,NULL);
  `);
  database.exec(
    await readFile(
      new URL(
        "../drizzle/0021_backfill_opportunity_commercial_validator.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );

  const validators = database
    .prepare(
      `SELECT id,commercial_validator_user_id AS validator
       FROM opportunities ORDER BY id`,
    )
    .all()
    .map((row) => ({ id: row.id, validator: row.validator }));
  assert.deepEqual(validators, [
    { id: "op-a", validator: "sales-a" },
    { id: "op-b", validator: "sales-b" },
    { id: "op-booking", validator: null },
    { id: "op-existing", validator: "original-sales" },
    { id: "op-inactive", validator: null },
  ]);
});

test("acessos de Booking usam relação independente e aceitam vários por artista", async () => {
  const schema = await readFile(
    new URL("../db/schema.ts", import.meta.url),
    "utf8",
  );
  const migration = await readFile(
    new URL("../drizzle/0014_yummy_celestials.sql", import.meta.url),
    "utf8",
  );
  assert.match(schema, /bookingCollaboratorArtistAccess/);
  assert.match(
    schema,
    /primaryKey\(\{ columns: \[table\.artistId, table\.userId\] \}\)/,
  );
  assert.match(migration, /CREATE TABLE `booking_collaborator_artist_access`/);
  assert.match(migration, /DELETE FROM (?:`)?artist_sales_assignments(?:`)?/);
  assert.match(migration, /`commercial_validator_user_id`/);
});

test("aplica permissões OWNER, MANAGER e SALES", () => {
  assert.equal(canManageArtistAssignments("OWNER"), true);
  assert.equal(canManageArtistAssignments("MANAGER"), true);
  assert.equal(canManageArtistAssignments("SALES"), false);
  assert.equal(canViewArtist("SALES", true), true);
  assert.equal(canViewArtist("SALES", false), false);
});

test("migration garante tenant nas duas chaves estrangeiras", async () => {
  const sql = await readFile(
    new URL("../drizzle/0002_brown_grey_gargoyle.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /FOREIGN KEY \(`artist_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`organization_id`,`user_id`\)/);
  assert.match(sql, /WHERE .*is_primary.*= 1/i);
});
