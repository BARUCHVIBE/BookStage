import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { normalizeReceiptInput, paymentSituation } from "../app/lib/finance-rules";

test("recebimento exige centavos positivos, data, método e idempotência", () => {
  assert.deepEqual(normalizeReceiptInput({ amount: 25000, receivedAt: "2026-09-16", method: "pix", idempotencyKey: "once" }), { amount: 25000, receivedAt: "2026-09-16", method: "PIX", notes: null, idempotencyKey: "once" });
  assert.throws(() => normalizeReceiptInput({ amount: 0, receivedAt: "2026-09-16", method: "PIX", idempotencyKey: "x" }), /inválido/);
  assert.throws(() => normalizeReceiptInput({ amount: 1, receivedAt: "16/09/2026", method: "PIX", idempotencyKey: "x" }), /data efetiva/);
});

test("situação financeira diferencia ausência, parcial, vencido e quitado", () => {
  assert.equal(paymentSituation(0, 0, 0), "Sem parcelas definidas");
  assert.equal(paymentSituation(100, 20, 0), "Recebido parcialmente");
  assert.equal(paymentSituation(100, 20, 1), "Recebido parcialmente · vencido");
  assert.equal(paymentSituation(100, 100, 0), "Quitado");
});

test("migration preserva pagos legados e protege saldo e idempotência", async () => {
  const sql = await readFile(new URL("../drizzle/0025_opportunity_receipts.sql", import.meta.url), "utf8");
  assert.match(sql, /WHERE status='PAID'/);
  assert.match(sql, /'legacy:' \|\| id/);
  assert.match(sql, /idx_payment_receipt_idempotency/);
  assert.match(sql, /PAYMENT_RECEIPT_TOTAL_EXCEEDED/);
  assert.match(sql, /opportunity_id/);
});
