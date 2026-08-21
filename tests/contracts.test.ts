import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAccessContract,
  contractStatuses,
  formatContractNumber,
  safeContractFileName,
  validateContractFile,
  validateContractTransition,
} from "../app/lib/contract-rules";
import {
  normalizeContractFieldValues,
  normalizeTemplateInput,
  renderContractTemplate,
} from "../app/lib/contract-template-rules";

test("contratos possuem os status básicos e numeração anual", () => {
  assert.deepEqual(contractStatuses, ["DRAFT", "SENT", "SIGNED", "CANCELLED"]);
  assert.equal(formatContractNumber(2026, 7), "CONT-2026-0007");
});

test("transições exigem arquivo e preservam estados terminais", () => {
  assert.throws(
    () => validateContractTransition("DRAFT", "SENT", false),
    /upload/,
  );
  assert.equal(validateContractTransition("DRAFT", "SENT", true), "SENT");
  assert.equal(validateContractTransition("SENT", "SIGNED", true), "SIGNED");
  assert.equal(
    validateContractTransition("DRAFT", "CANCELLED", false),
    "CANCELLED",
  );
  assert.throws(
    () => validateContractTransition("SIGNED", "CANCELLED", true),
    /não permitida/,
  );
});

test("upload aceita apenas PDF dentro do limite e higieniza o nome", () => {
  validateContractFile(
    new File(["%PDF-test"], "contrato.pdf", { type: "application/pdf" }),
  );
  assert.throws(
    () =>
      validateContractFile(
        new File(["texto"], "contrato.txt", { type: "text/plain" }),
      ),
    /PDF/,
  );
  assert.equal(
    safeContractFileName('contrato/cliente\n"x".pdf'),
    "contrato_cliente__x_.pdf",
  );
});

test("permissões seguem o escopo comercial da oportunidade", () => {
  assert.equal(canAccessContract("OWNER", null, "owner"), true);
  assert.equal(canAccessContract("MANAGER", "sales-b", "manager"), true);
  assert.equal(canAccessContract("SALES", "sales-a", "sales-a"), true);
  assert.equal(canAccessContract("SALES", "sales-b", "sales-a"), false);
  assert.equal(
    canAccessContract("SALES", "sales-b", "sales-a", null, "sales-a"),
    true,
  );
  assert.equal(canAccessContract("FINANCE", "finance", "finance"), false);
});

test("modelo aceita somente campos controlados e preserva cláusulas", () => {
  const template = normalizeTemplateInput(
    "Contrato padrão",
    "Artista: {{artist_name}}. Cachê: {{fee}}.",
  );
  assert.equal(
    renderContractTemplate(template.body, {
      artist_name: "Artista X",
      fee: "R$ 10.000,00",
    }),
    "Artista: Artista X. Cachê: R$ 10.000,00.",
  );
  assert.throws(
    () => normalizeTemplateInput("Inválido", "{{senha_interna}}"),
    /não permitido/,
  );
  const fields = normalizeContractFieldValues({
    fee: " R$ 10.000,00 ",
    hidden_clause: "não deve entrar",
  });
  assert.equal(fields.fee, "R$ 10.000,00");
  assert.equal("hidden_clause" in fields, false);
});

test("modelos são versionados e PDF exige validação comercial", async () => {
  const [templateRoute, versionRoute, generateRoute, migration] =
    await Promise.all([
      readFile(
        new URL("../app/api/contract-templates/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/contract-templates/[id]/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/contracts/[id]/generate/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../drizzle/0016_talented_dorian_gray.sql", import.meta.url),
        "utf8",
      ),
    ]);
  assert.match(templateRoute, /membership\.role !== "OWNER"/);
  assert.match(versionRoute, /status='ARCHIVED'/);
  assert.match(versionRoute, /Number\(current\.version\) \+ 1/);
  assert.match(generateRoute, /commercialApprovalStatus !== "APPROVED"/);
  assert.match(generateRoute, /env\.FILES\.put/);
  assert.match(migration, /CREATE TABLE `contract_templates`/);
  assert.match(migration, /`template_body_snapshot`/);
  assert.match(
    migration,
    /FOREIGN KEY \(`template_id`,`organization_id`\) REFERENCES `contract_templates`/,
  );
});

test("migration garante relacionamentos compostos por organização", async () => {
  const sql = await readFile(
    new URL("../drizzle/0009_worried_tombstone.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE `contracts`/);
  assert.match(sql, /FOREIGN KEY \(`opportunity_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`show_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`customer_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`artist_id`,`organization_id`\)/);
  assert.match(sql, /CREATE TABLE `contract_activities`/);
});

test("arquivo privado usa R2 e download exige autorização", async () => {
  const fileRoute = await readFile(
    new URL("../app/api/contracts/[id]/file/route.ts", import.meta.url),
    "utf8",
  );
  const access = await readFile(
    new URL("../app/lib/contract-access.ts", import.meta.url),
    "utf8",
  );
  const hosting = await readFile(
    new URL("../.openai/hosting.json", import.meta.url),
    "utf8",
  );
  assert.match(fileRoute, /accessibleContract/);
  assert.match(fileRoute, /env\.FILES\.get/);
  assert.match(fileRoute, /private, no-store/);
  assert.match(fileRoute, /crypto\.randomUUID\(\)/);
  assert.doesNotMatch(fileRoute, /public\/|file_key.*Response\.json/);
  assert.match(access, /contract\.organization_id=\?/);
  assert.match(hosting, /"r2": "FILES"/);
});
