import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";
import { assertTenantAccess, canManageOrganization, type Role, TenantAccessError } from "@/app/lib/tenant";

async function membership(userId: string, organizationId: string) {
  return await env.DB.prepare(`SELECT user_id AS userId, organization_id AS organizationId, role, status FROM memberships WHERE user_id=? AND organization_id=?`).bind(userId, organizationId).first<{userId:string;organizationId:string;role:Role;status:string}>();
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await context.params;
  try { assertTenantAccess(user.id, await membership(user.id,id), id); }
  catch (e) { return Response.json({ error: (e as TenantAccessError).message }, { status: 404 }); }
  const organization = await env.DB.prepare(`SELECT * FROM organizations WHERE id=?`).bind(id).first();
  return Response.json({ organization });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await context.params;
  let member;
  try { member = assertTenantAccess(user.id, await membership(user.id,id), id); }
  catch (e) { return Response.json({ error: (e as TenantAccessError).message }, { status: 404 }); }
  if (!canManageOrganization(member.role as Role)) return Response.json({ error: "Sem permissão" }, { status: 403 });
  const b = await request.json() as Record<string,string>;
  if (!b.name?.trim() || !b.email?.trim()) return Response.json({ error: "Nome e e-mail são obrigatórios." }, { status: 400 });
  await env.DB.prepare(`UPDATE organizations SET name=?,logo=?,email=?,phone=?,document=?,website=?,instagram=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`).bind(b.name.trim(),b.logo||null,b.email.trim(),b.phone||null,b.document||null,b.website||null,b.instagram||null,id).run();
  return Response.json({ ok: true });
}
