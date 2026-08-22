import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  conflictResponse,
  findBlockingConflict,
  requireArtistCalendarAccess,
} from "@/app/lib/calendar-access";
import {
  canViewCalendarInternalNotes,
  canViewCalendarStatuses,
  isBlockingStatus,
  isCalendarStatus,
  normalizeCalendarInput,
} from "@/app/lib/calendar-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import {
  hasGlobalArtistAccess,
  isArtistScopedCommercial,
} from "@/app/lib/member-access";

function monthRange(month: string | null) {
  if (!month || !/^\d{4}-\d{2}$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  if (monthNumber < 1 || monthNumber > 12) return null;
  return {
    start: new Date(Date.UTC(year, monthNumber - 1, 1)).toISOString(),
    end: new Date(Date.UTC(year, monthNumber, 1)).toISOString(),
  };
}

export async function GET(request: Request) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const params = new URL(request.url).searchParams;
  const range = monthRange(params.get("month"));
  if (!range) return Response.json({ error: "Mês inválido." }, { status: 400 });
  const artistId = params.get("artistId");
  const canViewStatuses = canViewCalendarStatuses(context.membership.role);
  const requestedStatus = params.get("status");
  if (canViewStatuses && requestedStatus && !isCalendarStatus(requestedStatus))
    return Response.json({ error: "Status inválido." }, { status: 400 });
  const status = canViewStatuses ? requestedStatus : null;
  const scoped =
    isArtistScopedCommercial(context.membership.role) &&
    !hasGlobalArtistAccess(
      context.membership.role,
      context.membership.artistAccessScope,
    );
  const salesScope = !scoped
    ? ""
    : context.membership.role === "BOOKING_AGENT"
      ? `AND EXISTS (SELECT 1 FROM booking_collaborator_artist_access assignment WHERE assignment.organization_id=entry.organization_id AND assignment.artist_id=entry.artist_id AND assignment.user_id=? AND assignment.status='ACTIVE')`
      : `AND EXISTS (SELECT 1 FROM artist_sales_assignments assignment WHERE assignment.organization_id=entry.organization_id AND assignment.artist_id=entry.artist_id AND assignment.user_id=?)`;
  const artistScope = artistId ? "AND entry.artist_id=?" : "";
  const statusScope = status ? "AND entry.status=?" : "";
  const canEditField =
    context.membership.role === "BOOKING_AGENT"
      ? "CASE WHEN entry.created_by=? THEN 1 ELSE 0 END AS canEdit"
      : context.membership.role === "FINANCE"
        ? "0 AS canEdit"
        : "1 AS canEdit";
  const bindings: unknown[] = [];
  if (context.membership.role === "BOOKING_AGENT")
    bindings.push(context.user.id);
  bindings.push(context.organizationId, range.end, range.start);
  if (scoped) bindings.push(context.user.id);
  if (artistId) bindings.push(artistId);
  if (status) bindings.push(status);
  const canViewInternalNotes = canViewCalendarInternalNotes(
    context.membership.role,
  );
  const privateFields = canViewInternalNotes
    ? "entry.internal_notes AS internalNotes,entry.created_by AS createdBy"
    : "NULL AS internalNotes,NULL AS createdBy";
  const statusField = canViewStatuses ? "entry.status" : "NULL AS status";
  const visualFields = canViewStatuses
    ? "NULL AS displayTone,NULL AS displayPriority"
    : `CASE entry.status WHEN 'AVAILABLE' THEN 'positive' WHEN 'INQUIRY' THEN 'notice' WHEN 'OPTION' THEN 'attention' WHEN 'CONFIRMED' THEN 'highlight' WHEN 'BLOCKED' THEN 'critical' END AS displayTone,CASE entry.status WHEN 'AVAILABLE' THEN 1 WHEN 'INQUIRY' THEN 2 WHEN 'OPTION' THEN 3 WHEN 'CONFIRMED' THEN 4 WHEN 'BLOCKED' THEN 5 END AS displayPriority`;
  const result = await env.DB.prepare(
    `SELECT entry.id,entry.artist_id AS artistId,artist.name AS artistName,entry.start_datetime AS startDatetime,entry.end_datetime AS endDatetime,${statusField},${visualFields},entry.title,${privateFields},${canEditField},entry.created_at AS createdAt,entry.updated_at AS updatedAt,link.opportunity_id AS opportunityId FROM calendar_entries entry JOIN artists artist ON artist.id=entry.artist_id AND artist.organization_id=entry.organization_id LEFT JOIN opportunity_calendar_entries link ON link.calendar_entry_id=entry.id AND link.organization_id=entry.organization_id WHERE entry.organization_id=? AND entry.start_datetime<? AND COALESCE(entry.end_datetime,entry.start_datetime)>=? ${salesScope} ${artistScope} ${statusScope} ORDER BY entry.start_datetime,artist.name`,
  )
    .bind(...bindings)
    .all();
  return Response.json({
    entries: result.results,
    canCreate: context.membership.role !== "FINANCE",
    canViewInternalNotes,
    canViewStatuses,
  });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  let input;
  try {
    input = normalizeCalendarInput(
      (await request.json()) as Record<string, unknown>,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }
  if (
    context.membership.role === "BOOKING_AGENT" &&
    ["CONFIRMED", "BLOCKED"].includes(input.status)
  )
    return Response.json(
      {
        error:
          "Booking Agents podem criar consultas e OPTIONs; a confirmação exige aprovação comercial.",
      },
      { status: 403 },
    );
  const access = await requireArtistCalendarAccess(
    context.organizationId,
    input.artistId,
    context.user.id,
    context.membership.role,
    context.membership.artistAccessScope,
    true,
  );
  if ("error" in access) return access.error;
  if (isBlockingStatus(input.status)) {
    const conflict = await findBlockingConflict(
      context.organizationId,
      input.artistId,
      input.startDatetime,
      input.endDatetime,
    );
    if (conflict) return conflictResponse(conflict);
  }
  const id = crypto.randomUUID();
  try {
    await env.DB.prepare(
      `INSERT INTO calendar_entries (id,organization_id,artist_id,start_datetime,end_datetime,status,title,internal_notes,created_by) VALUES (?,?,?,?,?,?,?,?,?)`,
    )
      .bind(
        id,
        context.organizationId,
        input.artistId,
        input.startDatetime,
        input.endDatetime,
        input.status,
        input.title,
        canViewCalendarInternalNotes(context.membership.role)
          ? input.internalNotes
          : null,
        context.user.id,
      )
      .run();
  } catch (error) {
    if (String(error).includes("CALENDAR_CONFLICT")) {
      const conflict = await findBlockingConflict(
        context.organizationId,
        input.artistId,
        input.startDatetime,
        input.endDatetime,
      );
      if (conflict) return conflictResponse(conflict);
    }
    throw error;
  }
  return Response.json(
    {
      entry: {
        id,
        ...input,
        status: canViewCalendarStatuses(context.membership.role)
          ? input.status
          : null,
        internalNotes: canViewCalendarInternalNotes(context.membership.role)
          ? input.internalNotes
          : null,
        canEdit: true,
        artistName: access.artist.name,
      },
    },
    { status: 201 },
  );
}
