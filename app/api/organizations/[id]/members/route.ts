import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";
import { assertTenantAccess, TenantAccessError } from "@/app/lib/tenant";

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await context.params;
  const member = await env.DB.prepare(`SELECT user_id AS userId, organization_id AS organizationId, status FROM memberships WHERE user_id=? AND organization_id=?`).bind(user.id,id).first<{userId:string;organizationId:string;status:string}>();
  try { assertTenantAccess(user.id, member, id); }
  catch (e) { return Response.json({ error: (e as TenantAccessError).message }, { status: 404 }); }
  const rows = await env.DB.prepare(`SELECT u.id,u.name,u.email,m.role,m.status FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.organization_id=? ORDER BY u.name`).bind(id).all();
  return Response.json({ members: rows.results });
}
