import type { Role } from "./tenant";

export type AssignmentInput = { organizationId: string; userId: string; role: Role; status: string };

export function canManageArtistAssignments(role: Role) {
  return role === "OWNER" || role === "MANAGER";
}

export function canViewArtist(role: Role, assigned: boolean) {
  return role === "OWNER" || role === "MANAGER" || (role === "SALES" && assigned);
}

export function validateCommercialAssignments(organizationId: string, primaryUserId: string | null, authorizedUserIds: string[], memberships: AssignmentInput[]) {
  const eligible = new Map(memberships.filter(member => member.organizationId === organizationId && member.status === "ACTIVE" && ["OWNER","MANAGER","SALES"].includes(member.role)).map(member => [member.userId, member]));
  const requested = [...new Set([...(primaryUserId ? [primaryUserId] : []), ...authorizedUserIds])];
  if (requested.some(userId => !eligible.has(userId))) throw new Error("Usuário comercial inválido para esta organização.");
  return { primaryUserId, authorizedUserIds: [...new Set(authorizedUserIds)].filter(userId => userId !== primaryUserId) };
}
