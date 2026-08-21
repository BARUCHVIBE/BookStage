import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  normalizeCommissionInput,
  validateCommissionTransition,
  type CommissionStatus,
} from "@/app/lib/finance-rules";
import { canAccessArtist } from "@/app/lib/member-access";
import { canAccessOpportunity } from "@/app/lib/opportunity-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
type Opportunity = {
  artistId: string;
  assignedUserId: string | null;
  originatorUserId: string | null;
  commercialValidatorUserId: string | null;
  proposedValue: number | null;
  showId: string | null;
};
async function access(id: string) {
  const context = await requireActiveMembership();
  if ("error" in context) return { error: context.error } as const;
  const opportunity = await env.DB.prepare(
    `SELECT opportunity.artist_id AS artistId,opportunity.assigned_user_id AS assignedUserId,opportunity.originator_user_id AS originatorUserId,opportunity.commercial_validator_user_id AS commercialValidatorUserId,opportunity.proposed_value AS proposedValue,show.id AS showId FROM opportunities opportunity LEFT JOIN shows show ON show.opportunity_id=opportunity.id AND show.organization_id=opportunity.organization_id WHERE opportunity.id=? AND opportunity.organization_id=?`,
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
  const own = ["SALES", "BOOKING_AGENT"].includes(
      result.context.membership.role,
    )
      ? "AND commission.user_id=?"
      : "",
    bindings = [
      result.context.organizationId,
      id,
      ...(own ? [result.context.user.id] : []),
    ];
  const rows = await env.DB.prepare(
    `SELECT commission.id,commission.user_id AS userId,user.name AS userName,commission.type,commission.method,commission.calculation_base AS calculationBase,commission.percentage,commission.base_amount AS baseAmount,commission.amount,commission.status,commission.source,commission.notes,commission.created_at AS createdAt FROM show_commissions commission JOIN users user ON user.id=commission.user_id WHERE commission.organization_id=? AND commission.opportunity_id=? ${own} ORDER BY commission.created_at`,
  )
    .bind(...bindings)
    .all();
  const members = ["OWNER", "MANAGER", "FINANCE"].includes(
    result.context.membership.role,
  )
    ? (
        await env.DB.prepare(
          `SELECT user.id,user.name,CASE WHEN membership.role='SALES' AND membership.professional_role='BOOKING_AGENT' THEN 'BOOKING_AGENT' ELSE membership.role END AS role FROM memberships membership JOIN users user ON user.id=membership.user_id WHERE membership.organization_id=? AND membership.status='ACTIVE' AND membership.role IN ('OWNER','MANAGER','SALES') ORDER BY user.name`,
        )
          .bind(result.context.organizationId)
          .all()
      ).results
    : [];
  return Response.json({
    commissions: rows.results,
    members,
    canManage: ["OWNER", "MANAGER", "FINANCE"].includes(
      result.context.membership.role,
    ),
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
  if (!["OWNER", "MANAGER", "FINANCE"].includes(result.context.membership.role))
    return Response.json(
      { error: "Sem permissão para definir comissões." },
      { status: 403 },
    );
  let input;
  try {
    input = normalizeCommissionInput(
      (await request.json()) as Record<string, unknown>,
      result.opportunity.proposedValue,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Comissão inválida." },
      { status: 400 },
    );
  }
  const member = await env.DB.prepare(
    `SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND status='ACTIVE' AND role IN ('OWNER','MANAGER','SALES')`,
  )
    .bind(result.context.organizationId, input.userId)
    .first();
  if (!member)
    return Response.json(
      { error: "Beneficiário inválido para esta organização." },
      { status: 400 },
    );
  const commissionId = crypto.randomUUID();
  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO show_commissions (id,organization_id,show_id,opportunity_id,user_id,type,method,calculation_base,percentage,base_amount,amount,status,source,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,'ESTIMATED','OPPORTUNITY',?,?)`,
      ).bind(
        commissionId,
        result.context.organizationId,
        result.opportunity.showId,
        id,
        input.userId,
        input.type,
        input.method,
        input.calculationBase,
        input.percentage,
        input.baseAmount,
        input.amount,
        input.notes,
        result.context.user.id,
      ),
      env.DB.prepare(
        `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,'FINANCIAL_ITEM_CREATED','Comissão estimada criada.',?,?)`,
      ).bind(
        crypto.randomUUID(),
        result.context.organizationId,
        id,
        String(input.amount),
        result.context.user.id,
      ),
    ]);
  } catch (error) {
    if (String(error).includes("UNIQUE"))
      return Response.json(
        { error: "Este participante já possui comissão deste tipo." },
        { status: 409 },
      );
    throw error;
  }
  return Response.json(
    { id: commissionId, amount: input.amount },
    { status: 201 },
  );
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
  if (!["OWNER", "FINANCE"].includes(result.context.membership.role))
    return Response.json(
      { error: "Sem permissão para aprovar comissões." },
      { status: 403 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >,
    commissionId = typeof body.id === "string" ? body.id : "",
    current = await env.DB.prepare(
      `SELECT status FROM show_commissions WHERE id=? AND opportunity_id=? AND organization_id=?`,
    )
      .bind(commissionId, id, result.context.organizationId)
      .first<{ status: CommissionStatus }>();
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
      { error: error instanceof Error ? error.message : "Transição inválida." },
      { status: 409 },
    );
  }
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE show_commissions SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND opportunity_id=? AND organization_id=?`,
    ).bind(next, commissionId, id, result.context.organizationId),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,'FINANCIAL_ITEM_UPDATED','Status de comissão atualizado.',?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      result.context.organizationId,
      id,
      current.status,
      next,
      result.context.user.id,
    ),
  ]);
  return Response.json({ ok: true, status: next });
}
