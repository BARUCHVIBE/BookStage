import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { accessibleContract } from "@/app/lib/contract-access";
import { normalizeContractNotes, validateContractTransition, type ContractStatus } from "@/app/lib/contract-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

const activityMap: Record<Exclude<ContractStatus, "DRAFT">, { contractType: string; opportunityType: string; description: string }> = {
  SENT: { contractType: "SENT", opportunityType: "CONTRACT_SENT", description: "Contrato marcado como enviado." },
  SIGNED: { contractType: "SIGNED", opportunityType: "CONTRACT_SIGNED", description: "Contrato marcado como assinado." },
  CANCELLED: { contractType: "CANCELLED", opportunityType: "CONTRACT_CANCELLED", description: "Contrato cancelado." },
};

export async function GET(_: Request, route: { params: Promise<{ id: string }> }) {
  const context = await requireActiveMembership(); if ("error" in context) return context.error;
  const { id } = await route.params, access = await accessibleContract(id, context.organizationId, context.user.id, context.membership.role);
  if (!access) return Response.json({ error: "Contrato não encontrado." }, { status: 404 });
  const contract = await env.DB.prepare(`SELECT contract.id,contract.contract_number AS contractNumber,contract.status,contract.file_name AS fileName,contract.file_type AS fileType,contract.file_size AS fileSize,contract.file_uploaded_at AS fileUploadedAt,contract.sent_at AS sentAt,contract.signed_at AS signedAt,contract.notes,contract.created_at AS createdAt,contract.updated_at AS updatedAt,opportunity.id AS opportunityId,opportunity.event_date AS eventDate,opportunity.city,opportunity.state,opportunity.venue,customer.name AS customerName,customer.company_name AS companyName,artist.name AS artistName,show.id AS showId,creator.name AS createdByName FROM contracts contract JOIN opportunities opportunity ON opportunity.id=contract.opportunity_id AND opportunity.organization_id=contract.organization_id JOIN customers customer ON customer.id=contract.customer_id AND customer.organization_id=contract.organization_id JOIN artists artist ON artist.id=contract.artist_id AND artist.organization_id=contract.organization_id LEFT JOIN shows show ON show.id=contract.show_id AND show.organization_id=contract.organization_id JOIN users creator ON creator.id=contract.created_by WHERE contract.id=? AND contract.organization_id=?`).bind(id, context.organizationId).first();
  const activities = await env.DB.prepare(`SELECT activity.id,activity.type,activity.description,activity.from_value AS fromValue,activity.to_value AS toValue,activity.created_at AS createdAt,user.name AS authorName FROM contract_activities activity JOIN users user ON user.id=activity.created_by WHERE activity.contract_id=? AND activity.organization_id=? ORDER BY activity.created_at DESC`).bind(id, context.organizationId).all();
  return Response.json({ contract, activities: activities.results });
}

export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const context = await requireActiveMembership(); if ("error" in context) return context.error;
  const { id } = await route.params, access = await accessibleContract(id, context.organizationId, context.user.id, context.membership.role);
  if (!access) return Response.json({ error: "Contrato não encontrado." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if ("status" in body) {
    let status;
    try { status = validateContractTransition(access.status, body.status, Boolean(access.fileKey)); }
    catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Status inválido." }, { status: 409 }); }
    const activity = activityMap[status as Exclude<ContractStatus, "DRAFT">], nowField = status === "SENT" ? ",sent_at=CURRENT_TIMESTAMP" : status === "SIGNED" ? ",signed_at=CURRENT_TIMESTAMP" : "";
    await env.DB.batch([
      env.DB.prepare(`UPDATE contracts SET status=?,updated_at=CURRENT_TIMESTAMP${nowField} WHERE id=? AND organization_id=?`).bind(status, id, context.organizationId),
      env.DB.prepare(`INSERT INTO contract_activities (id,organization_id,contract_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.organizationId, id, activity.contractType, `${activity.description} ${access.contractNumber}.`, access.status, status, context.user.id),
      env.DB.prepare(`INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.organizationId, access.opportunityId, activity.opportunityType, `${activity.description} ${access.contractNumber}.`, access.status, status, context.user.id),
      ...(status === "SENT" ? [env.DB.prepare(`UPDATE opportunities SET stage=CASE WHEN stage IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION') THEN 'CONTRACT' ELSE stage END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`).bind(access.opportunityId, context.organizationId)] : []),
    ]);
    return Response.json({ ok: true, status });
  }
  if (access.status !== "DRAFT") return Response.json({ error: "Somente contratos em rascunho podem ser editados." }, { status: 409 });
  const notes = normalizeContractNotes(body.notes);
  await env.DB.batch([
    env.DB.prepare(`UPDATE contracts SET notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`).bind(notes, id, context.organizationId),
    env.DB.prepare(`INSERT INTO contract_activities (id,organization_id,contract_id,type,description,created_by) VALUES (?,?,?,'NOTES_UPDATED','Observações do contrato atualizadas.',?)`).bind(crypto.randomUUID(), context.organizationId, id, context.user.id),
  ]);
  return Response.json({ ok: true });
}
