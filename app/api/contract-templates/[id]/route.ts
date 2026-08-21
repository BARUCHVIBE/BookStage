import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { normalizeTemplateInput } from "@/app/lib/contract-template-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

export async function PATCH(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (context.membership.role !== "OWNER")
    return Response.json(
      { error: "Somente o Owner pode versionar modelos de contrato." },
      { status: 403 },
    );
  const { id } = await route.params;
  const current = await env.DB.prepare(
    `SELECT id,template_key AS templateKey,version,is_default AS isDefault FROM contract_templates WHERE id=? AND organization_id=? AND status='ACTIVE'`,
  )
    .bind(id, context.organizationId)
    .first<{
      id: string;
      templateKey: string;
      version: number;
      isDefault: number;
    }>();
  if (!current)
    return Response.json({ error: "Modelo não encontrado." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  let normalized;
  try {
    normalized = normalizeTemplateInput(body.name, body.body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Modelo inválido." },
      { status: 400 },
    );
  }
  const nextId = crypto.randomUUID(),
    makeDefault = body.isDefault === true || Boolean(current.isDefault);
  const statements = [
    env.DB.prepare(
      `UPDATE contract_templates SET status='ARCHIVED',is_default=0,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='ACTIVE'`,
    ).bind(id, context.organizationId),
  ];
  if (makeDefault)
    statements.push(
      env.DB.prepare(
        `UPDATE contract_templates SET is_default=0,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND status='ACTIVE'`,
      ).bind(context.organizationId),
    );
  statements.push(
    env.DB.prepare(
      `INSERT INTO contract_templates (id,organization_id,template_key,name,version,status,is_default,body,created_by) VALUES (?,?,?,?,?,'ACTIVE',?,?,?)`,
    ).bind(
      nextId,
      context.organizationId,
      current.templateKey,
      normalized.name,
      Number(current.version) + 1,
      makeDefault ? 1 : 0,
      normalized.body,
      context.user.id,
    ),
  );
  await env.DB.batch(statements);
  return Response.json({ id: nextId, version: Number(current.version) + 1 });
}
