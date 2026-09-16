import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function integrityDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE opportunities(id TEXT, organization_id TEXT, stage TEXT, PRIMARY KEY(id,organization_id));
    CREATE TABLE calendar_entries(id TEXT, organization_id TEXT, title TEXT, PRIMARY KEY(id,organization_id));
    CREATE TABLE opportunity_calendar_entries(organization_id TEXT, opportunity_id TEXT, calendar_entry_id TEXT, PRIMARY KEY(organization_id,opportunity_id));
    CREATE TABLE opportunity_activities(id TEXT PRIMARY KEY, organization_id TEXT, opportunity_id TEXT, type TEXT, description TEXT);
    CREATE TABLE shows(id TEXT, organization_id TEXT, fee INTEGER, PRIMARY KEY(id,organization_id));
    CREATE TABLE payments(id TEXT PRIMARY KEY, organization_id TEXT, show_id TEXT, amount INTEGER, status TEXT);
  `);
  db.exec(
    await readFile(
      new URL("../drizzle/0024_operational_integrity.sql", import.meta.url),
      "utf8",
    ),
  );
  return db;
}

test("integridade financeira é aplicada atomicamente pelo SQLite", async () => {
  const db = await integrityDatabase();
  try {
    db.exec("INSERT INTO shows VALUES('show','a',10000),('show','b',5000)");
    const insert = db.prepare("INSERT INTO payments VALUES(?,?,?,?,?)");
    insert.run("p1", "a", "show", 4000, "PENDING");
    insert.run("p2", "a", "show", 6000, "PAID");
    assert.throws(
      () => insert.run("p3", "a", "show", 1, "PENDING"),
      /PAYMENT_TOTAL_EXCEEDED/,
    );
    insert.run("cancelled", "a", "show", 50000, "CANCELLED");
    assert.throws(
      () => db.prepare("UPDATE payments SET status='PENDING' WHERE id='cancelled'").run(),
      /PAYMENT_TOTAL_EXCEEDED/,
    );
    assert.throws(
      () => db.prepare("UPDATE shows SET fee=9999 WHERE id='show' AND organization_id='a'").run(),
      /PAYMENT_TOTAL_EXCEEDED/,
    );
    insert.run("tenant-b", "b", "show", 5000, "PENDING");
    assert.equal(
      db.prepare("SELECT SUM(amount) AS total FROM payments WHERE organization_id='b' AND status<>'CANCELLED'").get()!.total,
      5000,
    );
  } finally {
    db.close();
  }
});

test("fechamento concorrente reverte integralmente uma alteração de agenda", async () => {
  const db = await integrityDatabase();
  try {
    db.exec(`
      INSERT INTO opportunities VALUES('deal','a','NEGOTIATION');
      INSERT INTO calendar_entries VALUES('entry','a','antes');
      INSERT INTO opportunity_calendar_entries VALUES('a','deal','entry');
      UPDATE opportunities SET stage='CLOSED_LOST' WHERE id='deal' AND organization_id='a';
    `);
    assert.throws(() => {
      db.exec("BEGIN");
      try {
        db.exec("UPDATE calendar_entries SET title='depois' WHERE id='entry' AND organization_id='a'");
        db.exec("INSERT INTO opportunity_activities VALUES('activity','a','deal','CALENDAR_OPTION','Opção')");
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }, /OPPORTUNITY_CLOSED/);
    assert.equal(
      db.prepare("SELECT title FROM calendar_entries WHERE id='entry' AND organization_id='a'").get()!.title,
      "antes",
    );
    assert.throws(
      () => db.exec("UPDATE opportunities SET stage='DATE_OPTION' WHERE id='deal' AND organization_id='a'"),
      /OPPORTUNITY_CLOSED/,
    );
    db.exec("INSERT INTO opportunities VALUES('other','a','CLOSED_WON'); INSERT INTO calendar_entries VALUES('other-entry','a','x')");
    assert.throws(
      () => db.exec("INSERT INTO opportunity_calendar_entries VALUES('a','other','other-entry')"),
      /OPPORTUNITY_CLOSED/,
    );
  } finally {
    db.close();
  }
});
