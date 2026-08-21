import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  conflictResponse,
  findBlockingConflict,
} from "@/app/lib/calendar-access";
import { defaultOpportunityInterval } from "@/app/lib/opportunity-calendar";
import {
  canAccessOpportunity,
  canEditOpportunity,
  parseProposedValue,
  validateOpportunityStage,
  validateOpportunityTransition,
  validateStageChange,
  type OpportunityStage,
} from "@/app/lib/opportunity-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import { canAccessArtist } from "@/app/lib/member-access";

type Current = {
  id: string;
  customerId: string;
  customerName: string;
  artistId: string;
  artistName: string;
  assignedUserId: string | null;
  originatorUserId: string | null;
  commercialValidatorUserId: string | null;
  stage: OpportunityStage;
  eventDate: string;
  eventType: string;
  city: string;
  state: string;
  venue: string | null;
  proposedValue: number | null;
  notes: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  lostReason: string | null;
  commercialApprovalStatus: string;
  financialApprovalStatus: string;
};
type LinkedEntry = {
  id: string;
  artistId: string;
  startDatetime: string;
  endDatetime: string | null;
  status: string;
};
async function currentOpportunity(id: string, organizationId: string) {
  return env.DB.prepare(
    `SELECT opportunity.id,opportunity.customer_id AS customerId,customer.name AS customerName,opportunity.artist_id AS artistId,artist.name AS artistName,opportunity.assigned_user_id AS assignedUserId,opportunity.originator_user_id AS originatorUserId,opportunity.commercial_validator_user_id AS commercialValidatorUserId,opportunity.stage,opportunity.event_date AS eventDate,opportunity.event_type AS eventType,opportunity.city,opportunity.state,opportunity.venue,opportunity.proposed_value AS proposedValue,opportunity.notes,opportunity.next_action AS nextAction,opportunity.next_action_at AS nextActionAt,opportunity.lost_reason AS lostReason,opportunity.commercial_approval_status AS commercialApprovalStatus,opportunity.financial_approval_status AS financialApprovalStatus FROM opportunities opportunity JOIN customers customer ON customer.id=opportunity.customer_id AND customer.organization_id=opportunity.organization_id JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id WHERE opportunity.id=? AND opportunity.organization_id=?`,
  )
    .bind(id, organizationId)
    .first<Current>();
}
async function linkedEntry(id: string, organizationId: string) {
  return env.DB.prepare(
    `SELECT entry.id,entry.artist_id AS artistId,entry.start_datetime AS startDatetime,entry.end_datetime AS endDatetime,entry.status FROM opportunity_calendar_entries link JOIN calendar_entries entry ON entry.id=link.calendar_entry_id AND entry.organization_id=link.organization_id WHERE link.opportunity_id=? AND link.organization_id=?`,
  )
    .bind(id, organizationId)
    .first<LinkedEntry>();
}
function clean(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export async function GET(
  _: Request,
  route: { params: Promise<{ id: string }> },
) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params,
    current = await currentOpportunity(id, context.organizationId);
  if (
    !current ||
    !canAccessOpportunity(
      context.membership.role,
      current.assignedUserId,
      context.user.id,
      current.originatorUserId,
      current.commercialValidatorUserId,
    ) ||
    !(await canAccessArtist(
      context.organizationId,
      context.user.id,
      context.membership.role,
      context.membership.artistAccessScope,
      current.artistId,
    ))
  )
    return Response.json(
      { error: "Oportunidade não encontrada." },
      { status: 404 },
    );
  const opportunity = await env.DB.prepare(
    `SELECT opportunity.*,customer.name AS customerName,customer.company_name AS companyName,customer.email,customer.phone,artist.name AS artistName,assignee.name AS assigneeName,originator.name AS originatorName,validator.name AS commercialValidatorName FROM opportunities opportunity JOIN customers customer ON customer.id=opportunity.customer_id AND customer.organization_id=opportunity.organization_id JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id LEFT JOIN users assignee ON assignee.id=opportunity.assigned_user_id LEFT JOIN users originator ON originator.id=opportunity.originator_user_id LEFT JOIN users validator ON validator.id=opportunity.commercial_validator_user_id WHERE opportunity.id=? AND opportunity.organization_id=?`,
  )
    .bind(id, context.organizationId)
    .first();
  const activities = await env.DB.prepare(
    `SELECT activity.id,activity.type,activity.description,activity.from_value AS fromValue,activity.to_value AS toValue,activity.created_at AS createdAt,author.name AS authorName FROM opportunity_activities activity LEFT JOIN users author ON author.id=activity.created_by WHERE activity.opportunity_id=? AND activity.organization_id=? ORDER BY activity.created_at DESC`,
  )
    .bind(id, context.organizationId)
    .all();
  const members = !["OWNER", "MANAGER"].includes(context.membership.role)
    ? []
    : (
        await env.DB.prepare(
          `SELECT user.id,user.name,CASE WHEN membership.role='SALES' AND membership.professional_role='BOOKING_AGENT' THEN 'BOOKING_AGENT' ELSE membership.role END AS role FROM memberships membership JOIN users user ON user.id=membership.user_id WHERE membership.organization_id=? AND membership.status='ACTIVE' AND membership.role IN ('OWNER','MANAGER','SALES') ORDER BY user.name`,
        )
          .bind(context.organizationId)
          .all()
      ).results;
  return Response.json({
    opportunity,
    activities: activities.results,
    members,
    canReassign: ["OWNER", "MANAGER"].includes(context.membership.role),
    canEdit:
      canEditOpportunity(
        context.membership.role,
        current.assignedUserId,
        context.user.id,
        current.originatorUserId,
        current.commercialValidatorUserId,
      ) &&
      !(
        context.membership.role === "BOOKING_AGENT" &&
        current.commercialApprovalStatus === "APPROVED"
      ),
    role: context.membership.role,
  });
}

export async function PATCH(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params,
    current = await currentOpportunity(id, context.organizationId);
  if (
    !current ||
    !canEditOpportunity(
      context.membership.role,
      current.assignedUserId,
      context.user.id,
      current.originatorUserId,
      current.commercialValidatorUserId,
    ) ||
    !(await canAccessArtist(
      context.organizationId,
      context.user.id,
      context.membership.role,
      context.membership.artistAccessScope,
      current.artistId,
    ))
  )
    return Response.json(
      { error: "Oportunidade não encontrada." },
      { status: 404 },
    );
  if (
    context.membership.role === "BOOKING_AGENT" &&
    current.commercialApprovalStatus === "APPROVED"
  )
    return Response.json(
      {
        error:
          "A negociação já foi validada e agora segue com o comercial interno do artista.",
      },
      { status: 403 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  let stage = current.stage,
    assignedUserId = current.assignedUserId,
    originatorUserId = current.originatorUserId,
    proposedValue = current.proposedValue,
    notes = current.notes,
    nextAction = current.nextAction,
    nextActionAt = current.nextActionAt,
    lostReason = current.lostReason,
    originChangeReason: string | null = null;
  try {
    if ("stage" in body)
      stage = validateOpportunityTransition(
        current.stage,
        validateOpportunityStage(body.stage),
      );
    if ("proposedValue" in body)
      proposedValue = parseProposedValue(body.proposedValue);
    if ("notes" in body) notes = clean(body.notes, 4000) || null;
    if ("nextAction" in body) nextAction = clean(body.nextAction, 500) || null;
    if ("nextActionAt" in body) {
      const raw = clean(body.nextActionAt, 30);
      if (raw && Number.isNaN(new Date(raw).getTime()))
        throw new Error("Data da próxima ação inválida.");
      nextActionAt = raw ? new Date(raw).toISOString() : null;
    }
    if ("assignedUserId" in body) {
      if (!["OWNER", "MANAGER"].includes(context.membership.role))
        throw new Error("Sem permissão para trocar o responsável.");
      assignedUserId = clean(body.assignedUserId, 100) || null;
      if (assignedUserId) {
        const member = await env.DB.prepare(
          `SELECT role,professional_role AS professionalRole,artist_access_scope AS scope FROM memberships WHERE organization_id=? AND user_id=? AND status='ACTIVE' AND role IN ('OWNER','MANAGER','SALES')`,
        )
          .bind(context.organizationId, assignedUserId)
          .first<{
            role: string;
            professionalRole: string | null;
            scope: "ALL" | "ASSIGNED";
          }>();
        if (!member)
          throw new Error("Responsável inválido para esta organização.");
        const targetRole =
          member.role === "SALES" && member.professionalRole === "BOOKING_AGENT"
            ? "BOOKING_AGENT"
            : member.role;
        if (
          !(await canAccessArtist(
            context.organizationId,
            assignedUserId,
            targetRole as import("@/app/lib/tenant").Role,
            member.scope,
            current.artistId,
          ))
        )
          throw new Error("O responsável não possui acesso a este artista.");
      }
    }
    if ("originatorUserId" in body) {
      if (!["OWNER", "MANAGER"].includes(context.membership.role))
        throw new Error("Sem permissão para corrigir a origem.");
      originChangeReason = clean(body.originChangeReason, 500);
      if (!originChangeReason)
        throw new Error("Informe o motivo da correção da origem comercial.");
      originatorUserId = clean(body.originatorUserId, 100) || null;
      if (originatorUserId) {
        const member = await env.DB.prepare(
          `SELECT role,professional_role AS professionalRole,artist_access_scope AS scope FROM memberships WHERE organization_id=? AND user_id=? AND status='ACTIVE' AND role IN ('OWNER','MANAGER','SALES')`,
        )
          .bind(context.organizationId, originatorUserId)
          .first<{
            role: string;
            professionalRole: string | null;
            scope: "ALL" | "ASSIGNED";
          }>();
        if (!member)
          throw new Error("Originador inválido para esta organização.");
        const targetRole =
          member.role === "SALES" && member.professionalRole === "BOOKING_AGENT"
            ? "BOOKING_AGENT"
            : member.role;
        if (
          !(await canAccessArtist(
            context.organizationId,
            originatorUserId,
            targetRole as import("@/app/lib/tenant").Role,
            member.scope,
            current.artistId,
          ))
        )
          throw new Error("O originador não possui acesso a este artista.");
      }
    }
    lostReason = validateStageChange(
      stage,
      "lostReason" in body ? body.lostReason : current.lostReason,
    );
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Dados inválidos." },
      { status: 400 },
    );
  }
  let closingEntry: LinkedEntry | null = null,
    closingEntryId: string | null = null,
    existingShow: { id: string } | null = null;
  if (stage === "CLOSED_WON") {
    if (!["OWNER", "MANAGER"].includes(context.membership.role))
      return Response.json(
        { error: "O fechamento definitivo exige validação comercial." },
        { status: 403 },
      );
    if (
      current.commercialApprovalStatus !== "APPROVED" ||
      current.financialApprovalStatus !== "APPROVED"
    )
      return Response.json(
        {
          error:
            "A venda precisa das aprovações comercial e financeira antes do fechamento.",
        },
        { status: 409 },
      );
    const signedContract = await env.DB.prepare(
      `SELECT 1 FROM contracts WHERE opportunity_id=? AND organization_id=? AND status='SIGNED'`,
    )
      .bind(id, context.organizationId)
      .first();
    if (!signedContract)
      return Response.json(
        { error: "Marque o contrato como assinado antes de confirmar o show." },
        { status: 409 },
      );
    closingEntry = (await linkedEntry(id, context.organizationId)) ?? null;
    if (closingEntry && closingEntry.artistId !== current.artistId)
      return Response.json(
        {
          error: "A data vinculada não pertence ao artista desta oportunidade.",
        },
        { status: 409 },
      );
    const interval =
        closingEntry ?? defaultOpportunityInterval(current.eventDate),
      conflict = await findBlockingConflict(
        context.organizationId,
        current.artistId,
        interval.startDatetime,
        interval.endDatetime,
        closingEntry?.id,
      );
    if (conflict) return conflictResponse(conflict);
    closingEntryId = closingEntry?.id || crypto.randomUUID();
    existingShow =
      (await env.DB.prepare(
        `SELECT id FROM shows WHERE opportunity_id=? AND organization_id=?`,
      )
        .bind(id, context.organizationId)
        .first<{ id: string }>()) ?? null;
  }
  const statements = [];
  statements.push(
    env.DB.prepare(
      `UPDATE opportunities SET assigned_user_id=?,originator_user_id=?,stage=?,proposed_value=?,notes=?,next_action=?,next_action_at=?,lost_reason=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
    ).bind(
      assignedUserId,
      originatorUserId,
      stage,
      proposedValue,
      notes,
      nextAction,
      nextActionAt,
      lostReason,
      id,
      context.organizationId,
    ),
  );
  const addActivity = (
    type: string,
    description: string,
    fromValue: string | null,
    toValue: string | null,
  ) =>
    statements.push(
      env.DB.prepare(
        `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,?,?,?,?,?)`,
      ).bind(
        crypto.randomUUID(),
        context.organizationId,
        id,
        type,
        description,
        fromValue,
        toValue,
        context.user.id,
      ),
    );
  if (stage !== current.stage)
    addActivity(
      stage === "CLOSED_WON"
        ? "CLOSED_WON"
        : stage === "CLOSED_LOST"
          ? "CLOSED_LOST"
          : "STAGE_CHANGED",
      stage === "CLOSED_WON"
        ? "Oportunidade marcada como ganha."
        : stage === "CLOSED_LOST"
          ? `Oportunidade perdida: ${lostReason}`
          : "Etapa comercial atualizada.",
      current.stage,
      stage,
    );
  if (assignedUserId !== current.assignedUserId)
    addActivity(
      "ASSIGNEE_CHANGED",
      "Responsável comercial alterado.",
      current.assignedUserId,
      assignedUserId,
    );
  if (originatorUserId !== current.originatorUserId)
    addActivity(
      "ORIGINATOR_CHANGED",
      `Origem comercial corrigida: ${originChangeReason}`,
      current.originatorUserId,
      originatorUserId,
    );
  if (proposedValue !== current.proposedValue)
    addActivity(
      "VALUE_CHANGED",
      "Valor proposto alterado.",
      current.proposedValue === null ? null : String(current.proposedValue),
      proposedValue === null ? null : String(proposedValue),
    );
  if (notes !== current.notes)
    addActivity(
      "NOTE_UPDATED",
      "Observações relevantes atualizadas.",
      null,
      null,
    );
  if (stage === "CLOSED_WON" && closingEntryId) {
    const interval =
        closingEntry ?? defaultOpportunityInterval(current.eventDate),
      title = `Show confirmado · ${current.artistName} · ${current.customerName}`;
    if (closingEntry)
      statements.push(
        env.DB.prepare(
          `UPDATE calendar_entries SET status='CONFIRMED',title=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
        ).bind(title, closingEntryId, context.organizationId),
      );
    else {
      statements.push(
        env.DB.prepare(
          `INSERT INTO calendar_entries (id,organization_id,artist_id,start_datetime,end_datetime,status,title,internal_notes,created_by) VALUES (?,?,?,?,?,'CONFIRMED',?,?,?)`,
        ).bind(
          closingEntryId,
          context.organizationId,
          current.artistId,
          interval.startDatetime,
          interval.endDatetime,
          title,
          `Confirmado pelo fechamento da oportunidade ${id}.`,
          context.user.id,
        ),
      );
      statements.push(
        env.DB.prepare(
          `INSERT INTO opportunity_calendar_entries (organization_id,opportunity_id,calendar_entry_id) VALUES (?,?,?)`,
        ).bind(context.organizationId, id, closingEntryId),
      );
    }
    if (!closingEntry || closingEntry.status !== "CONFIRMED")
      addActivity(
        "CALENDAR_CONFIRMED",
        "Data confirmada automaticamente no fechamento.",
        closingEntry?.status ?? null,
        "CONFIRMED",
      );
    const showId = existingShow?.id || crypto.randomUUID(),
      eventName = `${current.artistName} · ${current.eventType}`,
      showTime = interval.startDatetime.slice(11, 16);
    statements.push(
      env.DB.prepare(
        `INSERT OR IGNORE INTO shows (id,organization_id,opportunity_id,artist_id,customer_id,calendar_entry_id,event_name,date,show_time,venue,city,state,fee,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'CONFIRMED')`,
      ).bind(
        showId,
        context.organizationId,
        id,
        current.artistId,
        current.customerId,
        closingEntryId,
        eventName,
        current.eventDate,
        showTime,
        current.venue,
        current.city,
        current.state,
        proposedValue,
      ),
    );
    statements.push(
      env.DB.prepare(
        `UPDATE show_commissions SET show_id=?,status=CASE WHEN status='ESTIMATED' THEN 'APPROVED' ELSE status END,updated_at=CURRENT_TIMESTAMP WHERE opportunity_id=? AND organization_id=?`,
      ).bind(showId, id, context.organizationId),
    );
    if (existingShow)
      statements.push(
        env.DB.prepare(
          `UPDATE shows SET event_name=CASE WHEN event_name='' THEN ? ELSE event_name END,date=CASE WHEN date='' THEN ? ELSE date END,show_time=COALESCE(show_time,?),venue=COALESCE(venue,?),city=CASE WHEN city='' THEN ? ELSE city END,state=CASE WHEN state='' THEN ? ELSE state END,fee=COALESCE(fee,?),updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
        ).bind(
          eventName,
          current.eventDate,
          showTime,
          current.venue,
          current.city,
          current.state,
          proposedValue,
          showId,
          context.organizationId,
        ),
      );
    statements.push(
      env.DB.prepare(
        `UPDATE contracts SET show_id=COALESCE(show_id,?),updated_at=CURRENT_TIMESTAMP WHERE opportunity_id=? AND organization_id=?`,
      ).bind(showId, id, context.organizationId),
    );
    if (!existingShow) {
      statements.push(
        env.DB.prepare(
          `INSERT INTO show_activities (id,organization_id,show_id,type,description,created_by) VALUES (?,?,?,'CREATED','Show criado a partir do fechamento da oportunidade.',?)`,
        ).bind(
          crypto.randomUUID(),
          context.organizationId,
          showId,
          context.user.id,
        ),
      );
      addActivity(
        "SHOW_PREPARED",
        "Show confirmado e estrutura operacional criada.",
        null,
        "CONFIRMED",
      );
    }
    statements.push(
      env.DB.prepare(
        `INSERT INTO referral_events (id,organization_id,referral_link_id,artist_id,user_id,opportunity_id,type) SELECT ?,organization_id,referral_link_id,artist_id,originator_user_id,id,'SHOW_CONFIRMED' FROM opportunities WHERE id=? AND organization_id=? AND referral_link_id IS NOT NULL AND originator_user_id IS NOT NULL`,
      ).bind(crypto.randomUUID(), id, context.organizationId),
    );
  }
  try {
    await env.DB.batch(statements);
  } catch (error) {
    if (stage === "CLOSED_WON" && String(error).includes("CALENDAR_CONFLICT")) {
      const interval =
          closingEntry ?? defaultOpportunityInterval(current.eventDate),
        latest = await findBlockingConflict(
          context.organizationId,
          current.artistId,
          interval.startDatetime,
          interval.endDatetime,
          closingEntry?.id,
        );
      if (latest) return conflictResponse(latest);
    }
    throw error;
  }
  return Response.json({ ok: true, showPrepared: stage === "CLOSED_WON" });
}
