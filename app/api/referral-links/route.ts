import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { canAccessArtist } from "@/app/lib/member-access";
import { randomToken, sha256 } from "@/app/lib/referrals";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import {
  effectiveRole,
  type ArtistAccessScope,
  type BaseRole,
} from "@/app/lib/tenant";

export async function GET(request: Request) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (!["OWNER", "MANAGER", "BOOKING_AGENT"].includes(context.membership.role))
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  const params = new URL(request.url).searchParams,
    userId = params.get("userId") || "",
    artistId = params.get("artistId") || "",
    clauses = ["link.organization_id=?"],
    bindings = [context.organizationId];
  if (context.membership.role === "BOOKING_AGENT") {
    clauses.push("link.user_id=?");
    bindings.push(context.user.id);
  } else if (userId) {
    clauses.push("link.user_id=?");
    bindings.push(userId);
  }
  if (artistId) {
    clauses.push("link.artist_id=?");
    bindings.push(artistId);
  }
  const rows = await env.DB.prepare(
    `SELECT link.id,link.user_id AS userId,user.name AS userName,link.artist_id AS artistId,artist.name AS artistName,artist.slug AS artistSlug,organization.slug AS organizationSlug,link.token_prefix AS tokenPrefix,link.status,link.expires_at AS expiresAt,link.revoked_at AS revokedAt,link.created_at AS createdAt,COUNT(DISTINCT CASE WHEN event.type='LINK_VISIT' THEN event.id END) AS visits,COUNT(DISTINCT CASE WHEN event.type='OPPORTUNITY_CREATED' THEN event.id END) AS leads,COUNT(DISTINCT CASE WHEN event.type='SHOW_CONFIRMED' THEN event.id END) AS sales FROM commercial_referral_links link JOIN users user ON user.id=link.user_id JOIN artists artist ON artist.id=link.artist_id AND artist.organization_id=link.organization_id JOIN organizations organization ON organization.id=link.organization_id LEFT JOIN referral_events event ON event.referral_link_id=link.id AND event.organization_id=link.organization_id WHERE ${clauses.join(" AND ")} GROUP BY link.id ORDER BY link.created_at DESC`,
  )
    .bind(...bindings)
    .all();
  return Response.json({ links: rows.results });
}
export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (!["OWNER", "MANAGER"].includes(context.membership.role))
    return Response.json(
      { error: "Somente a empresa pode gerar links de colaboradores." },
      { status: 403 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >,
    artistId = typeof body.artistId === "string" ? body.artistId : "",
    userId = typeof body.userId === "string" ? body.userId : "",
    expiresAt =
      typeof body.expiresAt === "string" && body.expiresAt
        ? new Date(body.expiresAt).toISOString()
        : null;
  const target = await env.DB.prepare(
    `SELECT role AS baseRole,professional_role AS professionalRole,artist_access_scope AS artistAccessScope FROM memberships WHERE organization_id=? AND user_id=? AND status='ACTIVE'`,
  )
    .bind(context.organizationId, userId)
    .first<{
      baseRole: BaseRole;
      professionalRole: string | null;
      artistAccessScope: ArtistAccessScope;
    }>();
  if (!target)
    return Response.json({ error: "Colaborador inválido." }, { status: 400 });
  const role = effectiveRole(target.baseRole, target.professionalRole);
  if (
    role !== "BOOKING_AGENT" ||
    !(await canAccessArtist(
      context.organizationId,
      userId,
      role,
      target.artistAccessScope,
      artistId,
    ))
  )
    return Response.json(
      {
        error:
          "Selecione um colaborador de Booking autorizado para este artista.",
      },
      { status: 403 },
    );
  const existing = await env.DB.prepare(
    `SELECT 1 FROM commercial_referral_links WHERE organization_id=? AND artist_id=? AND user_id=? AND status='ACTIVE' AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>CURRENT_TIMESTAMP)`,
  )
    .bind(context.organizationId, artistId, userId)
    .first();
  if (existing)
    return Response.json(
      { error: "Já existe um link ativo para este colaborador e artista." },
      { status: 409 },
    );
  const identity = await env.DB.prepare(
    `SELECT organization.slug AS organizationSlug,artist.slug AS artistSlug FROM organizations organization JOIN artists artist ON artist.organization_id=organization.id WHERE organization.id=? AND artist.id=? AND artist.status='ACTIVE' AND artist.slug IS NOT NULL`,
  )
    .bind(context.organizationId, artistId)
    .first<{ organizationSlug: string; artistSlug: string }>();
  if (!identity)
    return Response.json(
      { error: "Artista indisponível para link público." },
      { status: 400 },
    );
  const token = randomToken(),
    tokenHash = await sha256(token),
    id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE commercial_referral_links SET status='REVOKED',revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND artist_id=? AND user_id=? AND status='ACTIVE' AND expires_at IS NOT NULL AND expires_at<=CURRENT_TIMESTAMP`,
    ).bind(context.organizationId, artistId, userId),
    env.DB.prepare(
      `INSERT INTO commercial_referral_links (id,organization_id,artist_id,user_id,token_hash,token_prefix,status,created_by,expires_at) VALUES (?,?,?,?,?,?,'ACTIVE',?,?)`,
    ).bind(
      id,
      context.organizationId,
      artistId,
      userId,
      tokenHash,
      token.slice(0, 8),
      context.user.id,
      expiresAt,
    ),
    env.DB.prepare(
      `INSERT INTO membership_activities (id,organization_id,user_id,type,description,to_value,created_by) VALUES (?,?,?,'REFERRAL_LINK_CREATED','Link de Booking criado pela empresa.',?,?)`,
    ).bind(
      crypto.randomUUID(),
      context.organizationId,
      userId,
      id,
      context.user.id,
    ),
  ]);
  const origin = new URL(request.url).origin;
  return Response.json(
    {
      id,
      url: `${origin}/catalogo/${identity.organizationSlug}/${identity.artistSlug}?r=${token}`,
      token,
    },
    { status: 201 },
  );
}
export async function PATCH(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (!["OWNER", "MANAGER"].includes(context.membership.role))
    return Response.json(
      { error: "Somente a empresa pode revogar links de colaboradores." },
      { status: 403 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >,
    id = typeof body.id === "string" ? body.id : "";
  const link = await env.DB.prepare(
    `SELECT user_id AS userId,status FROM commercial_referral_links WHERE id=? AND organization_id=?`,
  )
    .bind(id, context.organizationId)
    .first<{ userId: string; status: string }>();
  if (!link)
    return Response.json({ error: "Link não encontrado." }, { status: 404 });
  if (link.status === "REVOKED") return Response.json({ ok: true });
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE commercial_referral_links SET status='REVOKED',revoked_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
    ).bind(id, context.organizationId),
    env.DB.prepare(
      `INSERT INTO membership_activities (id,organization_id,user_id,type,description,to_value,created_by) VALUES (?,?,?,'REFERRAL_LINK_REVOKED','Link de Booking revogado pela empresa.',?,?)`,
    ).bind(
      crypto.randomUUID(),
      context.organizationId,
      link.userId,
      id,
      context.user.id,
    ),
  ]);
  return Response.json({ ok: true });
}
