import { env } from "cloudflare:workers";
import { getArtistPrimaryCommercial } from "@/app/lib/artist-sales";
import { normalizeEmail,normalizePhone,validatePublicBooking } from "@/app/lib/booking-request-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

async function hash(value:string){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return Array.from(new Uint8Array(bytes)).map(byte=>byte.toString(16).padStart(2,"0")).join("")}

export async function POST(request:Request,context:{params:Promise<{organizationSlug:string;artistSlug:string}>}){
  const rejected=rejectCrossOriginMutation(request);if(rejected)return rejected;
  const {organizationSlug,artistSlug}=await context.params;
  const identity=await env.DB.prepare(`SELECT organization.id AS organizationId,artist.id AS artistId,artist.name AS artistName FROM organizations organization JOIN artists artist ON artist.organization_id=organization.id WHERE organization.slug=? AND artist.slug=? AND organization.status='ACTIVE' AND artist.status='ACTIVE' AND artist.is_public=1`).bind(organizationSlug,artistSlug).first<{organizationId:string;artistId:string;artistName:string}>();
  if(!identity)return Response.json({error:"Artista não encontrado."},{status:404});
  let input;try{input=validatePublicBooking(await request.json() as Record<string,unknown>)}catch(error){return Response.json({error:error instanceof Error?error.message:"Dados inválidos."},{status:400})}
  const source=request.headers.get("cf-connecting-ip")||request.headers.get("x-forwarded-for")?.split(",")[0]||"local",agent=request.headers.get("user-agent")||"unknown",fingerprint=await hash(`${source}|${agent}`);
  const attempts=await env.DB.prepare(`SELECT COUNT(*) AS count FROM public_request_attempts WHERE organization_id=? AND fingerprint_hash=? AND created_at>datetime('now','-1 hour')`).bind(identity.organizationId,fingerprint).first<{count:number}>();
  if(Number(attempts?.count||0)>=5)return Response.json({error:"Muitas solicitações recentes. Tente novamente mais tarde."},{status:429});
  const normalizedEmail=normalizeEmail(input.email),normalizedPhone=normalizePhone(input.phone);
  const matches=await env.DB.prepare(`SELECT id FROM customers WHERE organization_id=? AND (normalized_email=? OR normalized_phone=?)`).bind(identity.organizationId,normalizedEmail,normalizedPhone).all<{id:string}>();
  const customerIds=[...new Set(matches.results.map(item=>item.id))];
  if(customerIds.length>1)return Response.json({error:"Não foi possível identificar o cadastro. Entre em contato com a equipe."},{status:409});
  const customerId=customerIds[0]||crypto.randomUUID(),requestId=crypto.randomUUID(),attemptId=crypto.randomUUID(),assignee=await getArtistPrimaryCommercial(identity.organizationId,identity.artistId);
  const statements=[];
  if(!customerIds.length)statements.push(env.DB.prepare(`INSERT INTO customers (id,organization_id,name,company_name,email,normalized_email,phone,normalized_phone,city,state) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(customerId,identity.organizationId,input.name,input.companyName,input.email,normalizedEmail,input.phone,normalizedPhone,input.city,input.state));
  statements.push(env.DB.prepare(`INSERT INTO opportunities (id,organization_id,artist_id,customer_id,assigned_user_id,stage,source,event_date,city,state,venue,event_type,estimated_audience,budget,notes) VALUES (?,?,?,?,?,'NEW','PUBLIC_CATALOG',?,?,?,?,?,?,?,?)`).bind(requestId,identity.organizationId,identity.artistId,customerId,assignee?.userId||null,input.eventDate,input.city,input.state,input.venue,input.eventType,input.estimatedAudience,input.budget,input.notes));
  statements.push(env.DB.prepare(`INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value) VALUES (?,?,?,'CREATED','Oportunidade criada pelo catálogo público.','PUBLIC_CATALOG')`).bind(crypto.randomUUID(),identity.organizationId,requestId));
  statements.push(env.DB.prepare(`INSERT INTO public_request_attempts (id,organization_id,fingerprint_hash) VALUES (?,?,?)`).bind(attemptId,identity.organizationId,fingerprint));
  statements.push(env.DB.prepare(`DELETE FROM public_request_attempts WHERE created_at<datetime('now','-24 hours')`));
  await env.DB.batch(statements);
  return Response.json({ok:true,requestId,message:`Solicitação enviada para a equipe de ${identity.artistName}.`},{status:201});
}
