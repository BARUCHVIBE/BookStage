import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { opportunityStages } from "@/app/lib/opportunity-rules";

export async function GET(request:Request){
  const context=await requireActiveMembership();if("error" in context)return context.error;
  if(!["OWNER","MANAGER","SALES"].includes(context.membership.role))return Response.json({error:"Sem permissão."},{status:403});
  const url=new URL(request.url),stage=url.searchParams.get("stage")||"",artistId=url.searchParams.get("artistId")||"",assignedUserId=url.searchParams.get("assignedUserId")||"",search=(url.searchParams.get("q")||"").trim().slice(0,100);
  if(stage&&!opportunityStages.includes(stage as typeof opportunityStages[number]))return Response.json({error:"Etapa inválida."},{status:400});
  const clauses=["opportunity.organization_id=?"],bindings:Array<string>=[context.organizationId];
  if(context.membership.role==="SALES"){clauses.push("opportunity.assigned_user_id=?");bindings.push(context.user.id)}
  else if(assignedUserId){clauses.push("opportunity.assigned_user_id=?");bindings.push(assignedUserId)}
  if(stage){clauses.push("opportunity.stage=?");bindings.push(stage)}
  if(artistId){clauses.push("opportunity.artist_id=?");bindings.push(artistId)}
  if(search){clauses.push("(customer.name LIKE ? OR customer.company_name LIKE ? OR artist.name LIKE ? OR opportunity.city LIKE ?)");const term=`%${search}%`;bindings.push(term,term,term,term)}
  const rows=await env.DB.prepare(`SELECT opportunity.id,opportunity.stage,opportunity.source,opportunity.event_date AS eventDate,opportunity.city,opportunity.state,opportunity.venue,opportunity.event_type AS eventType,opportunity.estimated_audience AS estimatedAudience,opportunity.budget,opportunity.proposed_value AS proposedValue,opportunity.next_action AS nextAction,opportunity.next_action_at AS nextActionAt,opportunity.created_at AS createdAt,opportunity.updated_at AS updatedAt,artist.id AS artistId,artist.name AS artistName,customer.id AS customerId,customer.name AS customerName,customer.company_name AS companyName,opportunity.assigned_user_id AS assignedUserId,assignee.name AS assigneeName FROM opportunities opportunity JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id JOIN customers customer ON customer.id=opportunity.customer_id AND customer.organization_id=opportunity.organization_id LEFT JOIN users assignee ON assignee.id=opportunity.assigned_user_id WHERE ${clauses.join(" AND ")} ORDER BY opportunity.updated_at DESC LIMIT 250`).bind(...bindings).all();
  return Response.json({opportunities:rows.results,stages:opportunityStages});
}
