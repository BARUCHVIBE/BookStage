import assert from "node:assert/strict";
import test from "node:test";
import { fetchJson } from "../app/lib/http-client";

test("cliente HTTP trata JSON, body vazio, texto e erros sem perder o status", async () => {
  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ value: 42 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    assert.deepEqual(await fetchJson<{ value: number }>("/success"), {
      ok: true,
      status: 200,
      data: { value: 42 },
      error: null,
    });

    globalThis.fetch = async () => new Response(null, { status: 204 });
    assert.deepEqual(await fetchJson("/empty"), {
      ok: true,
      status: 204,
      data: null,
      error: null,
    });

    globalThis.fetch = async () =>
      new Response("Forbidden", {
        status: 403,
        headers: { "content-type": "text/plain" },
      });
    const forbidden = await fetchJson("/forbidden");
    assert.equal(forbidden.ok, false);
    assert.equal(forbidden.status, 403);
    assert.match(forbidden.error || "", /permissão/);
    assert.doesNotMatch(forbidden.error || "", /JSON/);

    globalThis.fetch = async () =>
      Response.json({ error: "Solicitação já processada." }, { status: 409 });
    const conflict = await fetchJson("/conflict");
    assert.equal(conflict.error, "Solicitação já processada.");

    globalThis.fetch = async () =>
      new Response("Payload Too Large", { status: 413 });
    const tooLarge = await fetchJson("/too-large");
    assert.equal(tooLarge.status, 413);
    assert.match(tooLarge.error || "", /tamanho permitido/);
    assert.doesNotMatch(tooLarge.error || "", /JSON/);

    globalThis.fetch = async () => new Response("<html>erro</html>", { status: 500 });
    const serverError = await fetchJson("/server-error");
    assert.equal(serverError.status, 500);
    assert.match(serverError.error || "", /HTTP 500/);

    globalThis.fetch = async () => {
      throw new TypeError("offline");
    };
    const networkError = await fetchJson("/offline");
    assert.equal(networkError.status, 0);
    assert.match(networkError.error || "", /conectar/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
