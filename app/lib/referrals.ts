import { env } from "cloudflare:workers";
import { effectiveRole, type ArtistAccessScope, type BaseRole } from "./tenant";
import { canAccessArtist } from "./member-access";
export const referralCookie = "bookstage_referral";
export const referralSessionCookie = "bookstage_referral_session";
export async function sha256(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
export function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return btoa(String.fromCharCode(...value))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
export function readCookie(request: Request, name: string) {
  const source = request.headers.get("cookie") || "";
  for (const part of source.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}
export function cookieHeader(
  name: string,
  value: string,
  maxAge: number,
  secure: boolean,
) {
  return `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;
}
type ValidLink = {
  id: string;
  organizationId: string;
  artistId: string;
  userId: string;
  organizationSlug: string;
  artistSlug: string;
  memberRole: BaseRole;
  professionalRole: string | null;
  artistAccessScope: ArtistAccessScope;
};
export async function validReferralToken(
  token: string,
  expected?: { organizationId?: string; artistId?: string },
) {
  if (!token || token.length > 200) return null;
  const tokenHash = await sha256(token),
    link = await env.DB.prepare(
      `SELECT link.id,link.organization_id AS organizationId,link.artist_id AS artistId,link.user_id AS userId,organization.slug AS organizationSlug,artist.slug AS artistSlug,membership.role AS memberRole,membership.professional_role AS professionalRole,membership.artist_access_scope AS artistAccessScope FROM commercial_referral_links link JOIN organizations organization ON organization.id=link.organization_id JOIN artists artist ON artist.id=link.artist_id AND artist.organization_id=link.organization_id JOIN memberships membership ON membership.organization_id=link.organization_id AND membership.user_id=link.user_id WHERE link.token_hash=? AND link.status='ACTIVE' AND (link.expires_at IS NULL OR link.expires_at>CURRENT_TIMESTAMP) AND link.revoked_at IS NULL AND organization.status='ACTIVE' AND artist.status='ACTIVE' AND artist.is_public=1 AND membership.status='ACTIVE'`,
    )
      .bind(tokenHash)
      .first<ValidLink>();
  if (
    !link ||
    (expected?.organizationId &&
      expected.organizationId !== link.organizationId) ||
    (expected?.artistId && expected.artistId !== link.artistId)
  )
    return null;
  const role = effectiveRole(link.memberRole, link.professionalRole);
  if (
    role !== "BOOKING_AGENT" ||
    !(await canAccessArtist(
      link.organizationId,
      link.userId,
      role,
      link.artistAccessScope,
      link.artistId,
    ))
  )
    return null;
  return { ...link, role };
}
