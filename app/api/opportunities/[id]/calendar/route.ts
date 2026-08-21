import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  conflictResponse,
  findBlockingConflict,
} from "@/app/lib/calendar-access";
import { canAccessOpportunity } from "@/app/lib/opportunity-rules";
import {
  defaultOpportunityInterval,
  isOpportunityCalendarAction,
  normalizeOpportunityInterval,
} from "@/app/lib/opportunity-calendar";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import { canAccessArtist } from "@/app/lib/member-access";

type Opportunity = {
  id: string;
  artistId: string;
  artistName: string;
  customerId: string;
  customerName: string;
  assignedUserId: string | null;
  originatorUserId: string | null;
  commercialValidatorUserId: string | null;
  assigneeName: string | null;
  eventDate: string;
  stage: string;
  commercialApprovalStatus: string;
  financialApprovalStatus: string;
};
type LinkedEntry = {
  id: string;
  artistId: string;
  startDatetime: string;
  endDatetime: string | null;
  status: string;
  title: string;
};
async function loadOpportunity(id: string, organizationId: string) {
  return env.DB.prepare(
    `SELECT opportunity.id,opportunity.artist_id AS artistId,artist.name AS artistName,opportunity.customer_id AS customerId,customer.name AS customerName,opportunity.assigned_user_id AS assignedUserId,opportunity.originator_user_id AS originatorUserId,opportunity.commercial_validator_user_id AS commercialValidatorUserId,assignee.name AS assigneeName,opportunity.event_date AS eventDate,opportunity.stage,opportunity.commercial_approval_status AS commercialApprovalStatus,opportunity.financial_approval_status AS financialApprovalStatus FROM opportunities opportunity JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id JOIN customers customer ON customer.id=opportunity.customer_id AND customer.organization_id=opportunity.organization_id LEFT JOIN users assignee ON assignee.id=opportunity.assigned_user_id WHERE opportunity.id=? AND opportunity.organization_id=?`,
  )
    .bind(id, organizationId)
    .first<Opportunity>();
}
async function linkedEntry(id: string, organizationId: string) {
  return env.DB.prepare(
    `SELECT entry.id,entry.artist_id AS artistId,entry.start_datetime AS startDatetime,entry.end_datetime AS endDatetime,entry.status,entry.title FROM opportunity_calendar_entries link JOIN calendar_entries entry ON entry.id=link.calendar_entry_id AND entry.organization_id=link.organization_id WHERE link.opportunity_id=? AND link.organization_id=?`,
  )
    .bind(id, organizationId)
    .first<LinkedEntry>();
}
async function authorized(
  id: string,
  organizationId: string,
  userId: string,
  role: Parameters<typeof canAccessOpportunity>[0],
  scope: Parameters<typeof canAccessArtist>[3],
) {
  const opportunity = await loadOpportunity(id, organizationId);
  return opportunity &&
    canAccessOpportunity(
      role,
      opportunity.assignedUserId,
      userId,
      opportunity.originatorUserId,
      opportunity.commercialValidatorUserId,
    ) &&
    (await canAccessArtist(
      organizationId,
      userId,
      role,
      scope,
      opportunity.artistId,
    ))
    ? opportunity
    : null;
}

export async function GET(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params,
    opportunity = await authorized(
      id,
      context.organizationId,
      context.user.id,
      context.membership.role,
      context.membership.artistAccessScope,
    );
  if (!opportunity)
    return Response.json(
      { error: "Oportunidade não encontrada." },
      { status: 404 },
    );
  const url = new URL(request.url),
    defaults = defaultOpportunityInterval(opportunity.eventDate);
  let interval;
  try {
    interval = normalizeOpportunityInterval(
      url.searchParams.get("start") || defaults.startDatetime,
      url.searchParams.get("end") || defaults.endDatetime,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Período inválido." },
      { status: 400 },
    );
  }
  const linked = await linkedEntry(id, context.organizationId),
    entries = await env.DB.prepare(
      `SELECT entry.id,entry.status,entry.title,entry.start_datetime AS startDatetime,entry.end_datetime AS endDatetime,artist.name AS artistName FROM calendar_entries entry JOIN artists artist ON artist.id=entry.artist_id AND artist.organization_id=entry.organization_id WHERE entry.organization_id=? AND entry.artist_id=? AND entry.start_datetime<=? AND COALESCE(entry.end_datetime,entry.start_datetime)>=? AND entry.status<>'AVAILABLE' ORDER BY entry.start_datetime`,
    )
      .bind(
        context.organizationId,
        opportunity.artistId,
        interval.endDatetime ?? interval.startDatetime,
        interval.startDatetime,
      )
      .all();
  const conflicts = entries.results.filter(
      (item) => (item as { id: string }).id !== linked?.id,
    ),
    blocking = conflicts.some((item) =>
      ["CONFIRMED", "BLOCKED"].includes((item as { status: string }).status),
    );
  const show = await env.DB.prepare(
    `SELECT id,status FROM shows WHERE opportunity_id=? AND organization_id=?`,
  )
    .bind(id, context.organizationId)
    .first();
  return Response.json({
    interval,
    linkedEntry: linked || null,
    conflicts,
    availability: blocking
      ? "BLOCKED"
      : conflicts.length
        ? "ATTENTION"
        : "AVAILABLE",
    show: show || null,
    identity: {
      customerName: opportunity.customerName,
      assigneeName: opportunity.assigneeName,
    },
  });
}

export async function POST(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params,
    opportunity = await authorized(
      id,
      context.organizationId,
      context.user.id,
      context.membership.role,
      context.membership.artistAccessScope,
    );
  if (!opportunity)
    return Response.json(
      { error: "Oportunidade não encontrada." },
      { status: 404 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (context.membership.role === "FINANCE")
    return Response.json(
      { error: "Financeiro possui acesso de consulta à agenda." },
      { status: 403 },
    );
  if (
    context.membership.role === "BOOKING_AGENT" &&
    opportunity.commercialApprovalStatus === "APPROVED"
  )
    return Response.json(
      {
        error:
          "A negociação já foi validada e a agenda agora é conduzida pelo comercial interno do artista.",
      },
      { status: 403 },
    );
  if (!isOpportunityCalendarAction(body.action))
    return Response.json(
      { error: "Ação de agenda inválida." },
      { status: 400 },
    );
  const existing = await linkedEntry(id, context.organizationId);
  if (
    body.action === "CONFIRM" &&
    !["OWNER", "MANAGER"].includes(context.membership.role)
  )
    return Response.json(
      {
        error: "A confirmação exige aprovação e permissão comercial superior.",
      },
      { status: 403 },
    );
  if (
    body.action === "CONFIRM" &&
    (opportunity.commercialApprovalStatus !== "APPROVED" ||
      opportunity.financialApprovalStatus !== "APPROVED")
  )
    return Response.json(
      {
        error:
          "A data só pode ser confirmada após as aprovações comercial e financeira.",
      },
      { status: 409 },
    );
  if (
    body.action === "CONFIRM" &&
    !(await env.DB.prepare(
      `SELECT 1 FROM contracts WHERE opportunity_id=? AND organization_id=? AND status='SIGNED'`,
    )
      .bind(id, context.organizationId)
      .first())
  )
    return Response.json(
      {
        error:
          "O contrato precisa estar assinado antes da confirmação da data.",
      },
      { status: 409 },
    );
  if (body.action === "CANCEL_OPTION") {
    if (!existing || existing.status !== "OPTION")
      return Response.json(
        { error: "Esta oportunidade não possui uma opção ativa." },
        { status: 409 },
      );
    const show = await env.DB.prepare(
      `SELECT 1 FROM shows WHERE opportunity_id=? AND organization_id=?`,
    )
      .bind(id, context.organizationId)
      .first();
    if (show)
      return Response.json(
        {
          error:
            "A data já está vinculada a um show e não pode ser cancelada por aqui.",
        },
        { status: 409 },
      );
    await env.DB.batch([
      env.DB.prepare(
        `DELETE FROM calendar_entries WHERE id=? AND organization_id=?`,
      ).bind(existing.id, context.organizationId),
      env.DB.prepare(
        `UPDATE opportunities SET stage=CASE WHEN stage='DATE_OPTION' THEN 'NEGOTIATION' ELSE stage END,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
      ).bind(id, context.organizationId),
      env.DB.prepare(
        `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,from_value,created_by) VALUES (?,?,?,'CALENDAR_OPTION_CANCELLED','Opção de data cancelada.',?,?)`,
      ).bind(
        crypto.randomUUID(),
        context.organizationId,
        id,
        existing.startDatetime,
        context.user.id,
      ),
    ]);
    return Response.json({ ok: true });
  }
  if (existing?.status === "CONFIRMED")
    return Response.json(
      { error: "A data desta oportunidade já está confirmada." },
      { status: 409 },
    );
  let interval;
  try {
    const defaults = defaultOpportunityInterval(opportunity.eventDate);
    interval = normalizeOpportunityInterval(
      body.startDatetime || defaults.startDatetime,
      body.endDatetime || defaults.endDatetime,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Período inválido." },
      { status: 400 },
    );
  }
  const nextStatus =
      body.action === "INQUIRY"
        ? "INQUIRY"
        : body.action === "OPTION"
          ? "OPTION"
          : "CONFIRMED",
    conflict =
      nextStatus !== "INQUIRY"
        ? await findBlockingConflict(
            context.organizationId,
            opportunity.artistId,
            interval.startDatetime,
            interval.endDatetime,
            existing?.id,
          )
        : null;
  if (conflict) return conflictResponse(conflict);
  const entryId = existing?.id || crypto.randomUUID(),
    title = `${nextStatus === "INQUIRY" ? "Consulta" : nextStatus === "OPTION" ? "Opção" : "Show confirmado"} · ${opportunity.artistName} · ${opportunity.customerName}`,
    statements = [];
  const optionExpiresAt =
      nextStatus === "OPTION" &&
      typeof body.expiresAt === "string" &&
      !Number.isNaN(new Date(body.expiresAt).getTime())
        ? new Date(body.expiresAt).toISOString()
        : nextStatus === "OPTION"
          ? new Date(Date.now() + 7 * 86400000).toISOString()
          : null,
    optionNotes =
      typeof body.notes === "string"
        ? body.notes.trim().slice(0, 2000)
        : `Originado pela oportunidade ${id}.`;
  if (existing)
    statements.push(
      env.DB.prepare(
        `UPDATE calendar_entries SET start_datetime=?,end_datetime=?,status=?,title=?,internal_notes=?,option_expires_at=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
      ).bind(
        interval.startDatetime,
        interval.endDatetime,
        nextStatus,
        title,
        optionNotes,
        optionExpiresAt,
        entryId,
        context.organizationId,
      ),
    );
  else {
    statements.push(
      env.DB.prepare(
        `INSERT INTO calendar_entries (id,organization_id,artist_id,start_datetime,end_datetime,status,title,internal_notes,option_expires_at,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        entryId,
        context.organizationId,
        opportunity.artistId,
        interval.startDatetime,
        interval.endDatetime,
        nextStatus,
        title,
        optionNotes,
        optionExpiresAt,
        context.user.id,
      ),
    );
    statements.push(
      env.DB.prepare(
        `INSERT INTO opportunity_calendar_entries (organization_id,opportunity_id,calendar_entry_id) VALUES (?,?,?)`,
      ).bind(context.organizationId, id, entryId),
    );
  }
  const nextStage = nextStatus === "OPTION" ? "DATE_OPTION" : opportunity.stage;
  statements.push(
    env.DB.prepare(
      `UPDATE opportunities SET event_date=?,stage=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
    ).bind(
      interval.startDatetime.slice(0, 10),
      nextStage,
      id,
      context.organizationId,
    ),
  );
  const activityType =
      nextStatus === "INQUIRY"
        ? "CALENDAR_INQUIRY"
        : nextStatus === "OPTION"
          ? "CALENDAR_OPTION"
          : "CALENDAR_CONFIRMED",
    description =
      nextStatus === "INQUIRY"
        ? "Consulta de disponibilidade registrada."
        : nextStatus === "OPTION"
          ? "Opção de data criada."
          : "Data confirmada na agenda.";
  statements.push(
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      context.organizationId,
      id,
      activityType,
      description,
      interval.startDatetime,
      context.user.id,
    ),
  );
  if (nextStage !== opportunity.stage)
    statements.push(
      env.DB.prepare(
        `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,'STAGE_CHANGED','Etapa atualizada após criação da opção.',?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        context.organizationId,
        id,
        opportunity.stage,
        nextStage,
        context.user.id,
      ),
    );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (String(error).includes("CALENDAR_CONFLICT")) {
      const latest = await findBlockingConflict(
        context.organizationId,
        opportunity.artistId,
        interval.startDatetime,
        interval.endDatetime,
        existing?.id,
      );
      if (latest) return conflictResponse(latest);
    }
    throw error;
  }
  return Response.json({
    ok: true,
    entry: { id: entryId, status: nextStatus, ...interval },
  });
}
