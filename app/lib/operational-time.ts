export const OPERATIONAL_TIME_ZONE = "America/Sao_Paulo";

function parts(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Data inválida.");
  return Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: OPERATIONAL_TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date).map((item) => [item.type, item.value]),
  );
}

export function operationalDate(value: string | Date) {
  const valueParts = parts(value);
  return `${valueParts.year}-${valueParts.month}-${valueParts.day}`;
}

export function operationalTime(value: string | Date) {
  const valueParts = parts(value);
  return `${valueParts.hour}:${valueParts.minute}`;
}

export function currentOperationalDate(now = new Date()) {
  return operationalDate(now);
}

function operationalParts(value: string | Date) {
  const valueParts = parts(value);
  return {
    year: Number(valueParts.year),
    month: Number(valueParts.month),
    day: Number(valueParts.day),
    hour: Number(valueParts.hour),
    minute: Number(valueParts.minute),
  };
}

/** Converts a wall-clock date/time in the operational timezone to an instant.
 * The short iteration also handles future timezone offset changes without
 * hardcoding Brazil's current UTC-03 offset. */
export function operationalDateTime(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Data ou horário operacional inválido.");
  const [year, month, day] = date.split("-").map(Number),
    [hour, minute] = time.split(":").map(Number),
    targetWallClock = Date.UTC(year, month - 1, day, hour, minute);
  let instant = targetWallClock;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const current = operationalParts(new Date(instant)),
      currentWallClock = Date.UTC(
        current.year,
        current.month - 1,
        current.day,
        current.hour,
        current.minute,
      ),
      difference = targetWallClock - currentWallClock;
    instant += difference;
    if (!difference) break;
  }
  const resolved = new Date(instant);
  if (operationalDate(resolved) !== date || operationalTime(resolved) !== time)
    throw new Error("O horário informado não existe no fuso operacional.");
  return resolved.toISOString();
}

export function rescheduleOperationalInterval(
  date: string,
  time: string,
  currentStart: string,
  currentEnd: string | null,
) {
  const startDatetime = operationalDateTime(date, time),
    duration = currentEnd
      ? new Date(currentEnd).getTime() - new Date(currentStart).getTime()
      : null;
  if (duration !== null && duration < 0)
    throw new Error("O intervalo atual da agenda é inválido.");
  return {
    startDatetime,
    endDatetime:
      duration === null
        ? null
        : new Date(new Date(startDatetime).getTime() + duration).toISOString(),
  };
}
