import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { accessibleContract } from "@/app/lib/contract-access";
import {
  normalizeContractNotes,
  validateContractTransition,
  type ContractStatus,
} from "@/app/lib/contract-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import {
  contractEditableFields,
  normalizeContractFieldValues,
  renderContractTemplate,
} from "@/app/lib/contract-template-rules";

const activityMap: Record<
  Exclude<ContractStatus, "DRAFT">,
  { contractType: string; opportunityType: string; description: string }
> = {
  SENT: {
    contractType: "SENT",
    opportunityType: "CONTRACT_SENT",
    description: "Contrato marcado como enviado.",
  },
  SIGNED: {
    contractType: "SIGNED",
    opportunityType: "CONTRACT_SIGNED",
    description: "Contrato marcado como assinado.",
  },
  CANCELLED: {
    contractType: "CANCELLED",
    opportunityType: "CONTRACT_CANCELLED",
    description: "Contrato cancelado.",
  },
};

export async function GET(
  _: Request,
  route: { params: Promise<{ id: string }> },
) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params,
    access = await accessibleContract(
      id,
      context.organizationId,
      context.user.id,
      context.membership.role,
    );
  if (!access)
    return Response.json(
      { error: "Contrato não encontrado." },
      { status: 404 },
    );
  const contract = await env.DB.prepare(
    `SELECT contract.id,contract.contract_number AS contractNumber,contract.status,contract.template_id AS templateId,template.name AS templateName,template.version AS templateVersion,contract.template_body_snapshot AS templateBodySnapshot,contract.field_values AS fieldValues,contract.generated_at AS generatedAt,contract.file_name AS fileName,contract.file_type AS fileType,contract.file_size AS fileSize,contract.file_uploaded_at AS fileUploadedAt,contract.sent_at AS sentAt,contract.signed_at AS signedAt,contract.notes,contract.created_at AS createdAt,contract.updated_at AS updatedAt,opportunity.id AS opportunityId,opportunity.event_date AS eventDate,opportunity.city,opportunity.state,opportunity.venue,customer.name AS customerName,customer.company_name AS companyName,customer.document AS customerDocument,artist.name AS artistName,organization.name AS organizationName,organization.document AS organizationDocument,show.id AS showId,creator.name AS createdByName FROM contracts contract JOIN opportunities opportunity ON opportunity.id=contract.opportunity_id AND opportunity.organization_id=contract.organization_id JOIN customers customer ON customer.id=contract.customer_id AND customer.organization_id=contract.organization_id JOIN artists artist ON artist.id=contract.artist_id AND artist.organization_id=contract.organization_id JOIN organizations organization ON organization.id=contract.organization_id LEFT JOIN contract_templates template ON template.id=contract.template_id AND template.organization_id=contract.organization_id LEFT JOIN shows show ON show.id=contract.show_id AND show.organization_id=contract.organization_id JOIN users creator ON creator.id=contract.created_by WHERE contract.id=? AND contract.organization_id=?`,
  )
    .bind(id, context.organizationId)
    .first<Record<string, unknown>>();
  const activities = await env.DB.prepare(
    `SELECT activity.id,activity.type,activity.description,activity.from_value AS fromValue,activity.to_value AS toValue,activity.created_at AS createdAt,user.name AS authorName FROM contract_activities activity JOIN users user ON user.id=activity.created_by WHERE activity.contract_id=? AND activity.organization_id=? ORDER BY activity.created_at DESC`,
  )
    .bind(id, context.organizationId)
    .all();
  let storedFields: unknown = {};
  try {
    storedFields = contract?.fieldValues
      ? JSON.parse(String(contract.fieldValues))
      : {};
  } catch {
    storedFields = {};
  }
  const parsedFields = normalizeContractFieldValues(storedFields),
    renderedDocument = contract?.templateBodySnapshot
      ? renderContractTemplate(String(contract.templateBodySnapshot), {
          ...parsedFields,
          contract_number: String(contract.contractNumber || ""),
          organization_name: String(contract.organizationName || ""),
          organization_document: String(contract.organizationDocument || ""),
          customer_name: String(contract.customerName || ""),
          customer_company: String(contract.companyName || ""),
          customer_document: String(contract.customerDocument || ""),
          artist_name: String(contract.artistName || ""),
        })
      : null,
    canEditFields =
      access.status === "DRAFT" &&
      !(
        context.membership.role === "BOOKING_AGENT" &&
        access.commercialApprovalStatus === "APPROVED"
      ),
    canGenerate =
      access.status === "DRAFT" &&
      access.commercialApprovalStatus === "APPROVED" &&
      ["OWNER", "MANAGER", "SALES"].includes(context.membership.role),
    canManageStatus =
      access.commercialApprovalStatus === "APPROVED" &&
      ["OWNER", "MANAGER", "SALES"].includes(context.membership.role);
  return Response.json({
    contract: contract ? { ...contract, fieldValues: parsedFields } : contract,
    activities: activities.results,
    fieldDefinitions: contractEditableFields,
    renderedDocument,
    canEditFields,
    canGenerate,
    canManageStatus,
  });
}

export async function PATCH(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params,
    access = await accessibleContract(
      id,
      context.organizationId,
      context.user.id,
      context.membership.role,
    );
  if (!access)
    return Response.json(
      { error: "Contrato não encontrado." },
      { status: 404 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if ("status" in body) {
    if (context.membership.role === "BOOKING_AGENT")
      return Response.json(
        { error: "A validação e o envio pertencem ao comercial interno." },
        { status: 403 },
      );
    if (
      body.status === "SENT" &&
      access.commercialApprovalStatus !== "APPROVED"
    )
      return Response.json(
        { error: "A validação comercial deve ser concluída antes do envio." },
        { status: 409 },
      );
    let status;
    try {
      status = validateContractTransition(
        access.status,
        body.status,
        Boolean(access.fileKey),
      );
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : "Status inválido." },
        { status: 409 },
      );
    }
    const activity = activityMap[status as Exclude<ContractStatus, "DRAFT">],
      nowField =
        status === "SENT"
          ? ",sent_at=CURRENT_TIMESTAMP"
          : status === "SIGNED"
            ? ",signed_at=CURRENT_TIMESTAMP"
            : "";
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE contracts SET status=?,updated_at=CURRENT_TIMESTAMP${nowField} WHERE id=? AND organization_id=?`,
      ).bind(status, id, context.organizationId),
      env.DB.prepare(
        `INSERT INTO contract_activities (id,organization_id,contract_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        context.organizationId,
        id,
        activity.contractType,
        `${activity.description} ${access.contractNumber}.`,
        access.status,
        status,
        context.user.id,
      ),
      env.DB.prepare(
        `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        context.organizationId,
        access.opportunityId,
        activity.opportunityType,
        `${activity.description} ${access.contractNumber}.`,
        access.status,
        status,
        context.user.id,
      ),
      ...(status === "SENT"
        ? [
            env.DB.prepare(
              `UPDATE opportunities SET stage=CASE WHEN stage IN ('NEW','CONTACTED','QUALIFIED','PROPOSAL','NEGOTIATION','DATE_OPTION') THEN 'CONTRACT' ELSE stage END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
            ).bind(access.opportunityId, context.organizationId),
          ]
        : []),
    ]);
    return Response.json({ ok: true, status });
  }
  if (access.status !== "DRAFT")
    return Response.json(
      { error: "Somente contratos em rascunho podem ser editados." },
      { status: 409 },
    );
  if (
    context.membership.role === "BOOKING_AGENT" &&
    access.commercialApprovalStatus === "APPROVED"
  )
    return Response.json(
      {
        error: "O contrato já está sob responsabilidade do comercial interno.",
      },
      { status: 403 },
    );
  if ("fieldValues" in body) {
    const fieldValues = normalizeContractFieldValues(body.fieldValues),
      generated = await env.DB.prepare(
        `SELECT file_key AS fileKey,generated_at AS generatedAt FROM contracts WHERE id=? AND organization_id=?`,
      )
        .bind(id, context.organizationId)
        .first<{ fileKey: string | null; generatedAt: string | null }>();
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE contracts SET field_values=?,generated_at=NULL,file_key=CASE WHEN generated_at IS NOT NULL THEN NULL ELSE file_key END,file_name=CASE WHEN generated_at IS NOT NULL THEN NULL ELSE file_name END,file_type=CASE WHEN generated_at IS NOT NULL THEN NULL ELSE file_type END,file_size=CASE WHEN generated_at IS NOT NULL THEN NULL ELSE file_size END,file_uploaded_at=CASE WHEN generated_at IS NOT NULL THEN NULL ELSE file_uploaded_at END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='DRAFT'`,
      ).bind(JSON.stringify(fieldValues), id, context.organizationId),
      env.DB.prepare(
        `INSERT INTO contract_activities (id,organization_id,contract_id,type,description,created_by) VALUES (?,?,?,'FIELDS_UPDATED','Informações editáveis do contrato atualizadas.',?)`,
      ).bind(crypto.randomUUID(), context.organizationId, id, context.user.id),
    ]);
    if (generated?.generatedAt && generated.fileKey)
      await env.FILES.delete(generated.fileKey);
    return Response.json({ ok: true });
  }
  const notes = normalizeContractNotes(body.notes);
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE contracts SET notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
    ).bind(notes, id, context.organizationId),
    env.DB.prepare(
      `INSERT INTO contract_activities (id,organization_id,contract_id,type,description,created_by) VALUES (?,?,?,'NOTES_UPDATED','Observações do contrato atualizadas.',?)`,
    ).bind(crypto.randomUUID(), context.organizationId, id, context.user.id),
  ]);
  return Response.json({ ok: true });
}
