import { env } from "cloudflare:workers";
import type { ArtistAccessScope, Role } from "./tenant";

export function hasGlobalArtistAccess(role: Role, scope: ArtistAccessScope) {
  return (
    ["OWNER", "MANAGER", "PRODUCTION", "FINANCE"].includes(role) ||
    (["SALES", "BOOKING_AGENT"].includes(role) && scope === "ALL")
  );
}
export function isArtistScopedCommercial(role: Role) {
  return role === "SALES" || role === "BOOKING_AGENT";
}
export async function canAccessArtist(
  organizationId: string,
  userId: string,
  role: Role,
  scope: ArtistAccessScope,
  artistId: string,
) {
  const artist = await env.DB.prepare(
    `SELECT 1 FROM artists WHERE id=? AND organization_id=? AND status='ACTIVE'`,
  )
    .bind(artistId, organizationId)
    .first();
  if (!artist) return false;
  if (hasGlobalArtistAccess(role, scope)) return true;
  if (role === "BOOKING_AGENT")
    return Boolean(
      await env.DB.prepare(
        `SELECT 1 FROM booking_collaborator_artist_access WHERE organization_id=? AND artist_id=? AND user_id=? AND status='ACTIVE'`,
      )
        .bind(organizationId, artistId, userId)
        .first(),
    );
  if (role === "SALES")
    return Boolean(
      await env.DB.prepare(
        `SELECT 1 FROM artist_sales_assignments WHERE organization_id=? AND artist_id=? AND user_id=?`,
      )
        .bind(organizationId, artistId, userId)
        .first(),
    );
  return false;
}
export function canManageTeam(role: Role) {
  return role === "OWNER";
}
export function canViewTeam(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}
