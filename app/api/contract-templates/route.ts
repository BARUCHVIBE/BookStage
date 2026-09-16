import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  contractEditableFields,
  contractPlaceholders,
  defaultContractTemplate,
  normalizeTemplateInput,
} from "@/app/lib/contract-template-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import { canAccessArtist } from "@/app/lib/member-access";

export async function GET() {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (
    !["OWNER", "MANAGER", "SALES", "BOOKING_AGENT"].includes(
      context.membership.role,
    )
  )
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  const rows = await env.DB.prepare(
    `SELECT template.id,template.artist_id AS artistId,artist.name AS artistName,template.template_key AS templateKey,template.name,template.category,template.description,template.template_type AS templateType,template.file_name AS fileName,template.file_size AS fileSize,template.detected_fields AS detectedFields,template.field_mapping AS fieldMapping,template.version,template.status,template.is_default AS isDefault,template.body,template.created_at AS createdAt,template.updated_at AS updatedAt FROM contract_templates template LEFT JOIN artists artist ON artist.id=template.artist_id AND artist.organization_id=template.organization_id WHERE template.organization_id=? AND template.status='ACTIVE' ORDER BY artist.name,template.is_default DESC,template.updated_at DESC`,
  )
    .bind(context.organizationId)
    .all();
  const templates = (
    await Promise.all(
      rows.results.map(async (row) => {
        const item = row as Record<string, unknown> & { artistId?: string | null };
        if (
          item.artistId &&
          !(await canAccessArtist(
            context.organizationId,
            context.user.id,
            context.membership.role,
            context.membership.artistAccessScope,
            item.artistId,
          ))
        )
          return null;
        return {
          ...item,
          detectedFields: JSON.parse(String(item.detectedFields || "[]")),
          fieldMapping: JSON.parse(String(item.fieldMapping || "{}")),
        };
      }),
    )
  ).filter(Boolean);
  const canManage = context.membership.role === "OWNER",
    artists = canManage
      ? await env.DB.prepare(
          `SELECT id,name FROM artists WHERE organization_id=? AND status='ACTIVE' ORDER BY name`,
        )
          .bind(context.organizationId)
          .all()
      : { results: [] };
  return Response.json({
    templates,
    artists: artists.results,
    fields: canManage ? contractEditableFields : [],
    placeholders: canManage ? contractPlaceholders : [],
    starterBody: canManage ? defaultContractTemplate : "",
    canManage,
  });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (context.membership.role !== "OWNER")
    return Response.json(
      { error: "Somente o Owner pode criar modelos de contrato." },
      { status: 403 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  const artistId = typeof body.artistId === "string" ? body.artistId : "",
    templateType = body.templateType === "PDF" ? "PDF_STATIC" : "TEXT",
    category =
      typeof body.category === "string" ? body.category.trim().slice(0, 80) : null,
    description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 500)
        : null;
  if (!artistId)
    return Response.json({ error: "Selecione o artista do modelo." }, { status: 400 });
  const artist = await env.DB.prepare(
    `SELECT 1 FROM artists WHERE id=? AND organization_id=? AND status='ACTIVE'`,
  )
    .bind(artistId, context.organizationId)
    .first();
  if (!artist)
    return Response.json({ error: "Artista não encontrado." }, { status: 404 });
  let normalized;
  try {
    normalized =
      templateType === "TEXT"
        ? normalizeTemplateInput(body.name, body.body)
        : {
            name:
              typeof body.name === "string" ? body.name.trim().slice(0, 160) : "",
            body: "",
          };
    if (!normalized.name) throw new Error("Informe o nome do modelo.");
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Modelo inválido." },
      { status: 400 },
    );
  }
  const id = crypto.randomUUID(),
    templateKey = crypto.randomUUID(),
    makeDefault = body.isDefault !== false;
  const statements = [];
  if (makeDefault)
    statements.push(
      env.DB.prepare(
        `UPDATE contract_templates SET is_default=0,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND artist_id=? AND status='ACTIVE'`,
      ).bind(context.organizationId, artistId),
    );
  statements.push(
    env.DB.prepare(
      `INSERT INTO contract_templates (id,organization_id,artist_id,template_key,name,category,description,template_type,version,status,is_default,body,created_by) VALUES (?,?,?,?,?,?,?,?,1,'ACTIVE',?,?,?)`,
    ).bind(
      id,
      context.organizationId,
      artistId,
      templateKey,
      normalized.name,
      category,
      description,
      templateType,
      makeDefault ? 1 : 0,
      normalized.body,
      context.user.id,
    ),
  );
  await env.DB.batch(statements);
  return Response.json({ id }, { status: 201 });
}
