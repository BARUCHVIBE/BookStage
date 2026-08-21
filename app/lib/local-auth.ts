import { env } from "cloudflare:workers";
import { cookies } from "next/headers";
import { ensureDatabase } from "@/db/bootstrap";

const SESSION_COOKIE = "bookstage_session";
const SESSION_DAYS = 7;
const DEFAULT_EMAIL = "admin@bookstage.local";
const DEFAULT_PASSWORD = "BookStage@2026";
const DEFAULT_USER_ID = "user-a";

const encoder = new TextEncoder();

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function randomHex(size: number) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}

async function sha256(value: string) {
  return toHex(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", encoder.encode(value)),
    ),
  );
}

async function passwordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: encoder.encode(salt),
      iterations: 210_000,
    },
    key,
    256,
  );
  return toHex(new Uint8Array(bits));
}

export async function createPasswordCredential(password: string) {
  const salt = randomHex(16);
  return { salt, hash: await passwordHash(password, salt) };
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index++)
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return result === 0;
}

async function ensureLocalAdmin() {
  if (
    process.env.NODE_ENV === "production" ||
    process.env.BOOKSTAGE_ENABLE_LOCAL_SEED !== "true"
  )
    return;
  const email =
    process.env.BOOKSTAGE_LOCAL_ADMIN_EMAIL?.trim().toLowerCase() ||
    DEFAULT_EMAIL;
  const password =
    process.env.BOOKSTAGE_LOCAL_ADMIN_PASSWORD || DEFAULT_PASSWORD;
  const existing = await env.DB.prepare(
    `SELECT user_id FROM auth_credentials WHERE user_id=?`,
  )
    .bind(DEFAULT_USER_ID)
    .first();
  if (!existing) {
    const salt = randomHex(16);
    const hash = await passwordHash(password, salt);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id,email,name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,updated_at=CURRENT_TIMESTAMP`,
      ).bind(DEFAULT_USER_ID, email, "Administrador"),
      env.DB.prepare(
        `INSERT INTO auth_credentials (user_id,password_hash,password_salt) VALUES (?,?,?) ON CONFLICT(user_id) DO UPDATE SET password_hash=excluded.password_hash,password_salt=excluded.password_salt,updated_at=CURRENT_TIMESTAMP`,
      ).bind(DEFAULT_USER_ID, hash, salt),
    ]);
  }
  const productionUserId = "production-luiza",
    productionExisting = await env.DB.prepare(
      `SELECT user_id FROM auth_credentials WHERE user_id=?`,
    )
      .bind(productionUserId)
      .first();
  if (!productionExisting) {
    const salt = randomHex(16),
      hash = await passwordHash(DEFAULT_PASSWORD, salt);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id,email,name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,updated_at=CURRENT_TIMESTAMP`,
      ).bind(productionUserId, "producao@bookstage.local", "Luiza Produção"),
      env.DB.prepare(
        `INSERT INTO auth_credentials (user_id,password_hash,password_salt) VALUES (?,?,?)`,
      ).bind(productionUserId, hash, salt),
    ]);
  }
  const financeUserId = "finance-marina",
    financeExisting = await env.DB.prepare(
      `SELECT user_id FROM auth_credentials WHERE user_id=?`,
    )
      .bind(financeUserId)
      .first();
  if (!financeExisting) {
    const salt = randomHex(16),
      hash = await passwordHash(DEFAULT_PASSWORD, salt);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id,email,name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,updated_at=CURRENT_TIMESTAMP`,
      ).bind(financeUserId, "financeiro@bookstage.local", "Marina Financeiro"),
      env.DB.prepare(
        `INSERT INTO auth_credentials (user_id,password_hash,password_salt) VALUES (?,?,?)`,
      ).bind(financeUserId, hash, salt),
    ]);
  }
  const salesUserId = "sales-ana",
    salesExisting = await env.DB.prepare(
      `SELECT user_id FROM auth_credentials WHERE user_id=?`,
    )
      .bind(salesUserId)
      .first();
  if (!salesExisting) {
    const salt = randomHex(16),
      hash = await passwordHash(DEFAULT_PASSWORD, salt);
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO users (id,email,name) VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,updated_at=CURRENT_TIMESTAMP`,
      ).bind(salesUserId, "ana.comercial@bookstage.local", "Ana Comercial"),
      env.DB.prepare(
        `INSERT INTO auth_credentials (user_id,password_hash,password_salt) VALUES (?,?,?)`,
      ).bind(salesUserId, hash, salt),
    ]);
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (id,email,name) VALUES ('sales-ana','ana.comercial@bookstage.local','Ana Comercial') ON CONFLICT(id) DO NOTHING`,
    ),
    env.DB.prepare(
      `INSERT INTO users (id,email,name) VALUES ('sales-bruno','bruno.comercial@bookstage.local','Bruno Comercial') ON CONFLICT(id) DO NOTHING`,
    ),
    env.DB.prepare(
      `INSERT INTO users (id,email,name) VALUES ('production-luiza','producao@bookstage.local','Luiza Produção') ON CONFLICT(id) DO NOTHING`,
    ),
    env.DB.prepare(
      `INSERT INTO users (id,email,name) VALUES ('finance-marina','financeiro@bookstage.local','Marina Financeiro') ON CONFLICT(id) DO NOTHING`,
    ),
    env.DB.prepare(
      `INSERT INTO memberships (organization_id,user_id,role,status) SELECT organization_id,'sales-ana','SALES','ACTIVE' FROM memberships WHERE user_id=? AND status='ACTIVE' ON CONFLICT(organization_id,user_id) DO NOTHING`,
    ).bind(DEFAULT_USER_ID),
    env.DB.prepare(
      `INSERT INTO memberships (organization_id,user_id,role,status) SELECT organization_id,'sales-bruno','SALES','ACTIVE' FROM memberships WHERE user_id=? AND status='ACTIVE' ON CONFLICT(organization_id,user_id) DO NOTHING`,
    ).bind(DEFAULT_USER_ID),
    env.DB.prepare(
      `INSERT INTO memberships (organization_id,user_id,role,status) SELECT organization_id,'production-luiza','PRODUCTION','ACTIVE' FROM memberships WHERE user_id=? AND status='ACTIVE' ON CONFLICT(organization_id,user_id) DO NOTHING`,
    ).bind(DEFAULT_USER_ID),
    env.DB.prepare(
      `INSERT INTO memberships (organization_id,user_id,role,status) SELECT organization_id,'finance-marina','FINANCE','ACTIVE' FROM memberships WHERE user_id=? AND status='ACTIVE' ON CONFLICT(organization_id,user_id) DO NOTHING`,
    ).bind(DEFAULT_USER_ID),
  ]);
}

export async function authenticate(email: string, password: string) {
  await ensureDatabase();
  await ensureLocalAdmin();
  const row = await env.DB.prepare(
    `SELECT u.id,u.email,u.name,c.password_hash AS passwordHash,c.password_salt AS passwordSalt FROM users u JOIN auth_credentials c ON c.user_id=u.id WHERE lower(u.email)=lower(?)`,
  )
    .bind(email.trim())
    .first<{
      id: string;
      email: string;
      name: string | null;
      passwordHash: string;
      passwordSalt: string;
    }>();
  if (!row) {
    await passwordHash(password, "00000000000000000000000000000000");
    return null;
  }
  const candidate = await passwordHash(password, row.passwordSalt);
  return timingSafeEqual(candidate, row.passwordHash)
    ? { id: row.id, email: row.email, name: row.name ?? row.email }
    : null;
}

export async function createSession(userId: string) {
  await ensureDatabase();
  const cookieStore = await cookies();
  const previousToken = cookieStore.get(SESSION_COOKIE)?.value;
  const token = randomHex(32);
  const tokenHash = await sha256(token);
  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 86_400_000,
  ).toISOString();
  const statements = [
    env.DB.prepare(
      `INSERT INTO sessions (token_hash,user_id,expires_at) VALUES (?,?,?)`,
    ).bind(tokenHash, userId, expiresAt),
    env.DB.prepare(`DELETE FROM sessions WHERE expires_at<=?`).bind(
      new Date().toISOString(),
    ),
  ];
  if (previousToken)
    statements.push(
      env.DB.prepare(`DELETE FROM sessions WHERE token_hash=?`).bind(
        await sha256(previousToken),
      ),
    );
  await env.DB.batch(statements);
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function sessionUser() {
  await ensureDatabase();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT u.id,u.email,u.name FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?`,
  )
    .bind(tokenHash, new Date().toISOString())
    .first<{ id: string; email: string; name: string | null }>();
  return row
    ? { id: row.id, email: row.email, name: row.name ?? row.email }
    : null;
}

export async function destroySession() {
  await ensureDatabase();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token)
    await env.DB.prepare(`DELETE FROM sessions WHERE token_hash=?`)
      .bind(await sha256(token))
      .run();
  cookieStore.delete(SESSION_COOKIE);
  cookieStore.delete("bookstage_active_organization");
}
