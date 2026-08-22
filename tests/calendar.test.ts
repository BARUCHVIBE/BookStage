import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  calendarStatuses,
  canManageCalendar,
  canViewCalendarInternalNotes,
  canViewCalendarStatuses,
  canViewCalendar,
  intervalsOverlap,
  isBlockingStatus,
  normalizeCalendarInput,
} from "../app/lib/calendar-rules";

test("cria dados válidos para cada status da agenda", () => {
  for (const status of calendarStatuses) {
    const input = normalizeCalendarInput({
      artistId: "artist-a",
      title: `Evento ${status}`,
      status,
      startDatetime: "2026-09-12T18:00:00.000Z",
      endDatetime: "2026-09-12T20:00:00.000Z",
    });
    assert.equal(input.status, status);
    assert.equal(input.artistId, "artist-a");
  }
});

test("rejeita término anterior ao início", () => {
  assert.throws(
    () =>
      normalizeCalendarInput({
        artistId: "artist-a",
        title: "Evento",
        status: "OPTION",
        startDatetime: "2026-09-12T20:00:00.000Z",
        endDatetime: "2026-09-12T18:00:00.000Z",
      }),
    /término/,
  );
});

test("detecta sobreposição e limita bloqueio a confirmado ou bloqueado", () => {
  assert.equal(
    intervalsOverlap(
      "2026-09-12T18:00:00.000Z",
      "2026-09-12T20:00:00.000Z",
      "2026-09-12T19:00:00.000Z",
      null,
    ),
    true,
  );
  assert.equal(
    intervalsOverlap(
      "2026-09-12T18:00:00.000Z",
      "2026-09-12T20:00:00.000Z",
      "2026-09-13T19:00:00.000Z",
      null,
    ),
    false,
  );
  assert.equal(isBlockingStatus("CONFIRMED"), true);
  assert.equal(isBlockingStatus("BLOCKED"), true);
  assert.equal(isBlockingStatus("OPTION"), false);
});

test("aplica permissões da agenda por perfil e atribuição", () => {
  assert.equal(canManageCalendar("OWNER", false), true);
  assert.equal(canManageCalendar("MANAGER", false), true);
  assert.equal(canManageCalendar("PRODUCTION", false), true);
  assert.equal(canManageCalendar("SALES", true), true);
  assert.equal(canManageCalendar("SALES", false), false);
  assert.equal(canManageCalendar("FINANCE", true), false);
  assert.equal(canViewCalendar("SALES", true), true);
  assert.equal(canViewCalendar("SALES", false), false);
});

test("Booking e Finance não visualizam notas internas da agenda", () => {
  assert.equal(canViewCalendarInternalNotes("BOOKING_AGENT"), false);
  assert.equal(canViewCalendarInternalNotes("FINANCE"), false);
  assert.equal(canViewCalendarInternalNotes("OWNER"), true);
  assert.equal(canViewCalendarInternalNotes("MANAGER"), true);
  assert.equal(canViewCalendarInternalNotes("SALES"), true);
  assert.equal(canViewCalendarInternalNotes("PRODUCTION"), true);
});

test("Booking não visualiza status internos da agenda", () => {
  assert.equal(canViewCalendarStatuses("BOOKING_AGENT"), false);
  assert.equal(canViewCalendarStatuses("OWNER"), true);
  assert.equal(canViewCalendarStatuses("MANAGER"), true);
  assert.equal(canViewCalendarStatuses("SALES"), true);
  assert.equal(canViewCalendarStatuses("PRODUCTION"), true);
  assert.equal(canViewCalendarStatuses("FINANCE"), true);
});

test("migration garante isolamento e conflitos no banco", async () => {
  const sql = await readFile(
    new URL("../drizzle/0003_black_deathbird.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /FOREIGN KEY \(`artist_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`organization_id`,`created_by`\)/);
  assert.match(sql, /trg_calendar_blocking_insert/);
  assert.match(sql, /trg_calendar_blocking_update/);
  assert.match(sql, /CALENDAR_CONFLICT/g);
});

test("APIs mantêm filtros, edição e exclusão escopados pela organização", async () => {
  const collection = await readFile(
    new URL("../app/api/calendar/route.ts", import.meta.url),
    "utf8",
  );
  const item = await readFile(
    new URL("../app/api/calendar/[id]/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(collection, /entry\.organization_id=\?/);
  assert.match(collection, /entry\.artist_id=\?/);
  assert.match(collection, /entry\.status=\?/);
  assert.match(collection, /NULL AS internalNotes,NULL AS createdBy/);
  assert.match(collection, /NULL AS status/);
  assert.match(collection, /AS displayTone/);
  assert.doesNotMatch(collection, /AS displayColor/);
  assert.doesNotMatch(collection, /AS displayBackground/);
  assert.match(collection, /THEN 'positive'/);
  assert.match(collection, /THEN 'critical'/);
  assert.match(collection, /canViewInternalNotes/);
  assert.match(collection, /canViewStatuses/);
  assert.match(collection, /entry\.created_by=\?[\s\S]*AS canEdit/);
  assert.match(item, /WHERE id=\? AND organization_id=\?/);
  assert.match(item, /UPDATE calendar_entries[\s\S]*organization_id=\?/);
  assert.match(item, /ELSE internal_notes END/);
  assert.match(item, /existing\.createdBy !== context\.user\.id/);
  assert.match(item, /entry\.createdBy !== context\.user\.id/);
  assert.match(
    item,
    /DELETE FROM calendar_entries WHERE id=\? AND organization_id=\?/,
  );
  assert.match(item, /body\.confirm !== true/);
});
