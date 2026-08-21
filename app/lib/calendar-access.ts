import { env } from "cloudflare:workers";
import type { Role } from "./tenant";
import { canManageCalendar, canViewCalendar } from "./calendar-rules";

export async function requireArtistCalendarAccess(organizationId: string, artistId: string, userId: string, role: Role, manage = false) {
  const artist = await env.DB.prepare(`SELECT id,name FROM artists WHERE id=? AND organization_id=?`).bind(artistId, organizationId).first<{id:string;name:string}>();
  if (!artist) return { error: Response.json({ error: "Artista não encontrado." }, { status: 404 }) } as const;
  const assignment = role === "SALES" ? await env.DB.prepare(`SELECT 1 AS assigned FROM artist_sales_assignments WHERE organization_id=? AND artist_id=? AND user_id=?`).bind(organizationId, artistId, userId).first() : { assigned: 1 };
  const allowed = manage ? canManageCalendar(role, Boolean(assignment)) : canViewCalendar(role, Boolean(assignment));
  if (!allowed) return { error: Response.json({ error: manage ? "Sem permissão para alterar esta agenda." : "Artista não encontrado." }, { status: manage ? 403 : 404 }) } as const;
  return { artist } as const;
}

export async function findBlockingConflict(organizationId: string, artistId: string, startDatetime: string, endDatetime: string | null, excludeId?: string) {
  const exclude = excludeId ? "AND id<>?" : "";
  const bindings = [organizationId, artistId, endDatetime ?? startDatetime, startDatetime, ...(excludeId ? [excludeId] : [])];
  return env.DB.prepare(`SELECT id,title,status,start_datetime AS startDatetime,end_datetime AS endDatetime FROM calendar_entries WHERE organization_id=? AND artist_id=? AND status IN ('CONFIRMED','BLOCKED') AND start_datetime<=? AND COALESCE(end_datetime,start_datetime)>=? ${exclude} ORDER BY start_datetime LIMIT 1`).bind(...bindings).first<{id:string;title:string;status:string;startDatetime:string;endDatetime:string|null}>();
}

export function conflictResponse(conflict: {id:string;title:string;status:string;startDatetime:string;endDatetime:string|null}) {
  return Response.json({ error: `Conflito com “${conflict.title}” (${conflict.status}). Revise a data antes de confirmar ou bloquear.`, conflict }, { status: 409 });
}
