import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import {
  canManageCommercialRequest,
  commercialRequestCapabilities,
  commercialRequestMembershipSql,
} from "../app/lib/commercial-request-access";
import {
  guardedOpportunityInsertSql,
  guardedRequestConversionSql,
} from "../app/lib/commercial-request-conversion";

test("capacidades de solicitação preservam menor privilégio", () => {
  assert.equal(canManageCommercialRequest("OWNER", false), true);
  assert.equal(canManageCommercialRequest("MANAGER", false), true);
  assert.equal(canManageCommercialRequest("BOOKING_AGENT", true), true);
  assert.equal(canManageCommercialRequest("BOOKING_AGENT", false), false);
  assert.equal(canManageCommercialRequest("SALES", false), false);

  assert.deepEqual(
    commercialRequestCapabilities({
      role: "SALES",
      isOwnBookingRequest: false,
      status: "CONVERTED",
      opportunityId: "op-1",
    }),
    {
      canAccept: false,
      canDecline: false,
      canConvert: false,
      canOpenOpportunity: true,
    },
  );
  assert.equal(
    commercialRequestCapabilities({
      role: "BOOKING_AGENT",
      isOwnBookingRequest: true,
      status: "ACCEPTED",
      opportunityId: null,
    }).canConvert,
    true,
  );
});

test("membership de outro tenant ou organização inativa não autoriza a solicitação", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE organizations (id TEXT PRIMARY KEY, status TEXT NOT NULL);
    CREATE TABLE memberships (
      organization_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL,
      professional_role TEXT, artist_access_scope TEXT, status TEXT NOT NULL
    );
    INSERT INTO organizations VALUES ('org-a','ACTIVE'),('org-b','INACTIVE');
    INSERT INTO memberships VALUES
      ('org-a','user-a','SALES','BOOKING_AGENT','ALL','ACTIVE'),
      ('org-b','user-b','SALES','BOOKING_AGENT','ALL','ACTIVE');
  `);
  assert.equal(
    db.prepare(commercialRequestMembershipSql).get("org-a", "user-a")?.status,
    "ACTIVE",
  );
  assert.equal(db.prepare(commercialRequestMembershipSql).get("org-a", "user-b"), undefined);
  assert.equal(db.prepare(commercialRequestMembershipSql).get("org-b", "user-b"), undefined);
});

function database() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE commercial_requests (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, artist_id TEXT NOT NULL,
      status TEXT NOT NULL, opportunity_id TEXT, event_date TEXT, city TEXT,
      state TEXT, venue TEXT, event_type TEXT, estimated_audience INTEGER,
      budget TEXT, notes TEXT, updated_at TEXT
    );
    CREATE TABLE customers (id TEXT PRIMARY KEY, organization_id TEXT NOT NULL);
    CREATE TABLE opportunities (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, artist_id TEXT NOT NULL,
      customer_id TEXT NOT NULL, assigned_user_id TEXT, originator_user_id TEXT,
      commercial_validator_user_id TEXT, stage TEXT, source TEXT, event_date TEXT,
      city TEXT, state TEXT, venue TEXT, event_type TEXT, estimated_audience INTEGER,
      budget TEXT, notes TEXT,
      FOREIGN KEY (customer_id) REFERENCES customers(id)
    );
    CREATE TABLE opportunity_activities (
      id TEXT PRIMARY KEY, organization_id TEXT NOT NULL, opportunity_id TEXT NOT NULL,
      FOREIGN KEY (opportunity_id) REFERENCES opportunities(id)
    );
  `);
  return db;
}

function convert(db: DatabaseSync, suffix = "") {
  const opportunityId = `opportunity${suffix || "-first"}`;
  db.exec("BEGIN IMMEDIATE");
  try {
    db.prepare("INSERT INTO customers (id,organization_id) VALUES (?,?)")
      .run(`customer${suffix}`, "org-a");
    db.prepare(guardedOpportunityInsertSql).run(
      opportunityId, `customer${suffix}`, "booking-a", "booking-a", "sales-a",
      "request-1", "org-a",
    );
    db.prepare(guardedRequestConversionSql).run(
      opportunityId, "request-1", "org-a", opportunityId, "org-a",
    );
    db.prepare("INSERT INTO opportunity_activities (id,organization_id,opportunity_id) VALUES (?,?,?)")
      .run(`activity${suffix}`, "org-a", opportunityId);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

test("conversão SQL é atômica e idempotente sob repetição", () => {
  const db = database();
  db.exec(`INSERT INTO commercial_requests VALUES ('request-1','org-a','artist-a','ACCEPTED',NULL,'2026-10-01','Rio de Janeiro','RJ',NULL,'Festival',NULL,NULL,NULL,NULL)`);
  convert(db);
  assert.equal(db.prepare("SELECT count(*) total FROM opportunities").get()?.total, 1);
  assert.equal(db.prepare("SELECT status FROM commercial_requests").get()?.status, "CONVERTED");
  assert.throws(() => convert(db, "-retry"));
  assert.equal(db.prepare("SELECT count(*) total FROM opportunities").get()?.total, 1);
  assert.equal(db.prepare("SELECT count(*) total FROM customers").get()?.total, 1);
});

test("mudança concorrente de status aborta sem deixar cliente órfão", () => {
  const db = database();
  db.exec(`INSERT INTO commercial_requests VALUES ('request-1','org-a','artist-a','DECLINED',NULL,'2026-10-01','Rio de Janeiro','RJ',NULL,'Festival',NULL,NULL,NULL,NULL)`);
  assert.throws(() => convert(db));
  assert.equal(db.prepare("SELECT count(*) total FROM opportunities").get()?.total, 0);
  assert.equal(db.prepare("SELECT count(*) total FROM customers").get()?.total, 0);
  assert.equal(db.prepare("SELECT count(*) total FROM opportunity_activities").get()?.total, 0);
});

test("falha depois de criar a oportunidade reverte toda a conversão", () => {
  const db = database();
  db.exec(`
    INSERT INTO commercial_requests VALUES ('request-1','org-a','artist-a','ACCEPTED',NULL,'2026-10-01','Rio de Janeiro','RJ',NULL,'Festival',NULL,NULL,NULL,NULL);
    INSERT INTO customers VALUES ('seed-customer','org-a');
    INSERT INTO opportunities VALUES ('seed-opportunity','org-a','artist-a','seed-customer',NULL,NULL,NULL,'NEW','TEST',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL);
    INSERT INTO opportunity_activities VALUES ('activity-fail','org-a','seed-opportunity');
  `);
  assert.throws(() => convert(db, "-fail"));
  assert.equal(db.prepare("SELECT status FROM commercial_requests").get()?.status, "ACCEPTED");
  assert.equal(db.prepare("SELECT opportunity_id AS id FROM commercial_requests").get()?.id, null);
  assert.equal(db.prepare("SELECT count(*) total FROM opportunities WHERE id='opportunity-fail'").get()?.total, 0);
  assert.equal(db.prepare("SELECT count(*) total FROM customers WHERE id='customer-fail'").get()?.total, 0);
});
