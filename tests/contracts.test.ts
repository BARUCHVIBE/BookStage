import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canAccessContract, contractStatuses, formatContractNumber, safeContractFileName, validateContractFile, validateContractTransition } from "../app/lib/contract-rules";

test("contratos possuem os status básicos e numeração anual", () => {
  assert.deepEqual(contractStatuses, ["DRAFT", "SENT", "SIGNED", "CANCELLED"]);
  assert.equal(formatContractNumber(2026, 7), "CONT-2026-0007");
});

test("transições exigem arquivo e preservam estados terminais", () => {
  assert.throws(() => validateContractTransition("DRAFT", "SENT", false), /upload/);
  assert.equal(validateContractTransition("DRAFT", "SENT", true), "SENT");
  assert.equal(validateContractTransition("SENT", "SIGNED", true), "SIGNED");
  assert.equal(validateContractTransition("DRAFT", "CANCELLED", false), "CANCELLED");
  assert.throws(() => validateContractTransition("SIGNED", "CANCELLED", true), /não permitida/);
});

test("upload aceita apenas PDF dentro do limite e higieniza o nome", () => {
  validateContractFile(new File(["%PDF-test"], "contrato.pdf", { type: "application/pdf" }));
  assert.throws(() => validateContractFile(new File(["texto"], "contrato.txt", { type: "text/plain" })), /PDF/);
  assert.equal(safeContractFileName('contrato/cliente\n"x".pdf'), "contrato_cliente__x_.pdf");
});

test("permissões seguem o escopo comercial da oportunidade", () => {
  assert.equal(canAccessContract("OWNER", null, "owner"), true);
  assert.equal(canAccessContract("MANAGER", "sales-b", "manager"), true);
  assert.equal(canAccessContract("SALES", "sales-a", "sales-a"), true);
  assert.equal(canAccessContract("SALES", "sales-b", "sales-a"), false);
  assert.equal(canAccessContract("FINANCE", "finance", "finance"), false);
});

test("migration garante relacionamentos compostos por organização", async () => {
  const sql = await readFile(new URL("../drizzle/0009_worried_tombstone.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE `contracts`/);
  assert.match(sql, /FOREIGN KEY \(`opportunity_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`show_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`customer_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`artist_id`,`organization_id`\)/);
  assert.match(sql, /CREATE TABLE `contract_activities`/);
});

test("arquivo privado usa R2 e download exige autorização", async () => {
  const fileRoute = await readFile(new URL("../app/api/contracts/[id]/file/route.ts", import.meta.url), "utf8");
  const access = await readFile(new URL("../app/lib/contract-access.ts", import.meta.url), "utf8");
  const hosting = await readFile(new URL("../.openai/hosting.json", import.meta.url), "utf8");
  assert.match(fileRoute, /accessibleContract/);
  assert.match(fileRoute, /env\.FILES\.get/);
  assert.match(fileRoute, /private, no-store/);
  assert.match(fileRoute, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(fileRoute, /public\/|file_key.*Response\.json/);
  assert.match(access, /contract\.organization_id=\?/);
  assert.match(hosting, /"r2": "FILES"/);
});
