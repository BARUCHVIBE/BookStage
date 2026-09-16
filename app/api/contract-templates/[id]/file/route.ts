import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { inspectContractTemplatePdf } from "@/app/lib/contract-pdf";
import { canAccessArtist } from "@/app/lib/member-access";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

type Template = {
  id: string;
  artistId: string | null;
  templateKey: string;
  name: string;
  category: string | null;
  description: string | null;
  version: number;
  isDefault: number;
  body: string;
  fileKey: string | null;
};

async function template(id: string, organizationId: string) {
  return env.DB.prepare(
    `SELECT id,artist_id AS artistId,template_key AS templateKey,name,category,description,version,is_default AS isDefault,body,file_key AS fileKey FROM contract_templates WHERE id=? AND organization_id=? AND status='ACTIVE'`,
  )
    .bind(id, organizationId)
    .first<Template>();
}

export async function GET(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params,
    current = await template(id, context.organizationId);
  if (
    !current ||
    !current.fileKey ||
    (current.artistId &&
      !(await canAccessArtist(
        context.organizationId,
        context.user.id,
        context.membership.role,
        context.membership.artistAccessScope,
        current.artistId,
      )))
  )
    return Response.json({ error: "Modelo não encontrado." }, { status: 404 });
  const object = await env.FILES.get(current.fileKey);
  if (!object)
    return Response.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const disposition = new URL(request.url).searchParams.get("download") === "1"
    ? "attachment"
    : "inline";
  return new Response(object.body, {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `${disposition}; filename="modelo-${current.version}.pdf"`,
      "cache-control": "private, no-store",
      "content-security-policy": "sandbox",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (context.membership.role !== "OWNER")
    return Response.json({ error: "Somente o Owner pode anexar modelos PDF." }, { status: 403 });
  const { id } = await route.params,
    current = await template(id, context.organizationId);
  if (!current || !current.artistId)
    return Response.json({ error: "Modelo não encontrado." }, { status: 404 });
  const form = await request.formData(),
    file = form.get("file");
  if (!(file instanceof File))
    return Response.json({ error: "Selecione um arquivo PDF." }, { status: 400 });
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf"))
    return Response.json({ error: "Envie um arquivo PDF válido." }, { status: 400 });
  if (file.size < 5 || file.size > 10_000_000)
    return Response.json({ error: "O PDF deve possuir no máximo 10 MB." }, { status: 400 });
  const bytes = new Uint8Array(await file.arrayBuffer());
  let inspection;
  try {
    inspection = await inspectContractTemplatePdf(bytes);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "PDF inválido." },
      { status: 400 },
    );
  }
  const nextVersion = current.fileKey ? Number(current.version) + 1 : Number(current.version),
    nextId = current.fileKey ? crypto.randomUUID() : current.id,
    key = `contract-templates/${context.organizationId}/${current.artistId}/${current.templateKey}/${nextVersion}/${crypto.randomUUID()}.pdf`,
    safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-180),
    detectedFields = JSON.stringify(inspection.fields),
    initialMapping = JSON.stringify({});
  await env.FILES.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: {
      organizationId: context.organizationId,
      artistId: current.artistId,
      templateKey: current.templateKey,
      version: String(nextVersion),
    },
  });
  try {
    if (current.fileKey) {
      await env.DB.batch([
        env.DB.prepare(
          `UPDATE contract_templates SET status='ARCHIVED',is_default=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='ACTIVE'`,
        ).bind(current.id, context.organizationId),
        env.DB.prepare(
          `INSERT INTO contract_templates (id,organization_id,artist_id,template_key,name,category,description,template_type,file_key,file_name,file_type,file_size,detected_fields,field_mapping,version,status,is_default,body,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'ACTIVE',?,?,?)`,
        ).bind(nextId, context.organizationId, current.artistId, current.templateKey, current.name, current.category, current.description, inspection.type, key, safeName, "application/pdf", bytes.length, detectedFields, initialMapping, nextVersion, current.isDefault, current.body, context.user.id),
      ]);
    } else {
      await env.DB.prepare(
        `UPDATE contract_templates SET template_type=?,file_key=?,file_name=?,file_type='application/pdf',file_size=?,detected_fields=?,field_mapping='{}',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='ACTIVE' AND file_key IS NULL`,
      )
        .bind(inspection.type, key, safeName, bytes.length, detectedFields, current.id, context.organizationId)
        .run();
    }
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
  return Response.json({ id: nextId, version: nextVersion, type: inspection.type, fields: inspection.fields, pages: inspection.pages });
}
