import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canManageArtistAssignments, canViewArtist, validateCommercialAssignments } from "../app/lib/artist-access";

const memberships = [
  { organizationId: "org-a", userId: "owner-a", role: "OWNER" as const, status: "ACTIVE" },
  { organizationId: "org-a", userId: "sales-a1", role: "SALES" as const, status: "ACTIVE" },
  { organizationId: "org-a", userId: "sales-a2", role: "SALES" as const, status: "ACTIVE" },
  { organizationId: "org-b", userId: "sales-b", role: "SALES" as const, status: "ACTIVE" },
];

test("atribui responsável principal", () => {
  const result = validateCommercialAssignments("org-a", "sales-a1", [], memberships);
  assert.equal(result.primaryUserId, "sales-a1");
});

test("mantém múltiplos comerciais autorizados sem duplicar o principal", () => {
  const result = validateCommercialAssignments("org-a", "sales-a1", ["sales-a1", "sales-a2", "sales-a2"], memberships);
  assert.deepEqual(result.authorizedUserIds, ["sales-a2"]);
});

test("permite trocar o responsável principal", () => {
  const result = validateCommercialAssignments("org-a", "sales-a2", ["sales-a1"], memberships);
  assert.equal(result.primaryUserId, "sales-a2");
  assert.deepEqual(result.authorizedUserIds, ["sales-a1"]);
});

test("rejeita atribuição entre organizações", () => {
  assert.throws(() => validateCommercialAssignments("org-a", "sales-b", [], memberships), /inválido/);
});

test("aplica permissões OWNER, MANAGER e SALES", () => {
  assert.equal(canManageArtistAssignments("OWNER"), true);
  assert.equal(canManageArtistAssignments("MANAGER"), true);
  assert.equal(canManageArtistAssignments("SALES"), false);
  assert.equal(canViewArtist("SALES", true), true);
  assert.equal(canViewArtist("SALES", false), false);
});

test("migration garante tenant nas duas chaves estrangeiras", async () => {
  const sql = await readFile(new URL("../drizzle/0002_brown_grey_gargoyle.sql", import.meta.url), "utf8");
  assert.match(sql, /FOREIGN KEY \(`artist_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`organization_id`,`user_id`\)/);
  assert.match(sql, /WHERE .*is_primary.*= 1/i);
});
