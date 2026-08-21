import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { canManageArtistAssignments, canViewArtist } from "@/app/lib/artist-access";
import { makeSlug } from "@/app/lib/tenant";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

export async function GET(_: Request, routeContext: { params: Promise<{ id: string }> }) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await routeContext.params;
  const artist = await env.DB.prepare(`SELECT id,name,slug,status,photo_url AS photoUrl,cover_url AS coverUrl,genre,description,base_city AS baseCity,show_formats AS showFormats,video_urls AS videoUrls,instagram,spotify,youtube,public_materials AS publicMaterials,is_public AS isPublic,created_at AS createdAt FROM artists WHERE id=? AND organization_id=?`).bind(id,context.organizationId).first();
  if (!artist) return Response.json({ error: "Artista não encontrado." }, { status: 404 });
  const assignments = await env.DB.prepare(`SELECT u.id,u.name,u.email,m.role,a.is_primary AS isPrimary FROM artist_sales_assignments a JOIN users u ON u.id=a.user_id JOIN memberships m ON m.organization_id=a.organization_id AND m.user_id=a.user_id WHERE a.artist_id=? AND a.organization_id=? ORDER BY a.is_primary DESC,u.name`).bind(id,context.organizationId).all();
  const isAssigned = assignments.results.some(row => (row as {id:string}).id === context.user.id);
  if (!canViewArtist(context.membership.role,isAssigned)) return Response.json({ error: "Artista não encontrado." }, { status: 404 });
  return Response.json({ artist, assignments: assignments.results, canManageAssignments: canManageArtistAssignments(context.membership.role) });
}

export async function PATCH(request: Request, routeContext: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (!canManageArtistAssignments(context.membership.role)) return Response.json({ error: "Sem permissão para editar o catálogo." }, { status: 403 });
  const { id } = await routeContext.params;
  const existing = await env.DB.prepare(`SELECT id,name,slug FROM artists WHERE id=? AND organization_id=?`).bind(id,context.organizationId).first<{id:string;name:string;slug:string|null}>();
  if (!existing) return Response.json({ error: "Artista não encontrado." }, { status: 404 });
  const body = await request.json().catch(() => ({})) as Record<string,unknown>;
  const limits:Record<string,number>={name:160,slug:180,photoUrl:1000,coverUrl:1000,genre:160,description:4000,baseCity:160,showFormats:4000,videoUrls:8000,instagram:1000,spotify:1000,youtube:1000,publicMaterials:8000};
  const text = (key:string) => typeof body[key] === "string" && (body[key] as string).trim() ? (body[key] as string).trim() : null;
  for(const [key,max] of Object.entries(limits))if(key in body&&typeof body[key]!=="string")return Response.json({error:`Campo ${key} inválido.`},{status:400});else if(typeof body[key]==="string"&&(body[key] as string).trim().length>max)return Response.json({error:`Campo ${key} excede o limite permitido.`},{status:400});
  if("isPublic" in body&&typeof body.isPublic!=="boolean")return Response.json({error:"Visibilidade pública inválida."},{status:400});
  const name = "name" in body ? text("name") : existing.name;
  if(!name)return Response.json({error:"Nome do artista inválido."},{status:400});
  const requestedSlug = makeSlug("slug" in body ? text("slug") ?? name : existing.slug ?? name) || `artista-${id.slice(0,6)}`;
  const duplicate = await env.DB.prepare(`SELECT id FROM artists WHERE organization_id=? AND slug=? AND id<>?`).bind(context.organizationId,requestedSlug,id).first();
  if (duplicate) return Response.json({ error: "Esta URL pública já está em uso." }, { status: 409 });
  const mapping=[["photoUrl","photo_url"],["coverUrl","cover_url"],["genre","genre"],["description","description"],["baseCity","base_city"],["showFormats","show_formats"],["videoUrls","video_urls"],["instagram","instagram"],["spotify","spotify"],["youtube","youtube"],["publicMaterials","public_materials"]] as const;
  const changes:{column:string;value:string|number|null}[]=[];
  if("name" in body)changes.push({column:"name",value:name});
  if("slug" in body)changes.push({column:"slug",value:requestedSlug});
  for(const [key,column] of mapping)if(key in body)changes.push({column,value:text(key)});
  if("isPublic" in body)changes.push({column:"is_public",value:body.isPublic===true?1:0});
  if(!changes.length)return Response.json({error:"Informe ao menos um campo para atualizar."},{status:400});
  await env.DB.prepare(`UPDATE artists SET ${changes.map(change=>`${change.column}=?`).join(",")},updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`).bind(...changes.map(change=>change.value),id,context.organizationId).run();
  return Response.json({ ok:true, slug:requestedSlug });
}
