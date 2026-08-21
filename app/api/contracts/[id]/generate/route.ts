import { env } from "cloudflare:workers";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { accessibleContract } from "@/app/lib/contract-access";
import {
  normalizeContractFieldValues,
  renderContractTemplate,
} from "@/app/lib/contract-template-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

function safePdfText(value: string) {
  const normalized = value
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-");
  return Array.from(normalized)
    .filter((character) => {
      const code = character.charCodeAt(0);
      return (
        code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 255)
      );
    })
    .join("");
}

function wrap(text: string, max = 92) {
  const output: string[] = [];
  for (const paragraph of text.split("\n")) {
    if (!paragraph.trim()) {
      output.push("");
      continue;
    }
    let line = "";
    for (const word of paragraph.split(/\s+/)) {
      if (`${line} ${word}`.trim().length > max && line) {
        output.push(line);
        line = word;
      } else line = `${line} ${word}`.trim();
    }
    if (line) output.push(line);
  }
  return output;
}

export async function POST(
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
  if (
    access.status !== "DRAFT" ||
    access.commercialApprovalStatus !== "APPROVED" ||
    !["OWNER", "MANAGER", "SALES"].includes(context.membership.role)
  )
    return Response.json(
      {
        error:
          "O PDF exige contrato em rascunho e validação do comercial interno.",
      },
      { status: 403 },
    );
  const contract = await env.DB.prepare(
    `SELECT contract.contract_number AS contractNumber,contract.template_body_snapshot AS templateBody,contract.field_values AS fieldValues,contract.file_key AS previousFileKey,contract.updated_at AS sourceUpdatedAt,organization.name AS organizationName,organization.document AS organizationDocument,customer.name AS customerName,customer.company_name AS companyName,customer.document AS customerDocument,artist.name AS artistName FROM contracts contract JOIN organizations organization ON organization.id=contract.organization_id JOIN customers customer ON customer.id=contract.customer_id AND customer.organization_id=contract.organization_id JOIN artists artist ON artist.id=contract.artist_id AND artist.organization_id=contract.organization_id WHERE contract.id=? AND contract.organization_id=? AND contract.status='DRAFT'`,
  )
    .bind(id, context.organizationId)
    .first<{
      contractNumber: string;
      templateBody: string | null;
      fieldValues: string;
      previousFileKey: string | null;
      sourceUpdatedAt: string;
      organizationName: string;
      organizationDocument: string | null;
      customerName: string;
      companyName: string | null;
      customerDocument: string | null;
      artistName: string;
    }>();
  if (!contract?.templateBody)
    return Response.json(
      { error: "Este contrato não possui um modelo aplicado." },
      { status: 409 },
    );
  let storedFields: unknown = {};
  try {
    storedFields = JSON.parse(contract.fieldValues || "{}");
  } catch {
    storedFields = {};
  }
  const text = renderContractTemplate(contract.templateBody, {
      ...normalizeContractFieldValues(storedFields),
      contract_number: contract.contractNumber,
      organization_name: contract.organizationName,
      organization_document: contract.organizationDocument || "",
      customer_name: contract.customerName,
      customer_company: contract.companyName || "",
      customer_document: contract.customerDocument || "",
      artist_name: contract.artistName,
    }),
    pdf = await PDFDocument.create(),
    font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold),
    lines = wrap(safePdfText(text));
  let page = pdf.addPage([595.28, 841.89]),
    y = 785;
  for (const line of lines) {
    if (y < 60) {
      page = pdf.addPage([595.28, 841.89]);
      y = 785;
    }
    const heading = /^\d+\.|^CONTRATO/.test(line);
    page.drawText(line, {
      x: 52,
      y,
      size: heading ? 11 : 9.5,
      font: heading ? bold : font,
      color: rgb(0.08, 0.1, 0.15),
    });
    y -= line ? (heading ? 18 : 14) : 10;
  }
  const bytes = await pdf.save(),
    fileName = `${contract.contractNumber}.pdf`,
    key = `contracts/${context.organizationId}/${id}/${crypto.randomUUID()}.pdf`;
  await env.FILES.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { organizationId: context.organizationId, contractId: id },
  });
  const updated = await env.DB.prepare(
    `UPDATE contracts SET file_key=?,file_name=?,file_type='application/pdf',file_size=?,file_uploaded_at=CURRENT_TIMESTAMP,generated_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='DRAFT' AND updated_at=? AND field_values=?`,
  )
    .bind(
      key,
      fileName,
      bytes.length,
      id,
      context.organizationId,
      contract.sourceUpdatedAt,
      contract.fieldValues,
    )
    .run();
  if (updated.meta.changes !== 1) {
    await env.FILES.delete(key);
    return Response.json(
      {
        error: "O contrato foi alterado. Atualize a página e tente novamente.",
      },
      { status: 409 },
    );
  }
  await env.DB.prepare(
    `INSERT INTO contract_activities (id,organization_id,contract_id,type,description,to_value,created_by) VALUES (?,?,?,'PDF_GENERATED','PDF gerado a partir do modelo protegido.',?,?)`,
  )
    .bind(
      crypto.randomUUID(),
      context.organizationId,
      id,
      fileName,
      context.user.id,
    )
    .run();
  if (contract.previousFileKey && contract.previousFileKey !== key)
    await env.FILES.delete(contract.previousFileKey);
  return Response.json({ ok: true, fileName });
}
