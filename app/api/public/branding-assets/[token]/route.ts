import { env } from "cloudflare:workers";
import {
  brandingAssetKey,
  brandingAssetUrl,
} from "@/app/lib/branding-assets";

export async function GET(
  _: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(token))
    return new Response("Não encontrado", { status: 404 });
  const url = brandingAssetUrl(token),
    referenced = await env.DB.prepare(
      `SELECT 1 FROM organizations organization LEFT JOIN organization_branding branding ON branding.organization_id=organization.id WHERE organization.status='ACTIVE' AND (organization.logo=? OR branding.favicon_url=? OR branding.catalog_cover_url=?) LIMIT 1`,
    )
      .bind(url, url, url)
      .first();
  if (!referenced) return new Response("Não encontrado", { status: 404 });
  const object = await env.FILES.get(brandingAssetKey(token));
  if (!object) return new Response("Não encontrado", { status: 404 });
  const headers = new Headers({
    "cache-control": "public, max-age=3600, stale-while-revalidate=300",
    "content-security-policy": "default-src 'none'; sandbox",
    "x-content-type-options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
