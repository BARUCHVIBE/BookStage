import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { canEditProduction, canViewShowCommercial } from "@/app/lib/show-rules";

type Row = { id: string; eventName: string; date: string; showTime: string | null; venue: string | null; city: string; state: string; status: string; fee: number | null; opportunityId: string; artistName: string; customerName: string; producerName: string | null; assignedUserId: string | null };
export async function GET() {
  const context = await requireActiveMembership(); if ("error" in context) return context.error;
  const salesClause = context.membership.role === "SALES" ? " AND opportunity.assigned_user_id=?" : "";
  if (!["OWNER", "MANAGER", "SALES", "PRODUCTION", "FINANCE"].includes(context.membership.role)) return Response.json({ error: "Sem permissão para acessar shows." }, { status: 403 });
  const bindings = context.membership.role === "SALES" ? [context.organizationId, context.user.id] : [context.organizationId];
  const rows = await env.DB.prepare(`SELECT show.id,show.event_name AS eventName,show.date,show.show_time AS showTime,show.venue,show.city,show.state,show.status,show.fee,show.opportunity_id AS opportunityId,artist.name AS artistName,customer.name AS customerName,producer.name AS producerName,opportunity.assigned_user_id AS assignedUserId FROM shows show JOIN opportunities opportunity ON opportunity.id=show.opportunity_id AND opportunity.organization_id=show.organization_id JOIN artists artist ON artist.id=show.artist_id AND artist.organization_id=show.organization_id JOIN customers customer ON customer.id=show.customer_id AND customer.organization_id=show.organization_id LEFT JOIN users producer ON producer.id=show.producer_user_id WHERE show.organization_id=?${salesClause} ORDER BY show.date,show.show_time`).bind(...bindings).all<Row>();
  return Response.json({ shows: rows.results.map(row => { const commercial = canViewShowCommercial(context.membership.role, row.assignedUserId, context.user.id), operational = canEditProduction(context.membership.role); return { id: row.id, eventName: row.eventName, date: row.date, showTime: row.showTime, venue: row.venue, city: row.city, state: row.state, status: row.status, artistName: row.artistName, ...(operational ? { producerName: row.producerName } : {}), ...(commercial ? { customerName: row.customerName, fee: row.fee, opportunityId: row.opportunityId } : {}) }; }) });
}
