export const opportunityCalendarActions = [
  "INQUIRY",
  "OPTION",
  "CONFIRM",
  "CANCEL_OPTION",
] as const;
export type OpportunityCalendarAction =
  (typeof opportunityCalendarActions)[number];

type CalendarConfirmationRole =
  | "OWNER"
  | "MANAGER"
  | "SALES"
  | "BOOKING_AGENT"
  | "PRODUCTION"
  | "FINANCE";

export function canConfirmOpportunityDate(
  role: CalendarConfirmationRole,
  userId: string,
  commercialValidatorUserId: string | null,
) {
  return (
    role === "OWNER" ||
    role === "MANAGER" ||
    (role === "SALES" && commercialValidatorUserId === userId)
  );
}

export function defaultOpportunityInterval(eventDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate))
    throw new Error("Data do evento inválida.");
  return {
    // BookStage currently operates in America/Sao_Paulo. Persist instants in UTC.
    startDatetime: new Date(`${eventDate}T18:00:00-03:00`).toISOString(),
    endDatetime: new Date(`${eventDate}T23:00:00-03:00`).toISOString(),
  };
}

export function normalizeOpportunityInterval(
  startValue: unknown,
  endValue: unknown,
) {
  const start = new Date(typeof startValue === "string" ? startValue : ""),
    end = endValue
      ? new Date(typeof endValue === "string" ? endValue : "")
      : null;
  if (Number.isNaN(start.getTime()) || (end && Number.isNaN(end.getTime())))
    throw new Error("Data ou horário inválido.");
  if (end && end.getTime() < start.getTime())
    throw new Error("O término não pode ser anterior ao início.");
  return {
    startDatetime: start.toISOString(),
    endDatetime: end?.toISOString() ?? null,
  };
}

export function isOpportunityCalendarAction(
  value: unknown,
): value is OpportunityCalendarAction {
  return (
    typeof value === "string" &&
    opportunityCalendarActions.includes(value as OpportunityCalendarAction)
  );
}

export function canMutateOpportunityCalendar(stage: string) {
  return stage !== "CLOSED_WON" && stage !== "CLOSED_LOST";
}

export function lostOpportunityCalendarDisposition(
  status: string | null,
  hasShow: boolean,
) {
  if (hasShow) return "BLOCK_SHOW" as const;
  if (status === "BLOCKED") return "BLOCK_OPERATIONAL" as const;
  return status ? ("RELEASE" as const) : ("NONE" as const);
}
