import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("login do ChatGPT foi removido da aplicação", async () => {
  const [page, context] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/request-context.ts", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(page, /signin-with-chatgpt|Entrar com ChatGPT/);
  assert.doesNotMatch(context, /oai-authenticated-user/);
  assert.match(page, /LoginForm/);
});

test("sessões locais usam cookie HttpOnly e token armazenado como hash", async () => {
  const auth = await readFile(
    new URL("../app/lib/local-auth.ts", import.meta.url),
    "utf8",
  );
  assert.match(auth, /httpOnly:\s*true/);
  assert.match(auth, /sameSite:\s*"strict"/);
  assert.match(auth, /SHA-256/);
  assert.match(auth, /PBKDF2/);
  assert.match(auth, /210_000/);
  assert.doesNotMatch(auth, /INSERT INTO sessions \(token,/);
});
