export const roles = ["OWNER", "MANAGER", "SALES", "PRODUCTION", "FINANCE"] as const;
export type Role = (typeof roles)[number];

export function canManageOrganization(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

export function assertTenantAccess<T extends { userId: string; organizationId: string; status: string }>(userId: string, membership: T | null, organizationId: string): T {
  if (!membership || membership.userId !== userId || membership.organizationId !== organizationId || membership.status !== "ACTIVE") {
    throw new TenantAccessError();
  }
  return membership;
}

export class TenantAccessError extends Error {
  status = 404;
  constructor() { super("Organização não encontrada."); }
}

export function makeSlug(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}
