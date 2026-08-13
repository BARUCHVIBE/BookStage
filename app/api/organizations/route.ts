import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";
import { makeSlug } from "@/app/lib/tenant";

export async function GET() {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const result = await env.DB.prepare(`SELECT o.*, m.role FROM organizations o JOIN memberships m ON m.organization_id=o.id WHERE m.user_id=? AND m.status='ACTIVE' ORDER BY o.name`).bind(user.id).all();
  return Response.json({ organizations: result.results });
}

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Não autenticado" }, { status: 401 });
  const body = await request.json() as Record<string, string>;
  const name = body.name?.trim();
  const email = body.email?.trim();
  if (!name || !email) return Response.json({ error: "Nome e e-mail são obrigatórios." }, { status: 400 });
  const id = crypto.randomUUID();
  const base = makeSlug(body.slug || name) || "organizacao";
  const slug = `${base}-${id.slice(0, 6)}`;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO organizations (id,name,slug,logo,email,phone,document,website,instagram) VALUES (?,?,?,?,?,?,?,?,?)`).bind(id,name,slug,body.logo||null,email,body.phone||null,body.document||null,body.website||null,body.instagram||null),
    env.DB.prepare(`INSERT INTO memberships (organization_id,user_id,role,status) VALUES (?,?,'OWNER','ACTIVE')`).bind(id,user.id),
  ]);
  return Response.json({ organization: { id, name, slug, email, role: "OWNER" } }, { status: 201 });
}
