import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  canAccessContract,
  contractStatuses,
  formatContractNumber,
  normalizeContractNotes,
} from "@/app/lib/contract-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import { normalizeContractFieldValues } from "@/app/lib/contract-template-rules";

type Opportunity = {
  id: string;
  artistId: string;
  customerId: string;
  assignedUserId: string | null;
  originatorUserId: string | null;
  artistName: string;
  customerName: string;
  companyName: string | null;
  eventDate: string;
  city: string;
  state: string;
  venue: string | null;
  proposedValue: number | null;
  commercialValidatorUserId: string | null;
};

export async function GET(request: Request) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (
    !["OWNER", "MANAGER", "SALES", "BOOKING_AGENT"].includes(
      context.membership.role,
    )
  )
    return Response.json(
      { error: "Sem permissão para acessar contratos." },
      { status: 403 },
    );
  const url = new URL(request.url),
    status = url.searchParams.get("status") || "",
    q = (url.searchParams.get("q") || "").trim().slice(0, 120);
  if (
    status &&
    !contractStatuses.includes(status as (typeof contractStatuses)[number])
  )
    return Response.json({ error: "Status inválido." }, { status: 400 });
  const salesClause = ["SALES", "BOOKING_AGENT"].includes(
      context.membership.role,
    )
      ? " AND (opportunity.assigned_user_id=? OR opportunity.originator_user_id=? OR opportunity.commercial_validator_user_id=?)"
      : "",
    statusClause = status ? " AND contract.status=?" : "",
    queryClause = q
      ? " AND (contract.contract_number LIKE ? OR customer.name LIKE ? OR artist.name LIKE ?)"
      : "";
  const bindings: unknown[] = [context.organizationId];
  if (["SALES", "BOOKING_AGENT"].includes(context.membership.role))
    bindings.push(context.user.id, context.user.id, context.user.id);
  if (status) bindings.push(status);
  if (q) bindings.push(`%${q}%`, `%${q}%`, `%${q}%`);
  const contracts = await env.DB.prepare(
    `SELECT contract.id,contract.contract_number AS contractNumber,contract.status,contract.file_name AS fileName,contract.file_size AS fileSize,contract.sent_at AS sentAt,contract.signed_at AS signedAt,contract.updated_at AS updatedAt,opportunity.id AS opportunityId,opportunity.event_date AS eventDate,customer.name AS customerName,artist.name AS artistName,show.id AS showId FROM contracts contract JOIN opportunities opportunity ON opportunity.id=contract.opportunity_id AND opportunity.organization_id=contract.organization_id JOIN customers customer ON customer.id=contract.customer_id AND customer.organization_id=contract.organization_id JOIN artists artist ON artist.id=contract.artist_id AND artist.organization_id=contract.organization_id LEFT JOIN shows show ON show.id=contract.show_id AND show.organization_id=contract.organization_id WHERE contract.organization_id=?${salesClause}${statusClause}${queryClause} ORDER BY contract.updated_at DESC`,
  )
    .bind(...bindings)
    .all();
  const opportunityBindings: unknown[] = [context.organizationId];
  const opportunitySalesClause = ["SALES", "BOOKING_AGENT"].includes(
    context.membership.role,
  )
    ? " AND (opportunity.assigned_user_id=? OR opportunity.originator_user_id=? OR opportunity.commercial_validator_user_id=?)"
    : "";
  if (["SALES", "BOOKING_AGENT"].includes(context.membership.role))
    opportunityBindings.push(context.user.id, context.user.id, context.user.id);
  const opportunities = await env.DB.prepare(
    `SELECT opportunity.id,opportunity.event_date AS eventDate,opportunity.stage,customer.name AS customerName,artist.name AS artistName,show.id AS showId FROM opportunities opportunity JOIN customers customer ON customer.id=opportunity.customer_id AND customer.organization_id=opportunity.organization_id JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id LEFT JOIN shows show ON show.opportunity_id=opportunity.id AND show.organization_id=opportunity.organization_id WHERE opportunity.organization_id=?${opportunitySalesClause} ORDER BY opportunity.updated_at DESC`,
  )
    .bind(...opportunityBindings)
    .all();
  return Response.json({
    contracts: contracts.results,
    opportunities: opportunities.results,
  });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (
    !["OWNER", "MANAGER", "SALES", "BOOKING_AGENT"].includes(
      context.membership.role,
    )
  )
    return Response.json(
      { error: "Sem permissão para criar contratos." },
      { status: 403 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >,
    opportunityId =
      typeof body.opportunityId === "string" ? body.opportunityId : "";
  const opportunity = await env.DB.prepare(
    `SELECT opportunity.id,opportunity.artist_id AS artistId,opportunity.customer_id AS customerId,opportunity.assigned_user_id AS assignedUserId,opportunity.originator_user_id AS originatorUserId,opportunity.commercial_validator_user_id AS commercialValidatorUserId,opportunity.event_date AS eventDate,opportunity.city,opportunity.state,opportunity.venue,opportunity.proposed_value AS proposedValue,artist.name AS artistName,customer.name AS customerName,customer.company_name AS companyName FROM opportunities opportunity JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id JOIN customers customer ON customer.id=opportunity.customer_id AND customer.organization_id=opportunity.organization_id WHERE opportunity.id=? AND opportunity.organization_id=?`,
  )
    .bind(opportunityId, context.organizationId)
    .first<Opportunity>();
  if (
    !opportunity ||
    !canAccessContract(
      context.membership.role,
      opportunity.assignedUserId,
      context.user.id,
      opportunity.originatorUserId,
      opportunity.commercialValidatorUserId,
    )
  )
    return Response.json(
      { error: "Oportunidade não encontrada." },
      { status: 404 },
    );
  const requestedTemplateId =
      typeof body.templateId === "string" ? body.templateId : "",
    template = requestedTemplateId
      ? await env.DB.prepare(
          `SELECT id,body FROM contract_templates WHERE id=? AND organization_id=? AND status='ACTIVE'`,
        )
          .bind(requestedTemplateId, context.organizationId)
          .first<{ id: string; body: string }>()
      : await env.DB.prepare(
          `SELECT id,body FROM contract_templates WHERE organization_id=? AND status='ACTIVE' AND is_default=1 LIMIT 1`,
        )
          .bind(context.organizationId)
          .first<{ id: string; body: string }>();
  if (requestedTemplateId && !template)
    return Response.json({ error: "Modelo não encontrado." }, { status: 404 });
  const show = await env.DB.prepare(
    `SELECT id FROM shows WHERE opportunity_id=? AND organization_id=?`,
  )
    .bind(opportunityId, context.organizationId)
    .first<{ id: string }>();
  const year = new Date().getUTCFullYear(),
    sequence = await env.DB.prepare(
      `INSERT INTO contract_sequences (organization_id,year,next_number) VALUES (?,?,1) ON CONFLICT(organization_id,year) DO UPDATE SET next_number=contract_sequences.next_number+1 RETURNING next_number AS nextNumber`,
    )
      .bind(context.organizationId, year)
      .first<{ nextNumber: number }>();
  if (!sequence)
    return Response.json(
      { error: "Não foi possível numerar o contrato." },
      { status: 500 },
    );
  const contractId = crypto.randomUUID(),
    contractNumber = formatContractNumber(year, sequence.nextNumber),
    notes = normalizeContractNotes(body.notes),
    fieldValues = normalizeContractFieldValues({
      event_date: opportunity.eventDate,
      venue: opportunity.venue || "",
      city: opportunity.city,
      state: opportunity.state,
      fee: opportunity.proposedValue
        ? new Intl.NumberFormat("pt-BR", {
            style: "currency",
            currency: "BRL",
          }).format(opportunity.proposedValue / 100)
        : "",
    });
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO contracts (id,organization_id,opportunity_id,show_id,customer_id,artist_id,contract_number,template_id,template_body_snapshot,field_values,status,notes,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,'DRAFT',?,?)`,
    ).bind(
      contractId,
      context.organizationId,
      opportunityId,
      show?.id || null,
      opportunity.customerId,
      opportunity.artistId,
      contractNumber,
      template?.id || null,
      template?.body || null,
      JSON.stringify(fieldValues),
      notes,
      context.user.id,
    ),
    env.DB.prepare(
      `INSERT INTO contract_activities (id,organization_id,contract_id,type,description,to_value,created_by) VALUES (?,?,?,'CREATED',?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      context.organizationId,
      contractId,
      `Contrato ${contractNumber} criado.`,
      contractId,
      context.user.id,
    ),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,'CONTRACT_CREATED',?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      context.organizationId,
      opportunityId,
      `Contrato ${contractNumber} criado.`,
      contractId,
      context.user.id,
    ),
  ]);
  return Response.json({ id: contractId, contractNumber }, { status: 201 });
}
