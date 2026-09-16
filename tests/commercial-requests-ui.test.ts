import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("status de solicitações usa um chip estrutural e tons semânticos", async () => {
  const [component, css] = await Promise.all([
    readFile(
      new URL("../app/components/commercial-requests-module.tsx", import.meta.url),
      "utf8",
    ),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /NEW: \{ label: "Pendente", tone: "info" \}/);
  assert.match(component, /ACCEPTED: \{ label: "Aceita · aguardando CRM", tone: "success" \}/);
  assert.match(component, /DECLINED: \{ label: "Negada", tone: "danger" \}/);
  assert.match(component, /CONVERTED: \{ label: "No CRM", tone: "success" \}/);
  assert.match(component, /<RequestStatusBadge status=\{item\.status\}/);
  assert.doesNotMatch(css, /\.no-crm\b/);
  assert.match(css, /\.status-badge \{[\s\S]*?display: inline-flex/);
  assert.match(css, /\.status-badge \{[\s\S]*?align-self: flex-start/);
  assert.match(css, /\.status-badge \{[\s\S]*?width: max-content/);
  assert.match(css, /\.status-badge \{[\s\S]*?white-space: nowrap/);
  assert.match(css, /\.request-card > header \{[\s\S]*?align-items: flex-start/);
});

test("solicitações usam as visões pendente, aceita e negada sem duplicar conversão", async () => {
  const component = await readFile(
    new URL("../app/components/commercial-requests-module.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /"PENDING" \| "ACCEPTED" \| "DECLINED"/);
  assert.match(component, /\? item\.status === "NEW"/);
  assert.match(component, /item\.status === "ACCEPTED" \|\| item\.status === "CONVERTED"/);
  assert.match(component, /: item\.status === "DECLINED"/);
  assert.match(component, /Pendentes/);
  assert.match(component, /Aceitas/);
  assert.match(component, /Negadas/);
  assert.match(component, /\} pendentes/);
  assert.match(component, /setView\("ACCEPTED"\)/);
  assert.match(component, /Ver negociação no CRM/);
});

test("caixa de solicitações usa HTTP seguro e erro recuperável", async () => {
  const component = await readFile(
    new URL("../app/components/commercial-requests-module.tsx", import.meta.url),
    "utf8",
  );
  assert.match(component, /fetchJson/);
  assert.doesNotMatch(component, /response\.json\(\)/);
  assert.match(component, /section-load-error/);
  assert.match(component, /role="alert"/);
  assert.match(component, /Tentar novamente/);
  assert.match(component, /onClick=\{\(\) => void load\(\)\}/);
});
