import { cookies } from "next/headers";
import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { organizationId } = await request.json() as { organizationId?: string };
  const member = organizationId ? await env.DB.prepare(`SELECT 1 FROM memberships WHERE user_id=? AND organization_id=? AND status='ACTIVE'`).bind(user.id,organizationId).first() : null;
  if (!member) return Response.json({ error: "Organização não encontrada." }, { status: 404 });
  (await cookies()).set("bookstage_active_organization", organizationId!, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/" });
  return Response.json({ ok: true });
}
