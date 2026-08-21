import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canEditProduction, canViewShow, canViewShowCommercial, safeShowFileName, showStatuses, validateShowDocument, validateShowTransition } from "../app/lib/show-rules";

test("shows possuem os estados operacionais solicitados", () => {
  assert.deepEqual(showStatuses, ["CONFIRMED", "IN_PREPARATION", "COMPLETED", "CANCELLED"]);
  assert.equal(validateShowTransition("CONFIRMED", "IN_PREPARATION", "PRODUCTION"), "IN_PREPARATION");
  assert.equal(validateShowTransition("IN_PREPARATION", "COMPLETED", "PRODUCTION"), "COMPLETED");
  assert.equal(validateShowTransition("CONFIRMED", "CANCELLED", "OWNER"), "CANCELLED");
  assert.throws(() => validateShowTransition("CONFIRMED", "CANCELLED", "PRODUCTION"), /OWNER ou MANAGER/);
  assert.throws(() => validateShowTransition("COMPLETED", "IN_PREPARATION", "OWNER"), /não permitida/);
});

test("produção acessa a operação sem receber o contexto comercial", () => {
  assert.equal(canViewShow("PRODUCTION", null, "production"), true);
  assert.equal(canEditProduction("PRODUCTION"), true);
  assert.equal(canViewShowCommercial("PRODUCTION", null, "production"), false);
  assert.equal(canViewShow("SALES", "sales-a", "sales-a"), true);
  assert.equal(canViewShow("SALES", "sales-b", "sales-a"), false);
  assert.equal(canEditProduction("SALES"), false);
});

test("rider e mapa de palco aceitam apenas documentos seguros", () => {
  validateShowDocument(new File(["%PDF-test"], "rider.pdf", { type: "application/pdf" }));
  validateShowDocument(new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "mapa.png", { type: "image/png" }));
  assert.throws(() => validateShowDocument(new File(["texto"], "rider.txt", { type: "text/plain" })), /PDF, PNG ou JPG/);
  assert.equal(safeShowFileName('rider/turnê\n"2026".pdf'), "rider_turnê__2026_.pdf");
});

test("migration protege todos os relacionamentos de Show por organização", async () => {
  const sql = await readFile(new URL("../drizzle/0010_fixed_radioactive_man.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE `__new_shows`/);
  assert.match(sql, /FOREIGN KEY \(`opportunity_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`artist_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`customer_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`organization_id`,`producer_user_id`\)/);
  assert.match(sql, /CREATE TABLE `show_activities`/);
  assert.match(sql, /CREATE UNIQUE INDEX `idx_shows_opportunity_tenant`/);
  assert.match(sql, /CASE WHEN show\.status='PREPARING' THEN 'IN_PREPARATION'/);
});

test("fechamento cria Show e confirma agenda de forma idempotente", async () => {
  const route = await readFile(new URL("../app/api/opportunities/[id]/route.ts", import.meta.url), "utf8");
  assert.match(route, /INSERT OR IGNORE INTO shows/);
  assert.match(route, /status='CONFIRMED'[\s\S]*calendar_entries/);
  assert.match(route, /UPDATE contracts SET show_id=/);
  assert.match(route, /INSERT INTO show_activities/);
  assert.match(route, /SHOW_PREPARED/);
});

test("arquivos técnicos ficam privados no R2 e exigem acesso ao Show", async () => {
  const route = await readFile(new URL("../app/api/shows/[id]/files/[kind]/route.ts", import.meta.url), "utf8");
  const access = await readFile(new URL("../app/lib/show-access.ts", import.meta.url), "utf8");
  assert.match(route, /accessibleShow/);
  assert.match(route, /env\.FILES\.get/);
  assert.match(route, /private, no-store/);
  assert.match(route, /crypto\.randomUUID\(\)/);
  assert.match(route, /O conteúdo do arquivo não corresponde ao formato informado/);
  assert.match(access, /show\.organization_id=\?/);
  assert.doesNotMatch(route, /public\//);
});
