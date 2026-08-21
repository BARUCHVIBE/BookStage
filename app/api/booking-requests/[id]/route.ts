import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

export async function DELETE(
  requestObject: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(requestObject);
  if (rejected) return rejected;
  const membership = await requireActiveMembership();
  if ("error" in membership) return membership.error;
  if (!["OWNER", "MANAGER"].includes(membership.membership.role))
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  const { id } = await context.params,
    request = await env.DB.prepare(
      `SELECT opportunity.customer_id AS customerId,opportunity.stage,opportunity.source,CASE WHEN EXISTS(SELECT 1 FROM proposals WHERE opportunity_id=opportunity.id AND organization_id=opportunity.organization_id) OR EXISTS(SELECT 1 FROM contracts WHERE opportunity_id=opportunity.id AND organization_id=opportunity.organization_id) OR EXISTS(SELECT 1 FROM shows WHERE opportunity_id=opportunity.id AND organization_id=opportunity.organization_id) OR EXISTS(SELECT 1 FROM opportunity_calendar_entries WHERE opportunity_id=opportunity.id AND organization_id=opportunity.organization_id) THEN 1 ELSE 0 END AS hasDependencies FROM opportunities opportunity WHERE opportunity.id=? AND opportunity.organization_id=?`,
    )
      .bind(id, membership.organizationId)
      .first<{
        customerId: string;
        stage: string;
        source: string;
        hasDependencies: number;
      }>();
  if (!request)
    return Response.json(
      { error: "Solicitação não encontrada." },
      { status: 404 },
    );
  if (
    request.stage !== "NEW" ||
    request.source !== "PUBLIC_CATALOG" ||
    request.hasDependencies
  )
    return Response.json(
      {
        error: "Apenas solicitações novas e sem vínculos podem ser excluídas.",
      },
      { status: 409 },
    );
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM opportunities WHERE id=? AND organization_id=? AND stage='NEW' AND source='PUBLIC_CATALOG'`,
    ).bind(id, membership.organizationId),
    env.DB.prepare(
      `DELETE FROM customers WHERE id=? AND organization_id=? AND NOT EXISTS(SELECT 1 FROM opportunities WHERE customer_id=? AND organization_id=?)`,
    ).bind(
      request.customerId,
      membership.organizationId,
      request.customerId,
      membership.organizationId,
    ),
  ]);
  return Response.json({ ok: true });
}
