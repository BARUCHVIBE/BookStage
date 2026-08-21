import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";
import {
  assertTenantAccess,
  canManageOrganization,
  type Role,
  TenantAccessError,
} from "@/app/lib/tenant";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import { normalizeOrganizationInput } from "@/app/lib/organization-rules";

async function membership(userId: string, organizationId: string) {
  return await env.DB.prepare(
    `SELECT user_id AS userId, organization_id AS organizationId, role, status FROM memberships WHERE user_id=? AND organization_id=?`,
  )
    .bind(userId, organizationId)
    .first<{
      userId: string;
      organizationId: string;
      role: Role;
      status: string;
    }>();
}

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await context.params;
  try {
    assertTenantAccess(user.id, await membership(user.id, id), id);
  } catch (e) {
    return Response.json(
      { error: (e as TenantAccessError).message },
      { status: 404 },
    );
  }
  const organization = await env.DB.prepare(
    `SELECT * FROM organizations WHERE id=?`,
  )
    .bind(id)
    .first();
  return Response.json({ organization });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await context.params;
  let member;
  try {
    member = assertTenantAccess(user.id, await membership(user.id, id), id);
  } catch (e) {
    return Response.json(
      { error: (e as TenantAccessError).message },
      { status: 404 },
    );
  }
  if (!canManageOrganization(member.role as Role))
    return Response.json({ error: "Sem permissão" }, { status: 403 });
  const b = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!b)
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  let input;
  try {
    input = normalizeOrganizationInput(b);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }
  await env.DB.prepare(
    `UPDATE organizations SET name=?,logo=?,email=?,phone=?,document=?,website=?,instagram=?,description=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
  )
    .bind(
      input.name,
      input.logo,
      input.email,
      input.phone,
      input.document,
      input.website,
      input.instagram,
      input.description,
      id,
    )
    .run();
  return Response.json({ ok: true });
}
