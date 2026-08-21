export const opportunityCalendarActions = [
  "INQUIRY",
  "OPTION",
  "CONFIRM",
  "CANCEL_OPTION",
] as const;
export type OpportunityCalendarAction =
  (typeof opportunityCalendarActions)[number];

export function defaultOpportunityInterval(eventDate: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate))
    throw new Error("Data do evento inválida.");
  return {
    startDatetime: `${eventDate}T18:00:00.000Z`,
    endDatetime: `${eventDate}T23:00:00.000Z`,
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
