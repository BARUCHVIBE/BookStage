import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { PDFDocument } from "pdf-lib";
import {
  canAccessContract,
  canManageContract,
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
import {
  generateContractFromPdfTemplate,
  inspectContractTemplatePdf,
  normalizePdfFieldMapping,
} from "../app/lib/contract-pdf";

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
  validateContractFile(
    new File([new Uint8Array(10 * 1024 * 1024)], "limite.pdf", {
      type: "application/pdf",
    }),
  );
  assert.throws(
    () =>
      validateContractFile(
        new File([new Uint8Array(10 * 1024 * 1024 + 1)], "excesso.pdf", {
          type: "application/pdf",
        }),
      ),
    /10 MB/,
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
  assert.equal(canAccessContract("FINANCE", "sales", "finance"), true);
  assert.equal(canAccessContract("BOOKING_AGENT", "booking", "booking"), false);
  assert.equal(canAccessContract("PRODUCTION", "production", "production"), false);
  assert.equal(canManageContract("FINANCE"), false);
  assert.equal(canManageContract("SALES"), true);
});

test("Finance consulta e baixa contratos do tenant sem receber mutações", async () => {
  const [listRoute, detailRoute, fileRoute, component] = await Promise.all([
    readFile(new URL("../app/api/contracts/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/contracts/[id]/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/api/contracts/[id]/file/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../app/components/contracts-module.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.doesNotMatch(listRoute, /"BOOKING_AGENT", "FINANCE"/);
  assert.match(listRoute, /role === "FINANCE"[\s\S]*?results: \[\]/);
  assert.match(detailRoute, /!canManageContract\(context\.membership\.role\)/);
  assert.match(fileRoute, /!canManageContract\(context\.membership\.role\)/);
  assert.match(component, /role === "FINANCE"/);
  assert.match(component, /Acesso financeiro de consulta/);
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

test("modelo PDF detecta assinatura e campos AcroForm reais", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage(),
    field = pdf.getForm().createTextField("valor_cache");
  field.addToPage(page, { x: 40, y: 700, width: 180, height: 24 });
  const bytes = await pdf.save(),
    inspection = await inspectContractTemplatePdf(bytes);
  assert.equal(inspection.type, "PDF_ACROFORM");
  assert.deepEqual(inspection.fields.map((item) => item.name), ["valor_cache"]);
  await assert.rejects(
    () => inspectContractTemplatePdf(new TextEncoder().encode("não é pdf")),
    /assinatura válida/,
  );
});

test("mapeamento aceita somente campo detectado e variável registrada", () => {
  const fields = [{ name: "valor_cache", type: "PDFTextField" }];
  assert.deepEqual(
    normalizePdfFieldMapping({ valor_cache: "fee" }, fields),
    { valor_cache: "fee" },
  );
  assert.throws(
    () => normalizePdfFieldMapping({ inexistente: "fee" }, fields),
    /não encontrado/,
  );
  assert.throws(
    () => normalizePdfFieldMapping({ valor_cache: "secret" }, fields),
    /inválida/,
  );
});

test("geração preenche uma cópia AcroForm e preserva o template", async () => {
  const pdf = await PDFDocument.create(),
    page = pdf.addPage(),
    field = pdf.getForm().createTextField("valor_cache");
  field.addToPage(page, { x: 40, y: 700, width: 180, height: 24 });
  const source = await pdf.save(),
    original = Uint8Array.from(source),
    generated = await generateContractFromPdfTemplate(
      source,
      "PDF_ACROFORM",
      { valor_cache: "fee" },
      { fee: "R$ 80.000,00" },
    ),
    reopened = await PDFDocument.load(generated);
  assert.equal(reopened.getForm().getTextField("valor_cache").getText(), "R$ 80.000,00");
  assert.deepEqual(source, original);
});

test("PDF estático é preservado e recebe página confiável de dados", async () => {
  const pdf = await PDFDocument.create();
  pdf.addPage();
  const source = await pdf.save(),
    generated = await generateContractFromPdfTemplate(
      source,
      "PDF_STATIC",
      {},
      { artist_name: "Artista A", fee: "R$ 80.000,00" },
    ),
    reopened = await PDFDocument.load(generated);
  assert.equal(reopened.getPageCount(), 2);
});

test("biblioteca PDF é vinculada ao artista, privada e versionada", async () => {
  const [collection, fileRoute, versionRoute, contractRoute, generateRoute, migration] =
    await Promise.all([
      readFile(new URL("../app/api/contract-templates/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/contract-templates/[id]/file/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../app/api/contract-templates/[id]/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/api/contracts/route.ts", import.meta.url), "utf8"),
      readFile(
        new URL("../app/api/contracts/[id]/generate/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL("../drizzle/0020_blue_omega_sentinel.sql", import.meta.url),
        "utf8",
      ),
    ]);
  assert.match(collection, /artist_id AS artistId/);
  assert.match(collection, /artist_id=\?/);
  assert.match(fileRoute, /inspectContractTemplatePdf/);
  assert.match(fileRoute, /env\.FILES\.put/);
  assert.match(fileRoute, /content-security-policy/);
  assert.match(fileRoute, /status='ARCHIVED'/);
  assert.match(versionRoute, /normalizePdfFieldMapping/);
  assert.match(contractRoute, /template_file_key_snapshot/);
  assert.match(generateRoute, /generateContractFromPdfTemplate/);
  assert.match(generateRoute, /generated_by=\?/);
  assert.match(
    migration,
    /trg_contract_template_artist_insert/,
  );
});

test("upload PDF rejeita tamanho excessivo antes de carregar o arquivo", async () => {
  const route = await readFile(
    new URL("../app/api/contract-templates/[id]/file/route.ts", import.meta.url),
    "utf8",
  );
  const sizeCheck = route.indexOf("file.size > 10_000_000");
  const readBytes = route.indexOf("file.arrayBuffer()");
  assert.ok(sizeCheck >= 0);
  assert.ok(readBytes > sizeCheck);
});

test("Booking consulta somente modelos e não acessa ou cria contratos", async () => {
  const [route, component, templates, panel, templateFile] = await Promise.all([
    readFile(new URL("../app/api/contracts/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/contracts-module.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/contract-templates/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/contract-templates-panel.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/contract-templates/[id]/file/route.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(route, /\["OWNER", "MANAGER", "SALES", "BOOKING_AGENT"\]/);
  assert.match(component, /bookingModelsOnly = role === "BOOKING_AGENT"/);
  assert.match(component, /useState\(bookingModelsOnly\)/);
  assert.doesNotMatch(component, /canCreate = \[[^\]]*BOOKING_AGENT/);
  assert.match(templates, /canManage \? contractEditableFields : \[\]/);
  assert.match(panel, /contract-template-reader/);
  assert.match(panel, /Modelo autorizado/);
  assert.match(panel, /Baixar PDF/);
  assert.match(panel, /!canManage \? \(/);
  assert.match(templateFile, /canAccessArtist/);
  assert.match(templateFile, /organizationId/);
  assert.match(templateFile, /attachment/);
});
