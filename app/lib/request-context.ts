import { env } from "cloudflare:workers";
import { cookies, headers } from "next/headers";
import { ensureDatabase } from "@/db/bootstrap";

export type CurrentUser = { id: string; email: string; name: string };

export async function currentUser(): Promise<CurrentUser | null> {
  const h = await headers();
  let id = h.get("oai-authenticated-user-id");
  let email = h.get("oai-authenticated-user-email");
  let name = email;
  const encoded = h.get("oai-authenticated-user-full-name");
  if (encoded && h.get("oai-authenticated-user-full-name-encoding") === "percent-encoded-utf-8") {
    try { name = decodeURIComponent(encoded); } catch { /* use email */ }
  }
  if (process.env.NODE_ENV !== "production" && !id) {
    const demo = (await cookies()).get("bookstage_demo_user")?.value ?? "user-a";
    id = demo;
    email = `${demo}@bookstage.local`;
    name = demo === "user-b" ? "Usuário B" : "Usuário A";
  }
  if (!id || !email) return null;
  await ensureDatabase();
  await env.DB.prepare(`INSERT INTO users (id,email,name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,updated_at=CURRENT_TIMESTAMP`).bind(id, email, name).run();
  return { id, email, name: name ?? email };
}

export async function activeOrganizationId() {
  return (await cookies()).get("bookstage_active_organization")?.value ?? null;
}
