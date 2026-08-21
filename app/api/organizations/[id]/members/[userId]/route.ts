import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import {
  artistAccessScopes,
  departments,
  effectiveRole,
  roles,
  storedRole,
  type ArtistAccessScope,
  type BaseRole,
  type Department,
  type Role,
} from "@/app/lib/tenant";

type Membership = {
  id: string;
  baseRole: BaseRole;
  professionalRole: string | null;
  department: Department;
  artistAccessScope: ArtistAccessScope;
  status: string;
  name: string;
  email: string;
};
async function viewer(organizationId: string, userId: string) {
  return env.DB.prepare(
    `SELECT role AS baseRole,professional_role AS professionalRole,status FROM memberships WHERE organization_id=? AND user_id=? AND status='ACTIVE'`,
  )
    .bind(organizationId, userId)
    .first<{
      baseRole: BaseRole;
      professionalRole: string | null;
      status: string;
    }>();
}
async function target(organizationId: string, userId: string) {
  return env.DB.prepare(
    `SELECT user.id,membership.role AS baseRole,membership.professional_role AS professionalRole,membership.department,membership.artist_access_scope AS artistAccessScope,membership.status,user.name,user.email FROM memberships membership JOIN users user ON user.id=membership.user_id WHERE membership.organization_id=? AND membership.user_id=?`,
  )
    .bind(organizationId, userId)
    .first<Membership>();
}

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id, userId } = await context.params,
    access = await viewer(id, user.id);
  if (!access)
    return Response.json(
      { error: "Organização não encontrada." },
      { status: 404 },
    );
  if (
    !["OWNER", "MANAGER"].includes(
      effectiveRole(access.baseRole, access.professionalRole),
    )
  )
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  const member = await target(id, userId);
  if (!member)
    return Response.json(
      { error: "Colaborador não encontrado." },
      { status: 404 },
    );
  const memberRole = effectiveRole(member.baseRole, member.professionalRole);
  const artistAccessTable =
    memberRole === "BOOKING_AGENT"
      ? "booking_collaborator_artist_access"
      : "artist_sales_assignments";
  const artistAccessStatus =
    memberRole === "BOOKING_AGENT" ? " AND assignment.status='ACTIVE'" : "";
  const primaryExpression =
    memberRole === "BOOKING_AGENT" ? "0" : "COALESCE(assignment.is_primary,0)";
  const [artists, activities, links, opportunities, commissions] =
    await Promise.all([
      env.DB.prepare(
        `SELECT artist.id,artist.name,CASE WHEN assignment.artist_id IS NULL THEN 0 ELSE 1 END AS assigned,${primaryExpression} AS isPrimary FROM artists artist LEFT JOIN ${artistAccessTable} assignment ON assignment.organization_id=artist.organization_id AND assignment.artist_id=artist.id AND assignment.user_id=?${artistAccessStatus} WHERE artist.organization_id=? AND artist.status='ACTIVE' ORDER BY artist.name`,
      )
        .bind(userId, id)
        .all(),
      env.DB.prepare(
        `SELECT activity.id,activity.type,activity.description,activity.from_value AS fromValue,activity.to_value AS toValue,activity.created_at AS createdAt,creator.name AS createdByName FROM membership_activities activity JOIN users creator ON creator.id=activity.created_by WHERE activity.organization_id=? AND activity.user_id=? ORDER BY activity.created_at DESC LIMIT 50`,
      )
        .bind(id, userId)
        .all(),
      env.DB.prepare(
        `SELECT link.id,artist.name AS artistName,link.status,link.token_prefix AS tokenPrefix,link.expires_at AS expiresAt,link.created_at AS createdAt,COUNT(DISTINCT CASE WHEN event.type='LINK_VISIT' THEN event.id END) AS visits,COUNT(DISTINCT CASE WHEN event.type='OPPORTUNITY_CREATED' THEN event.id END) AS leads,COUNT(DISTINCT CASE WHEN event.type='PROPOSAL_CREATED' THEN event.id END) AS proposals,COUNT(DISTINCT CASE WHEN event.type='SHOW_CONFIRMED' THEN event.id END) AS sales FROM commercial_referral_links link JOIN artists artist ON artist.id=link.artist_id AND artist.organization_id=link.organization_id LEFT JOIN referral_events event ON event.organization_id=link.organization_id AND event.referral_link_id=link.id WHERE link.organization_id=? AND link.user_id=? GROUP BY link.id ORDER BY link.created_at DESC`,
      )
        .bind(id, userId)
        .all(),
      env.DB.prepare(
        `SELECT COUNT(*) AS total,SUM(CASE WHEN stage='CLOSED_WON' THEN 1 ELSE 0 END) AS won,COALESCE(SUM(CASE WHEN stage='CLOSED_WON' THEN proposed_value ELSE 0 END),0) AS soldValue FROM opportunities WHERE organization_id=? AND (assigned_user_id=? OR originator_user_id=?)`,
      )
        .bind(id, userId, userId)
        .first(),
      env.DB.prepare(
        `SELECT status,COUNT(*) AS count,COALESCE(SUM(amount),0) AS amount FROM show_commissions WHERE organization_id=? AND user_id=? GROUP BY status`,
      )
        .bind(id, userId)
        .all(),
    ]);
  return Response.json({
    member: {
      ...member,
      role: memberRole,
    },
    artists: artists.results,
    activities: activities.results,
    links: links.results,
    opportunities,
    commissions: commissions.results,
    canManage:
      effectiveRole(access.baseRole, access.professionalRole) === "OWNER",
    canManageLinks: ["OWNER", "MANAGER"].includes(
      effectiveRole(access.baseRole, access.professionalRole),
    ),
  });
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id, userId } = await context.params,
    access = await viewer(id, user.id);
  if (!access)
    return Response.json(
      { error: "Organização não encontrada." },
      { status: 404 },
    );
  if (effectiveRole(access.baseRole, access.professionalRole) !== "OWNER")
    return Response.json(
      { error: "Somente o Owner pode alterar perfis da equipe." },
      { status: 403 },
    );
  const previous = await target(id, userId);
  if (!previous)
    return Response.json(
      { error: "Colaborador não encontrado." },
      { status: 404 },
    );
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  if (!body)
    return Response.json({ error: "Requisição inválida." }, { status: 400 });
  const name = typeof body.name === "string" ? body.name.trim() : previous.name,
    role = (
      typeof body.role === "string"
        ? body.role
        : effectiveRole(previous.baseRole, previous.professionalRole)
    ) as Role,
    department = (
      typeof body.department === "string"
        ? body.department
        : previous.department
    ) as Department,
    status = typeof body.status === "string" ? body.status : previous.status,
    scope = (
      typeof body.artistAccessScope === "string"
        ? body.artistAccessScope
        : previous.artistAccessScope
    ) as ArtistAccessScope;
  if (
    !name ||
    name.length > 160 ||
    !roles.includes(role) ||
    !departments.includes(department) ||
    !artistAccessScopes.includes(scope) ||
    !["ACTIVE", "INACTIVE", "INVITED"].includes(status)
  )
    return Response.json(
      { error: "Dados do perfil inválidos." },
      { status: 400 },
    );
  if (
    previous.baseRole === "OWNER" &&
    (role !== "OWNER" || status !== "ACTIVE")
  ) {
    const owners = await env.DB.prepare(
      `SELECT COUNT(*) AS total FROM memberships WHERE organization_id=? AND role='OWNER' AND status='ACTIVE' AND user_id<>?`,
    )
      .bind(id, userId)
      .first<{ total: number }>();
    if (!owners?.total)
      return Response.json(
        { error: "A organização precisa manter ao menos um Owner ativo." },
        { status: 409 },
      );
  }
  const artistIds = Array.isArray(body.artistIds)
    ? [
        ...new Set(
          body.artistIds.filter(
            (item): item is string =>
              typeof item === "string" && item.length <= 100,
          ),
        ),
      ]
    : [];
  if (scope === "ASSIGNED" && artistIds.length) {
    const placeholders = artistIds.map(() => "?").join(","),
      valid = await env.DB.prepare(
        `SELECT COUNT(*) AS total FROM artists WHERE organization_id=? AND id IN (${placeholders})`,
      )
        .bind(id, ...artistIds)
        .first<{ total: number }>();
    if (Number(valid?.total) !== artistIds.length)
      return Response.json(
        { error: "Um ou mais artistas não pertencem à organização." },
        { status: 400 },
      );
  }
  const stored = storedRole(role),
    changes: Array<{
      type: string;
      description: string;
      fromValue: string | null;
      toValue: string | null;
    }> = [];
  const oldRole = effectiveRole(previous.baseRole, previous.professionalRole);
  if (oldRole !== role)
    changes.push({
      type: "ROLE_CHANGED",
      description: "Papel do colaborador alterado.",
      fromValue: oldRole,
      toValue: role,
    });
  if (previous.status !== status)
    changes.push({
      type: "STATUS_CHANGED",
      description: "Status do colaborador alterado.",
      fromValue: previous.status,
      toValue: status,
    });
  if (previous.artistAccessScope !== scope)
    changes.push({
      type: "ARTIST_SCOPE_CHANGED",
      description: "Escopo de artistas alterado.",
      fromValue: previous.artistAccessScope,
      toValue: scope,
    });
  const statements = [
    env.DB.prepare(
      `UPDATE users SET name=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
    ).bind(name, userId),
    env.DB.prepare(
      `UPDATE memberships SET role=?,professional_role=?,department=?,artist_access_scope=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND user_id=?`,
    ).bind(
      stored.baseRole,
      stored.professionalRole,
      department,
      scope,
      status,
      id,
      userId,
    ),
  ];
  if (role === "BOOKING_AGENT") {
    statements.push(
      env.DB.prepare(
        `DELETE FROM artist_sales_assignments WHERE organization_id=? AND user_id=?`,
      ).bind(id, userId),
      env.DB.prepare(
        `UPDATE booking_collaborator_artist_access SET status='SUSPENDED',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND user_id=?`,
      ).bind(id, userId),
    );
    if (scope === "ASSIGNED")
      for (const artistId of artistIds)
        statements.push(
          env.DB.prepare(
            `INSERT INTO booking_collaborator_artist_access (organization_id,artist_id,user_id,status,created_by) VALUES (?,?,?,'ACTIVE',?) ON CONFLICT(artist_id,user_id) DO UPDATE SET status='ACTIVE',updated_at=CURRENT_TIMESTAMP`,
          ).bind(id, artistId, userId, user.id),
        );
    changes.push({
      type: "ARTISTS_CHANGED",
      description:
        "Artistas autorizados para o colaborador de Booking atualizados.",
      fromValue: null,
      toValue: scope === "ALL" ? "ALL" : artistIds.join(","),
    });
  } else {
    statements.push(
      env.DB.prepare(
        `UPDATE booking_collaborator_artist_access SET status='SUSPENDED',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND user_id=?`,
      ).bind(id, userId),
    );
  }
  if (scope === "ASSIGNED" && role !== "BOOKING_AGENT") {
    statements.push(
      env.DB.prepare(
        `DELETE FROM artist_sales_assignments WHERE organization_id=? AND user_id=? AND is_primary=0`,
      ).bind(id, userId),
    );
    for (const artistId of artistIds)
      statements.push(
        env.DB.prepare(
          `INSERT OR IGNORE INTO artist_sales_assignments (organization_id,artist_id,user_id,is_primary) VALUES (?,?,?,0)`,
        ).bind(id, artistId, userId),
      );
    changes.push({
      type: "ARTISTS_CHANGED",
      description: "Artistas autorizados atualizados.",
      fromValue: null,
      toValue: artistIds.join(","),
    });
  }
  if (previous.name !== name)
    changes.push({
      type: "PROFILE_UPDATED",
      description: "Nome do colaborador atualizado.",
      fromValue: previous.name,
      toValue: name,
    });
  for (const change of changes)
    statements.push(
      env.DB.prepare(
        `INSERT INTO membership_activities (id,organization_id,user_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        id,
        userId,
        change.type,
        change.description,
        change.fromValue,
        change.toValue,
        user.id,
      ),
    );
  await env.DB.batch(statements);
  return Response.json({ ok: true });
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string; userId: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id, userId } = await context.params,
    access = await viewer(id, user.id);
  if (
    !access ||
    effectiveRole(access.baseRole, access.professionalRole) !== "OWNER"
  )
    return Response.json(
      { error: "Somente o Owner pode remover acessos da equipe." },
      { status: 403 },
    );
  if (userId === user.id)
    return Response.json(
      { error: "Você não pode remover o próprio acesso." },
      { status: 409 },
    );
  const member = await target(id, userId);
  if (!member)
    return Response.json(
      { error: "Colaborador não encontrado." },
      { status: 404 },
    );
  if (member.baseRole === "OWNER")
    return Response.json(
      { error: "O acesso de outro Owner deve ser alterado, não removido." },
      { status: 409 },
    );
  const primary = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM artist_sales_assignments WHERE organization_id=? AND user_id=? AND is_primary=1`,
  )
    .bind(id, userId)
    .first<{ total: number }>();
  if (Number(primary?.total))
    return Response.json(
      {
        error:
          "Reatribua os artistas em que este membro é responsável principal antes de remover o acesso.",
      },
      { status: 409 },
    );
  const openOpportunities = await env.DB.prepare(
    `SELECT COUNT(*) AS total FROM opportunities WHERE organization_id=? AND (assigned_user_id=? OR commercial_validator_user_id=?) AND stage NOT IN ('CLOSED_WON','CLOSED_LOST')`,
  )
    .bind(id, userId, userId)
    .first<{ total: number }>();
  if (Number(openOpportunities?.total))
    return Response.json(
      {
        error:
          "Reatribua as oportunidades abertas deste membro antes de remover o acesso.",
      },
      { status: 409 },
    );
  await env.DB.batch([
    env.DB.prepare(
      `UPDATE memberships SET status='INACTIVE',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND user_id=?`,
    ).bind(id, userId),
    env.DB.prepare(
      `DELETE FROM artist_sales_assignments WHERE organization_id=? AND user_id=? AND is_primary=0`,
    ).bind(id, userId),
    env.DB.prepare(
      `UPDATE booking_collaborator_artist_access SET status='SUSPENDED',updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND user_id=?`,
    ).bind(id, userId),
    env.DB.prepare(
      `UPDATE commercial_referral_links SET status='REVOKED',revoked_at=COALESCE(revoked_at,CURRENT_TIMESTAMP),updated_at=CURRENT_TIMESTAMP WHERE organization_id=? AND user_id=? AND status='ACTIVE'`,
    ).bind(id, userId),
    env.DB.prepare(
      `INSERT INTO membership_activities (id,organization_id,user_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,'ACCESS_REMOVED','Acesso removido da empresa com preservação do histórico.',?,'INACTIVE',?)`,
    ).bind(
      crypto.randomUUID(),
      id,
      userId,
      member.status,
      user.id,
    ),
  ]);
  return Response.json({ ok: true });
}
