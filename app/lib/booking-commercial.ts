import { env } from "cloudflare:workers";

export type BookingPortfolioArtist = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationLogo: string | null;
  artistId: string;
  artistName: string;
  artistSlug: string;
  photoUrl: string | null;
  coverUrl: string | null;
  genre: string | null;
  baseCity: string | null;
};

export async function getBookingPortfolio(
  publicCode: string,
  filters: { organizationSlug?: string; artistSlug?: string } = {},
) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(publicCode)) return null;
  const profile = await env.DB.prepare(
    `SELECT profile.user_id AS userId,profile.title,profile.avatar_url AS avatarUrl,profile.phone,profile.whatsapp,user.name
     FROM booking_commercial_profiles profile
     JOIN users user ON user.id=profile.user_id
     WHERE profile.public_code=? AND profile.status='ACTIVE'`,
  )
    .bind(publicCode)
    .first<{
      userId: string;
      title: string;
      avatarUrl: string | null;
      phone: string | null;
      whatsapp: string | null;
      name: string;
    }>();
  if (!profile) return null;

  const clauses = [
      "membership.user_id=?",
      "membership.status='ACTIVE'",
      "membership.role='SALES'",
      "membership.professional_role='BOOKING_AGENT'",
      "organization.status='ACTIVE'",
      "artist.status='ACTIVE'",
      "artist.is_public=1",
      "artist.slug IS NOT NULL",
      "(membership.artist_access_scope='ALL' OR access.artist_id IS NOT NULL)",
    ],
    bindings: string[] = [profile.userId];
  if (filters.organizationSlug) {
    clauses.push("organization.slug=?");
    bindings.push(filters.organizationSlug);
  }
  if (filters.artistSlug) {
    clauses.push("artist.slug=?");
    bindings.push(filters.artistSlug);
  }
  const artists = await env.DB.prepare(
    `SELECT organization.id AS organizationId,organization.name AS organizationName,organization.slug AS organizationSlug,organization.logo AS organizationLogo,artist.id AS artistId,artist.name AS artistName,artist.slug AS artistSlug,artist.photo_url AS photoUrl,artist.cover_url AS coverUrl,artist.genre,artist.base_city AS baseCity
     FROM memberships membership
     JOIN organizations organization ON organization.id=membership.organization_id
     JOIN artists artist ON artist.organization_id=membership.organization_id
     LEFT JOIN booking_collaborator_artist_access access ON access.organization_id=membership.organization_id AND access.artist_id=artist.id AND access.user_id=membership.user_id AND access.status='ACTIVE'
     WHERE ${clauses.join(" AND ")}
     ORDER BY organization.name,artist.name`,
  )
    .bind(...bindings)
    .all<BookingPortfolioArtist>();
  return { profile, artists: artists.results };
}
