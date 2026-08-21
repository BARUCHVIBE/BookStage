import type { Role } from "./tenant";

export const showStatuses = ["CONFIRMED", "IN_PREPARATION", "COMPLETED", "CANCELLED"] as const;
export type ShowStatus = typeof showStatuses[number];

export function canViewShow(role: Role, assignedUserId: string | null, currentUserId: string) {
  return role === "OWNER" || role === "MANAGER" || role === "PRODUCTION" || role === "FINANCE" || (role === "SALES" && assignedUserId === currentUserId);
}
export function canEditProduction(role: Role) { return role === "OWNER" || role === "MANAGER" || role === "PRODUCTION"; }
export function canViewShowCommercial(role: Role, assignedUserId: string | null, currentUserId: string) { return role === "OWNER" || role === "MANAGER" || role === "FINANCE" || (role === "SALES" && assignedUserId === currentUserId); }

export function validateShowTransition(current: ShowStatus, next: unknown, role: Role) {
  if (typeof next !== "string" || !showStatuses.includes(next as ShowStatus)) throw new Error("Status de show inválido.");
  const allowed: Record<ShowStatus, ShowStatus[]> = { CONFIRMED: ["IN_PREPARATION", "CANCELLED"], IN_PREPARATION: ["COMPLETED", "CANCELLED"], COMPLETED: [], CANCELLED: [] };
  if (!allowed[current].includes(next as ShowStatus)) throw new Error("Transição de status não permitida.");
  if (next === "CANCELLED" && role !== "OWNER" && role !== "MANAGER") throw new Error("Somente OWNER ou MANAGER pode cancelar um show.");
  if (!canEditProduction(role)) throw new Error("Sem permissão para alterar o status do show.");
  return next as ShowStatus;
}

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) || null : null;
export function normalizeProductionInput(body: Record<string, unknown>) {
  const showTime = clean(body.showTime, 5), soundcheckAt = clean(body.soundcheckAt, 16);
  if (showTime && !/^([01]\d|2[0-3]):[0-5]\d$/.test(showTime)) throw new Error("Horário do show inválido.");
  if (soundcheckAt && !/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(soundcheckAt)) throw new Error("Horário da passagem de som inválido.");
  return {
    eventName: clean(body.eventName, 200), showTime, venue: clean(body.venue, 200), city: clean(body.city, 120), state: clean(body.state, 2)?.toUpperCase() || null,
    address: clean(body.address, 300), localContactName: clean(body.localContactName, 160), localContactPhone: clean(body.localContactPhone, 40), producerUserId: clean(body.producerUserId, 100),
    soundcheckAt, hotel: clean(body.hotel, 1000), transportation: clean(body.transportation, 1000), airport: clean(body.airport, 500), dressingRoom: clean(body.dressingRoom, 1000),
    technicalInfo: clean(body.technicalInfo, 4000), productionNotes: clean(body.productionNotes, 4000),
  };
}

export function validateShowDocument(file: File) {
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error("O arquivo deve ter no máximo 10 MB.");
  const allowed = ["application/pdf", "image/png", "image/jpeg"];
  if (!allowed.includes(file.type)) throw new Error("Envie PDF, PNG ou JPG.");
}
export function safeShowFileName(value: string) { return value.replace(/[\r\n"\\/]/g, "_").replace(/[^a-zA-Z0-9À-ÿ._ -]/g, "_").slice(0, 180).trim() || "arquivo"; }
