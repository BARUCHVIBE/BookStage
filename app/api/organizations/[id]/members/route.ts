import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";
import { createPasswordCredential } from "@/app/lib/local-auth";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import {
  departments,
  effectiveRole,
  storedRole,
  type ArtistAccessScope,
  type BaseRole,
  type Department,
  type Role,
} from "@/app/lib/tenant";

type Viewer = {
  baseRole: BaseRole;
  professionalRole: string | null;
  department: Department;
  artistAccessScope: ArtistAccessScope;
  status: string;
};

export async function GET(
  _: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await context.params;
  const viewer = await env.DB.prepare(
    `SELECT role AS baseRole,professional_role AS professionalRole,department,artist_access_scope AS artistAccessScope,status FROM memberships WHERE user_id=? AND organization_id=? AND status='ACTIVE'`,
  )
    .bind(user.id, id)
    .first<Viewer>();
  if (!viewer)
    return Response.json(
      { error: "Organização não encontrada." },
      { status: 404 },
    );
  const viewerRole = effectiveRole(viewer.baseRole, viewer.professionalRole);
  if (!["OWNER", "MANAGER"].includes(viewerRole))
    return Response.json(
      { error: "Sem permissão para visualizar a equipe." },
      { status: 403 },
    );
  const rows = await env.DB.prepare(
    `SELECT u.id,u.name,u.email,CASE WHEN m.role='SALES' AND m.professional_role='BOOKING_AGENT' THEN 'BOOKING_AGENT' ELSE m.role END AS role,m.department,m.artist_access_scope AS artistAccessScope,m.status,CASE WHEN m.professional_role='BOOKING_AGENT' THEN COUNT(DISTINCT booking.artist_id) ELSE COUNT(DISTINCT assignment.artist_id) END AS artistCount,CASE WHEN m.professional_role='BOOKING_AGENT' THEN GROUP_CONCAT(DISTINCT booking_artist.name) ELSE GROUP_CONCAT(DISTINCT artist.name) END AS artistNames,(SELECT COUNT(*) FROM opportunities opportunity WHERE opportunity.organization_id=m.organization_id AND (opportunity.assigned_user_id=m.user_id OR opportunity.originator_user_id=m.user_id OR opportunity.commercial_validator_user_id=m.user_id)) AS opportunityCount,(SELECT COUNT(*) FROM opportunities opportunity WHERE opportunity.organization_id=m.organization_id AND opportunity.stage='CLOSED_WON' AND (opportunity.assigned_user_id=m.user_id OR opportunity.originator_user_id=m.user_id OR opportunity.commercial_validator_user_id=m.user_id)) AS salesCount,(SELECT COALESCE(SUM(commission.amount),0) FROM show_commissions commission WHERE commission.organization_id=m.organization_id AND commission.user_id=m.user_id AND commission.status<>'CANCELLED') AS commissionAmount FROM memberships m JOIN users u ON u.id=m.user_id LEFT JOIN artist_sales_assignments assignment ON assignment.organization_id=m.organization_id AND assignment.user_id=m.user_id LEFT JOIN artists artist ON artist.id=assignment.artist_id AND artist.organization_id=assignment.organization_id LEFT JOIN booking_collaborator_artist_access booking ON booking.organization_id=m.organization_id AND booking.user_id=m.user_id AND booking.status='ACTIVE' LEFT JOIN artists booking_artist ON booking_artist.id=booking.artist_id AND booking_artist.organization_id=booking.organization_id WHERE m.organization_id=? AND m.status<>'INACTIVE' GROUP BY u.id,u.name,u.email,m.role,m.professional_role,m.department,m.artist_access_scope,m.status ORDER BY m.department,u.name`,
  )
    .bind(id)
    .all();
  const artists = await env.DB.prepare(
    `SELECT id,name FROM artists WHERE organization_id=? AND status='ACTIVE' ORDER BY name`,
  )
    .bind(id)
    .all();
  return Response.json({
    members: rows.results.map((row) => ({
      ...row,
      artistNames:
        typeof row.artistNames === "string" && row.artistNames
          ? row.artistNames.split(",")
          : [],
    })),
    artists: artists.results,
    canManage: viewerRole === "OWNER",
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await context.params;
  const owner = await env.DB.prepare(
    `SELECT 1 FROM memberships WHERE organization_id=? AND user_id=? AND role='OWNER' AND professional_role IS NULL AND status='ACTIVE'`,
  )
    .bind(id, user.id)
    .first();
  if (!owner)
    return Response.json(
      { error: "Somente o Owner pode criar acessos da equipe." },
      { status: 403 },
    );
  const body = (await request.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "",
    email =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "",
    password = typeof body?.password === "string" ? body.password : "",
    role = (typeof body?.role === "string"
      ? body.role
      : "BOOKING_AGENT") as Role,
    department = (typeof body?.department === "string"
      ? body.department
      : role === "PRODUCTION"
        ? "PRODUCTION"
        : role === "FINANCE"
          ? "FINANCE"
          : role === "MANAGER"
            ? "MANAGEMENT"
            : "COMMERCIAL") as Department,
    artistIds = Array.isArray(body?.artistIds)
      ? [
          ...new Set(
            body.artistIds.filter(
              (item): item is string =>
                typeof item === "string" && item.length <= 100,
            ),
          ),
        ]
      : [];
  if (!name || name.length > 160)
    return Response.json({ error: "Informe um nome válido." }, { status: 400 });
  if (
    !["MANAGER", "SALES", "BOOKING_AGENT", "PRODUCTION", "FINANCE"].includes(
      role,
    ) ||
    !departments.includes(department)
  )
    return Response.json(
      { error: "Papel ou setor inválido para o novo membro." },
      { status: 400 },
    );
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return Response.json(
      { error: "Informe um e-mail válido." },
      { status: 400 },
    );
  if (
    password.length < 12 ||
    password.length > 200 ||
    !/[A-Z]/.test(password) ||
    !/[a-z]/.test(password) ||
    !/[0-9]/.test(password)
  )
    return Response.json(
      {
        error:
          "A senha deve ter ao menos 12 caracteres, com letra maiúscula, minúscula e número.",
      },
      { status: 400 },
    );
  if (role === "BOOKING_AGENT" && !artistIds.length)
    return Response.json(
      { error: "Selecione ao menos um artista para o Booking." },
      { status: 400 },
    );
  const existing = await env.DB.prepare(
    `SELECT id FROM users WHERE lower(email)=?`,
  )
    .bind(email)
    .first();
  if (existing)
    return Response.json(
      { error: "Este e-mail já possui um acesso no BookStage." },
      { status: 409 },
    );
  if (artistIds.length) {
    const placeholders = artistIds.map(() => "?").join(","),
      validArtists = await env.DB.prepare(
        `SELECT COUNT(*) AS total FROM artists WHERE organization_id=? AND status='ACTIVE' AND id IN (${placeholders})`,
      )
        .bind(id, ...artistIds)
        .first<{ total: number }>();
    if (Number(validArtists?.total) !== artistIds.length)
      return Response.json(
        { error: "Um ou mais artistas não pertencem à organização." },
        { status: 400 },
      );
  }
  const userId = crypto.randomUUID(),
    credential = await createPasswordCredential(password),
    stored = storedRole(role),
    artistScope = ["SALES", "BOOKING_AGENT"].includes(role)
      ? "ASSIGNED"
      : "ALL";
  const statements = [
    env.DB.prepare(`INSERT INTO users (id,email,name) VALUES (?,?,?)`).bind(
      userId,
      email,
      name,
    ),
    env.DB.prepare(
      `INSERT INTO auth_credentials (user_id,password_hash,password_salt) VALUES (?,?,?)`,
    ).bind(userId, credential.hash, credential.salt),
    env.DB.prepare(
      `INSERT INTO memberships (organization_id,user_id,role,professional_role,department,artist_access_scope,status) VALUES (?,?,?,?,?,?,'ACTIVE')`,
    ).bind(
      id,
      userId,
      stored.baseRole,
      stored.professionalRole,
      department,
      artistScope,
    ),
    ...(["BOOKING_AGENT", "SALES"].includes(role)
      ? artistIds.map((artistId) =>
          role === "BOOKING_AGENT"
            ? env.DB.prepare(
                `INSERT INTO booking_collaborator_artist_access (organization_id,artist_id,user_id,status,created_by) VALUES (?,?,?,'ACTIVE',?)`,
              ).bind(id, artistId, userId, user.id)
            : env.DB.prepare(
                `INSERT INTO artist_sales_assignments (organization_id,artist_id,user_id,is_primary) VALUES (?,?,?,0)`,
              ).bind(id, artistId, userId),
        )
      : []),
    env.DB.prepare(
      `INSERT INTO membership_activities (id,organization_id,user_id,type,description,to_value,created_by) VALUES (?,?,?,'ACCESS_CREATED',?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      id,
      userId,
      role === "BOOKING_AGENT"
        ? "Acesso de colaborador de Booking criado pelo Owner."
        : "Acesso de membro interno criado pelo Owner.",
      `${role}:${artistIds.join(",")}`,
      user.id,
    ),
  ];
  try {
    await env.DB.batch(statements);
  } catch {
    return Response.json(
      {
        error: "Não foi possível criar o acesso. Verifique o e-mail informado.",
      },
      { status: 409 },
    );
  }
  return Response.json({ id: userId }, { status: 201 });
}
