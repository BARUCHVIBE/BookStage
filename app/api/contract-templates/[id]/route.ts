import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { normalizePdfFieldMapping, type DetectedPdfField } from "@/app/lib/contract-pdf";
import { normalizeTemplateInput } from "@/app/lib/contract-template-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

type Current = {
  id: string;
  artistId: string | null;
  templateKey: string;
  name: string;
  category: string | null;
  description: string | null;
  templateType: "TEXT" | "PDF_ACROFORM" | "PDF_STATIC";
  fileKey: string | null;
  fileName: string | null;
  fileType: string | null;
  fileSize: number | null;
  detectedFields: string;
  fieldMapping: string;
  body: string;
  version: number;
  isDefault: number;
};

export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (context.membership.role !== "OWNER")
    return Response.json({ error: "Somente o Owner pode versionar modelos de contrato." }, { status: 403 });
  const { id } = await route.params,
    current = await env.DB.prepare(
      `SELECT id,artist_id AS artistId,template_key AS templateKey,name,category,description,template_type AS templateType,file_key AS fileKey,file_name AS fileName,file_type AS fileType,file_size AS fileSize,detected_fields AS detectedFields,field_mapping AS fieldMapping,body,version,is_default AS isDefault FROM contract_templates WHERE id=? AND organization_id=? AND status='ACTIVE'`,
    )
      .bind(id, context.organizationId)
      .first<Current>();
  if (!current)
    return Response.json({ error: "Modelo não encontrado." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  let name = current.name,
    templateBody = current.body,
    fieldMapping = current.fieldMapping;
  try {
    if (current.templateType === "TEXT") {
      const normalized = normalizeTemplateInput(body.name, body.body);
      name = normalized.name;
      templateBody = normalized.body;
    } else {
      name =
        typeof body.name === "string" && body.name.trim()
          ? body.name.trim().slice(0, 160)
          : current.name;
      const detected = JSON.parse(current.detectedFields) as DetectedPdfField[];
      fieldMapping = JSON.stringify(
        normalizePdfFieldMapping(body.fieldMapping, detected),
      );
    }
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Modelo inválido." }, { status: 400 });
  }
  const nextId = crypto.randomUUID(),
    nextVersion = Number(current.version) + 1,
    makeDefault = body.isDefault === true || Boolean(current.isDefault),
    category =
      typeof body.category === "string"
        ? body.category.trim().slice(0, 80) || null
        : current.category,
    description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 500) || null
        : current.description,
    statements = [
      env.DB.prepare(
        `UPDATE contract_templates SET status='ARCHIVED',is_default=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='ACTIVE'`,
      ).bind(id, context.organizationId),
    ];
  if (makeDefault && current.artistId)
    statements.push(
      env.DB.prepare(
        `UPDATE contract_templates SET is_default=0,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND artist_id=? AND status='ACTIVE'`,
      ).bind(context.organizationId, current.artistId),
    );
  statements.push(
    env.DB.prepare(
      `INSERT INTO contract_templates (id,organization_id,artist_id,template_key,name,category,description,template_type,file_key,file_name,file_type,file_size,detected_fields,field_mapping,version,status,is_default,body,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?)`,
    ).bind(nextId, context.organizationId, current.artistId, current.templateKey, name, category, description, current.templateType, current.fileKey, current.fileName, current.fileType, current.fileSize, current.detectedFields, fieldMapping, nextVersion, makeDefault ? 1 : 0, templateBody, context.user.id),
  );
  await env.DB.batch(statements);
  return Response.json({ id: nextId, version: nextVersion });
}
