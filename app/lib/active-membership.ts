import { env } from "cloudflare:workers";
import { activeOrganizationId, currentUser } from "./request-context";
import type { Role } from "./tenant";

export async function requireActiveMembership() {
  const user = await currentUser();
  if (!user) return { error: Response.json({ error: "Não autenticado" }, { status: 401 }) } as const;
  const organizationId = await activeOrganizationId();
  if (!organizationId) return { error: Response.json({ error: "Selecione uma organização." }, { status: 400 }) } as const;
  const membership = await env.DB.prepare(`SELECT role,status FROM memberships WHERE organization_id=? AND user_id=? AND status='ACTIVE'`).bind(organizationId,user.id).first<{role:Role;status:string}>();
  if (!membership) return { error: Response.json({ error: "Organização não encontrada." }, { status: 404 }) } as const;
  return { user, organizationId, membership } as const;
}
