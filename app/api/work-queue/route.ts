import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { hasGlobalArtistAccess } from "@/app/lib/member-access";

export async function GET() {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const role = context.membership.role;
  if (!['SALES', 'FINANCE'].includes(role))
    return Response.json({ error: "Fila indisponível para este perfil." }, { status: 403 });

  let salesClause = "";
  const bindings: string[] = [context.organizationId];
  if (role === "SALES") {
    salesClause = " AND (opportunity.assigned_user_id=? OR opportunity.originator_user_id=? OR opportunity.commercial_validator_user_id=?)";
    bindings.push(context.user.id, context.user.id, context.user.id);
    if (!hasGlobalArtistAccess(role, context.membership.artistAccessScope)) {
      salesClause += " AND EXISTS (SELECT 1 FROM artist_sales_assignments access WHERE access.organization_id=opportunity.organization_id AND access.artist_id=opportunity.artist_id AND access.user_id=?)";
      bindings.push(context.user.id);
    }
  }
  const stageClause = role === "FINANCE" ? " AND opportunity.stage<>'CLOSED_LOST'" : " AND opportunity.stage NOT IN ('CLOSED_WON','CLOSED_LOST')";
  const rows = await env.DB.prepare(
    `SELECT opportunity.id,opportunity.stage,opportunity.source,opportunity.event_date AS eventDate,opportunity.city,opportunity.state,opportunity.venue,opportunity.event_type AS eventType,opportunity.proposed_value AS proposedValue,opportunity.budget,opportunity.next_action AS nextAction,opportunity.next_action_at AS nextActionAt,opportunity.commercial_approval_status AS commercialApprovalStatus,opportunity.financial_approval_status AS financialApprovalStatus,opportunity.updated_at AS updatedAt,artist.name AS artistName,customer.name AS customerName,customer.company_name AS companyName,assignee.name AS assigneeName,originator.name AS originatorName,validator.name AS commercialValidatorName,(SELECT contract.status FROM contracts contract WHERE contract.organization_id=opportunity.organization_id AND contract.opportunity_id=opportunity.id ORDER BY contract.created_at DESC LIMIT 1) AS contractStatus,(SELECT approval.notes FROM opportunity_approvals approval WHERE approval.organization_id=opportunity.organization_id AND approval.opportunity_id=opportunity.id AND approval.kind='FINANCIAL' ORDER BY approval.created_at DESC LIMIT 1) AS financialReviewNotes FROM opportunities opportunity JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id JOIN customers customer ON customer.id=opportunity.customer_id AND customer.organization_id=opportunity.organization_id LEFT JOIN users assignee ON assignee.id=opportunity.assigned_user_id LEFT JOIN users originator ON originator.id=opportunity.originator_user_id LEFT JOIN users validator ON validator.id=opportunity.commercial_validator_user_id WHERE opportunity.organization_id=?${salesClause}${stageClause} ORDER BY CASE WHEN opportunity.next_action_at IS NULL THEN 1 ELSE 0 END,opportunity.next_action_at,opportunity.updated_at DESC`,
  ).bind(...bindings).all();

  let receipts: unknown[] = [];
  if (role === "FINANCE") {
    const paymentRows = await env.DB.prepare(
      `SELECT opportunity.id,artist.name AS artistName,customer.name AS customerName,opportunity.event_date AS eventDate,opportunity.proposed_value AS amount,COALESCE(SUM(CASE WHEN payment.status<>'CANCELLED' THEN payment.amount ELSE 0 END),0) AS scheduledAmount,COALESCE(SUM(received.receivedAmount),0) AS receivedAmount,MIN(CASE WHEN payment.status<>'CANCELLED' AND COALESCE(received.receivedAmount,0)<payment.amount THEN payment.due_date END) AS dueDate,SUM(CASE WHEN payment.status<>'CANCELLED' AND payment.due_date<date('now') AND COALESCE(received.receivedAmount,0)<payment.amount THEN 1 ELSE 0 END) AS overdueCount FROM opportunities opportunity JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id JOIN customers customer ON customer.id=opportunity.customer_id AND customer.organization_id=opportunity.organization_id LEFT JOIN payments payment ON payment.opportunity_id=opportunity.id AND payment.organization_id=opportunity.organization_id LEFT JOIN (SELECT organization_id,payment_id,SUM(amount) AS receivedAmount FROM payment_receipts GROUP BY organization_id,payment_id) received ON received.payment_id=payment.id AND received.organization_id=payment.organization_id WHERE opportunity.organization_id=? AND opportunity.financial_approval_status='APPROVED' AND opportunity.stage<>'CLOSED_LOST' GROUP BY opportunity.id ORDER BY overdueCount DESC,dueDate,opportunity.updated_at DESC`,
    ).bind(context.organizationId).all();
    receipts = paymentRows.results;
  }
  return Response.json({ role, opportunities: rows.results, receipts });
}
