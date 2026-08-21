export const roles = [
  "OWNER",
  "MANAGER",
  "SALES",
  "BOOKING_AGENT",
  "PRODUCTION",
  "FINANCE",
] as const;
export type Role = (typeof roles)[number];
export type BaseRole = Exclude<Role, "BOOKING_AGENT">;
export const departments = [
  "MANAGEMENT",
  "COMMERCIAL",
  "PRODUCTION",
  "FINANCE",
] as const;
export type Department = (typeof departments)[number];
export const artistAccessScopes = ["ALL", "ASSIGNED"] as const;
export type ArtistAccessScope = (typeof artistAccessScopes)[number];

export function effectiveRole(
  baseRole: BaseRole,
  professionalRole: string | null,
): Role {
  return baseRole === "SALES" && professionalRole === "BOOKING_AGENT"
    ? "BOOKING_AGENT"
    : baseRole;
}
export function storedRole(role: Role) {
  return role === "BOOKING_AGENT"
    ? {
        baseRole: "SALES" as BaseRole,
        professionalRole: "BOOKING_AGENT" as const,
      }
    : { baseRole: role as BaseRole, professionalRole: null };
}
export function isCommercialRole(role: Role) {
  return (
    role === "OWNER" ||
    role === "MANAGER" ||
    role === "SALES" ||
    role === "BOOKING_AGENT"
  );
}

export function canManageOrganization(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

export function assertTenantAccess<
  T extends { userId: string; organizationId: string; status: string },
>(userId: string, membership: T | null, organizationId: string): T {
  if (
    !membership ||
    membership.userId !== userId ||
    membership.organizationId !== organizationId ||
    membership.status !== "ACTIVE"
  ) {
    throw new TenantAccessError();
  }
  return membership;
}

export class TenantAccessError extends Error {
  status = 404;
  constructor() {
    super("Organização não encontrada.");
  }
}

export function makeSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
