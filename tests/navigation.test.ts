import assert from "node:assert/strict";
import test from "node:test";
import { navigationForRole } from "../app/lib/navigation";
import type { Role } from "../app/lib/tenant";

const labelFor = (role: Role, destination: string) =>
  navigationForRole(role).find((item) => item.destination === destination)
    ?.label;

test("Booking é o label do módulo para gestão, booking e produção", () => {
  for (const role of [
    "OWNER",
    "MANAGER",
    "BOOKING_AGENT",
    "PRODUCTION",
  ] as const) {
    assert.equal(labelFor(role, "catalog"), "Booking");
  }
});

test("SALES e FINANCE recebem navegação operacional especializada", () => {
  assert.equal(labelFor("SALES", "workQueue"), "Minha fila");
  assert.equal(labelFor("FINANCE", "financeAnalysis"), "Análises");
  assert.equal(labelFor("FINANCE", "receipts"), "Recebimentos");
  assert.equal(labelFor("SALES", "catalog"), undefined);
  assert.equal(labelFor("FINANCE", "catalog"), undefined);
});

test("visibilidade condicional permanece centralizada por perfil", () => {
  assert.ok(
    navigationForRole("BOOKING_AGENT").some(
      (item) => item.destination === "requests",
    ),
  );
  assert.ok(
    !navigationForRole("OWNER").some(
      (item) => item.destination === "requests",
    ),
  );
  assert.ok(
    navigationForRole("OWNER").some(
      (item) => item.destination === "settings",
    ),
  );
  assert.ok(
    !navigationForRole("FINANCE").some(
      (item) => item.destination === "settings",
    ),
  );
});

test("cada item centraliza capability, ícone, label e destino", () => {
  for (const item of navigationForRole("OWNER")) {
    assert.ok(item.capability);
    assert.ok(item.icon);
    assert.ok(item.label);
    assert.ok(item.destination);
  }
});

test("menus não oferecem equipe nem dados comerciais a perfis sem acesso", () => {
  for (const role of ["SALES", "BOOKING_AGENT", "FINANCE", "PRODUCTION"] as const)
    assert.equal(labelFor(role, "team"), undefined);
  assert.equal(labelFor("PRODUCTION", "crm"), undefined);
  assert.equal(labelFor("PRODUCTION", "contracts"), undefined);
  assert.equal(labelFor("FINANCE", "crm"), "CRM");
  assert.equal(labelFor("FINANCE", "contracts"), "Contratos");
});
