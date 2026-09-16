import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { publicImageUrl } from "../app/lib/public-image-url";
import { conflictResponse } from "../app/lib/calendar-response";
import {
  operationalDate,
  operationalDateTime,
  operationalTime,
  rescheduleOperationalInterval,
} from "../app/lib/operational-time";

test("imagens públicas preservam uploads oficiais sem liberar rotas privadas", () => {
  const token = "12345678-1234-1234-1234-123456789abc";
  for (const kind of ["artist-assets", "branding-assets"]) {
    const url = `/api/public/${kind}/${token}`;
    assert.equal(publicImageUrl(url), url);
  }
  for (const invalid of ["/api/contracts/private/file", "/public/photo.png", "C:\\photo.png", "javascript:alert(1)", "//example.com/file"]) assert.equal(publicImageUrl(invalid), null);
  assert.equal(publicImageUrl("https://example.com/old.jpg"), "https://example.com/old.jpg");
  assert.equal(publicImageUrl(null), null);
});

test("data e hora operacionais não mudam para o dia UTC", () => {
  assert.equal(operationalDate("2026-09-12T01:30:00.000Z"), "2026-09-11");
  assert.equal(operationalTime("2026-09-12T01:30:00.000Z"), "22:30");
});

test("reagendamento preserva duração e suporta término no dia seguinte", () => {
  assert.equal(
    operationalDateTime("2026-09-11", "22:30"),
    "2026-09-12T01:30:00.000Z",
  );
  assert.deepEqual(
    rescheduleOperationalInterval(
      "2026-09-11",
      "23:30",
      "2026-09-12T01:00:00.000Z",
      "2026-09-12T04:00:00.000Z",
    ),
    {
      startDatetime: "2026-09-12T02:30:00.000Z",
      endDatetime: "2026-09-12T05:30:00.000Z",
    },
  );
  assert.equal(
    rescheduleOperationalInterval(
      "2026-09-11",
      "18:00",
      "2026-09-11T21:00:00.000Z",
      null,
    ).endDatetime,
    null,
  );
});

test("resposta de conflito oculta identidade, título e status para Booking", async () => {
  const conflict = { id: "private-id", title: "Cliente reservado", status: "CONFIRMED", startDatetime: "2026-10-10T18:00:00Z", endDatetime: null };
  const response = conflictResponse(conflict, "BOOKING_AGENT");
  assert.equal(response.status, 409);
  const result = await response.json() as { conflict: { startDatetime: string; endDatetime: string | null } };
  assert.deepEqual(result.conflict, { startDatetime: conflict.startDatetime, endDatetime: null });
  assert.doesNotMatch(JSON.stringify(result), /private-id|Cliente reservado|CONFIRMED/);
  const internal = await conflictResponse(conflict, "OWNER").json() as { conflict: { status: string } };
  assert.equal(internal.conflict.status, "CONFIRMED");
});

test("SQL real do guard rejeita organização inativa e associação de outro tenant", async () => {
  const source = await readFile("app/lib/active-membership.ts", "utf8");
  const sql = source.match(/`(SELECT role AS baseRole[^\x60]+)`/)?.[1];
  assert.ok(sql);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE organizations(id TEXT,status TEXT); CREATE TABLE memberships(organization_id TEXT,user_id TEXT,role TEXT,professional_role TEXT,department TEXT,artist_access_scope TEXT,status TEXT); INSERT INTO organizations VALUES('a','ACTIVE'),('b','INACTIVE'); INSERT INTO memberships VALUES('a','alice','OWNER',NULL,'SALES','ALL','ACTIVE'),('b','bob','OWNER',NULL,'SALES','ALL','ACTIVE');");
    assert.ok(db.prepare(sql).get("a", "alice"));
    assert.equal(db.prepare(sql).get("b", "alice"), undefined);
    assert.equal(db.prepare(sql).get("b", "bob"), undefined);
  } finally { db.close(); }
});

test("SQL real de revisão do cachê invalida aprovações apenas da oportunidade/empresa correta", async () => {
  const source = await readFile("app/api/opportunities/[id]/route.ts", "utf8");
  const sql = source.match(/`(UPDATE opportunities SET commercial_approval_status=CASE[^\x60]+)`/)?.[1];
  assert.ok(sql);
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE opportunities(id TEXT,organization_id TEXT,commercial_approval_status TEXT,financial_approval_status TEXT); INSERT INTO opportunities VALUES('deal','a','PENDING_APPROVAL','APPROVED'),('deal','b','APPROVED','APPROVED');");
    db.prepare(sql).run("deal", "a");
    const a = db.prepare("SELECT * FROM opportunities WHERE organization_id='a'").get()!;
    assert.equal(a.commercial_approval_status, "CHANGES_REQUESTED");
    assert.equal(a.financial_approval_status, "CHANGES_REQUESTED");
    assert.equal(db.prepare("SELECT financial_approval_status FROM opportunities WHERE organization_id='b'").get()!.financial_approval_status, "APPROVED");
  } finally { db.close(); }
});

test("nova organização não pode apropriar asset interno de branding", async () => {
  const source = await readFile("app/api/organizations/route.ts", "utf8");
  assert.match(source, /brandingAssetToken\(input\.logo\)/);
  assert.match(source, /Envie o logo após criar a organização/);
});
