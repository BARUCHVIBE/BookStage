import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { normalizeCalendarInput } from "../app/lib/calendar-rules";
import { validateOpportunityTransition } from "../app/lib/opportunity-rules";
import { rejectCrossOriginMutation } from "../app/lib/request-security";
import { normalizeOrganizationInput } from "../app/lib/organization-rules";

test("proteção CSRF rejeita mutação cross-site e aceita same-origin", () => {
  const blocked = rejectCrossOriginMutation(
    new Request("https://bookstage.test/api/organizations", {
      method: "POST",
      headers: { origin: "https://evil.test", "sec-fetch-site": "cross-site" },
    }),
  );
  assert.equal(blocked?.status, 403);
  const allowed = rejectCrossOriginMutation(
    new Request("https://bookstage.test/api/organizations", {
      method: "POST",
      headers: {
        origin: "https://bookstage.test",
        "sec-fetch-site": "same-origin",
      },
    }),
  );
  assert.equal(allowed, null);
});

test("todas as rotas mutáveis aplicam proteção cross-origin", () => {
  const routes = readdirSync("app/api", {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && entry.name === "route.ts")
    .map((entry) => join(entry.parentPath, entry.name));
  for (const route of routes) {
    const source = readFileSync(route, "utf8");
    if (/export async function (POST|PUT|PATCH|DELETE)/.test(source))
      assert.match(source, /rejectCrossOriginMutation/, route);
  }
});

test("organização rejeita e-mail inválido e campos excessivos", () => {
  assert.throws(() =>
    normalizeOrganizationInput({ name: "Empresa", email: "invalido" }),
  );
  assert.throws(() =>
    normalizeOrganizationInput({
      name: "Empresa",
      email: "empresa@teste.com",
      logo: "x".repeat(1001),
    }),
  );
  assert.equal(
    normalizeOrganizationInput({
      name: " Empresa ",
      email: "contato@empresa.com",
    }).name,
    "Empresa",
  );
});

test("oportunidade terminal não pode ser reaberta", () => {
  assert.throws(() =>
    validateOpportunityTransition("CLOSED_WON", "NEGOTIATION"),
  );
  assert.throws(() => validateOpportunityTransition("CLOSED_LOST", "NEW"));
  assert.equal(
    validateOpportunityTransition("CLOSED_WON", "CLOSED_WON"),
    "CLOSED_WON",
  );
});

test("agenda limita título e normaliza observação interna", () => {
  assert.throws(() =>
    normalizeCalendarInput({
      artistId: "artist",
      title: "x".repeat(181),
      status: "OPTION",
      startDatetime: "2026-10-10T12:00:00Z",
    }),
  );
  const input = normalizeCalendarInput({
    artistId: "artist",
    title: "Evento",
    status: "OPTION",
    startDatetime: "2026-10-10T12:00:00Z",
    internalNotes: "x".repeat(5000),
  });
  assert.equal(input.internalNotes?.length, 4000);
});

test("migration de auditoria adiciona rate limit, enums no banco e reparo de show futuro", () => {
  const migration = readFileSync("drizzle/0012_happy_mac_gargan.sql", "utf8");
  assert.match(migration, /auth_login_attempts/);
  assert.match(migration, /INVALID_OPPORTUNITY_STATUS/);
  assert.match(migration, /INVALID_PROPOSAL_STATUS/);
  assert.match(migration, /INVALID_CONTRACT_STATUS/);
  assert.match(migration, /INVALID_SHOW_STATUS/);
  assert.match(migration, /`status`='COMPLETED'[\s\S]*`date`>date\('now'\)/);
});

test("cadeia completa de migrations aplica em banco vazio", () => {
  const directory = mkdtempSync(join(tmpdir(), "bookstage-migrations-"));
  const database = new DatabaseSync(join(directory, "audit.sqlite"));
  try {
    database.exec("PRAGMA foreign_keys=ON");
    for (const file of readdirSync("drizzle")
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      database.exec(
        readFileSync(join("drizzle", file), "utf8").replaceAll(
          "--> statement-breakpoint",
          "",
        ),
      );
    }
    assert.equal(
      database.prepare("PRAGMA integrity_check").get()?.integrity_check,
      "ok",
    );
    database.exec(
      "INSERT INTO auth_login_attempts(id,fingerprint_hash,email_hash) VALUES('x','f','e')",
    );
    assert.equal(
      database
        .prepare(
          "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name LIKE 'trg_%_status_%'",
        )
        .get()?.count,
      10,
    );
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("downloads privados aplicam sandbox e nunca expõem chave R2", () => {
  const route = readFileSync("app/api/contracts/[id]/file/route.ts", "utf8");
  assert.match(route, /content-security-policy/);
  assert.match(route, /private, no-store/);
  assert.match(route, /accessibleContract\(\s*id,\s*context\.organizationId/);
  assert.doesNotMatch(route, /Response\.json\(\{[^}]*fileKey/);
});
