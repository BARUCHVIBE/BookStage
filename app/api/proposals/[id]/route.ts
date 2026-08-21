import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { accessibleProposal } from "@/app/lib/proposal-access";
import {
  normalizeProposalInput,
  validateProposalTransition,
  type ProposalStatus,
} from "@/app/lib/proposal-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

const statusActivity: Record<
  Exclude<ProposalStatus, "DRAFT">,
  { type: string; description: string }
> = {
  SENT: { type: "PROPOSAL_SENT", description: "Proposta enviada." },
  ACCEPTED: { type: "PROPOSAL_ACCEPTED", description: "Proposta aceita." },
  REJECTED: { type: "PROPOSAL_REJECTED", description: "Proposta recusada." },
  EXPIRED: { type: "PROPOSAL_EXPIRED", description: "Proposta expirada." },
};

export async function GET(
  _: Request,
  route: { params: Promise<{ id: string }> },
) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params;
  const access = await accessibleProposal(
    id,
    context.organizationId,
    context.user.id,
    context.membership.role,
  );
  if (!access)
    return Response.json(
      { error: "Proposta não encontrada." },
      { status: 404 },
    );
  const proposal = await env.DB.prepare(
    `SELECT proposal.*,artist.name AS artistName,customer.name AS customerName,customer.company_name AS companyName,customer.email,customer.phone,opportunity.event_date AS eventDate,opportunity.city,opportunity.state,opportunity.venue,opportunity.event_type AS eventType,organization.name AS organizationName,organization.logo AS organizationLogo,organization.email AS organizationEmail,organization.phone AS organizationPhone,organization.website AS organizationWebsite FROM proposals proposal JOIN artists artist ON artist.id=proposal.artist_id AND artist.organization_id=proposal.organization_id JOIN customers customer ON customer.id=proposal.customer_id AND customer.organization_id=proposal.organization_id JOIN opportunities opportunity ON opportunity.id=proposal.opportunity_id AND opportunity.organization_id=proposal.organization_id JOIN organizations organization ON organization.id=proposal.organization_id WHERE proposal.id=? AND proposal.organization_id=?`,
  )
    .bind(id, context.organizationId)
    .first();
  return Response.json({ proposal });
}

export async function PATCH(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params;
  const access = await accessibleProposal(
    id,
    context.organizationId,
    context.user.id,
    context.membership.role,
  );
  if (!access)
    return Response.json(
      { error: "Proposta não encontrada." },
      { status: 404 },
    );
  if (context.membership.role === "FINANCE")
    return Response.json(
      { error: "Financeiro possui acesso de leitura às propostas." },
      { status: 403 },
    );
  if (
    context.membership.role === "BOOKING_AGENT" &&
    access.commercialApprovalStatus === "APPROVED"
  )
    return Response.json(
      { error: "A negociação já foi validada pelo comercial interno." },
      { status: 403 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if ("status" in body) {
    let status;
    try {
      status = validateProposalTransition(access.status, body.status);
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Status inválido." },
        { status: 409 },
      );
    }
    const activity = statusActivity[status as Exclude<ProposalStatus, "DRAFT">];
    const statements = [
      env.DB.prepare(
        `UPDATE proposals SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
      ).bind(status, id, context.organizationId),
      env.DB.prepare(
        `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        context.organizationId,
        access.opportunityId,
        activity.type,
        `${activity.description} ${access.proposalNumber}.`,
        access.status,
        status,
        context.user.id,
      ),
    ];
    if (status === "SENT")
      statements.push(
        env.DB.prepare(
          `UPDATE opportunities SET stage=CASE WHEN stage IN ('NEW','CONTACTED','QUALIFIED') THEN 'PROPOSAL' ELSE stage END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
        ).bind(access.opportunityId, context.organizationId),
      );
    await env.DB.batch(statements);
    return Response.json({ ok: true, status });
  }
  if (access.status !== "DRAFT")
    return Response.json(
      { error: "Somente propostas em rascunho podem ser editadas." },
      { status: 409 },
    );
  let input;
  try {
    input = normalizeProposalInput(body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE proposals SET value=?,payment_terms=?,transportation_terms=?,accommodation_terms=?,technical_terms=?,additional_terms=?,validity_date=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='DRAFT'`,
    ).bind(
      input.value,
      input.paymentTerms,
      input.transportationTerms,
      input.accommodationTerms,
      input.technicalTerms,
      input.additionalTerms,
      input.validityDate,
      id,
      context.organizationId,
    ),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,'PROPOSAL_UPDATED','Proposta em rascunho atualizada.',?,?)`,
    ).bind(
      crypto.randomUUID(),
      context.organizationId,
      access.opportunityId,
      id,
      context.user.id,
    ),
  ]);
  return Response.json({ ok: true });
}
