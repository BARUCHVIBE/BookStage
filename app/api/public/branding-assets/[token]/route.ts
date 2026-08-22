import { env } from "cloudflare:workers";

export async function GET(
  _: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(token))
    return new Response("Não encontrado", { status: 404 });
  const object = await env.FILES.get(`public-branding/${token}`);
  if (!object) return new Response("Não encontrado", { status: 404 });
  const headers = new Headers({
    "cache-control": "public, max-age=31536000, immutable",
    "content-security-policy": "default-src 'none'; sandbox",
    "x-content-type-options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
