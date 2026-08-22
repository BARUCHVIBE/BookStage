import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  normalizeOrganizationBranding,
  resolveOrganizationBranding,
} from "@/app/lib/organization-branding";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

async function branding(organizationId: string) {
  const row = await env.DB.prepare(
    `SELECT organization.logo AS logoUrl,branding.favicon_url AS faviconUrl,branding.primary_color AS primaryColor,branding.secondary_color AS secondaryColor,branding.accent_color AS accentColor,branding.background_color AS backgroundColor,branding.heading_font AS headingFont,branding.body_font AS bodyFont,branding.catalog_cover_url AS catalogCoverUrl,branding.catalog_title AS catalogTitle,branding.catalog_description AS catalogDescription FROM organizations organization LEFT JOIN organization_branding branding ON branding.organization_id=organization.id WHERE organization.id=?`,
  )
    .bind(organizationId)
    .first();
  return resolveOrganizationBranding(row);
}

export async function GET() {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  return Response.json({ branding: await branding(context.organizationId) });
}

export async function PATCH(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (context.membership.role !== "OWNER")
    return Response.json(
      { error: "Somente o Owner pode alterar a identidade visual." },
      { status: 403 },
    );
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body)
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  let input;
  try {
    input = normalizeOrganizationBranding(body);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE organizations SET logo=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(input.logoUrl, context.organizationId),
    env.DB.prepare(
      `INSERT INTO organization_branding (organization_id,favicon_url,primary_color,secondary_color,accent_color,background_color,heading_font,body_font,catalog_cover_url,catalog_title,catalog_description) VALUES (?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(organization_id) DO UPDATE SET favicon_url=excluded.favicon_url,primary_color=excluded.primary_color,secondary_color=excluded.secondary_color,accent_color=excluded.accent_color,background_color=excluded.background_color,heading_font=excluded.heading_font,body_font=excluded.body_font,catalog_cover_url=excluded.catalog_cover_url,catalog_title=excluded.catalog_title,catalog_description=excluded.catalog_description,updated_at=CURRENT_TIMESTAMP`,
    ).bind(
      context.organizationId,
      input.faviconUrl,
      input.primaryColor,
      input.secondaryColor,
      input.accentColor,
      input.backgroundColor,
      input.headingFont,
      input.bodyFont,
      input.catalogCoverUrl,
      input.catalogTitle,
      input.catalogDescription,
    ),
  ]);
  return Response.json({ branding: input });
}
