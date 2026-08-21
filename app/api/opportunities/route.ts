import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { opportunityStages } from "@/app/lib/opportunity-rules";
import { hasGlobalArtistAccess } from "@/app/lib/member-access";
import { canAccessArtist } from "@/app/lib/member-access";
import {
  normalizeEmail,
  normalizePhone,
} from "@/app/lib/booking-request-rules";
import {
  findBlockingConflict,
  conflictResponse,
} from "@/app/lib/calendar-access";
import { defaultOpportunityInterval } from "@/app/lib/opportunity-calendar";
import { parseProposedValue } from "@/app/lib/opportunity-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import { getArtistPrimaryCommercial } from "@/app/lib/artist-sales";

export async function GET(request: Request) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (
    !["OWNER", "MANAGER", "SALES", "BOOKING_AGENT", "FINANCE"].includes(
      context.membership.role,
    )
  )
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  const url = new URL(request.url),
    stage = url.searchParams.get("stage") || "",
    artistId = url.searchParams.get("artistId") || "",
    assignedUserId = url.searchParams.get("assignedUserId") || "",
    search = (url.searchParams.get("q") || "").trim().slice(0, 100);
  if (
    stage &&
    !opportunityStages.includes(stage as (typeof opportunityStages)[number])
  )
    return Response.json({ error: "Etapa inválida." }, { status: 400 });
  const clauses = ["opportunity.organization_id=?"],
    bindings: Array<string> = [context.organizationId];
  if (context.membership.role === "BOOKING_AGENT") {
    clauses.push(
      "(opportunity.assigned_user_id=? OR opportunity.originator_user_id=?)",
    );
    bindings.push(context.user.id, context.user.id);
    if (
      !hasGlobalArtistAccess(
        context.membership.role,
        context.membership.artistAccessScope,
      )
    ) {
      clauses.push(
        "EXISTS (SELECT 1 FROM booking_collaborator_artist_access access WHERE access.organization_id=opportunity.organization_id AND access.artist_id=opportunity.artist_id AND access.user_id=? AND access.status='ACTIVE')",
      );
      bindings.push(context.user.id);
    }
  } else if (context.membership.role === "SALES") {
    clauses.push(
      "(opportunity.assigned_user_id=? OR opportunity.originator_user_id=? OR opportunity.commercial_validator_user_id=?)",
    );
    bindings.push(context.user.id, context.user.id, context.user.id);
    if (
      !hasGlobalArtistAccess(
        context.membership.role,
        context.membership.artistAccessScope,
      )
    ) {
      clauses.push(
        "EXISTS (SELECT 1 FROM artist_sales_assignments access WHERE access.organization_id=opportunity.organization_id AND access.artist_id=opportunity.artist_id AND access.user_id=?)",
      );
      bindings.push(context.user.id);
    }
  } else if (assignedUserId) {
    clauses.push("opportunity.assigned_user_id=?");
    bindings.push(assignedUserId);
  }
  if (stage) {
    clauses.push("opportunity.stage=?");
    bindings.push(stage);
  }
  if (artistId) {
    clauses.push("opportunity.artist_id=?");
    bindings.push(artistId);
  }
  if (search) {
    clauses.push(
      "(customer.name LIKE ? OR customer.company_name LIKE ? OR artist.name LIKE ? OR opportunity.city LIKE ?)",
    );
    const term = `%${search}%`;
    bindings.push(term, term, term, term);
  }
  const rows = await env.DB.prepare(
    `SELECT opportunity.id,opportunity.stage,opportunity.source,opportunity.event_date AS eventDate,opportunity.city,opportunity.state,opportunity.venue,opportunity.event_type AS eventType,opportunity.estimated_audience AS estimatedAudience,opportunity.budget,opportunity.proposed_value AS proposedValue,opportunity.next_action AS nextAction,opportunity.next_action_at AS nextActionAt,opportunity.commercial_approval_status AS commercialApprovalStatus,opportunity.financial_approval_status AS financialApprovalStatus,opportunity.created_at AS createdAt,opportunity.updated_at AS updatedAt,artist.id AS artistId,artist.name AS artistName,customer.id AS customerId,customer.name AS customerName,customer.company_name AS companyName,opportunity.assigned_user_id AS assignedUserId,assignee.name AS assigneeName,opportunity.originator_user_id AS originatorUserId,originator.name AS originatorName,opportunity.commercial_validator_user_id AS commercialValidatorUserId,validator.name AS commercialValidatorName FROM opportunities opportunity JOIN artists artist ON artist.id=opportunity.artist_id AND artist.organization_id=opportunity.organization_id JOIN customers customer ON customer.id=opportunity.customer_id AND customer.organization_id=opportunity.organization_id LEFT JOIN users assignee ON assignee.id=opportunity.assigned_user_id LEFT JOIN users originator ON originator.id=opportunity.originator_user_id LEFT JOIN users validator ON validator.id=opportunity.commercial_validator_user_id WHERE ${clauses.join(" AND ")} ORDER BY opportunity.updated_at DESC LIMIT 250`,
  )
    .bind(...bindings)
    .all();
  return Response.json({
    opportunities: rows.results,
    stages: opportunityStages,
  });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (
    !["OWNER", "MANAGER", "SALES", "BOOKING_AGENT"].includes(
      context.membership.role,
    )
  )
    return Response.json(
      { error: "Sem permissão para criar oportunidades." },
      { status: 403 },
    );
  const body = (await request.json().catch(() => ({}))) as Record<
      string,
      unknown
    >,
    text = (key: string, max: number) =>
      typeof body[key] === "string"
        ? (body[key] as string).trim().slice(0, max)
        : "",
    artistId = text("artistId", 100),
    name = text("customerName", 160),
    email = text("email", 320),
    phone = text("phone", 60),
    companyName = text("companyName", 160) || null,
    eventDate = text("eventDate", 10),
    city = text("city", 160),
    state = text("state", 30),
    venue = text("venue", 200) || null,
    eventType = text("eventType", 160),
    notes = text("notes", 2000) || null;
  if (
    !artistId ||
    !name ||
    !email ||
    !phone ||
    !/^\d{4}-\d{2}-\d{2}$/.test(eventDate) ||
    !city ||
    !state ||
    !eventType
  )
    return Response.json(
      {
        error:
          "Artista, contratante, contato, data, cidade, estado e tipo de evento são obrigatórios.",
      },
      { status: 400 },
    );
  if (
    !(await canAccessArtist(
      context.organizationId,
      context.user.id,
      context.membership.role,
      context.membership.artistAccessScope,
      artistId,
    ))
  )
    return Response.json({ error: "Artista não encontrado." }, { status: 404 });
  const commercialValidator = await getArtistPrimaryCommercial(
    context.organizationId,
    artistId,
  );
  if (context.membership.role === "BOOKING_AGENT" && !commercialValidator)
    return Response.json(
      {
        error:
          "Este artista ainda não possui um comercial interno responsável pela validação.",
      },
      { status: 409 },
    );
  let proposedValue: null | number = null;
  try {
    proposedValue = parseProposedValue(body.proposedValue);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Valor inválido." },
      { status: 400 },
    );
  }
  const normalizedEmail = normalizeEmail(email),
    normalizedPhone = normalizePhone(phone),
    matches = await env.DB.prepare(
      `SELECT id FROM customers WHERE organization_id=? AND (normalized_email=? OR normalized_phone=?)`,
    )
      .bind(context.organizationId, normalizedEmail, normalizedPhone)
      .all<{ id: string }>(),
    ids = [...new Set(matches.results.map((item) => item.id))];
  if (ids.length > 1)
    return Response.json(
      { error: "Os contatos informados pertencem a cadastros diferentes." },
      { status: 409 },
    );
  const customerId = ids[0] || crypto.randomUUID(),
    opportunityId = crypto.randomUUID(),
    createOption = body.createOption === true,
    interval = defaultOpportunityInterval(eventDate);
  if (createOption) {
    const conflict = await findBlockingConflict(
      context.organizationId,
      artistId,
      interval.startDatetime,
      interval.endDatetime,
    );
    if (conflict) return conflictResponse(conflict);
  }
  const statements = [];
  if (!ids.length)
    statements.push(
      env.DB.prepare(
        `INSERT INTO customers (id,organization_id,name,company_name,email,normalized_email,phone,normalized_phone,city,state) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      ).bind(
        customerId,
        context.organizationId,
        name,
        companyName,
        email,
        normalizedEmail,
        phone,
        normalizedPhone,
        city,
        state,
      ),
    );
  statements.push(
    env.DB.prepare(
      `INSERT INTO opportunities (id,organization_id,artist_id,customer_id,assigned_user_id,originator_user_id,commercial_validator_user_id,stage,source,event_date,city,state,venue,event_type,proposed_value,notes) VALUES (?,?,?,?,?,?,?,?,'INTERNAL',?,?,?,?,?,?,?)`,
    ).bind(
      opportunityId,
      context.organizationId,
      artistId,
      customerId,
      context.user.id,
      context.user.id,
      commercialValidator?.userId || null,
      createOption ? "DATE_OPTION" : "NEW",
      eventDate,
      city,
      state,
      venue,
      eventType,
      proposedValue,
      notes,
    ),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,'CREATED','Oportunidade criada pela equipe comercial.','INTERNAL',?)`,
    ).bind(
      crypto.randomUUID(),
      context.organizationId,
      opportunityId,
      context.user.id,
    ),
  );
  if (createOption) {
    const entryId = crypto.randomUUID(),
      artist = await env.DB.prepare(
        `SELECT name FROM artists WHERE id=? AND organization_id=?`,
      )
        .bind(artistId, context.organizationId)
        .first<{ name: string }>();
    statements.push(
      env.DB.prepare(
        `INSERT INTO calendar_entries (id,organization_id,artist_id,start_datetime,end_datetime,status,title,internal_notes,option_expires_at,created_by) VALUES (?,?,?,?,?,'OPTION',?,?,?,?)`,
      ).bind(
        entryId,
        context.organizationId,
        artistId,
        interval.startDatetime,
        interval.endDatetime,
        `Opção · ${artist?.name || "Artista"} · ${name}`,
        notes,
        new Date(Date.now() + 7 * 86400000).toISOString(),
        context.user.id,
      ),
      env.DB.prepare(
        `INSERT INTO opportunity_calendar_entries (organization_id,opportunity_id,calendar_entry_id) VALUES (?,?,?)`,
      ).bind(context.organizationId, opportunityId, entryId),
      env.DB.prepare(
        `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,'CALENDAR_OPTION','Opção de data criada junto com a oportunidade.',?,?)`,
      ).bind(
        crypto.randomUUID(),
        context.organizationId,
        opportunityId,
        interval.startDatetime,
        context.user.id,
      ),
    );
  }
  await env.DB.batch(statements);
  return Response.json({ id: opportunityId }, { status: 201 });
}
