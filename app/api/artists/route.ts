import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  canManageArtistAssignments,
  validateCommercialAssignments,
  type AssignmentInput,
} from "@/app/lib/artist-access";
import {
  getArtistPrimaryCommercial,
  getOrganizationPrimaryCommercials,
} from "@/app/lib/artist-sales";
import { makeSlug } from "@/app/lib/tenant";
import {
  hasGlobalArtistAccess,
  isArtistScopedCommercial,
} from "@/app/lib/member-access";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

export async function GET(request: Request) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const responsibleId = new URL(request.url).searchParams.get("responsibleId");
  const scoped =
    isArtistScopedCommercial(context.membership.role) &&
    !hasGlobalArtistAccess(
      context.membership.role,
      context.membership.artistAccessScope,
    );
  const salesScope = !scoped
    ? ""
    : context.membership.role === "BOOKING_AGENT"
      ? `AND EXISTS (SELECT 1 FROM booking_collaborator_artist_access mine WHERE mine.artist_id=a.id AND mine.organization_id=a.organization_id AND mine.user_id=? AND mine.status='ACTIVE')`
      : `AND EXISTS (SELECT 1 FROM artist_sales_assignments mine WHERE mine.artist_id=a.id AND mine.organization_id=a.organization_id AND mine.user_id=?)`;
  const query = env.DB.prepare(
    `SELECT a.id,a.name,a.status,a.created_at AS createdAt,(SELECT COUNT(*) FROM artist_sales_assignments authorized JOIN memberships member ON member.organization_id=authorized.organization_id AND member.user_id=authorized.user_id WHERE authorized.artist_id=a.id AND authorized.organization_id=a.organization_id AND authorized.is_primary=0 AND member.status='ACTIVE' AND member.professional_role IS NULL AND member.role IN ('OWNER','MANAGER','SALES')) AS authorizedCount FROM artists a WHERE a.organization_id=? ${salesScope} ORDER BY a.name`,
  );
  const bindings: string[] = [context.organizationId];
  if (scoped) bindings.push(context.user.id);
  const result = await query.bind(...bindings).all<{
      id: string;
      name: string;
      status: string;
      createdAt: string;
      authorizedCount: number;
    }>(),
    primaryCommercials = await getOrganizationPrimaryCommercials(
      context.organizationId,
    ),
    artists = result.results
      .map((artist) => {
        const primaryCommercial = primaryCommercials.get(artist.id) || null;
        return {
          ...artist,
          primaryCommercial,
          primaryUserId: primaryCommercial?.userId || null,
          primaryUserName: primaryCommercial?.name || null,
          requiresPrimaryCommercial:
            artist.status === "ACTIVE" && !primaryCommercial,
        };
      })
      .filter(
        (artist) =>
          !responsibleId || artist.primaryCommercial?.userId === responsibleId,
      );
  return Response.json(
    {
      artists,
      canManageAssignments: canManageArtistAssignments(
        context.membership.role,
      ),
    },
    { headers: { "cache-control": "private, no-store" } },
  );
}

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (!canManageArtistAssignments(context.membership.role))
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  const body = (await request.json().catch(() => null)) as {
    name?: string;
    primaryUserId?: string;
  } | null;
  if (!body)
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  const name = body.name?.trim();
  if (!name || name.length > 160)
    return Response.json(
      { error: "Nome do artista inválido." },
      { status: 400 },
    );
  const membershipRows = await env.DB.prepare(
    `SELECT organization_id AS organizationId,user_id AS userId,CASE WHEN role='SALES' AND professional_role='BOOKING_AGENT' THEN 'BOOKING_AGENT' ELSE role END AS role,status FROM memberships WHERE organization_id=? AND status='ACTIVE'`,
  )
    .bind(context.organizationId)
    .all<AssignmentInput>();
  let assignment;
  try {
    assignment = validateCommercialAssignments(
      context.organizationId,
      body.primaryUserId || null,
      [],
      membershipRows.results,
    );
  } catch (error) {
    return Response.json(
      {
        error:
          error instanceof Error ? error.message : "Responsável inválido.",
      },
      { status: 400 },
    );
  }
  if (!assignment.primaryUserId)
    return Response.json(
      {
        error:
          "Todo artista ativo precisa de um responsável comercial principal.",
      },
      { status: 400 },
    );
  const id = crypto.randomUUID();
  const slug = `${makeSlug(name) || "artista"}-${id.slice(0, 6)}`;
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO artists (id,organization_id,name,slug) VALUES (?,?,?,?)`,
    ).bind(id, context.organizationId, name, slug),
    env.DB.prepare(
      `INSERT INTO artist_sales_assignments (organization_id,artist_id,user_id,is_primary) VALUES (?,?,?,1)`,
    ).bind(context.organizationId, id, assignment.primaryUserId),
  ]);
  const primaryCommercial = await getArtistPrimaryCommercial(
    context.organizationId,
    id,
  );
  return Response.json(
    { artist: { id, name, slug, status: "ACTIVE", primaryCommercial } },
    { status: 201 },
  );
}
