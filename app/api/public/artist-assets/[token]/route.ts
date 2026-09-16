import { env } from "cloudflare:workers";
import { artistAssetKey, artistAssetUrl } from "@/app/lib/artist-assets";
import { currentUser } from "@/app/lib/request-context";

export async function GET(
  _: Request,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  if (!/^[a-f0-9-]{36}$/i.test(token))
    return new Response("Não encontrado", { status: 404 });
  const user = await currentUser(),
    url = artistAssetUrl(token),
    authorized = await env.DB.prepare(
      `SELECT CASE WHEN artist.is_public=1 AND artist.status='ACTIVE' THEN 1 ELSE 0 END AS isPublic FROM artists artist JOIN organizations organization ON organization.id=artist.organization_id WHERE organization.status='ACTIVE' AND (artist.photo_url=? OR artist.cover_url=?) AND (artist.is_public=1 AND artist.status='ACTIVE' OR EXISTS (SELECT 1 FROM memberships membership WHERE membership.organization_id=artist.organization_id AND membership.user_id=? AND membership.status='ACTIVE' AND (membership.role<>'SALES' OR membership.artist_access_scope='ALL' OR membership.professional_role='BOOKING_AGENT' AND EXISTS (SELECT 1 FROM booking_collaborator_artist_access booking_access WHERE booking_access.organization_id=artist.organization_id AND booking_access.artist_id=artist.id AND booking_access.user_id=membership.user_id AND booking_access.status='ACTIVE') OR membership.professional_role IS NULL AND EXISTS (SELECT 1 FROM artist_sales_assignments sales_access WHERE sales_access.organization_id=artist.organization_id AND sales_access.artist_id=artist.id AND sales_access.user_id=membership.user_id)))) LIMIT 1`,
    )
      .bind(url, url, user?.id || "")
      .first();
  if (!authorized) return new Response("Não encontrado", { status: 404 });
  const object = await env.FILES.get(artistAssetKey(token));
  if (!object) return new Response("Não encontrado", { status: 404 });
  const headers = new Headers({
    "access-control-allow-origin": "*",
    "cache-control": authorized.isPublic
      ? "public, max-age=3600, stale-while-revalidate=300"
      : "private, no-store",
    "content-security-policy": "default-src 'none'; sandbox",
    "x-content-type-options": "nosniff",
  });
  object.writeHttpMetadata(headers);
  return new Response(object.body, { headers });
}
