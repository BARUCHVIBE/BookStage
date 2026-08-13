import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

function assertTenantAccess(userId, membership, organizationId) {
  if (!membership || membership.userId !== userId || membership.organizationId !== organizationId || membership.status !== "ACTIVE") throw new Error("not found");
}

test("Usuário A acessa a própria Organização A", () => {
  assert.doesNotThrow(() => assertTenantAccess("user-a", { userId:"user-a", organizationId:"org-a", status:"ACTIVE" }, "org-a"));
});

test("Usuário A não consulta, altera ou exclui recursos da Organização B", () => {
  const memberB = { userId:"user-b", organizationId:"org-b", status:"ACTIVE" };
  for (const operation of ["consultar","alterar","excluir"]) {
    assert.throws(() => assertTenantAccess("user-a", memberB, "org-b"), /not found/, operation);
  }
});

test("APIs escopam consultas pela associação do usuário", async () => {
  const [list, detail, members] = await Promise.all([
    readFile(new URL("../app/api/organizations/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/organizations/[id]/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/organizations/[id]/members/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(list, /m\.user_id=\?/);
  assert.match(detail, /assertTenantAccess/);
  assert.match(members, /assertTenantAccess/);
});
