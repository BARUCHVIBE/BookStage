import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { canManageArtistAssignments } from "@/app/lib/artist-access";
import { makeSlug } from "@/app/lib/tenant";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

export async function GET(request: Request) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const responsibleId = new URL(request.url).searchParams.get("responsibleId");
  const salesScope = context.membership.role === "SALES" ? `AND EXISTS (SELECT 1 FROM artist_sales_assignments mine WHERE mine.artist_id=a.id AND mine.organization_id=a.organization_id AND mine.user_id=?)` : "";
  const responsibleScope = responsibleId ? `AND EXISTS (SELECT 1 FROM artist_sales_assignments filter_assignment WHERE filter_assignment.artist_id=a.id AND filter_assignment.organization_id=a.organization_id AND filter_assignment.user_id=? AND filter_assignment.is_primary=1)` : "";
  const query = env.DB.prepare(`SELECT a.id,a.name,a.status,a.created_at AS createdAt,primary_user.id AS primaryUserId,primary_user.name AS primaryUserName,COUNT(CASE WHEN assignments.is_primary=0 THEN 1 END) AS authorizedCount FROM artists a LEFT JOIN artist_sales_assignments assignments ON assignments.artist_id=a.id AND assignments.organization_id=a.organization_id LEFT JOIN users primary_user ON primary_user.id=(SELECT p.user_id FROM artist_sales_assignments p WHERE p.artist_id=a.id AND p.organization_id=a.organization_id AND p.is_primary=1 LIMIT 1) WHERE a.organization_id=? ${salesScope} ${responsibleScope} GROUP BY a.id,a.name,a.status,a.created_at,primary_user.id,primary_user.name ORDER BY a.name`);
  const bindings: string[] = [context.organizationId];
  if (context.membership.role === "SALES") bindings.push(context.user.id);
  if (responsibleId) bindings.push(responsibleId);
  const result = await query.bind(...bindings).all();
  return Response.json({ artists: result.results, canManageAssignments: canManageArtistAssignments(context.membership.role) });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (!canManageArtistAssignments(context.membership.role)) return Response.json({ error: "Sem permissão." }, { status: 403 });
  const body = await request.json().catch(() => null) as { name?: string } | null;
  if (!body) return Response.json({ error: "Requisição inválida." }, { status: 400 });
  const name = body.name?.trim();
  if (!name || name.length > 160) return Response.json({ error: "Nome do artista inválido." }, { status: 400 });
  const id = crypto.randomUUID();
  const slug = `${makeSlug(name) || "artista"}-${id.slice(0,6)}`;
  await env.DB.prepare(`INSERT INTO artists (id,organization_id,name,slug) VALUES (?,?,?,?)`).bind(id,context.organizationId,name,slug).run();
  return Response.json({ artist: { id, name, slug, status: "ACTIVE" } }, { status: 201 });
}
