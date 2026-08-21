import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  contractEditableFields,
  contractPlaceholders,
  defaultContractTemplate,
  normalizeTemplateInput,
} from "@/app/lib/contract-template-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

export async function GET() {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (
    !["OWNER", "MANAGER", "SALES", "BOOKING_AGENT"].includes(
      context.membership.role,
    )
  )
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  const templates = await env.DB.prepare(
    `SELECT id,template_key AS templateKey,name,version,status,is_default AS isDefault,body,created_at AS createdAt,updated_at AS updatedAt FROM contract_templates WHERE organization_id=? AND status='ACTIVE' ORDER BY is_default DESC,updated_at DESC`,
  )
    .bind(context.organizationId)
    .all();
  return Response.json({
    templates: templates.results,
    fields: contractEditableFields,
    placeholders: contractPlaceholders,
    starterBody: defaultContractTemplate,
    canManage: context.membership.role === "OWNER",
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
  let normalized;
  try {
    normalized = normalizeTemplateInput(body.name, body.body);
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
        `UPDATE contract_templates SET is_default=0,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND status='ACTIVE'`,
      ).bind(context.organizationId),
    );
  statements.push(
    env.DB.prepare(
      `INSERT INTO contract_templates (id,organization_id,template_key,name,version,status,is_default,body,created_by) VALUES (?,?,?,?,1,'ACTIVE',?,?,?)`,
    ).bind(
      id,
      context.organizationId,
      templateKey,
      normalized.name,
      makeDefault ? 1 : 0,
      normalized.body,
      context.user.id,
    ),
  );
  await env.DB.batch(statements);
  return Response.json({ id }, { status: 201 });
}
