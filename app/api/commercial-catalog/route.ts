import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";

export async function GET() {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });

  const rows = await env.DB.prepare(
    `SELECT organization.id AS organizationId,organization.name AS organizationName,organization.slug AS organizationSlug,organization.logo AS organizationLogo,artist.id AS artistId,artist.name AS artistName,artist.slug AS artistSlug,artist.photo_url AS photoUrl,artist.cover_url AS coverUrl,artist.genre,artist.base_city AS baseCity,artist.is_public AS isPublic
     FROM memberships membership
     JOIN organizations organization ON organization.id=membership.organization_id AND organization.status='ACTIVE'
     JOIN artists artist ON artist.organization_id=membership.organization_id AND artist.status='ACTIVE'
     LEFT JOIN booking_collaborator_artist_access access ON access.organization_id=membership.organization_id AND access.artist_id=artist.id AND access.user_id=membership.user_id AND access.status='ACTIVE'
     WHERE membership.user_id=?
       AND membership.status='ACTIVE'
       AND membership.role='SALES'
       AND membership.professional_role='BOOKING_AGENT'
       AND (membership.artist_access_scope='ALL' OR access.artist_id IS NOT NULL)
     ORDER BY organization.name,artist.name`,
  )
    .bind(user.id)
    .all();

  return Response.json({
    booking: { id: user.id, name: user.name, email: user.email },
    artists: rows.results,
  });
}
