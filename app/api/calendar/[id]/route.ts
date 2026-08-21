import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  conflictResponse,
  findBlockingConflict,
  requireArtistCalendarAccess,
} from "@/app/lib/calendar-access";
import {
  isBlockingStatus,
  normalizeCalendarInput,
} from "@/app/lib/calendar-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

type ExistingEntry = {
  id: string;
  artistId: string;
  status: string;
  title: string;
  opportunityId: string | null;
};

async function findEntry(id: string, organizationId: string) {
  return env.DB.prepare(
    `SELECT entry.id,entry.artist_id AS artistId,entry.status,entry.title,link.opportunity_id AS opportunityId FROM calendar_entries entry LEFT JOIN opportunity_calendar_entries link ON link.calendar_entry_id=entry.id AND link.organization_id=entry.organization_id WHERE entry.id=? AND entry.organization_id=?`,
  )
    .bind(id, organizationId)
    .first<ExistingEntry>();
}

export async function PUT(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await routeContext.params;
  const existing = await findEntry(id, context.organizationId);
  if (!existing)
    return Response.json({ error: "Evento não encontrado." }, { status: 404 });
  if (existing.opportunityId)
    return Response.json(
      {
        error:
          "Esta data está vinculada a uma oportunidade. Faça a alteração pelo CRM.",
      },
      { status: 409 },
    );
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
      { error: "Booking Agents não podem confirmar ou bloquear datas." },
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
      id,
    );
    if (conflict) return conflictResponse(conflict);
  }
  try {
    await env.DB.prepare(
      `UPDATE calendar_entries SET artist_id=?,start_datetime=?,end_datetime=?,status=?,title=?,internal_notes=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
    )
      .bind(
        input.artistId,
        input.startDatetime,
        input.endDatetime,
        input.status,
        input.title,
        input.internalNotes,
        id,
        context.organizationId,
      )
      .run();
  } catch (error) {
    if (String(error).includes("CALENDAR_CONFLICT")) {
      const conflict = await findBlockingConflict(
        context.organizationId,
        input.artistId,
        input.startDatetime,
        input.endDatetime,
        id,
      );
      if (conflict) return conflictResponse(conflict);
    }
    throw error;
  }
  return Response.json({
    entry: { id, ...input, artistName: access.artist.name },
  });
}

export async function DELETE(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await routeContext.params;
  const entry = await findEntry(id, context.organizationId);
  if (!entry)
    return Response.json({ error: "Evento não encontrado." }, { status: 404 });
  if (entry.opportunityId)
    return Response.json(
      {
        error:
          "Esta data está vinculada a uma oportunidade. Cancele a opção pelo CRM.",
      },
      { status: 409 },
    );
  const access = await requireArtistCalendarAccess(
    context.organizationId,
    entry.artistId,
    context.user.id,
    context.membership.role,
    context.membership.artistAccessScope,
    true,
  );
  if ("error" in access) return access.error;
  const body = (await request.json().catch(() => ({}))) as {
    confirm?: boolean;
  };
  if (body.confirm !== true)
    return Response.json(
      {
        error: `Confirme a remoção de “${entry.title}”. Esta ação não pode ser desfeita.`,
      },
      { status: 409 },
    );
  await env.DB.prepare(
    `DELETE FROM calendar_entries WHERE id=? AND organization_id=?`,
  )
    .bind(id, context.organizationId)
    .run();
  return Response.json({ ok: true });
}
