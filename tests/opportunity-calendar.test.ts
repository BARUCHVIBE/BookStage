import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  defaultOpportunityInterval,
  isOpportunityCalendarAction,
  normalizeOpportunityInterval,
} from "../app/lib/opportunity-calendar";

test("prepara período padrão e valida ações de agenda", () => {
  assert.deepEqual(defaultOpportunityInterval("2026-10-10"), {
    startDatetime: "2026-10-10T18:00:00.000Z",
    endDatetime: "2026-10-10T23:00:00.000Z",
  });
  assert.equal(isOpportunityCalendarAction("OPTION"), true);
  assert.equal(isOpportunityCalendarAction("INVALID"), false);
  assert.throws(() => defaultOpportunityInterval("10/10/2026"), /inválida/);
});
test("normaliza intervalo comercial e rejeita término anterior", () => {
  const interval = normalizeOpportunityInterval(
    "2026-10-10T18:00:00.000Z",
    "2026-10-10T23:00:00.000Z",
  );
  assert.equal(interval.startDatetime, "2026-10-10T18:00:00.000Z");
  assert.throws(
    () =>
      normalizeOpportunityInterval(
        "2026-10-10T23:00:00.000Z",
        "2026-10-10T18:00:00.000Z",
      ),
    /término/,
  );
});
test("migration relaciona oportunidade, agenda e show dentro do tenant", async () => {
  const sql = await readFile(
    new URL("../drizzle/0007_familiar_lord_hawal.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE `opportunity_calendar_entries`/);
  assert.match(sql, /FOREIGN KEY \(`opportunity_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`calendar_entry_id`,`organization_id`\)/);
  assert.match(sql, /CREATE TABLE `shows`/);
  assert.match(sql, /idx_shows_opportunity_tenant/);
});
test("ações comerciais verificam conflito e registram histórico", async () => {
  const route = await readFile(
    new URL("../app/api/opportunities/[id]/calendar/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /findBlockingConflict/);
  assert.match(route, /CALENDAR_INQUIRY/);
  assert.match(route, /CALENDAR_OPTION/);
  assert.match(route, /CALENDAR_OPTION_CANCELLED/);
  assert.match(route, /CALENDAR_CONFIRMED/);
  assert.match(route, /opportunity_calendar_entries/);
  assert.match(route, /opportunity\.organization_id=\?/);
});
test("CLOSED_WON confirma agenda e prepara show de forma idempotente", async () => {
  const route = await readFile(
    new URL("../app/api/opportunities/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /stage\s*===\s*"CLOSED_WON"/);
  assert.match(route, /status='CONFIRMED'/);
  assert.match(route, /INSERT OR IGNORE INTO shows/);
  assert.match(route, /SHOW_PREPARED/);
  assert.match(route, /findBlockingConflict/);
});
test("agenda geral protege registros vinculados ao CRM", async () => {
  const route = await readFile(
    new URL("../app/api/calendar/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /opportunity_calendar_entries/);
  assert.match(route, /Faça a alteração pelo CRM/);
  assert.match(route, /Cancele a opção pelo CRM/);
});
