import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { canAccessArtist } from "@/app/lib/member-access";
import {
  canAccessOpportunity,
  canEditOpportunity,
} from "@/app/lib/opportunity-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

type Opportunity = {
  id: string;
  artistId: string;
  assignedUserId: string | null;
  originatorUserId: string | null;
  commercialValidatorUserId: string | null;
  commercialApprovalStatus: string;
};
async function load(id: string, organizationId: string) {
  return env.DB.prepare(
    `SELECT id,artist_id AS artistId,assigned_user_id AS assignedUserId,originator_user_id AS originatorUserId,commercial_validator_user_id AS commercialValidatorUserId,commercial_approval_status AS commercialApprovalStatus FROM opportunities WHERE id=? AND organization_id=?`,
  )
    .bind(id, organizationId)
    .first<Opportunity>();
}
async function authorize(id: string, write = false) {
  const context = await requireActiveMembership();
  if ("error" in context) return { error: context.error } as const;
  const opportunity = await load(id, context.organizationId);
  if (
    !opportunity ||
    !(write
      ? canEditOpportunity(
          context.membership.role,
          opportunity.assignedUserId,
          context.user.id,
          opportunity.originatorUserId,
          opportunity.commercialValidatorUserId,
        )
      : canAccessOpportunity(
          context.membership.role,
          opportunity.assignedUserId,
          context.user.id,
          opportunity.originatorUserId,
          opportunity.commercialValidatorUserId,
        )) ||
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
    access = await authorize(id);
  if ("error" in access) return access.error;
  const rows = await env.DB.prepare(
    `SELECT approval.id,approval.kind,approval.status,approval.requested_at AS requestedAt,approval.reviewed_at AS reviewedAt,approval.notes,requester.name AS requestedByName,reviewer.name AS reviewedByName FROM opportunity_approvals approval JOIN users requester ON requester.id=approval.requested_by LEFT JOIN users reviewer ON reviewer.id=approval.reviewed_by WHERE approval.organization_id=? AND approval.opportunity_id=? ORDER BY approval.created_at DESC`,
  )
    .bind(access.context.organizationId, id)
    .all();
  return Response.json({
    approvals: rows.results,
    role: access.context.membership.role,
    userId: access.context.user.id,
    canReviewCommercial:
      ["OWNER", "MANAGER"].includes(access.context.membership.role) ||
      (access.context.membership.role === "SALES" &&
        access.opportunity.commercialValidatorUserId ===
          access.context.user.id),
  });
}

export async function POST(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const { id } = await route.params;
  const contextResult = await requireActiveMembership();
  if ("error" in contextResult) return contextResult.error;
  const opportunity = await load(id, contextResult.organizationId);
  if (
    !opportunity ||
    !canAccessOpportunity(
      contextResult.membership.role,
      opportunity.assignedUserId,
      contextResult.user.id,
      opportunity.originatorUserId,
      opportunity.commercialValidatorUserId,
    ) ||
    !(await canAccessArtist(
      contextResult.organizationId,
      contextResult.user.id,
      contextResult.membership.role,
      contextResult.membership.artistAccessScope,
      opportunity.artistId,
    ))
  )
    return Response.json(
      { error: "Oportunidade não encontrada." },
      { status: 404 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >,
    kind = body.kind,
    action = body.action,
    notes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null;
  if (
    !["COMMERCIAL", "FINANCIAL"].includes(String(kind)) ||
    !["REQUEST", "APPROVE", "REJECT", "REQUEST_CHANGES"].includes(
      String(action),
    )
  )
    return Response.json(
      { error: "Ação de aprovação inválida." },
      { status: 400 },
    );
  if (action === "REQUEST") {
    if (
      kind === "COMMERCIAL" &&
      !canEditOpportunity(
        contextResult.membership.role,
        opportunity.assignedUserId,
        contextResult.user.id,
        opportunity.originatorUserId,
        opportunity.commercialValidatorUserId,
      )
    )
      return Response.json(
        { error: "Sem permissão para solicitar aprovação comercial." },
        { status: 403 },
      );
    if (
      kind === "FINANCIAL" &&
      !["OWNER", "MANAGER", "SALES", "BOOKING_AGENT"].includes(
        contextResult.membership.role,
      )
    )
      return Response.json(
        { error: "Sem permissão para solicitar validação financeira." },
        { status: 403 },
      );
    if (kind === "COMMERCIAL" && !opportunity.commercialValidatorUserId)
      return Response.json(
        {
          error:
            "O artista não possui um comercial interno responsável pela validação.",
        },
        { status: 409 },
      );
    if (
      kind === "FINANCIAL" &&
      opportunity.commercialApprovalStatus !== "APPROVED"
    )
      return Response.json(
        {
          error:
            "A validação comercial deve ser concluída antes do envio ao financeiro.",
        },
        { status: 409 },
      );
    const existing = await env.DB.prepare(
      `SELECT 1 FROM opportunity_approvals WHERE organization_id=? AND opportunity_id=? AND kind=? AND status='PENDING'`,
    )
      .bind(contextResult.organizationId, id, kind)
      .first();
    if (existing)
      return Response.json(
        { error: "Já existe uma aprovação pendente deste tipo." },
        { status: 409 },
      );
    const approvalId = crypto.randomUUID(),
      opportunityStatus =
        kind === "COMMERCIAL" ? "PENDING_APPROVAL" : "PENDING",
      activityType =
        kind === "COMMERCIAL"
          ? "COMMERCIAL_APPROVAL_REQUESTED"
          : "FINANCIAL_APPROVAL_REQUESTED";
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO opportunity_approvals (id,organization_id,opportunity_id,kind,status,requested_by,notes) VALUES (?,?,?,?, 'PENDING',?,?)`,
      ).bind(
        approvalId,
        contextResult.organizationId,
        id,
        kind,
        contextResult.user.id,
        notes,
      ),
      env.DB.prepare(
        `UPDATE opportunities SET ${kind === "COMMERCIAL" ? "commercial_approval_status" : "financial_approval_status"}=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
      ).bind(opportunityStatus, id, contextResult.organizationId),
      env.DB.prepare(
        `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,?,?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        contextResult.organizationId,
        id,
        activityType,
        kind === "COMMERCIAL"
          ? "Aprovação comercial solicitada."
          : "Validação financeira solicitada.",
        opportunityStatus,
        contextResult.user.id,
      ),
    ]);
    return Response.json(
      { id: approvalId, status: "PENDING" },
      { status: 201 },
    );
  }
  const allowed =
    kind === "COMMERCIAL"
      ? ["OWNER", "MANAGER"].includes(contextResult.membership.role) ||
        (contextResult.membership.role === "SALES" &&
          opportunity.commercialValidatorUserId === contextResult.user.id)
      : ["OWNER", "FINANCE"].includes(contextResult.membership.role);
  if (!allowed)
    return Response.json(
      { error: "Sem permissão para analisar esta aprovação." },
      { status: 403 },
    );
  const pending = await env.DB.prepare(
    `SELECT id,requested_by AS requestedBy FROM opportunity_approvals WHERE organization_id=? AND opportunity_id=? AND kind=? AND status='PENDING' ORDER BY requested_at DESC LIMIT 1`,
  )
    .bind(contextResult.organizationId, id, kind)
    .first<{ id: string; requestedBy: string }>();
  if (!pending)
    return Response.json(
      { error: "Nenhuma aprovação pendente." },
      { status: 409 },
    );
  const decision =
      action === "APPROVE"
        ? "APPROVED"
        : action === "REJECT"
          ? "REJECTED"
          : "CHANGES_REQUESTED",
    activityType = `${kind}_${decision === "APPROVED" ? "APPROVED" : decision === "REJECTED" ? "REJECTED" : "CHANGES_REQUESTED"}`,
    column =
      kind === "COMMERCIAL"
        ? "commercial_approval_status"
        : "financial_approval_status";
  const statements = [
    env.DB.prepare(
      `UPDATE opportunity_approvals SET status=?,reviewed_by=?,reviewed_at=CURRENT_TIMESTAMP,notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='PENDING'`,
    ).bind(
      decision,
      contextResult.user.id,
      notes,
      pending.id,
      contextResult.organizationId,
    ),
    env.DB.prepare(
      `UPDATE opportunities SET ${column}=?,assigned_user_id=CASE WHEN ?='COMMERCIAL' AND ?='APPROVED' AND commercial_validator_user_id IS NOT NULL THEN commercial_validator_user_id ELSE assigned_user_id END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
    ).bind(decision, kind, decision, id, contextResult.organizationId),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      contextResult.organizationId,
      id,
      activityType,
      `${kind === "COMMERCIAL" ? "Decisão comercial" : "Validação financeira"}: ${decision}.`,
      decision,
      contextResult.user.id,
    ),
  ];
  if (kind === "COMMERCIAL" && decision === "APPROVED")
    statements.push(
      env.DB.prepare(
        `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,'ASSIGNEE_CHANGED','Negociação validada e encaminhada ao comercial interno do artista.',?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        contextResult.organizationId,
        id,
        opportunity.assignedUserId,
        opportunity.commercialValidatorUserId,
        contextResult.user.id,
      ),
      env.DB.prepare(
        `INSERT INTO referral_events (id,organization_id,referral_link_id,artist_id,user_id,opportunity_id,type) SELECT ?,organization_id,referral_link_id,artist_id,originator_user_id,id,'SALE_APPROVED' FROM opportunities WHERE id=? AND organization_id=? AND referral_link_id IS NOT NULL AND originator_user_id IS NOT NULL`,
      ).bind(crypto.randomUUID(), id, contextResult.organizationId),
    );
  await env.DB.batch(statements);
  return Response.json({ ok: true, status: decision });
}
