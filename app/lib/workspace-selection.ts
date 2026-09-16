export type WorkspaceOrganization = { id: string };

export function resolveInitialWorkspace<T extends WorkspaceOrganization>(
  organizations: T[],
  activeOrganizationId: string | null | undefined,
) {
  const remembered = activeOrganizationId
    ? organizations.find((organization) => organization.id === activeOrganizationId)
    : undefined;
  if (remembered) return { organization: remembered, needsActivation: false };
  if (organizations.length === 1)
    return { organization: organizations[0], needsActivation: true };
  return { organization: null, needsActivation: false };
}
