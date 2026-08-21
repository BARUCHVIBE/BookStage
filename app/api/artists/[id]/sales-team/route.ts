import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { canManageArtistAssignments, validateCommercialAssignments, type AssignmentInput } from "@/app/lib/artist-access";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

export async function PUT(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (!canManageArtistAssignments(context.membership.role)) return Response.json({ error: "Sem permissão para gerenciar atribuições." }, { status: 403 });
  const { id } = await routeContext.params;
  const artist = await env.DB.prepare(`SELECT id FROM artists WHERE id=? AND organization_id=?`).bind(id,context.organizationId).first();
  if (!artist) return Response.json({ error: "Artista não encontrado." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as { primaryUserId?: string | null; authorizedUserIds?: string[] };
  const membershipRows = await env.DB.prepare(`SELECT organization_id AS organizationId,user_id AS userId,role,status FROM memberships WHERE organization_id=? AND status='ACTIVE'`).bind(context.organizationId).all<AssignmentInput>();
  let assignments;
  try { assignments = validateCommercialAssignments(context.organizationId,body.primaryUserId||null,Array.isArray(body.authorizedUserIds)?body.authorizedUserIds:[],membershipRows.results as AssignmentInput[]); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Atribuição inválida." }, { status: 400 }); }
  const statements = [env.DB.prepare(`DELETE FROM artist_sales_assignments WHERE artist_id=? AND organization_id=?`).bind(id,context.organizationId)];
  if (assignments.primaryUserId) statements.push(env.DB.prepare(`INSERT INTO artist_sales_assignments (organization_id,artist_id,user_id,is_primary) VALUES (?,?,?,1)`).bind(context.organizationId,id,assignments.primaryUserId));
  for (const userId of assignments.authorizedUserIds) statements.push(env.DB.prepare(`INSERT INTO artist_sales_assignments (organization_id,artist_id,user_id,is_primary) VALUES (?,?,?,0)`).bind(context.organizationId,id,userId));
  await env.DB.batch(statements);
  return Response.json({ ok: true });
}
