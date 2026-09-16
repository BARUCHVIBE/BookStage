import {
  changePassword,
  createSession,
} from "@/app/lib/local-auth";
import { passwordPolicyError } from "@/app/lib/password-policy";
import { currentUser } from "@/app/lib/request-context";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

const noStore = { "cache-control": "no-store" };

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user)
    return Response.json(
      { error: "Não autenticado." },
      { status: 401, headers: noStore },
    );
  const body = (await request.json().catch(() => null)) as {
    currentPassword?: unknown;
    newPassword?: unknown;
  } | null;
  if (
    typeof body?.currentPassword !== "string" ||
    typeof body.newPassword !== "string" ||
    body.currentPassword.length > 512
  )
    return Response.json(
      { error: "Informe a senha atual e a nova senha." },
      { status: 400, headers: noStore },
    );
  if (body.currentPassword === body.newPassword)
    return Response.json(
      { error: "A nova senha precisa ser diferente da senha atual." },
      { status: 400, headers: noStore },
    );
  const policyError = passwordPolicyError(body.newPassword);
  if (policyError)
    return Response.json(
      { error: policyError },
      { status: 400, headers: noStore },
    );
  const changed = await changePassword(
    user.id,
    body.currentPassword,
    body.newPassword,
  );
  if (!changed)
    return Response.json(
      { error: "A senha atual está incorreta." },
      { status: 400, headers: noStore },
    );
  await createSession(user.id);
  return Response.json({ ok: true }, { headers: noStore });
}
