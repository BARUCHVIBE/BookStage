import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";

export async function GET() {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (
    !["OWNER", "MANAGER", "SALES", "BOOKING_AGENT"].includes(
      context.membership.role,
    )
  )
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  const salesScope =
      context.membership.role === "BOOKING_AGENT"
        ? "AND (opportunity.assigned_user_id=? OR opportunity.originator_user_id=?)"
        : context.membership.role === "SALES"
          ? "AND (opportunity.assigned_user_id=? OR opportunity.originator_user_id=? OR opportunity.commercial_validator_user_id=?)"
          : "",
    bindings = [
      context.organizationId,
      ...(context.membership.role === "BOOKING_AGENT"
        ? [context.user.id, context.user.id]
        : context.membership.role === "SALES"
          ? [context.user.id, context.user.id, context.user.id]
          : []),
    ];
  const rows = await env.DB.prepare(
    `SELECT opportunity.id,opportunity.stage AS status,opportunity.source,opportunity.event_date AS eventDate,opportunity.city,opportunity.state,opportunity.venue,opportunity.event_type AS eventType,opportunity.estimated_audience AS estimatedAudience,opportunity.budget,opportunity.notes,opportunity.created_at AS createdAt,artist.name AS artistName,customer.name AS customerName,customer.company_name AS companyName,customer.email,customer.phone,assignee.name AS assigneeName FROM opportunities opportunity JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id JOIN customers customer ON customer.id=opportunity.customer_id AND customer.organization_id=opportunity.organization_id LEFT JOIN users assignee ON assignee.id=opportunity.assigned_user_id WHERE opportunity.organization_id=? ${salesScope} ORDER BY opportunity.created_at DESC LIMIT 100`,
  )
    .bind(...bindings)
    .all();
  return Response.json({ requests: rows.results });
}
