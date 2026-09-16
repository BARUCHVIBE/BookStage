import type { Role } from "./tenant";

export const commercialRequestMembershipSql =
  `SELECT membership.role AS baseRole,membership.professional_role AS professionalRole,membership.artist_access_scope AS scope,membership.status
   FROM memberships membership
   JOIN organizations organization ON organization.id=membership.organization_id AND organization.status='ACTIVE'
   WHERE membership.organization_id=? AND membership.user_id=?`;

export type CommercialRequestStatus =
  | "NEW"
  | "ACCEPTED"
  | "DECLINED"
  | "CONVERTED";

export type CommercialRequestCapabilities = {
  canAccept: boolean;
  canDecline: boolean;
  canConvert: boolean;
  canOpenOpportunity: boolean;
};

export function canManageCommercialRequest(
  role: Role,
  isOwnBookingRequest: boolean,
) {
  return (
    role === "OWNER" ||
    role === "MANAGER" ||
    (role === "BOOKING_AGENT" && isOwnBookingRequest)
  );
}

export function commercialRequestCapabilities(input: {
  role: Role;
  isOwnBookingRequest: boolean;
  status: CommercialRequestStatus;
  opportunityId: string | null;
}): CommercialRequestCapabilities {
  const canManage = canManageCommercialRequest(
    input.role,
    input.isOwnBookingRequest,
  );

  return {
    canAccept: canManage && input.status === "NEW",
    canDecline:
      canManage && (input.status === "NEW" || input.status === "ACCEPTED"),
    canConvert: canManage && input.status === "ACCEPTED",
    canOpenOpportunity:
      Boolean(input.opportunityId) &&
      (canManage || input.role === "SALES"),
  };
}
