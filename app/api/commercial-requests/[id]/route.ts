import { env } from "cloudflare:workers";
import { getArtistPrimaryCommercial } from "@/app/lib/artist-sales";
import { normalizeEmail, normalizePhone } from "@/app/lib/booking-request-rules";
import {
  canManageCommercialRequest,
  commercialRequestCapabilities,
  commercialRequestMembershipSql,
} from "@/app/lib/commercial-request-access";
import {
  guardedOpportunityInsertSql,
  guardedRequestConversionSql,
} from "@/app/lib/commercial-request-conversion";
import { canAccessArtist } from "@/app/lib/member-access";
import { activeOrganizationId, currentUser } from "@/app/lib/request-context";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
import { effectiveRole, type ArtistAccessScope, type BaseRole } from "@/app/lib/tenant";

type Intake = {
  id: string;
  organizationId: string;
  artistId: string;
  bookingUserId: string;
  opportunityId: string | null;
  status: "NEW" | "ACCEPTED" | "DECLINED" | "CONVERTED";
  customerName: string;
  companyName: string | null;
  phone: string;
  email: string;
  document: string | null;
  eventDate: string;
  city: string;
  state: string;
  venue: string | null;
  eventType: string;
  estimatedAudience: number | null;
  budget: string | null;
  notes: string | null;
  createdAt: string;
};

export async function PATCH(request: Request, route: { params: Promise<{ id: string }> }) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  const { id } = await route.params,
    intake = await env.DB.prepare(
      `SELECT id,organization_id AS organizationId,artist_id AS artistId,booking_user_id AS bookingUserId,opportunity_id AS opportunityId,status,customer_name AS customerName,company_name AS companyName,phone,email,document,event_date AS eventDate,city,state,venue,event_type AS eventType,estimated_audience AS estimatedAudience,budget,notes,created_at AS createdAt FROM commercial_requests WHERE id=?`,
    )
      .bind(id)
      .first<Intake>();
  if (!intake)
    return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
  const membership = await env.DB.prepare(
    commercialRequestMembershipSql,
  )
    .bind(intake.organizationId, user.id)
    .first<{
      baseRole: BaseRole;
      professionalRole: string | null;
      scope: ArtistAccessScope;
      status: string;
    }>();
  if (!membership || membership.status !== "ACTIVE")
    return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
  const role = effectiveRole(membership.baseRole, membership.professionalRole),
    ownBooking = role === "BOOKING_AGENT" && intake.bookingUserId === user.id,
    manager = ["OWNER", "MANAGER"].includes(role);
  if (manager && (await activeOrganizationId()) !== intake.organizationId)
    return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
  if (
    !canManageCommercialRequest(role, ownBooking) ||
    !(await canAccessArtist(
      intake.organizationId,
      user.id,
      role,
      membership.scope,
      intake.artistId,
    ))
  )
    return Response.json({ error: "Solicitação não encontrada." }, { status: 404 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>,
    action = typeof body.action === "string" ? body.action : "",
    decisionNotes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : null,
    capabilities = commercialRequestCapabilities({
      role,
      isOwnBookingRequest: ownBooking,
      status: intake.status,
      opportunityId: intake.opportunityId,
    });

  if (action === "ACCEPT") {
    if (intake.status === "ACCEPTED") return Response.json({ ok: true, status: "ACCEPTED" });
    if (!capabilities.canAccept)
      return Response.json({ error: "Solicitação já processada." }, { status: 409 });
    const updated = await env.DB.prepare(
      `UPDATE commercial_requests SET status='ACCEPTED',decision_notes=?,decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status='NEW'`,
    )
      .bind(decisionNotes, id)
      .run();
    if (updated.meta.changes !== 1) {
      const current = await currentRequestState(id, intake.organizationId);
      if (current?.status === "ACCEPTED")
        return Response.json({ ok: true, status: "ACCEPTED" });
      return concurrentChangeResponse();
    }
    return Response.json({ ok: true, status: "ACCEPTED" });
  }
  if (action === "DECLINE") {
    if (!capabilities.canDecline)
      return Response.json({ error: "Solicitação já processada." }, { status: 409 });
    if (!decisionNotes)
      return Response.json({ error: "Informe o motivo da recusa." }, { status: 400 });
    const updated = await env.DB.prepare(
      `UPDATE commercial_requests SET status='DECLINED',decision_notes=?,decided_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=? AND status IN ('NEW','ACCEPTED')`,
    )
      .bind(decisionNotes, id)
      .run();
    if (updated.meta.changes !== 1) {
      const current = await currentRequestState(id, intake.organizationId);
      if (current?.status === "DECLINED")
        return Response.json({ ok: true, status: "DECLINED" });
      return concurrentChangeResponse();
    }
    return Response.json({ ok: true, status: "DECLINED" });
  }
  if (action !== "CONVERT")
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  if (intake.status === "CONVERTED" && intake.opportunityId)
    return Response.json({ ok: true, status: "CONVERTED", opportunityId: intake.opportunityId });
  if (!capabilities.canConvert)
    return Response.json({ error: "Aceite a solicitação antes de criar a negociação." }, { status: 409 });

  const normalizedEmail = normalizeEmail(intake.email),
    normalizedPhone = normalizePhone(intake.phone),
    matches = await env.DB.prepare(
      `SELECT id FROM customers WHERE organization_id=? AND (normalized_email=? OR normalized_phone=?)`,
    )
      .bind(intake.organizationId, normalizedEmail, normalizedPhone)
      .all<{ id: string }>(),
    customerIds = [...new Set(matches.results.map((item) => item.id))];
  if (customerIds.length > 1)
    return Response.json({ error: "Os contatos pertencem a cadastros diferentes." }, { status: 409 });
  const customerId = customerIds[0] || crypto.randomUUID(),
    opportunityId = crypto.randomUUID(),
    validator = await getArtistPrimaryCommercial(intake.organizationId, intake.artistId),
    statements = [];
  if (!customerIds.length)
    statements.push(
      env.DB.prepare(
        `INSERT INTO customers (id,organization_id,name,company_name,email,normalized_email,phone,normalized_phone,document,city,state) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
      ).bind(customerId, intake.organizationId, intake.customerName, intake.companyName, intake.email, normalizedEmail, intake.phone, normalizedPhone, intake.document, intake.city, intake.state),
    );
  statements.push(
    env.DB.prepare(
      guardedOpportunityInsertSql,
    ).bind(opportunityId, customerId, intake.bookingUserId, intake.bookingUserId, validator?.userId || null, id, intake.organizationId),
    env.DB.prepare(
      guardedRequestConversionSql,
    ).bind(opportunityId, id, intake.organizationId, opportunityId, intake.organizationId),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_at) VALUES (?,?,?,'CREATED','Solicitação recebida pelo catálogo comercial do Booking.','BOOKING_CATALOG',?)`,
    ).bind(crypto.randomUUID(), intake.organizationId, opportunityId, intake.createdAt),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,to_value,created_by) VALUES (?,?,?,'INTAKE_ACCEPTED','Booking aceitou e transformou a solicitação em negociação.',?,?)`,
    ).bind(crypto.randomUUID(), intake.organizationId, opportunityId, id, user.id),
  );
  try {
    await env.DB.batch(statements);
  } catch (error) {
    const converted = await env.DB.prepare(
      `SELECT opportunity_id AS opportunityId FROM commercial_requests WHERE id=? AND organization_id=? AND status='CONVERTED'`,
    )
      .bind(id, intake.organizationId)
      .first<{ opportunityId: string | null }>();
    if (converted?.opportunityId)
      return Response.json({ ok: true, status: "CONVERTED", opportunityId: converted.opportunityId });
    const current = await currentRequestState(id, intake.organizationId);
    if (current && current.status !== "ACCEPTED") return concurrentChangeResponse();
    throw error;
  }
  return Response.json({ ok: true, status: "CONVERTED", opportunityId }, { status: 201 });
}

async function currentRequestState(id: string, organizationId: string) {
  return env.DB.prepare(
    `SELECT status,opportunity_id AS opportunityId FROM commercial_requests WHERE id=? AND organization_id=?`,
  )
    .bind(id, organizationId)
    .first<{ status: Intake["status"]; opportunityId: string | null }>();
}

function concurrentChangeResponse() {
  return Response.json(
    { error: "A solicitação foi alterada por outra operação. Atualize e tente novamente." },
    { status: 409 },
  );
}
