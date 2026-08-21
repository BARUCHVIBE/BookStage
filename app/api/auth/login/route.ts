import { authenticate, createSession } from "@/app/lib/local-auth";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import {
  clearLoginFailures,
  loginRateLimit,
  recordLoginFailure,
} from "@/app/lib/login-security";

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const body = (await request.json().catch(() => null)) as {
    email?: string;
    password?: string;
  } | null;
  if (!body)
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  if (!body.email || !body.password)
    return Response.json({ error: "Informe e-mail e senha." }, { status: 400 });
  if (body.email.length > 180 || body.password.length > 512)
    return Response.json(
      { error: "E-mail ou senha inválidos." },
      { status: 401 },
    );
  const rate = await loginRateLimit(request, body.email);
  if (rate.blocked)
    return Response.json(
      { error: "Muitas tentativas de login. Aguarde alguns minutos." },
      { status: 429, headers: { "retry-after": "900" } },
    );
  const user = await authenticate(body.email, body.password);
  if (!user) {
    await recordLoginFailure(rate.keys);
    return Response.json(
      { error: "E-mail ou senha inválidos." },
      { status: 401 },
    );
  }
  await clearLoginFailures(rate.keys);
  await createSession(user.id);
  return Response.json({
    user: { id: user.id, email: user.email, name: user.name },
  });
}
