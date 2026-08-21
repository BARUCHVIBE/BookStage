import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { accessibleShow } from "@/app/lib/show-access";
import {
  calculateFinancialSummary,
  canManageFinance,
  effectivePaymentStatus,
  normalizeCommissionInput,
  normalizePaymentInput,
  validateCommissionTransition,
  validatePaymentTransition,
  type CommissionStatus,
  type PaymentStatus,
} from "@/app/lib/finance-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

type Payment = {
  id: string;
  description: string;
  amount: number;
  dueDate: string;
  paidAt: string | null;
  status: PaymentStatus;
  notes: string | null;
  createdAt: string;
};
type Commission = {
  id: string;
  userId: string;
  userName: string;
  type: string;
  method: string;
  calculationBase: string;
  percentage: number | null;
  baseAmount: number;
  amount: number;
  status: CommissionStatus;
  createdAt: string;
};

async function financeContext(id: string) {
  const context = await requireActiveMembership();
  if ("error" in context)
    return { ok: false as const, response: context.error };
  if (!canManageFinance(context.membership.role))
    return {
      ok: false as const,
      response: Response.json(
        { error: "Sem permissão para acessar o financeiro do show." },
        { status: 403 },
      ),
    };
  const show = await accessibleShow(
    id,
    context.organizationId,
    context.user.id,
    context.membership.role,
  );
  if (!show)
    return {
      ok: false as const,
      response: Response.json(
        { error: "Show não encontrado." },
        { status: 404 },
      ),
    };
  return { ok: true as const, ...context, show };
}
export async function GET(
  _: Request,
  route: { params: Promise<{ id: string }> },
) {
  const { id } = await route.params,
    context = await financeContext(id);
  if (!context.ok) return context.response;
  const today = new Date().toISOString().slice(0, 10);
  await env.DB.prepare(
    `UPDATE payments SET status='OVERDUE',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND show_id=? AND status='PENDING' AND due_date<?`,
  )
    .bind(context.organizationId, id, today)
    .run();
  const payments = await env.DB.prepare(
    `SELECT id,description,amount,due_date AS dueDate,paid_at AS paidAt,status,notes,created_at AS createdAt FROM payments WHERE organization_id=? AND show_id=? ORDER BY due_date,created_at`,
  )
    .bind(context.organizationId, id)
    .all<Payment>();
  const commissions = await env.DB.prepare(
    `SELECT commission.id,commission.user_id AS userId,user.name AS userName,commission.type,commission.method,commission.calculation_base AS calculationBase,commission.percentage,commission.base_amount AS baseAmount,commission.amount,commission.status,commission.created_at AS createdAt FROM show_commissions commission JOIN users user ON user.id=commission.user_id WHERE commission.organization_id=? AND commission.show_id=? ORDER BY commission.created_at`,
  )
    .bind(context.organizationId, id)
    .all<Commission>();
  const members = await env.DB.prepare(
    `SELECT user.id,user.name,CASE WHEN membership.role='SALES' AND membership.professional_role='BOOKING_AGENT' THEN 'BOOKING_AGENT' ELSE membership.role END AS role FROM memberships membership JOIN users user ON user.id=membership.user_id WHERE membership.organization_id=? AND membership.status='ACTIVE' AND membership.role IN ('OWNER','MANAGER','SALES') ORDER BY user.name`,
  )
    .bind(context.organizationId)
    .all();
  const summary = calculateFinancialSummary(
    context.show.fee || 0,
    payments.results,
    today,
  );
  return Response.json({
    summary,
    payments: payments.results,
    commissions: commissions.results.map((item) => ({
      ...item,
      percentage: item.percentage === null ? null : item.percentage / 100,
    })),
    members: members.results,
  });
}

export async function POST(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const { id } = await route.params,
    context = await financeContext(id);
  if (!context.ok) return context.response;
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (body.entity === "payment") {
    let input;
    try {
      input = normalizePaymentInput(body);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "Pagamento inválido.",
        },
        { status: 400 },
      );
    }
    const active = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS total FROM payments WHERE organization_id=? AND show_id=? AND status<>'CANCELLED'`,
    )
      .bind(context.organizationId, id)
      .first<{ total: number }>();
    if ((active?.total || 0) + input.amount > (context.show.fee || 0))
      return Response.json(
        {
          error:
            "A soma das parcelas não pode ultrapassar o valor total do show.",
        },
        { status: 409 },
      );
    const status = effectivePaymentStatus(
        "PENDING",
        input.dueDate,
        new Date().toISOString().slice(0, 10),
      ),
      paymentId = crypto.randomUUID();
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO payments (id,organization_id,show_id,description,amount,due_date,status,notes) VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(
        paymentId,
        context.organizationId,
        id,
        input.description,
        input.amount,
        input.dueDate,
        status,
        input.notes,
      ),
      env.DB.prepare(
        `INSERT INTO show_activities (id,organization_id,show_id,type,description,to_value,created_by) VALUES (?,?,?,'PAYMENT_CREATED','Parcela financeira criada.',?,?)`,
      ).bind(
        crypto.randomUUID(),
        context.organizationId,
        id,
        String(input.amount),
        context.user.id,
      ),
    ]);
    return Response.json({ ok: true, id: paymentId }, { status: 201 });
  }
  if (body.entity === "commission") {
    let input;
    try {
      input = normalizeCommissionInput(body, context.show.fee);
    } catch (error) {
      return Response.json(
        {
          error: error instanceof Error ? error.message : "Comissão inválida.",
        },
        { status: 400 },
      );
    }
    const member = await env.DB.prepare(
      `SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND status='ACTIVE' AND role IN ('OWNER','MANAGER','SALES')`,
    )
      .bind(context.organizationId, input.userId)
      .first();
    if (!member)
      return Response.json(
        { error: "Comercial inválido para esta organização." },
        { status: 400 },
      );
    const commissionId = crypto.randomUUID();
    try {
      await env.DB.batch([
        env.DB.prepare(
          `INSERT INTO show_commissions (id,organization_id,show_id,opportunity_id,user_id,type,method,calculation_base,percentage,base_amount,amount,status,source,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,'ESTIMATED','MANUAL',?,?)`,
        ).bind(
          commissionId,
          context.organizationId,
          id,
          context.show.opportunityId,
          input.userId,
          input.type,
          input.method,
          input.calculationBase,
          input.percentage,
          input.baseAmount,
          input.amount,
          input.notes,
          context.user.id,
        ),
        env.DB.prepare(
          `INSERT INTO show_activities (id,organization_id,show_id,type,description,to_value,created_by) VALUES (?,?,?,'COMMISSION_CREATED','Comissão comercial criada.',?,?)`,
        ).bind(
          crypto.randomUUID(),
          context.organizationId,
          id,
          String(input.amount),
          context.user.id,
        ),
      ]);
    } catch (error) {
      if (String(error).includes("UNIQUE"))
        return Response.json(
          { error: "Este usuário já possui comissão neste show." },
          { status: 409 },
        );
      throw error;
    }
    return Response.json(
      { ok: true, id: commissionId, amount: input.amount },
      { status: 201 },
    );
  }
  return Response.json(
    { error: "Tipo de lançamento inválido." },
    { status: 400 },
  );
}

export async function PATCH(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const { id } = await route.params,
    context = await financeContext(id);
  if (!context.ok) return context.response;
  const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >,
    recordId = typeof body.id === "string" ? body.id : "";
  if (!recordId)
    return Response.json({ error: "Lançamento inválido." }, { status: 400 });
  if (body.entity === "payment") {
    const current = await env.DB.prepare(
      `SELECT id,description,amount,due_date AS dueDate,status FROM payments WHERE id=? AND show_id=? AND organization_id=?`,
    )
      .bind(recordId, id, context.organizationId)
      .first<{
        id: string;
        description: string;
        amount: number;
        dueDate: string;
        status: PaymentStatus;
      }>();
    if (!current)
      return Response.json(
        { error: "Pagamento não encontrado." },
        { status: 404 },
      );
    let next;
    try {
      next = validatePaymentTransition(current.status, body.status);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Status inválido." },
        { status: 409 },
      );
    }
    const paidAt = next === "PAID" ? new Date().toISOString() : null;
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE payments SET status=?,paid_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND show_id=? AND organization_id=?`,
      ).bind(next, paidAt, recordId, id, context.organizationId),
      env.DB.prepare(
        `INSERT INTO show_activities (id,organization_id,show_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,'PAYMENT_STATUS_CHANGED','Status de pagamento atualizado.',?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        context.organizationId,
        id,
        current.status,
        next,
        context.user.id,
      ),
    ]);
    return Response.json({ ok: true, status: next });
  }
  if (body.entity === "commission") {
    const current = await env.DB.prepare(
      `SELECT id,status FROM show_commissions WHERE id=? AND show_id=? AND organization_id=?`,
    )
      .bind(recordId, id, context.organizationId)
      .first<{ id: string; status: CommissionStatus }>();
    if (!current)
      return Response.json(
        { error: "Comissão não encontrada." },
        { status: 404 },
      );
    let next;
    try {
      next = validateCommissionTransition(current.status, body.status);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Status inválido." },
        { status: 409 },
      );
    }
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE show_commissions SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND show_id=? AND organization_id=?`,
      ).bind(next, recordId, id, context.organizationId),
      env.DB.prepare(
        `INSERT INTO show_activities (id,organization_id,show_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,'COMMISSION_STATUS_CHANGED','Status da comissão atualizado.',?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        context.organizationId,
        id,
        current.status,
        next,
        context.user.id,
      ),
    ]);
    return Response.json({ ok: true, status: next });
  }
  return Response.json(
    { error: "Tipo de lançamento inválido." },
    { status: 400 },
  );
}
