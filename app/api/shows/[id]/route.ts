import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { accessibleShow } from "@/app/lib/show-access";
import { canManageFinance } from "@/app/lib/finance-rules";
import { canEditProduction, canViewShowCommercial, normalizeProductionInput, validateShowTransition } from "@/app/lib/show-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

type Detail = { id: string; opportunityId: string; eventName: string; date: string; showTime: string | null; venue: string | null; city: string; state: string; address: string | null; fee: number | null; status: string; localContactName: string | null; localContactPhone: string | null; producerUserId: string | null; producerName: string | null; soundcheckAt: string | null; hotel: string | null; transportation: string | null; airport: string | null; dressingRoom: string | null; technicalInfo: string | null; productionNotes: string | null; riderFileName: string | null; riderFileSize: number | null; stageMapFileName: string | null; stageMapFileSize: number | null; createdAt: string; updatedAt: string; artistName: string; customerName: string; assignedUserId: string | null };

export async function GET(_: Request, route: { params: Promise<{ id: string }> }) {
  const context = await requireActiveMembership(); if ("error" in context) return context.error;
  const { id } = await route.params, access = await accessibleShow(id, context.organizationId, context.user.id, context.membership.role);
  if (!access) return Response.json({ error: "Show não encontrado." }, { status: 404 });
  const show = await env.DB.prepare(`SELECT show.id,show.opportunity_id AS opportunityId,show.event_name AS eventName,show.date,show.show_time AS showTime,show.venue,show.city,show.state,show.address,show.fee,show.status,show.local_contact_name AS localContactName,show.local_contact_phone AS localContactPhone,show.producer_user_id AS producerUserId,producer.name AS producerName,show.soundcheck_at AS soundcheckAt,show.hotel,show.transportation,show.airport,show.dressing_room AS dressingRoom,show.technical_info AS technicalInfo,show.production_notes AS productionNotes,show.rider_file_name AS riderFileName,show.rider_file_size AS riderFileSize,show.stage_map_file_name AS stageMapFileName,show.stage_map_file_size AS stageMapFileSize,show.created_at AS createdAt,show.updated_at AS updatedAt,artist.name AS artistName,customer.name AS customerName,opportunity.assigned_user_id AS assignedUserId FROM shows show JOIN opportunities opportunity ON opportunity.id=show.opportunity_id AND opportunity.organization_id=show.organization_id JOIN artists artist ON artist.id=show.artist_id AND artist.organization_id=show.organization_id JOIN customers customer ON customer.id=show.customer_id AND customer.organization_id=show.organization_id LEFT JOIN users producer ON producer.id=show.producer_user_id WHERE show.id=? AND show.organization_id=?`).bind(id, context.organizationId).first<Detail>();
  if (!show) return Response.json({ error: "Show não encontrado." }, { status: 404 });
  const commercial = canViewShowCommercial(context.membership.role, show.assignedUserId, context.user.id), operational = canEditProduction(context.membership.role), activities = await env.DB.prepare(`SELECT activity.id,activity.type,activity.description,activity.created_at AS createdAt,user.name AS authorName FROM show_activities activity LEFT JOIN users user ON user.id=activity.created_by WHERE activity.show_id=? AND activity.organization_id=? ORDER BY activity.created_at DESC`).bind(id, context.organizationId).all();
  const producers = canEditProduction(context.membership.role) ? (await env.DB.prepare(`SELECT user.id,user.name,membership.role FROM memberships membership JOIN users user ON user.id=membership.user_id WHERE membership.organization_id=? AND membership.status='ACTIVE' AND membership.role IN ('OWNER','MANAGER','PRODUCTION') ORDER BY user.name`).bind(context.organizationId).all()).results : [];
  const dto = { id: show.id, eventName: show.eventName, date: show.date, showTime: show.showTime, venue: show.venue, city: show.city, state: show.state, status: show.status, createdAt: show.createdAt, updatedAt: show.updatedAt, artistName: show.artistName, ...(operational ? { address: show.address, localContactName: show.localContactName, localContactPhone: show.localContactPhone, producerUserId: show.producerUserId, producerName: show.producerName, soundcheckAt: show.soundcheckAt, hotel: show.hotel, transportation: show.transportation, airport: show.airport, dressingRoom: show.dressingRoom, technicalInfo: show.technicalInfo, productionNotes: show.productionNotes, riderFileName: show.riderFileName, riderFileSize: show.riderFileSize, stageMapFileName: show.stageMapFileName, stageMapFileSize: show.stageMapFileSize } : {}), ...(commercial ? { opportunityId: show.opportunityId, customerName: show.customerName, fee: show.fee } : {}) };
  return Response.json({ show: dto, activities: activities.results, producers, permissions: { canEditProduction: canEditProduction(context.membership.role), canCancel: ["OWNER", "MANAGER"].includes(context.membership.role), canViewCommercial: commercial, canManageFinance: canManageFinance(context.membership.role) } });
}

export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const context = await requireActiveMembership(); if ("error" in context) return context.error;
  const { id } = await route.params, access = await accessibleShow(id, context.organizationId, context.user.id, context.membership.role);
  if (!access) return Response.json({ error: "Show não encontrado." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  if ("status" in body) {
    if (body.status === "COMPLETED" && access.date > new Date().toISOString().slice(0, 10)) return Response.json({ error: "Um show futuro não pode ser marcado como realizado." }, { status: 409 });
    let status; try { status = validateShowTransition(access.status, body.status, context.membership.role); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Status inválido." }, { status: 409 }); }
    await env.DB.batch([
      env.DB.prepare(`UPDATE shows SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`).bind(status, id, context.organizationId),
      ...(status === "CANCELLED" ? [env.DB.prepare(`UPDATE calendar_entries SET status='AVAILABLE',updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='CONFIRMED'`).bind(access.calendarEntryId, context.organizationId)] : []),
      env.DB.prepare(`INSERT INTO show_activities (id,organization_id,show_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,'STATUS_CHANGED','Status operacional atualizado.',?,?,?)`).bind(crypto.randomUUID(), context.organizationId, id, access.status, status, context.user.id),
      env.DB.prepare(`INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,'SHOW_STATUS_CHANGED','Status do show atualizado.',?,?,?)`).bind(crypto.randomUUID(), context.organizationId, access.opportunityId, access.status, status, context.user.id),
    ]); return Response.json({ ok: true, status });
  }
  if (!canEditProduction(context.membership.role)) return Response.json({ error: "Sem permissão para editar a produção." }, { status: 403 });
  if (["COMPLETED", "CANCELLED"].includes(access.status)) return Response.json({ error: "Shows concluídos ou cancelados não podem ser editados." }, { status: 409 });
  let input; try { input = normalizeProductionInput(body); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Dados inválidos." }, { status: 400 }); }
  if (input.producerUserId) { const producer = await env.DB.prepare(`SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND status='ACTIVE' AND role IN ('OWNER','MANAGER','PRODUCTION')`).bind(context.organizationId, input.producerUserId).first(); if (!producer) return Response.json({ error: "Produtor responsável inválido para esta organização." }, { status: 400 }); }
  const columns = [
    ["eventName", "event_name"], ["showTime", "show_time"], ["venue", "venue"], ["city", "city"], ["state", "state"], ["address", "address"],
    ["localContactName", "local_contact_name"], ["localContactPhone", "local_contact_phone"], ["producerUserId", "producer_user_id"], ["soundcheckAt", "soundcheck_at"],
    ["hotel", "hotel"], ["transportation", "transportation"], ["airport", "airport"], ["dressingRoom", "dressing_room"], ["technicalInfo", "technical_info"], ["productionNotes", "production_notes"],
  ] as const;
  const changes = columns.filter(([key]) => key in body && !(["eventName", "city", "state"] as string[]).includes(key) || (key in body && input[key] !== null));
  if (!changes.length) return Response.json({ error: "Informe ao menos um campo de produção para atualizar." }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare(`UPDATE shows SET ${changes.map(([, column]) => `${column}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`).bind(...changes.map(([key]) => input[key]), id, context.organizationId),
    env.DB.prepare(`INSERT INTO show_activities (id,organization_id,show_id,type,description,created_by) VALUES (?,?,?,'PRODUCTION_UPDATED','Dados operacionais da produção atualizados.',?)`).bind(crypto.randomUUID(), context.organizationId, id, context.user.id),
    env.DB.prepare(`INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,created_by) VALUES (?,?,?,'SHOW_PRODUCTION_UPDATED','Dados operacionais do show atualizados.',?)`).bind(crypto.randomUUID(), context.organizationId, access.opportunityId, context.user.id),
  ]); return Response.json({ ok: true });
}
