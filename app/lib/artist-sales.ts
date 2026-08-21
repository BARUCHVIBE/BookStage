import { env } from "cloudflare:workers";

export type ArtistPrimaryCommercial = {
  userId: string;
  name: string | null;
  email: string;
};

/**
 * Tenant-scoped lookup intended for future opportunity creation flows.
 * The organization is always part of the query so an artist identifier alone
 * can never leak or inherit a commercial owner from another tenant.
 */
export async function getArtistPrimaryCommercial(
  organizationId: string,
  artistId: string,
) {
  return env.DB.prepare(
    `SELECT u.id AS userId,u.name,u.email
     FROM artist_sales_assignments assignment
     JOIN users u ON u.id=assignment.user_id
     JOIN memberships membership ON membership.organization_id=assignment.organization_id AND membership.user_id=assignment.user_id
     WHERE assignment.organization_id=?
       AND assignment.artist_id=?
       AND assignment.is_primary=1
       AND membership.status='ACTIVE'
       AND membership.professional_role IS NULL
     LIMIT 1`,
  )
    .bind(organizationId, artistId)
    .first<ArtistPrimaryCommercial>();
}
