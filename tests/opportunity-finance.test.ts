import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { fetchJson } from "../app/lib/http-client";
import {
  calculateOpportunityMargin,
  canApproveOpportunityFinance,
  canManageOpportunityCommissions,
  canManageOpportunityFinancialItems,
  normalizeFinancialItem,
} from "../app/lib/opportunity-finance-rules";
import { normalizeCommissionInput } from "../app/lib/finance-rules";

test("resultado separa custos e comissões sem dupla contagem", () => {
  const transport = normalizeFinancialItem({
    kind: "COST",
    category: "TRANSPORT",
    description: "Transporte até o local do show",
    quantity: 100,
    unitAmount: 25_000,
  });
  const summary = calculateOpportunityMargin(
    [
      transport,
      {
        kind: "COST",
        category: "COMMISSION",
        quantity: 100,
        unitAmount: 100_000,
        totalAmount: 100_000,
        status: "ESTIMATED",
      },
    ],
    1_000_000,
  );
  assert.deepEqual(
    {
      revenue: summary.grossRevenue,
      costs: summary.costs,
      commissions: summary.commissions,
      result: summary.result,
      margin: summary.marginPercentage,
    },
    {
      revenue: 1_000_000,
      costs: 25_000,
      commissions: 100_000,
      result: 875_000,
      margin: 87.5,
    },
  );
});

test("receita adicional complementa o cachê sem duplicar a receita base", () => {
  const additional = normalizeFinancialItem({
    kind: "REVENUE",
    category: "ADDITIONAL",
    description: "Participação adicional",
    quantity: 100,
    unitAmount: 200_000,
  });
  assert.equal(
    calculateOpportunityMargin([additional], 1_000_000).grossRevenue,
    1_200_000,
  );
});

test("FINANCE possui capacidades financeiras sem receber gestão administrativa", () => {
  assert.equal(canManageOpportunityFinancialItems("FINANCE"), true);
  assert.equal(canManageOpportunityCommissions("FINANCE"), true);
  assert.equal(canApproveOpportunityFinance("FINANCE"), true);
  assert.equal(canManageOpportunityCommissions("SALES"), false);
  assert.equal(canApproveOpportunityFinance("BOOKING_AGENT"), false);
  assert.equal(canManageOpportunityFinancialItems("PRODUCTION"), false);
});

test("comissão aceita o beneficiário e calcula percentual em centavos", () => {
  assert.deepEqual(
    normalizeCommissionInput(
      {
        beneficiaryUserId: "booking-b",
        type: "REFERRAL",
        method: "PERCENTAGE",
        percentage: 10,
      },
      1_000_000,
    ),
    {
      userId: "booking-b",
      type: "REFERRAL",
      method: "PERCENTAGE",
      calculationBase: "GROSS_REVENUE",
      percentage: 1000,
      baseAmount: 1_000_000,
      amount: 100_000,
      notes: null,
    },
  );
});

test("membership composta mantém beneficiário no tenant da Opportunity", () => {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE memberships (
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      PRIMARY KEY (organization_id,user_id)
    );
    CREATE TABLE commissions (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      FOREIGN KEY (organization_id,user_id)
        REFERENCES memberships(organization_id,user_id)
    );
    INSERT INTO memberships VALUES ('org-a','joao'),('org-b','joao');
    INSERT INTO commissions VALUES ('commission-b','org-b','joao');
  `);
  assert.deepEqual(
    database
      .prepare("SELECT organization_id,user_id FROM commissions")
      .get(),
    Object.assign(Object.create(null), {
      organization_id: "org-b",
      user_id: "joao",
    }),
  );
  assert.throws(() =>
    database.exec(
      "INSERT INTO commissions VALUES ('commission-c','org-c','joao')",
    ),
  );
  database.close();
});

test("cliente HTTP preserva status quando erro retorna body vazio", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 500 });
  try {
    const result = await fetchJson("https://bookstage.test/api/failure");
    assert.equal(result.ok, false);
    assert.equal(result.status, 500);
    assert.match(result.error || "", /HTTP 500/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("rotas usam tenant real, beneficiários mínimos e respostas JSON controladas", async () => {
  const [commissions, finance, shell, component, bootstrap, migration, integrity] =
    await Promise.all([
      readFile(
        new URL(
          "../app/api/opportunities/[id]/commissions/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/opportunities/[id]/finance/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(new URL("../app/bookstage-app.tsx", import.meta.url), "utf8"),
      readFile(
        new URL("../app/components/opportunity-governance.tsx", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../db/bootstrap.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../drizzle/0022_remove_legacy_commission_triggers.sql",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL(
          "../drizzle/0023_modern_commission_integrity.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  assert.match(commissions, /membership\.organization_id=\?/);
  assert.match(commissions, /beneficiaries/);
  assert.match(commissions, /professionalRole/);
  assert.match(commissions, /Failed to create opportunity commission/);
  assert.match(
    commissions,
    /financial_approval_status='APPROVED' THEN 'CHANGES_REQUESTED'/,
  );
  assert.match(finance, /item\.organization_id=\?/);
  assert.match(finance, /item\.opportunity_id=\?/);
  assert.match(shell, /\["OWNER", "MANAGER"\]\.includes\(active\.role\)/);
  assert.match(component, /fetchJson/);
  assert.match(component, /financeError/);
  assert.match(component, /commissionError/);
  assert.doesNotMatch(bootstrap, /SELECT fee FROM shows/);
  assert.match(migration, /DROP TRIGGER IF EXISTS `trg_commission_amount_insert`/);
  assert.match(integrity, /NEW\.base_amount\*NEW\.percentage/);
  assert.doesNotMatch(integrity, /SELECT fee FROM shows/);
});
