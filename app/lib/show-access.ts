import { env } from "cloudflare:workers";
import { canViewShow, type ShowStatus } from "./show-rules";
import type { Role } from "./tenant";

export type ShowAccess = {
  id: string;
  organizationId: string;
  opportunityId: string;
  calendarEntryId: string;
  date: string;
  fee: number | null;
  status: ShowStatus;
  assignedUserId: string | null;
  originatorUserId: string | null;
  riderFileKey: string | null;
  riderFileName: string | null;
  riderFileType: string | null;
  riderFileSize: number | null;
  stageMapFileKey: string | null;
  stageMapFileName: string | null;
  stageMapFileType: string | null;
  stageMapFileSize: number | null;
};
export async function accessibleShow(
  id: string,
  organizationId: string,
  userId: string,
  role: Role,
) {
  const show = await env.DB.prepare(
    `SELECT show.id,show.organization_id AS organizationId,show.opportunity_id AS opportunityId,show.calendar_entry_id AS calendarEntryId,show.date,show.fee,show.status,show.rider_file_key AS riderFileKey,show.rider_file_name AS riderFileName,show.rider_file_type AS riderFileType,show.rider_file_size AS riderFileSize,show.stage_map_file_key AS stageMapFileKey,show.stage_map_file_name AS stageMapFileName,show.stage_map_file_type AS stageMapFileType,show.stage_map_file_size AS stageMapFileSize,opportunity.assigned_user_id AS assignedUserId,opportunity.originator_user_id AS originatorUserId FROM shows show JOIN opportunities opportunity ON opportunity.id=show.opportunity_id AND opportunity.organization_id=show.organization_id WHERE show.id=? AND show.organization_id=?`,
  )
    .bind(id, organizationId)
    .first<ShowAccess>();
  return show &&
    canViewShow(role, show.assignedUserId, userId, show.originatorUserId)
    ? show
    : null;
}
