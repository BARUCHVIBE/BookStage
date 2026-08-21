import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  dashboardVisibility,
  dashboardWindow,
  normalizeDashboardPeriod,
} from "../app/lib/dashboard-rules";

test("períodos do dashboard separam histórico comercial e janela operacional", () => {
  const now = new Date("2026-08-20T12:00:00Z"),
    month = dashboardWindow("30", now),
    year = dashboardWindow("year", now);
  assert.deepEqual(month, {
    commercialStart: "2026-07-21",
    commercialEnd: "2026-08-20",
    operationalStart: "2026-08-20",
    operationalEnd: "2026-09-19",
  });
  assert.equal(year.commercialStart, "2026-01-01");
  assert.equal(year.operationalEnd, "2026-12-31");
  assert.equal(normalizeDashboardPeriod("invalid"), "30");
});

test("dashboard aplica foco por perfil e menor privilégio", () => {
  assert.deepEqual(dashboardVisibility("OWNER"), {
    commercial: true,
    agenda: true,
    tasks: true,
    finance: true,
    commercialFilter: true,
  });
  assert.deepEqual(dashboardVisibility("MANAGER"), {
    commercial: true,
    agenda: true,
    tasks: true,
    finance: false,
    commercialFilter: true,
  });
  assert.deepEqual(dashboardVisibility("SALES"), {
    commercial: true,
    agenda: true,
    tasks: true,
    finance: false,
    commercialFilter: false,
  });
  assert.deepEqual(dashboardVisibility("BOOKING_AGENT"), {
    commercial: true,
    agenda: true,
    tasks: true,
    finance: false,
    commercialFilter: false,
  });
  assert.deepEqual(dashboardVisibility("PRODUCTION"), {
    commercial: false,
    agenda: true,
    tasks: false,
    finance: false,
    commercialFilter: false,
  });
  assert.deepEqual(dashboardVisibility("FINANCE"), {
    commercial: false,
    agenda: true,
    tasks: false,
    finance: true,
    commercialFilter: false,
  });
});

test("consultas do dashboard permanecem escopadas à organização e ao SALES", async () => {
  const route = await readFile(
    new URL("../app/api/dashboard/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /requireActiveMembership/);
  assert.match(route, /opportunity\.organization_id=\?/);
  assert.match(route, /show\.organization_id=\?/);
  assert.match(route, /entry\.organization_id=\?/);
  assert.match(route, /payment\.organization_id=\?/);
  assert.match(
    route,
    /\["SALES",\s*"BOOKING_AGENT"\]\.includes\(context\.membership\.role\)/,
  );
  assert.match(
    route,
    /assigned_user_id,opportunity\.originator_user_id,opportunity\.commercial_validator_user_id/,
  );
  assert.match(route, /Artista não encontrado/);
  assert.match(route, /Comercial não encontrado/);
});

test("indicadores usam apenas dados calculáveis existentes", async () => {
  const route = await readFile(
    new URL("../app/api/dashboard/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /stage='NEW'/);
  assert.match(route, /stage NOT IN \('CLOSED_WON','CLOSED_LOST'\)/);
  assert.match(route, /SUM\(opportunity\.proposed_value\)/);
  assert.match(route, /proposal\.status IN \('DRAFT','SENT'\)/);
  assert.match(route, /datetime\('now','-7 days'\)/);
  assert.match(route, /payment\.due_date<date\('now'\)/);
  assert.match(route, /payment\.due_date<=date\('now','\+7 days'\)/);
});
