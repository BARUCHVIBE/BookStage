import { cookies } from "next/headers";
import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { organizationId } = (await request.json().catch(() => ({}))) as {
    organizationId?: string;
  };
  const member = organizationId
    ? await env.DB.prepare(
        `SELECT 1 FROM memberships membership JOIN organizations organization ON organization.id=membership.organization_id WHERE membership.user_id=? AND membership.organization_id=? AND membership.status='ACTIVE' AND organization.status='ACTIVE'`,
      )
        .bind(user.id, organizationId)
        .first()
    : null;
  if (!member)
    return Response.json(
      { error: "Organização não encontrada." },
      { status: 404 },
    );
  (await cookies()).set("bookstage_active_organization", organizationId!, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return Response.json({ ok: true });
}
