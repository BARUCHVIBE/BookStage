import { env } from "cloudflare:workers";

export type ArtistPrimaryCommercial = {
  artistId: string;
  organizationId: string;
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "SALES";
};

const primaryCommercialQuery = `SELECT assignment.artist_id AS artistId,assignment.organization_id AS organizationId,u.id AS userId,u.name,u.email,membership.role
  FROM artist_sales_assignments assignment
  JOIN users u ON u.id=assignment.user_id
  JOIN memberships membership ON membership.organization_id=assignment.organization_id AND membership.user_id=assignment.user_id
  WHERE assignment.organization_id=?
    AND assignment.is_primary=1
    AND membership.status='ACTIVE'
    AND membership.professional_role IS NULL
    AND membership.role IN ('OWNER','MANAGER','SALES')`;

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
    `${primaryCommercialQuery} AND assignment.artist_id=? LIMIT 1`,
  )
    .bind(organizationId, artistId)
    .first<ArtistPrimaryCommercial>();
}

export async function getOrganizationPrimaryCommercials(
  organizationId: string,
) {
  const rows = await env.DB.prepare(primaryCommercialQuery)
    .bind(organizationId)
    .all<ArtistPrimaryCommercial>();
  return new Map(rows.results.map((commercial) => [commercial.artistId, commercial]));
}

/**
 * Repairs legacy opportunities that were created before the artist's primary
 * commercial was consistently snapshotted. Existing validators are preserved:
 * changing an artist's current primary must not rewrite negotiation history.
 */
export async function ensureOpportunityCommercialValidator(
  organizationId: string,
  opportunityId: string,
  artistId: string,
  currentValidatorUserId: string | null,
) {
  if (currentValidatorUserId) return currentValidatorUserId;

  const primaryCommercial = await getArtistPrimaryCommercial(
    organizationId,
    artistId,
  );
  if (!primaryCommercial) return null;

  await env.DB.prepare(
    `UPDATE opportunities
      SET commercial_validator_user_id=?,updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND organization_id=? AND artist_id=?
        AND commercial_validator_user_id IS NULL`,
  )
    .bind(
      primaryCommercial.userId,
      opportunityId,
      organizationId,
      artistId,
    )
    .run();

  const persisted = await env.DB.prepare(
    `SELECT commercial_validator_user_id AS userId
      FROM opportunities
      WHERE id=? AND organization_id=? AND artist_id=?`,
  )
    .bind(opportunityId, organizationId, artistId)
    .first<{ userId: string | null }>();

  return persisted?.userId ?? null;
}
