import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  canManageFinance,
  effectivePaymentStatus,
  normalizePaymentInput,
  normalizeReceiptInput,
  paymentSituation,
  type PaymentStatus,
} from "@/app/lib/finance-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

async function paymentContext(id: string) {
  const context = await requireActiveMembership();
  if ("error" in context) return { ok: false as const, response: context.error };
  if (!canManageFinance(context.membership.role))
    return { ok: false as const, response: Response.json({ error: "Somente Financeiro ou Proprietário pode registrar recebimentos." }, { status: 403 }) };
  const opportunity = await env.DB.prepare(
    `SELECT opportunity.id,opportunity.proposed_value AS proposedValue,opportunity.stage,show.id AS showId FROM opportunities opportunity LEFT JOIN shows show ON show.opportunity_id=opportunity.id AND show.organization_id=opportunity.organization_id WHERE opportunity.id=? AND opportunity.organization_id=?`,
  ).bind(id, context.organizationId).first<{ id: string; proposedValue: number | null; stage: string; showId: string | null }>();
  if (!opportunity)
    return { ok: false as const, response: Response.json({ error: "Oportunidade não encontrada." }, { status: 404 }) };
  return { ok: true as const, ...context, opportunity };
}

export async function GET(_: Request, route: { params: Promise<{ id: string }> }) {
  const { id } = await route.params, context = await paymentContext(id);
  if (!context.ok) return context.response;
  const today = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(`UPDATE payments SET status='OVERDUE',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND opportunity_id=? AND status='PENDING' AND due_date<?`).bind(context.organizationId, id, today).run();
  const rows = await env.DB.prepare(
    `SELECT payment.id,payment.description,payment.amount,payment.due_date AS dueDate,payment.paid_at AS paidAt,payment.status,payment.notes,payment.show_id AS showId,payment.created_at AS createdAt,COALESCE(SUM(receipt.amount),0) AS receivedAmount FROM payments payment LEFT JOIN payment_receipts receipt ON receipt.payment_id=payment.id AND receipt.organization_id=payment.organization_id WHERE payment.organization_id=? AND payment.opportunity_id=? GROUP BY payment.id ORDER BY payment.due_date,payment.created_at`,
  ).bind(context.organizationId, id).all<{ id: string; description: string; amount: number; dueDate: string; paidAt: string | null; status: PaymentStatus; notes: string | null; showId: string | null; createdAt: string; receivedAmount: number }>();
  const payments = rows.results.map((item) => ({ ...item, status: effectivePaymentStatus(item.status, item.dueDate, today), balance: Math.max(item.amount - Number(item.receivedAmount), 0) }));
  const active = payments.filter((item) => item.status !== "CANCELLED"), scheduled = active.reduce((sum, item) => sum + item.amount, 0), received = active.reduce((sum, item) => sum + Number(item.receivedAmount), 0), overdueCount = active.filter((item) => item.status === "OVERDUE" && item.balance > 0).length;
  return Response.json({ payments, summary: { totalValue: context.opportunity.proposedValue || 0, scheduled, received, balance: Math.max((context.opportunity.proposedValue || 0) - received, 0), nextDueDate: active.filter((item) => item.balance > 0).map((item) => item.dueDate).sort()[0] || null, overdueCount, situation: paymentSituation(scheduled, received, overdueCount) } });
}

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const { id } = await route.params, context = await paymentContext(id);
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (body.entity === "installment") {
    let input; try { input = normalizePaymentInput(body); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Parcela inválida." }, { status: 400 }); }
    const paymentId = crypto.randomUUID(), status = effectivePaymentStatus("PENDING", input.dueDate, new Date().toISOString().slice(0, 10));
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO payments (id,organization_id,opportunity_id,show_id,description,amount,due_date,status,notes) VALUES (?,?,?,?,?,?,?,?,?)`).bind(paymentId,context.organizationId,id,context.opportunity.showId,input.description,input.amount,input.dueDate,status,input.notes),
        env.DB.prepare(`INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,'PAYMENT_CREATED','Parcela financeira criada.',?,?)`).bind(crypto.randomUUID(),context.organizationId,id,String(input.amount),context.user.id),
      ]);
    } catch (error) { if (String(error).includes("PAYMENT_TOTAL_EXCEEDED")) return Response.json({ error: "A soma das parcelas não pode ultrapassar o valor combinado." }, { status: 409 }); throw error; }
    return Response.json({ ok: true, id: paymentId }, { status: 201 });
  }
  if (body.entity === "receipt") {
    let input; try { input = normalizeReceiptInput(body); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Recebimento inválido." }, { status: 400 }); }
    const paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
    const payment = await env.DB.prepare(`SELECT id,status FROM payments WHERE id=? AND opportunity_id=? AND organization_id=? AND status<>'CANCELLED'`).bind(paymentId,id,context.organizationId).first<{ id: string; status: string }>();
    if (!payment) return Response.json({ error: "Parcela não encontrada." }, { status: 404 });
    try {
      await env.DB.batch([
        env.DB.prepare(`INSERT INTO payment_receipts (id,organization_id,payment_id,opportunity_id,amount,received_at,method,notes,idempotency_key,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(),context.organizationId,paymentId,id,input.amount,input.receivedAt,input.method,input.notes,input.idempotencyKey,context.user.id),
        env.DB.prepare(`INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,'PAYMENT_RECEIVED',?, ?,?)`).bind(crypto.randomUUID(),context.organizationId,id,`Recebimento de ${new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(input.amount/100)} registrado em ${input.receivedAt}.`,String(input.amount),context.user.id),
      ]);
    } catch (error) {
      const message = String(error);
      if (message.includes("idx_payment_receipt_idempotency") || message.includes("UNIQUE constraint failed: payment_receipts.organization_id, payment_receipts.idempotency_key")) return Response.json({ ok: true, duplicate: true });
      if (message.includes("PAYMENT_RECEIPT_TOTAL_EXCEEDED")) return Response.json({ error: "O valor recebido ultrapassa o saldo desta parcela." }, { status: 409 });
      throw error;
    }
    return Response.json({ ok: true }, { status: 201 });
  }
  return Response.json({ error: "Tipo de lançamento inválido." }, { status: 400 });
}

export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const { id } = await route.params, context = await paymentContext(id);
  if (!context.ok) return context.response;
  const body = await request.json().catch(() => ({})) as Record<string, unknown>, paymentId = typeof body.paymentId === "string" ? body.paymentId : "";
  const payment = await env.DB.prepare(`SELECT payment.id,COALESCE(SUM(receipt.amount),0) AS received FROM payments payment LEFT JOIN payment_receipts receipt ON receipt.payment_id=payment.id AND receipt.organization_id=payment.organization_id WHERE payment.id=? AND payment.opportunity_id=? AND payment.organization_id=? GROUP BY payment.id`).bind(paymentId,id,context.organizationId).first<{ id: string; received: number }>();
  if (!payment) return Response.json({ error: "Parcela não encontrada." }, { status: 404 });
  if (Number(payment.received)>0) return Response.json({ error: "Uma parcela com recebimentos confirmados não pode ser cancelada." }, { status: 409 });
  await env.DB.batch([
    env.DB.prepare(`UPDATE payments SET status='CANCELLED',updated_at=CURRENT_TIMESTAMP WHERE id=? AND opportunity_id=? AND organization_id=?`).bind(paymentId,id,context.organizationId),
    env.DB.prepare(`INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,created_by) VALUES (?,?,?,'PAYMENT_CANCELLED','Parcela financeira cancelada.',?)`).bind(crypto.randomUUID(),context.organizationId,id,context.user.id),
  ]);
  return Response.json({ ok: true });
}
