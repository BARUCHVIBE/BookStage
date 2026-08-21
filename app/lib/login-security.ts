import { env } from "cloudflare:workers";
import { ensureDatabase } from "@/db/bootstrap";

async function hash(value: string) {
  const bytes = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
async function identity(request: Request, email: string) {
  const source =
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local";
  const agent = request.headers.get("user-agent")?.slice(0, 300) || "unknown";
  return {
    fingerprintHash: await hash(`${source}|${agent}`),
    emailHash: await hash(email.trim().toLowerCase()),
  };
}
export async function loginRateLimit(request: Request, email: string) {
  await ensureDatabase();
  const keys = await identity(request, email),
    counts = await env.DB.prepare(
      `SELECT SUM(CASE WHEN fingerprint_hash=? THEN 1 ELSE 0 END) AS fingerprintCount,SUM(CASE WHEN email_hash=? THEN 1 ELSE 0 END) AS emailCount FROM auth_login_attempts WHERE created_at>datetime('now','-15 minutes')`,
    )
      .bind(keys.fingerprintHash, keys.emailHash)
      .first<{ fingerprintCount: number | null; emailCount: number | null }>();
  return {
    keys,
    blocked:
      Number(counts?.fingerprintCount || 0) >= 10 ||
      Number(counts?.emailCount || 0) >= 20,
  };
}
export async function recordLoginFailure(keys: {
  fingerprintHash: string;
  emailHash: string;
}) {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO auth_login_attempts (id,fingerprint_hash,email_hash) VALUES (?,?,?)`,
    ).bind(crypto.randomUUID(), keys.fingerprintHash, keys.emailHash),
    env.DB.prepare(
      `DELETE FROM auth_login_attempts WHERE created_at<datetime('now','-24 hours')`,
    ),
  ]);
}
export async function clearLoginFailures(keys: {
  fingerprintHash: string;
  emailHash: string;
}) {
  await env.DB.prepare(
    `DELETE FROM auth_login_attempts WHERE fingerprint_hash=? AND email_hash=?`,
  )
    .bind(keys.fingerprintHash, keys.emailHash)
    .run();
}
