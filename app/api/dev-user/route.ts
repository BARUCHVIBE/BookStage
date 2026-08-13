import { cookies } from "next/headers";
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return Response.json({ error: "Not found" }, { status: 404 });
  const { userId } = await request.json() as { userId?: string };
  if (!userId || !["user-a","user-b"].includes(userId)) return Response.json({ error: "Usuário inválido" }, { status: 400 });
  (await cookies()).set("bookstage_demo_user", userId, { httpOnly: true, sameSite: "lax", path: "/" });
  (await cookies()).delete("bookstage_active_organization");
  return Response.json({ ok: true });
}
