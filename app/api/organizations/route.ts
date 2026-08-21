import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";
import { makeSlug } from "@/app/lib/tenant";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import { normalizeOrganizationInput } from "@/app/lib/organization-rules";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const result = await env.DB.prepare(`SELECT o.*, m.role FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE m.user_id=? AND m.status='ACTIVE' ORDER BY o.name`).bind(user.id).all();
  return Response.json({ organizations: result.results });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return Response.json({ error: "Requisição inválida." }, { status: 400 });
  let input;try{input=normalizeOrganizationInput(body)}catch(error){return Response.json({error:error instanceof Error?error.message:"Dados inválidos."},{status:400})}
  const {name,email}=input;
  const id = crypto.randomUUID();
  const base = makeSlug(input.slug || name) || "organizacao";
  const slug = `${base}-${id.slice(0, 6)}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id,name,slug,logo,email,phone,document,website,instagram,description) VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id,name,slug,input.logo,email,input.phone,input.document,input.website,input.instagram,input.description),
    env.DB.prepare(`INSERT INTO memberships (organization_id,user_id,role,status) VALUES (?,?,'OWNER','ACTIVE')`).bind(id,user.id),
  ]);
  return Response.json({ organization: { id, name, slug, email, role: "OWNER" } }, { status: 201 });
}
