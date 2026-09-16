import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  commercialRequestCapabilities,
  type CommercialRequestStatus,
} from "@/app/lib/commercial-request-access";

export async function GET() {
  const context = await requireActiveMembership();
  if ('error' in context) return context.error;
  const { user } = context;
  const booking = context.membership.role === 'BOOKING_AGENT';
  let where = "organization.status='ACTIVE' AND request.booking_user_id=? AND EXISTS (SELECT 1 FROM memberships active_booking WHERE active_booking.organization_id=request.organization_id AND active_booking.user_id=request.booking_user_id AND active_booking.status='ACTIVE' AND active_booking.role='SALES' AND active_booking.professional_role='BOOKING_AGENT' AND (active_booking.artist_access_scope='ALL' OR EXISTS (SELECT 1 FROM booking_collaborator_artist_access access WHERE access.organization_id=request.organization_id AND access.artist_id=request.artist_id AND access.user_id=active_booking.user_id AND access.status='ACTIVE')))",
    bindings: string[] = [user.id];
  if (!booking) {
    if (!['OWNER','MANAGER','SALES'].includes(context.membership.role))
      return Response.json({ error: "Sem permissão." }, { status: 403 });
    where = "request.organization_id=?";
    bindings = [context.organizationId];
    if (context.membership.role === 'SALES') {
      where += ' AND EXISTS (SELECT 1 FROM artist_sales_assignments assignment WHERE assignment.organization_id=request.organization_id AND assignment.artist_id=request.artist_id AND assignment.user_id=?)';
      bindings.push(user.id);
    }
  }
  const requests = await env.DB.prepare(
    `SELECT request.id,request.organization_id AS organizationId,organization.name AS organizationName,request.artist_id AS artistId,artist.name AS artistName,request.status,request.customer_name AS customerName,request.company_name AS companyName,request.phone,request.email,request.document,request.event_date AS eventDate,request.city,request.state,request.venue,request.event_type AS eventType,request.estimated_audience AS estimatedAudience,request.budget,request.notes,request.decision_notes AS decisionNotes,request.decided_at AS decidedAt,request.opportunity_id AS opportunityId,request.created_at AS createdAt FROM commercial_requests request JOIN organizations organization ON organization.id=request.organization_id JOIN artists artist ON artist.id=request.artist_id AND artist.organization_id=request.organization_id WHERE ${where} ORDER BY CASE request.status WHEN 'NEW' THEN 0 WHEN 'ACCEPTED' THEN 1 ELSE 2 END,request.created_at DESC`,
  )
    .bind(...bindings)
    .all();
  const visibleRequests = requests.results.map((request) => {
    const item = request as {
      status: CommercialRequestStatus;
      opportunityId: string | null;
    };
    return {
      ...request,
      capabilities: commercialRequestCapabilities({
        role: context.membership.role,
        isOwnBookingRequest: booking,
        status: item.status,
        opportunityId: item.opportunityId,
      }),
    };
  });
  return Response.json({ requests: visibleRequests, isBooking: Boolean(booking) });
}
