import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  commercialQueueBucket,
  financeQueueBucket,
} from "@/app/lib/work-queue-rules";

test("separa a aprovação comercial pendente", () => {
  assert.equal(
    commercialQueueBucket({
      stage: "PROPOSAL",
      commercialApprovalStatus: "PENDING_APPROVAL",
      financialApprovalStatus: "NOT_REQUESTED",
    }),
    "TO_ANALYZE",
  );
});
test("separa negociações validadas e em andamento", () => {
  assert.equal(
    commercialQueueBucket({
      stage: "NEGOTIATION",
      commercialApprovalStatus: "APPROVED",
      financialApprovalStatus: "PENDING",
    }),
    "VALIDATED",
  );
  assert.equal(
    commercialQueueBucket({
      stage: "CONTRACT",
      commercialApprovalStatus: "APPROVED",
      financialApprovalStatus: "APPROVED",
    }),
    "IN_PROGRESS",
  );
});
test("separa validações e ajustes financeiros", () => {
  assert.equal(
    financeQueueBucket({
      stage: "PROPOSAL",
      commercialApprovalStatus: "APPROVED",
      financialApprovalStatus: "PENDING",
    }),
    "TO_VALIDATE",
  );
  assert.equal(
    financeQueueBucket({
      stage: "PROPOSAL",
      commercialApprovalStatus: "APPROVED",
      financialApprovalStatus: "CHANGES_REQUESTED",
    }),
    "ADJUSTMENTS",
  );
  assert.equal(
    financeQueueBucket({
      stage: "CLOSED_WON",
      commercialApprovalStatus: "APPROVED",
      financialApprovalStatus: "APPROVED",
    }),
    "APPROVED",
  );
});
test("não leva oportunidades encerradas para filas", () => {
  const won = {
    stage: "CLOSED_WON",
    commercialApprovalStatus: "APPROVED",
    financialApprovalStatus: "PENDING",
  };
  assert.equal(commercialQueueBucket(won), null);
  assert.equal(financeQueueBucket({ ...won, stage: "CLOSED_LOST" }), null);
});

test("endpoint da fila protege tenant e escopo de artista do comercial", async () => {
  const source = await readFile(
    new URL("../app/api/work-queue/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /requireActiveMembership/);
  assert.match(source, /opportunity\.organization_id=\?/);
  assert.match(source, /artist_sales_assignments/);
  assert.match(source, /payment\.organization_id=opportunity\.organization_id/);
  assert.match(source, /\['SALES', 'FINANCE'\]/);
});

test("fila operacional usa diálogos do sistema para decisões e recebimentos", async () => {
  const source = await readFile(
    new URL("../app/components/role-work-queue.tsx", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /window\.(prompt|alert|confirm)/);
  assert.match(source, /className="system-dialog"/);
  assert.match(source, /Definir nova parcela/);
  assert.match(source, /Registrar recebimento/);
  assert.match(source, /Confirmar aprovação/);
});
