import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  canAccessOpportunity,
  canCloseOpportunity,
  opportunityStages,
  parseProposedValue,
  validateOpportunityStage,
  validateStageChange,
} from "../app/lib/opportunity-rules";

test("pipeline contém todas as etapas comerciais na ordem definida", () => {
  assert.deepEqual(opportunityStages, [
    "NEW",
    "CONTACTED",
    "QUALIFIED",
    "PROPOSAL",
    "NEGOTIATION",
    "DATE_OPTION",
    "CONTRACT",
    "CLOSED_WON",
    "CLOSED_LOST",
  ]);
  assert.equal(validateOpportunityStage("NEGOTIATION"), "NEGOTIATION");
  assert.throws(() => validateOpportunityStage("INVALID"), /inválida/);
});
test("somente gestão ou SALES validador comercial conclui a venda", () => {
  assert.equal(canCloseOpportunity("OWNER", "owner", null), true);
  assert.equal(canCloseOpportunity("MANAGER", "manager", null), true);
  assert.equal(canCloseOpportunity("SALES", "ana", "ana"), true);
  assert.equal(canCloseOpportunity("SALES", "outro", "ana"), false);
  assert.equal(canCloseOpportunity("BOOKING_AGENT", "booking", "booking"), false);
  assert.equal(canCloseOpportunity("FINANCE", "finance", "finance"), false);
});
test("fechamento perdido exige motivo", () => {
  assert.throws(() => validateStageChange("CLOSED_LOST", ""), /motivo/);
  assert.equal(
    validateStageChange("CLOSED_LOST", "Sem orçamento"),
    "Sem orçamento",
  );
  assert.equal(validateStageChange("CLOSED_WON", "ignorado"), null);
});
test("valor proposto é persistido em centavos", () => {
  assert.equal(parseProposedValue(1250000), 1250000);
  assert.equal(parseProposedValue(""), null);
  assert.throws(() => parseProposedValue(-1), /inválido/);
});
test("gestão vê o tenant, comercial vê atribuídas/originadas e FINANCE possui leitura", () => {
  assert.equal(canAccessOpportunity("OWNER", null, "owner"), true);
  assert.equal(canAccessOpportunity("MANAGER", "sales-b", "manager"), true);
  assert.equal(canAccessOpportunity("SALES", "sales-a", "sales-a"), true);
  assert.equal(
    canAccessOpportunity("BOOKING_AGENT", "sales-b", "sales-a", "sales-a"),
    true,
  );
  assert.equal(canAccessOpportunity("SALES", "sales-b", "sales-a"), false);
  assert.equal(canAccessOpportunity("FINANCE", "sales", "finance"), true);
});
test("migration preserva solicitações e impõe chaves compostas de tenant", async () => {
  const sql = await readFile(
    new URL("../drizzle/0006_slow_midnight.sql", import.meta.url),
    "utf8",
  );
  assert.match(
    sql,
    /INSERT INTO `opportunities`[\s\S]+FROM `booking_requests`/,
  );
  assert.match(sql, /FOREIGN KEY \(`artist_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`customer_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`organization_id`,`assigned_user_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`opportunity_id`,`organization_id`\)/);
});
test("rota pública cria oportunidade, histórico e herda responsável", async () => {
  const source = await readFile(
    new URL(
      "../app/api/public/catalog/[organizationSlug]/[artistSlug]/requests/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  assert.match(source, /INSERT INTO opportunities/);
  assert.match(source, /INSERT INTO opportunity_activities/);
  assert.match(source, /getArtistPrimaryCommercial/);
  assert.match(source, /PUBLIC_CATALOG/);
});
test("consultas internas protegem organização e escopo SALES", async () => {
  const list = await readFile(
      new URL("../app/api/opportunities/route.ts", import.meta.url),
      "utf8",
    ),
    detail = await readFile(
      new URL("../app/api/opportunities/[id]/route.ts", import.meta.url),
      "utf8",
    );
  assert.match(list, /opportunity\.organization_id=\?/);
  assert.match(list, /opportunity\.assigned_user_id=\?/);
  assert.match(detail, /id=\? AND organization_id=\?/);
  assert.match(detail, /canAccessOpportunity/);
  assert.match(detail, /organization_id=\? AND user_id=\?/);
});

test("Booking visualiza pipeline reduzido sem apagar estados internos", async () => {
  const [component, rules] = await Promise.all([
    readFile(new URL("../app/components/crm-module.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/opportunity-rules.ts", import.meta.url), "utf8"),
  ]);
  assert.match(component, /bookingStages = \["DATE_OPTION", "PROPOSAL", "CONTRACT"\]/);
  assert.match(component, /role === "BOOKING_AGENT" \? bookingStages : stages/);
  assert.match(component, /Marcar negociação como perdida/);
  assert.match(rules, /"CLOSED_WON"/);
  assert.match(rules, /"CLOSED_LOST"/);
});

test("cachê proposto usa o campo existente e registra valores na timeline", async () => {
  const [component, opportunityRoute, proposalRoute] = await Promise.all([
    readFile(new URL("../app/components/crm-module.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/opportunities/[id]/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/opportunities/[id]/proposals/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(component, /Cachê proposto \(R\$\)/);
  assert.doesNotMatch(component, /Valor inicial \(R\$\)/);
  assert.match(opportunityRoute, /Cachê proposto alterado de/);
  assert.match(proposalRoute, /proposed_value=\?/);
});

test("proposta e contrato inferem automaticamente o estágio", async () => {
  const [proposal, contract] = await Promise.all([
    readFile(
      new URL("../app/api/opportunities/[id]/proposals/route.ts", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/api/contracts/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(proposal, /THEN 'PROPOSAL'/);
  assert.match(contract, /THEN 'CONTRACT'/);
});

test("Booking não avança etapas manualmente e usa as ações do fluxo", async () => {
  const [route, component] = await Promise.all([
    readFile(new URL("../app/api/opportunities/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/components/crm-module.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /body\.stage !== current\.stage/);
  assert.match(route, /body\.stage !== "CLOSED_LOST"/);
  assert.match(route, /A etapa é atualizada automaticamente/);
  assert.match(component, /disabled=\{data\.role === "BOOKING_AGENT"\}/);
});

test("lista e detalhe do CRM preservam as cores semânticas das etapas", async () => {
  const [component, css] = await Promise.all([
    readFile(new URL("../app/components/crm-module.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);
  assert.match(
    component,
    /pipeline-badge stage-\$\{item\.stage\.toLowerCase\(\)\}/,
  );
  for (const stage of [
    "new",
    "contacted",
    "qualified",
    "proposal",
    "negotiation",
    "date_option",
    "contract",
    "closed_won",
    "closed_lost",
  ])
    assert.match(css, new RegExp(`\\.stage-${stage}\\s*\\{`));
  const badgeBlock = css.match(/\.pipeline-badge\s*\{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.doesNotMatch(badgeBlock, /--stage-color\s*:/);
  assert.match(badgeBlock, /var\(--stage-color, var\(--pipeline-neutral\)\)/);
});
