import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  normalizeLoginEmail,
  passwordPolicyError,
} from "../app/lib/password-policy";

test("política de senha é única para equipe e conta pessoal", () => {
  assert.equal(passwordPolicyError("Curta1"), "A senha deve ter ao menos 12 caracteres.");
  assert.match(passwordPolicyError("somente-minusculas-1") || "", /maiúscula/);
  assert.match(passwordPolicyError("SOMENTE-MAIUSCULAS-1") || "", /minúscula/);
  assert.match(passwordPolicyError("SemNumeroAlgum") || "", /número/);
  assert.equal(passwordPolicyError("SenhaForte2026"), null);
  assert.equal(normalizeLoginEmail("  TESTE@BookStage.Local "), "teste@bookstage.local");
});

test("autenticação não contém senha padrão e exige membership ativa", async () => {
  const [auth, example, readme] = await Promise.all([
    readFile(new URL("../app/lib/local-auth.ts", import.meta.url), "utf8"),
    readFile(new URL("../.env.example", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(auth, /BookStage@2026|DEFAULT_PASSWORD/);
  assert.doesNotMatch(example, /BookStage@2026/);
  assert.doesNotMatch(readme, /BookStage@2026/);
  assert.match(auth, /membership\.status='ACTIVE'/);
  assert.match(auth, /organization\.status='ACTIVE'/);
  assert.match(auth, /BOOKSTAGE_LOCAL_TEAM_PASSWORD/);
});

test("troca de senha revoga sessões e endpoint aplica CSRF e no-store", async () => {
  const [auth, route] = await Promise.all([
    readFile(new URL("../app/lib/local-auth.ts", import.meta.url), "utf8"),
    readFile(
      new URL("../app/api/auth/change-password/route.ts", import.meta.url),
      "utf8",
    ),
  ]);
  assert.match(auth, /DELETE FROM sessions WHERE user_id=\?/);
  assert.match(auth, /createPasswordCredential\(nextPassword\)/);
  assert.match(route, /rejectCrossOriginMutation/);
  assert.match(route, /passwordPolicyError/);
  assert.match(route, /createSession\(user\.id\)/);
  assert.match(route, /cache-control/);
});

test("respostas recebem cabeçalhos defensivos no worker", async () => {
  const worker = await readFile(
    new URL("../worker/index.ts", import.meta.url),
    "utf8",
  );
  assert.match(worker, /x-content-type-options/);
  assert.match(worker, /x-frame-options/);
  assert.match(worker, /referrer-policy/);
  assert.match(worker, /permissions-policy/);
});
