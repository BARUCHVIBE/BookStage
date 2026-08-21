import { env } from "cloudflare:workers";
import { canAccessOpportunity } from "./opportunity-rules";
import type { Role } from "./tenant";

export type ProposalAccess = {
  id: string;
  organizationId: string;
  opportunityId: string;
  artistId: string;
  customerId: string;
  proposalNumber: string;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  assignedUserId: string | null;
};

export async function accessibleProposal(id: string, organizationId: string, userId: string, role: Role) {
  const proposal = await env.DB.prepare(`SELECT proposal.id,proposal.organization_id AS organizationId,proposal.opportunity_id AS opportunityId,proposal.artist_id AS artistId,proposal.customer_id AS customerId,proposal.proposal_number AS proposalNumber,proposal.status,opportunity.assigned_user_id AS assignedUserId FROM proposals proposal JOIN opportunities opportunity ON opportunity.id=proposal.opportunity_id AND opportunity.organization_id=proposal.organization_id WHERE proposal.id=? AND proposal.organization_id=?`).bind(id, organizationId).first<ProposalAccess>();
  return proposal && canAccessOpportunity(role, proposal.assignedUserId, userId) ? proposal : null;
}
