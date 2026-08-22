import type { Role } from "./tenant";

export const calendarStatuses = [
  "AVAILABLE",
  "INQUIRY",
  "OPTION",
  "CONFIRMED",
  "BLOCKED",
] as const;
export type CalendarStatus = (typeof calendarStatuses)[number];

export type CalendarInput = {
  artistId: string;
  startDatetime: string;
  endDatetime: string | null;
  status: CalendarStatus;
  title: string;
  internalNotes: string | null;
};

export function isCalendarStatus(value: unknown): value is CalendarStatus {
  return (
    typeof value === "string" &&
    calendarStatuses.includes(value as CalendarStatus)
  );
}

export function canViewCalendar(role: Role, artistAssigned: boolean) {
  return !["SALES", "BOOKING_AGENT"].includes(role) || artistAssigned;
}

export function canManageCalendar(role: Role, artistAssigned: boolean) {
  return (
    role === "OWNER" ||
    role === "MANAGER" ||
    role === "PRODUCTION" ||
    (["SALES", "BOOKING_AGENT"].includes(role) && artistAssigned)
  );
}

export function canViewCalendarInternalNotes(role: Role) {
  return role !== "BOOKING_AGENT" && role !== "FINANCE";
}

export function canViewCalendarStatuses(role: Role) {
  return role !== "BOOKING_AGENT";
}

export function normalizeCalendarInput(
  body: Record<string, unknown>,
): CalendarInput {
  const artistId =
    typeof body.artistId === "string" ? body.artistId.trim() : "";
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const startDatetime =
    typeof body.startDatetime === "string" ? body.startDatetime : "";
  const endDatetime =
    typeof body.endDatetime === "string" && body.endDatetime
      ? body.endDatetime
      : null;
  if (!artistId || !title || !isCalendarStatus(body.status))
    throw new Error("Artista, título e status são obrigatórios.");
  if (artistId.length > 100 || title.length > 180)
    throw new Error("Artista ou título excede o limite permitido.");
  const start = new Date(startDatetime);
  const end = endDatetime ? new Date(endDatetime) : null;
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime())))
    throw new Error("Data ou horário inválido.");
  if (end && end.getTime() < start.getTime())
    throw new Error("O término não pode ser anterior ao início.");
  return {
    artistId,
    title,
    status: body.status,
    startDatetime: start.toISOString(),
    endDatetime: end?.toISOString() ?? null,
    internalNotes:
      typeof body.internalNotes === "string" && body.internalNotes.trim()
        ? body.internalNotes.trim().slice(0, 4000)
        : null,
  };
}

export function intervalsOverlap(
  startA: string,
  endA: string | null,
  startB: string,
  endB: string | null,
) {
  return startA <= (endB ?? startB) && (endA ?? startA) >= startB;
}

export function isBlockingStatus(status: CalendarStatus) {
  return status === "CONFIRMED" || status === "BLOCKED";
}
