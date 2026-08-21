import { env } from "cloudflare:workers";
import { activeOrganizationId, currentUser } from "./request-context";
import {
  effectiveRole,
  type ArtistAccessScope,
  type BaseRole,
  type Department,
} from "./tenant";

export async function requireActiveMembership() {
  const user = await currentUser();
  if (!user)
    return {
      error: Response.json({ error: "Não autenticado" }, { status: 401 }),
    } as const;
  const organizationId = await activeOrganizationId();
  if (!organizationId)
    return {
      error: Response.json(
        { error: "Selecione uma organização." },
        { status: 400 },
      ),
    } as const;
  const membership = await env.DB.prepare(
    `SELECT role AS baseRole,professional_role AS professionalRole,department,artist_access_scope AS artistAccessScope,status FROM memberships WHERE organization_id=? AND user_id=? AND status='ACTIVE'`,
  )
    .bind(organizationId, user.id)
    .first<{
      baseRole: BaseRole;
      professionalRole: string | null;
      department: Department;
      artistAccessScope: ArtistAccessScope;
      status: string;
    }>();
  if (!membership)
    return {
      error: Response.json(
        { error: "Organização não encontrada." },
        { status: 404 },
      ),
    } as const;
  return {
    user,
    organizationId,
    membership: {
      ...membership,
      role: effectiveRole(membership.baseRole, membership.professionalRole),
    },
  } as const;
}
