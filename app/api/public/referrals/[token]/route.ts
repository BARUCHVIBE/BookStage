import { env } from "cloudflare:workers";
import {
  cookieHeader,
  randomToken,
  readCookie,
  referralCookie,
  referralSessionCookie,
  sha256,
  validReferralToken,
} from "@/app/lib/referrals";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";
export async function POST(
  request: Request,
  route: { params: Promise<{ token: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const { token } = await route.params,
    link = await validReferralToken(token);
  if (!link) return Response.json({ valid: false }, { status: 404 });
  let session = readCookie(request, referralSessionCookie);
  if (!session) session = randomToken(18);
  const sessionHash = await sha256(session),
    recent = await env.DB.prepare(
      `SELECT 1 FROM referral_events WHERE referral_link_id=? AND session_hash=? AND type='LINK_VISIT' AND created_at>datetime('now','-24 hours')`,
    )
      .bind(link.id, sessionHash)
      .first();
  if (!recent)
    await env.DB.prepare(
      `INSERT INTO referral_events (id,organization_id,referral_link_id,artist_id,user_id,type,session_hash) VALUES (?,?,?,?,?,'LINK_VISIT',?)`,
    )
      .bind(
        crypto.randomUUID(),
        link.organizationId,
        link.id,
        link.artistId,
        link.userId,
        sessionHash,
      )
      .run();
  const secure = new URL(request.url).protocol === "https:",
    headers = new Headers();
  headers.append(
    "set-cookie",
    cookieHeader(referralCookie, token, 60 * 60 * 24 * 30, secure),
  );
  headers.append(
    "set-cookie",
    cookieHeader(referralSessionCookie, session, 60 * 60 * 24 * 30, secure),
  );
  return Response.json({ valid: true }, { headers });
}
