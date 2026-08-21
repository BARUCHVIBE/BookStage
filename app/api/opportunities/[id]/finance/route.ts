import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { canAccessArtist } from "@/app/lib/member-access";
import {
  calculateOpportunityMargin,
  normalizeFinancialItem,
  type FinancialItem,
} from "@/app/lib/opportunity-finance-rules";
import { canAccessOpportunity } from "@/app/lib/opportunity-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
type Opportunity = {
  artistId: string;
  assignedUserId: string | null;
  originatorUserId: string | null;
  commercialValidatorUserId: string | null;
  proposedValue: number | null;
  commercialApprovalStatus: string;
  financialApprovalStatus: string;
};
async function access(id: string) {
  const context = await requireActiveMembership();
  if ("error" in context) return { error: context.error } as const;
  const opportunity = await env.DB.prepare(
    `SELECT artist_id AS artistId,assigned_user_id AS assignedUserId,originator_user_id AS originatorUserId,commercial_validator_user_id AS commercialValidatorUserId,proposed_value AS proposedValue,commercial_approval_status AS commercialApprovalStatus,financial_approval_status AS financialApprovalStatus FROM opportunities WHERE id=? AND organization_id=?`,
  )
    .bind(id, context.organizationId)
    .first<Opportunity>();
  if (
    !opportunity ||
    !canAccessOpportunity(
      context.membership.role,
      opportunity.assignedUserId,
      context.user.id,
      opportunity.originatorUserId,
      opportunity.commercialValidatorUserId,
    ) ||
    !(await canAccessArtist(
      context.organizationId,
      context.user.id,
      context.membership.role,
      context.membership.artistAccessScope,
      opportunity.artistId,
    ))
  )
    return {
      error: Response.json(
        { error: "Oportunidade não encontrada." },
        { status: 404 },
      ),
    } as const;
  return { context, opportunity } as const;
}
export async function GET(
  _: Request,
  route: { params: Promise<{ id: string }> },
) {
  const { id } = await route.params,
    result = await access(id);
  if ("error" in result) return result.error;
  const items = await env.DB.prepare(
      `SELECT item.id,item.kind,item.category,item.description,item.quantity,item.unit_amount AS unitAmount,item.total_amount AS totalAmount,item.notes,item.responsible_user_id AS responsibleUserId,responsible.name AS responsibleName,item.status,item.created_at AS createdAt,item.updated_at AS updatedAt FROM opportunity_financial_items item LEFT JOIN users responsible ON responsible.id=item.responsible_user_id WHERE item.organization_id=? AND item.opportunity_id=? ORDER BY item.kind DESC,item.created_at`,
    )
      .bind(result.context.organizationId, id)
      .all<FinancialItem>(),
    commission = await env.DB.prepare(
      `SELECT COALESCE(SUM(amount),0) AS total FROM show_commissions WHERE organization_id=? AND opportunity_id=? AND status<>'CANCELLED'`,
    )
      .bind(result.context.organizationId, id)
      .first<{ total: number }>(),
    commissionCost: FinancialItem = {
      kind: "COST",
      category: "COMMISSION",
      quantity: 100,
      unitAmount: Number(commission?.total || 0),
      totalAmount: Number(commission?.total || 0),
      status: "ESTIMATED",
    };
  return Response.json({
    items: items.results,
    summary: calculateOpportunityMargin(
      [
        ...items.results,
        ...(commissionCost.totalAmount ? [commissionCost] : []),
      ],
      result.opportunity.proposedValue || 0,
    ),
    approvalStatus: result.opportunity.financialApprovalStatus,
    canManage: [
      "OWNER",
      "MANAGER",
      "FINANCE",
      "SALES",
      "BOOKING_AGENT",
    ].includes(result.context.membership.role),
  });
}
export async function POST(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const { id } = await route.params,
    result = await access(id);
  if ("error" in result) return result.error;
  if (
    !["OWNER", "MANAGER", "FINANCE", "SALES", "BOOKING_AGENT"].includes(
      result.context.membership.role,
    )
  )
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  if (
    result.context.membership.role === "BOOKING_AGENT" &&
    result.opportunity.commercialApprovalStatus === "APPROVED"
  )
    return Response.json(
      {
        error:
          "A negociação já foi validada e os custos agora são conduzidos pelas equipes internas.",
      },
      { status: 403 },
    );
  let input;
  try {
    input = normalizeFinancialItem(
      (await request.json()) as Record<string, unknown>,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }
  if (input.responsibleUserId) {
    const member = await env.DB.prepare(
      `SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND status='ACTIVE'`,
    )
      .bind(result.context.organizationId, input.responsibleUserId)
      .first();
    if (!member)
      return Response.json(
        { error: "Responsável inválido para esta organização." },
        { status: 400 },
      );
  }
  const itemId = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO opportunity_financial_items (id,organization_id,opportunity_id,kind,category,description,quantity,unit_amount,total_amount,notes,responsible_user_id,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(
      itemId,
      result.context.organizationId,
      id,
      input.kind,
      input.category,
      input.description,
      input.quantity,
      input.unitAmount,
      input.totalAmount,
      input.notes,
      input.responsibleUserId,
      input.status,
      result.context.user.id,
    ),
    env.DB.prepare(
      `UPDATE opportunities SET financial_approval_status=CASE WHEN financial_approval_status='APPROVED' THEN 'CHANGES_REQUESTED' ELSE financial_approval_status END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
    ).bind(id, result.context.organizationId),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,'FINANCIAL_ITEM_CREATED','Item financeiro criado.',?,?)`,
    ).bind(
      crypto.randomUUID(),
      result.context.organizationId,
      id,
      String(input.totalAmount),
      result.context.user.id,
    ),
  ]);
  return Response.json({ id: itemId }, { status: 201 });
}
export async function PATCH(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const { id } = await route.params,
    result = await access(id);
  if ("error" in result) return result.error;
  if (
    !["OWNER", "MANAGER", "FINANCE", "SALES", "BOOKING_AGENT"].includes(
      result.context.membership.role,
    )
  )
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  if (
    result.context.membership.role === "BOOKING_AGENT" &&
    result.opportunity.commercialApprovalStatus === "APPROVED"
  )
    return Response.json(
      {
        error:
          "A negociação já foi validada e os custos agora são conduzidos pelas equipes internas.",
      },
      { status: 403 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >,
    itemId = typeof body.id === "string" ? body.id : "";
  const existing = await env.DB.prepare(
    `SELECT id,kind,category,description,quantity,unit_amount AS unitAmount,notes,responsible_user_id AS responsibleUserId,status FROM opportunity_financial_items WHERE id=? AND opportunity_id=? AND organization_id=?`,
  )
    .bind(itemId, id, result.context.organizationId)
    .first<Record<string, unknown>>();
  if (!existing)
    return Response.json({ error: "Item não encontrado." }, { status: 404 });
  let input;
  try {
    input = normalizeFinancialItem({ ...existing, ...body });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE opportunity_financial_items SET kind=?,category=?,description=?,quantity=?,unit_amount=?,total_amount=?,notes=?,responsible_user_id=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND opportunity_id=? AND organization_id=?`,
    ).bind(
      input.kind,
      input.category,
      input.description,
      input.quantity,
      input.unitAmount,
      input.totalAmount,
      input.notes,
      input.responsibleUserId,
      input.status,
      itemId,
      id,
      result.context.organizationId,
    ),
    env.DB.prepare(
      `UPDATE opportunities SET financial_approval_status=CASE WHEN financial_approval_status='APPROVED' THEN 'CHANGES_REQUESTED' ELSE financial_approval_status END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
    ).bind(id, result.context.organizationId),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      result.context.organizationId,
      id,
      input.status === "CANCELLED"
        ? "FINANCIAL_ITEM_CANCELLED"
        : "FINANCIAL_ITEM_UPDATED",
      input.status === "CANCELLED"
        ? "Item financeiro cancelado."
        : "Item financeiro atualizado.",
      String(input.totalAmount),
      result.context.user.id,
    ),
  ]);
  return Response.json({ ok: true });
}
