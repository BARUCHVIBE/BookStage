import { env } from "cloudflare:workers";
import { currentUser } from "@/app/lib/request-context";
import { randomToken } from "@/app/lib/referrals";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

async function activeBooking(userId: string) {
  return env.DB.prepare(
    `SELECT 1 FROM memberships membership JOIN organizations organization ON organization.id=membership.organization_id WHERE membership.user_id=? AND membership.status='ACTIVE' AND membership.role='SALES' AND membership.professional_role='BOOKING_AGENT' AND organization.status='ACTIVE' LIMIT 1`,
  )
    .bind(userId)
    .first();
}

export async function GET(request: Request) {
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await activeBooking(user.id)))
    return Response.json({ error: "Sem perfil de Booking ativo." }, { status: 403 });
  const profile = await env.DB.prepare(
    `SELECT public_code AS publicCode,title,avatar_url AS avatarUrl,phone,whatsapp,status FROM booking_commercial_profiles WHERE user_id=?`,
  )
    .bind(user.id)
    .first();
  return Response.json({
    profile,
    url:
      profile && profile.status === "ACTIVE"
        ? `${new URL(request.url).origin}/bookings/${profile.publicCode}`
        : null,
  });
}

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await activeBooking(user.id)))
    return Response.json({ error: "Sem perfil de Booking ativo." }, { status: 403 });
  const existing = await env.DB.prepare(
    `SELECT public_code AS publicCode,status FROM booking_commercial_profiles WHERE user_id=?`,
  )
    .bind(user.id)
    .first<{ publicCode: string; status: string }>();
  let publicCode = existing?.publicCode;
  if (!publicCode || existing?.status !== "ACTIVE") publicCode = randomToken(18);
  await env.DB.prepare(
    `INSERT INTO booking_commercial_profiles (user_id,public_code,status) VALUES (?,?,'ACTIVE') ON CONFLICT(user_id) DO UPDATE SET public_code=excluded.public_code,status='ACTIVE',updated_at=CURRENT_TIMESTAMP`,
  )
    .bind(user.id, publicCode)
    .run();
  return Response.json({
    url: `${new URL(request.url).origin}/bookings/${publicCode}`,
    publicCode,
  });
}

export async function PATCH(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const user = await currentUser();
  if (!user)
    return Response.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await activeBooking(user.id)))
    return Response.json({ error: "Sem perfil de Booking ativo." }, { status: 403 });
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>,
    clean = (key: string, max: number) =>
      typeof body[key] === "string" ? String(body[key]).trim().slice(0, max) : null,
    title = clean("title", 80) || "Booking Agent",
    avatarUrl = clean("avatarUrl", 500),
    phone = clean("phone", 30),
    whatsapp = clean("whatsapp", 30);
  if (avatarUrl) {
    try {
      const parsed = new URL(avatarUrl);
      if (parsed.protocol !== "https:" || parsed.username || parsed.password)
        throw new Error();
    } catch {
      return Response.json(
        { error: "Avatar deve usar uma URL HTTPS válida." },
        { status: 400 },
      );
    }
  }
  const updated = await env.DB.prepare(
    `UPDATE booking_commercial_profiles SET title=?,avatar_url=?,phone=?,whatsapp=?,updated_at=CURRENT_TIMESTAMP WHERE user_id=? AND status='ACTIVE'`,
  )
    .bind(title, avatarUrl, phone, whatsapp, user.id)
    .run();
  if (updated.meta.changes !== 1)
    return Response.json({ error: "Perfil não encontrado." }, { status: 404 });
  return Response.json({ ok: true });
}
