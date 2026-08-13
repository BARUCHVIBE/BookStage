import { destroySession } from "@/app/lib/local-auth";

export async function POST() {
  await destroySession();
  return Response.json({ ok: true });
}
