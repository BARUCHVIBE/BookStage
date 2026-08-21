import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { canAccessOpportunity } from "@/app/lib/opportunity-rules";
import {
  formatProposalNumber,
  normalizeProposalInput,
} from "@/app/lib/proposal-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

type Opportunity = {
  id: string;
  artistId: string;
  customerId: string;
  assignedUserId: string | null;
  originatorUserId: string | null;
  commercialValidatorUserId: string | null;
  commercialApprovalStatus: string;
};

async function accessibleOpportunity(
  id: string,
  organizationId: string,
  userId: string,
  role: Parameters<typeof canAccessOpportunity>[0],
) {
  const opportunity = await env.DB.prepare(
    `SELECT id,artist_id AS artistId,customer_id AS customerId,assigned_user_id AS assignedUserId,originator_user_id AS originatorUserId,commercial_validator_user_id AS commercialValidatorUserId,commercial_approval_status AS commercialApprovalStatus FROM opportunities WHERE id=? AND organization_id=?`,
  )
    .bind(id, organizationId)
    .first<Opportunity>();
  return opportunity &&
    canAccessOpportunity(
      role,
      opportunity.assignedUserId,
      userId,
      opportunity.originatorUserId,
      opportunity.commercialValidatorUserId,
    )
    ? opportunity
    : null;
}

export async function GET(
  _: Request,
  route: { params: Promise<{ id: string }> },
) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params;
  const opportunity = await accessibleOpportunity(
    id,
    context.organizationId,
    context.user.id,
    context.membership.role,
  );
  if (!opportunity)
    return Response.json(
      { error: "Oportunidade não encontrada." },
      { status: 404 },
    );
  const proposals = await env.DB.prepare(
    `SELECT proposal.id,proposal.proposal_number AS proposalNumber,proposal.value,proposal.validity_date AS validityDate,proposal.status,proposal.created_at AS createdAt,creator.name AS createdByName FROM proposals proposal JOIN users creator ON creator.id=proposal.created_by WHERE proposal.opportunity_id=? AND proposal.organization_id=? ORDER BY proposal.created_at DESC,proposal.proposal_number DESC`,
  )
    .bind(id, context.organizationId)
    .all();
  return Response.json({ proposals: proposals.results });
}

export async function POST(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params;
  const opportunity = await accessibleOpportunity(
    id,
    context.organizationId,
    context.user.id,
    context.membership.role,
  );
  if (!opportunity)
    return Response.json(
      { error: "Oportunidade não encontrada." },
      { status: 404 },
    );
  if (
    context.membership.role === "BOOKING_AGENT" &&
    opportunity.commercialApprovalStatus === "APPROVED"
  )
    return Response.json(
      { error: "A negociação já foi validada pelo comercial interno." },
      { status: 403 },
    );
  if (context.membership.role === "FINANCE")
    return Response.json(
      { error: "Financeiro possui acesso de leitura às propostas." },
      { status: 403 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  let input;
  try {
    if (typeof body.sourceProposalId === "string" && body.sourceProposalId) {
      const source = await env.DB.prepare(
        `SELECT value,payment_terms AS paymentTerms,transportation_terms AS transportationTerms,accommodation_terms AS accommodationTerms,technical_terms AS technicalTerms,additional_terms AS additionalTerms,validity_date AS validityDate FROM proposals WHERE id=? AND opportunity_id=? AND organization_id=?`,
      )
        .bind(body.sourceProposalId, id, context.organizationId)
        .first<Record<string, unknown>>();
      if (!source)
        return Response.json(
          { error: "Proposta de origem não encontrada." },
          { status: 404 },
        );
      input = normalizeProposalInput(source);
    } else input = normalizeProposalInput(body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }
  const year = new Date().getUTCFullYear();
  const sequence = await env.DB.prepare(
    `INSERT INTO proposal_sequences (organization_id,year,next_number) VALUES (?,?,1) ON CONFLICT(organization_id,year) DO UPDATE SET next_number=proposal_sequences.next_number+1 RETURNING next_number AS nextNumber`,
  )
    .bind(context.organizationId, year)
    .first<{ nextNumber: number }>();
  if (!sequence)
    return Response.json(
      { error: "Não foi possível numerar a proposta." },
      { status: 500 },
    );
  const proposalId = crypto.randomUUID(),
    proposalNumber = formatProposalNumber(year, sequence.nextNumber);
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO proposals (id,organization_id,opportunity_id,artist_id,customer_id,proposal_number,value,payment_terms,transportation_terms,accommodation_terms,technical_terms,additional_terms,validity_date,status,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'DRAFT',?)`,
    ).bind(
      proposalId,
      context.organizationId,
      id,
      opportunity.artistId,
      opportunity.customerId,
      proposalNumber,
      input.value,
      input.paymentTerms,
      input.transportationTerms,
      input.accommodationTerms,
      input.technicalTerms,
      input.additionalTerms,
      input.validityDate,
      context.user.id,
    ),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,'PROPOSAL_CREATED',?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      context.organizationId,
      id,
      `Proposta ${proposalNumber} criada.`,
      proposalId,
      context.user.id,
    ),
    env.DB.prepare(
      `INSERT INTO referral_events (id,organization_id,referral_link_id,artist_id,user_id,opportunity_id,type) SELECT ?,organization_id,referral_link_id,artist_id,originator_user_id,id,'PROPOSAL_CREATED' FROM opportunities WHERE id=? AND organization_id=? AND referral_link_id IS NOT NULL AND originator_user_id IS NOT NULL`,
    ).bind(crypto.randomUUID(), id, context.organizationId),
  ]);
  return Response.json({ id: proposalId, proposalNumber }, { status: 201 });
}
