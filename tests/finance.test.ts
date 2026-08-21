import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calculateFinancialSummary, canManageFinance, effectivePaymentStatus, normalizeCommissionInput, normalizePaymentInput, validateCommissionTransition, validatePaymentTransition } from "../app/lib/finance-rules";

test("pagamentos parciais e totais calculam recebido e saldo do show", () => {
  const partial = calculateFinancialSummary(100_000, [{ amount: 40_000, dueDate: "2026-08-10", status: "PAID" }, { amount: 60_000, dueDate: "2026-09-10", status: "PENDING" }], "2026-08-20");
  assert.deepEqual({ received: partial.received, pending: partial.pending, next: partial.nextDueDate }, { received: 40_000, pending: 60_000, next: "2026-09-10" });
  const total = calculateFinancialSummary(100_000, [{ amount: 100_000, dueDate: "2026-08-10", status: "PAID" }], "2026-08-20");
  assert.equal(total.received, 100_000); assert.equal(total.pending, 0); assert.equal(total.nextDueDate, null);
});

test("vencidos são identificados e cancelados não alteram os totais", () => {
  assert.equal(effectivePaymentStatus("PENDING", "2026-08-19", "2026-08-20"), "OVERDUE");
  const summary = calculateFinancialSummary(100_000, [{ amount: 25_000, dueDate: "2026-08-19", status: "PENDING" }, { amount: 10_000, dueDate: "2026-08-01", status: "CANCELLED" }], "2026-08-20");
  assert.equal(summary.overdueCount, 1); assert.equal(summary.overdueAmount, 25_000); assert.equal(summary.received, 0); assert.equal(summary.pending, 100_000);
});

test("transições de pagamentos e comissões preservam estados terminais", () => {
  assert.equal(validatePaymentTransition("PENDING", "PAID"), "PAID");
  assert.equal(validatePaymentTransition("OVERDUE", "CANCELLED"), "CANCELLED");
  assert.throws(() => validatePaymentTransition("PAID", "CANCELLED"), /não permitida/);
  assert.equal(validateCommissionTransition("PENDING", "PAID"), "PAID");
  assert.throws(() => validateCommissionTransition("CANCELLED", "PAID"), /não permitida/);
});

test("comissão deriva o valor do percentual sobre o cachê", () => {
  assert.deepEqual(normalizeCommissionInput({ userId: "sales-a", percentage: 12.5 }, 200_000), { userId: "sales-a", percentage: 1250, amount: 25_000 });
  assert.throws(() => normalizeCommissionInput({ userId: "sales-a", percentage: 10 }, null), /valor total/);
  assert.throws(() => normalizeCommissionInput({ userId: "sales-a", percentage: 101 }, 200_000), /Percentual/);
});

test("validação de parcela exige valor positivo e vencimento", () => {
  assert.deepEqual(normalizePaymentInput({ description: "Sinal", amount: 50_000, dueDate: "2026-08-30", notes: "ok" }), { description: "Sinal", amount: 50_000, dueDate: "2026-08-30", notes: "ok" });
  assert.throws(() => normalizePaymentInput({ description: "Sinal", amount: 0, dueDate: "2026-08-30" }), /Valor/);
  assert.throws(() => normalizePaymentInput({ description: "Sinal", amount: 1, dueDate: "30/08/2026" }), /vencimento/);
});

test("somente OWNER e FINANCE gerenciam informações financeiras", () => {
  assert.equal(canManageFinance("OWNER"), true); assert.equal(canManageFinance("FINANCE"), true);
  assert.equal(canManageFinance("MANAGER"), false); assert.equal(canManageFinance("SALES"), false); assert.equal(canManageFinance("PRODUCTION"), false);
});

test("migration garante tenant, índices e consistência da comissão no banco", async () => {
  const sql = await readFile(new URL("../drizzle/0011_wild_jetstream.sql", import.meta.url), "utf8");
  assert.match(sql, /CREATE TABLE `payments`/); assert.match(sql, /CREATE TABLE `show_commissions`/);
  assert.match(sql, /FOREIGN KEY \(`show_id`,`organization_id`\)/); assert.match(sql, /FOREIGN KEY \(`organization_id`,`user_id`\)/);
  assert.match(sql, /idx_payments_status_due/); assert.match(sql, /idx_show_commissions_user_tenant/);
  assert.match(sql, /COMMISSION_AMOUNT_MISMATCH/); assert.match(sql, /trg_show_fee_commission_consistency/); assert.match(sql, /PRAGMA optimize/);
});

test("API financeira exige permissão e escopa todos os registros pela organização e show", async () => {
  const route = await readFile(new URL("../app/api/shows/[id]/finance/route.ts", import.meta.url), "utf8");
  assert.match(route, /canManageFinance/); assert.match(route, /accessibleShow/);
  assert.match(route, /organization_id=\? AND show_id=\?/); assert.match(route, /show_id=\? AND organization_id=\?/);
  assert.match(route, /A soma das parcelas não pode ultrapassar o valor total do show/);
  assert.match(route, /membership\.role IN \('OWNER','MANAGER','SALES'\)/);
});
