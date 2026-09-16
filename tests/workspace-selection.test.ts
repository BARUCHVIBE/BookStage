import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveInitialWorkspace } from "../app/lib/workspace-selection";

const owner = { id: "organization-a", role: "OWNER" },
  booking = { id: "organization-b", role: "BOOKING_AGENT" };

test("usuário com uma organização entra automaticamente no workspace", () => {
  assert.deepEqual(resolveInitialWorkspace([owner], null), {
    organization: owner,
    needsActivation: true,
  });
});

test("usuário multiempresa escolhe a organização quando não há seleção válida", () => {
  assert.deepEqual(resolveInitialWorkspace([owner, booking], null), {
    organization: null,
    needsActivation: false,
  });
});

test("última organização válida é retomada sem alterar seu papel efetivo", () => {
  assert.deepEqual(resolveInitialWorkspace([owner, booking], booking.id), {
    organization: booking,
    needsActivation: false,
  });
});

test("membership removida não reabre organização ausente", () => {
  assert.deepEqual(resolveInitialWorkspace([owner, booking], "removed-org"), {
    organization: null,
    needsActivation: false,
  });
});

test("seleção é um estado separado do shell operacional em desktop e mobile", async () => {
  const [shell, css, organizationsRoute, activeRoute, provider] = await Promise.all([
    readFile(new URL("../app/bookstage-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/organizations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/active-organization/route.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/components/organization-theme-provider.tsx", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(shell, /if \(!active\)[\s\S]*<OrganizationSelection/);
  assert.match(shell, /setOpeningOrganization\(org\);[\s\S]*setActive\(null\)/);
  assert.doesNotMatch(shell, /<ChevronDown/);
  assert.match(shell, /fallback=\{<WorkspaceOpening organization=\{active\} \/>\}/);
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.organization-card-grid/);
  assert.match(organizationsRoute, /activeOrganizationId/);
  assert.match(organizationsRoute, /m\.status='ACTIVE' AND o\.status='ACTIVE'/);
  assert.match(activeRoute, /organization\.status='ACTIVE'/);
  assert.match(provider, /brandingReady \? children : fallback/);
});
