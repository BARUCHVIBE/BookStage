import { env } from "cloudflare:workers";
import { canAccessContract, type ContractStatus } from "./contract-rules";
import type { Role } from "./tenant";

export type ContractAccess = {
  id: string; organizationId: string; opportunityId: string; showId: string | null; customerId: string;
  artistId: string; contractNumber: string; status: ContractStatus; fileKey: string | null; fileName: string | null;
  fileType: string | null; fileSize: number | null; assignedUserId: string | null;
};

export async function accessibleContract(id: string, organizationId: string, userId: string, role: Role) {
  const contract = await env.DB.prepare(`SELECT contract.id,contract.organization_id AS organizationId,contract.opportunity_id AS opportunityId,contract.show_id AS showId,contract.customer_id AS customerId,contract.artist_id AS artistId,contract.contract_number AS contractNumber,contract.status,contract.file_key AS fileKey,contract.file_name AS fileName,contract.file_type AS fileType,contract.file_size AS fileSize,opportunity.assigned_user_id AS assignedUserId FROM contracts contract JOIN opportunities opportunity ON opportunity.id=contract.opportunity_id AND opportunity.organization_id=contract.organization_id WHERE contract.id=? AND contract.organization_id=?`).bind(id, organizationId).first<ContractAccess>();
  return contract && canAccessContract(role, contract.assignedUserId, userId) ? contract : null;
}
