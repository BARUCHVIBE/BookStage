import { authenticate, createSession } from "@/app/lib/local-auth";

export async function POST(request: Request) {
  const body = await request.json() as { email?: string; password?: string };
  if (!body.email || !body.password) return Response.json({ error: "Informe e-mail e senha." }, { status: 400 });
  const user = await authenticate(body.email, body.password);
  if (!user) return Response.json({ error: "E-mail ou senha inválidos." }, { status: 401 });
  await createSession(user.id);
  return Response.json({ user: { id: user.id, email: user.email, name: user.name } });
}
