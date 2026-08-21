import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { canViewArtist } from "../app/lib/artist-access";
import { canManageCalendar, canViewCalendar } from "../app/lib/calendar-rules";
import {
  calculateOpportunityMargin,
  calculateItemTotal,
  normalizeFinancialItem,
} from "../app/lib/opportunity-finance-rules";
import {
  canAccessOpportunity,
  canEditOpportunity,
} from "../app/lib/opportunity-rules";
import {
  normalizeCommissionInput,
  validateCommissionTransition,
} from "../app/lib/finance-rules";
import { effectiveRole, storedRole } from "../app/lib/tenant";

test("Booking Agent usa papel profissional sobre a permissão comercial base", () => {
  assert.equal(effectiveRole("SALES", "BOOKING_AGENT"), "BOOKING_AGENT");
  assert.deepEqual(storedRole("BOOKING_AGENT"), {
    baseRole: "SALES",
    professionalRole: "BOOKING_AGENT",
  });
  assert.equal(canViewArtist("BOOKING_AGENT", true), true);
  assert.equal(canViewArtist("BOOKING_AGENT", false), false);
});
test("agenda exige atribuição e Booking Agent não ganha acesso global implícito", () => {
  assert.equal(canViewCalendar("BOOKING_AGENT", true), true);
  assert.equal(canManageCalendar("BOOKING_AGENT", true), true);
  assert.equal(canViewCalendar("BOOKING_AGENT", false), false);
  assert.equal(canManageCalendar("BOOKING_AGENT", false), false);
});
test("originador permanece com leitura mesmo após troca do responsável", () => {
  assert.equal(
    canAccessOpportunity("BOOKING_AGENT", "maria", "joao", "joao"),
    true,
  );
  assert.equal(
    canAccessOpportunity("BOOKING_AGENT", "maria", "pedro", "joao"),
    false,
  );
  assert.equal(canAccessOpportunity("FINANCE", "maria", "finance", null), true);
  assert.equal(canEditOpportunity("FINANCE", "maria", "finance", null), false);
  assert.equal(
    canAccessOpportunity("SALES", "maria", "validador", "joao", "validador"),
    true,
  );
});
test("itens financeiros e margem são calculados no backend em centavos", () => {
  assert.equal(calculateItemTotal(250, 8_000), 20_000);
  const transport = normalizeFinancialItem({
    kind: "COST",
    category: "TRANSPORT",
    description: "Van",
    quantity: 100,
    unitAmount: 8_000,
  });
  const summary = calculateOpportunityMargin(
    [
      {
        kind: "REVENUE",
        category: "FEE",
        quantity: 100,
        unitAmount: 100_000,
        totalAmount: 100_000,
        status: "ESTIMATED",
      },
      transport,
    ],
    0,
  );
  assert.deepEqual(summary, {
    grossRevenue: 100_000,
    costs: 8_000,
    taxes: 0,
    commissions: 0,
    result: 92_000,
    marginAmount: 92_000,
    marginPercentage: 92,
  });
});
test("comissões suportam múltiplos tipos, percentual, fixo e ciclo financeiro", () => {
  assert.deepEqual(
    normalizeCommissionInput(
      {
        userId: "joao",
        type: "REFERRAL",
        method: "PERCENTAGE",
        calculationBase: "GROSS_REVENUE",
        percentage: 2,
      },
      100_000,
    ),
    {
      userId: "joao",
      type: "REFERRAL",
      method: "PERCENTAGE",
      calculationBase: "GROSS_REVENUE",
      percentage: 200,
      baseAmount: 100_000,
      amount: 2_000,
      notes: null,
    },
  );
  assert.equal(
    normalizeCommissionInput(
      { userId: "maria", type: "CLOSING", method: "FIXED", amount: 1_500 },
      100_000,
    ).amount,
    1_500,
  );
  assert.equal(
    validateCommissionTransition("ESTIMATED", "APPROVED"),
    "APPROVED",
  );
  assert.throws(() => validateCommissionTransition("PAID", "APPROVED"));
});
test("rotas críticas escopam tenant, artista, autoaprovação, referral e confirmação", async () => {
  const [approval, referral, referralRules, request, opportunity, calendar] =
    await Promise.all([
      readFile(
        new URL(
          "../app/api/opportunities/[id]/approvals/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/api/referral-links/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(new URL("../app/lib/referrals.ts", import.meta.url), "utf8"),
      readFile(
        new URL(
          "../app/api/public/catalog/[organizationSlug]/[artistSlug]/requests/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
      readFile(
        new URL("../app/api/opportunities/[id]/route.ts", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../app/api/opportunities/[id]/calendar/route.ts",
          import.meta.url,
        ),
        "utf8",
      ),
    ]);
  assert.match(approval, /organization_id=\?/);
  assert.match(approval, /commercialValidatorUserId/);
  assert.match(approval, /membership\.role === "SALES"/);
  assert.match(approval, /assigned_user_id=CASE WHEN/);
  assert.match(
    approval,
    /kind === "COMMERCIAL"[\s\S]*?\["OWNER", "MANAGER"\][\s\S]*?membership\.role === "SALES"/,
  );
  assert.match(referral, /canAccessArtist/);
  assert.match(referral, /token_hash/);
  assert.match(referralRules, /expires_at>CURRENT_TIMESTAMP/);
  assert.match(referralRules, /revoked_at IS NULL/);
  assert.match(referralRules, /membership.status='ACTIVE'/);
  assert.match(request, /validReferralToken/);
  assert.match(request, /originator_user_id/);
  assert.match(opportunity, /commercialApprovalStatus\s*!==\s*"APPROVED"/);
  assert.match(opportunity, /financialApprovalStatus\s*!==\s*"APPROVED"/);
  assert.match(calendar, /canAccessArtist/);
  assert.match(calendar, /option_expires_at/);
});
test("migration incremental preserva legado e cria estruturas sem reset", async () => {
  const sql = await readFile(
    new URL("../drizzle/0013_lowly_lily_hollister.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE `commercial_referral_links`/);
  assert.match(sql, /CREATE TABLE `opportunity_approvals`/);
  assert.match(sql, /CREATE TABLE `opportunity_financial_items`/);
  assert.match(sql, /CREATE TABLE `membership_activities`/);
  assert.match(sql, /CASE commission\.status/);
  assert.match(
    sql,
    /assigned_user_id","assigned_user_id",NULL,NULL,'NOT_REQUESTED'/,
  );
  assert.doesNotMatch(sql, /DROP TABLE `users`/);
});

test("detalhe da equipe devolve o id usado para salvar e gerar links", async () => {
  const route = await readFile(
    new URL(
      "../app/api/organizations/[id]/members/[userId]/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const component = await readFile(
    new URL("../app/components/team-module.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /SELECT user\.id,membership\.role AS baseRole/);
  assert.match(component, /selected\?\.member\.id/);
  assert.doesNotMatch(component, /members\/undefined/);
});

test("Owner cria credencial de Booking com artistas do próprio tenant", async () => {
  const [route, auth, component] = await Promise.all([
    readFile(
      new URL(
        "../app/api/organizations/[id]/members/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(new URL("../app/lib/local-auth.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/team-module.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(route, /export async function POST/);
  assert.match(route, /role='OWNER'/);
  assert.match(route, /lower\(email\)=\?/);
  assert.match(route, /organization_id=\?[\s\S]*id IN/);
  assert.match(route, /professional_role[\s\S]*BOOKING_AGENT/);
  assert.match(route, /INSERT INTO auth_credentials/);
  assert.match(route, /booking_collaborator_artist_access/);
  assert.match(auth, /createPasswordCredential/);
  assert.match(auth, /PBKDF2/);
  assert.match(component, /Adicionar Booking/);
  assert.match(component, /type="password"/);
});

test("equipe separa membros internos de Booking e permite gestão segura", async () => {
  const [collectionRoute, detailRoute, component] = await Promise.all([
    readFile(
      new URL(
        "../app/api/organizations/[id]/members/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL(
        "../app/api/organizations/[id]/members/[userId]/route.ts",
        import.meta.url,
      ),
      "utf8",
    ),
    readFile(
      new URL("../app/components/team-module.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(component, /Membros da empresa/);
  assert.match(component, /Colaboradores de Booking/);
  assert.match(component, /Adicionar membro/);
  assert.match(component, /Remover acesso/);
  assert.match(collectionRoute, /"MANAGER", "SALES", "BOOKING_AGENT"/);
  assert.match(collectionRoute, /"PRODUCTION", "FINANCE"/);
  assert.match(collectionRoute, /INSERT INTO artist_sales_assignments/);
  assert.match(detailRoute, /export async function DELETE/);
  assert.match(detailRoute, /Você não pode remover o próprio acesso/);
  assert.match(detailRoute, /is_primary=1/);
  assert.match(
    detailRoute,
    /assigned_user_id=\? OR commercial_validator_user_id=\?/,
  );
  assert.match(detailRoute, /UPDATE memberships SET status='INACTIVE'/);
  assert.match(detailRoute, /commercial_referral_links SET status='REVOKED'/);
});
