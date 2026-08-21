import { destroySession } from "@/app/lib/local-auth";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  await destroySession();
  return Response.json({ ok: true });
}
