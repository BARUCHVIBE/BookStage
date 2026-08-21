import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  formatProposalNumber,
  normalizeProposalInput,
  proposalStatuses,
  validateProposalTransition,
} from "../app/lib/proposal-rules";

test("normaliza proposta em centavos e mantém os status previstos", () => {
  assert.deepEqual(proposalStatuses, [
    "DRAFT",
    "SENT",
    "ACCEPTED",
    "REJECTED",
    "EXPIRED",
  ]);
  const proposal = normalizeProposalInput({
    value: 250000,
    paymentTerms: "50% na assinatura",
    validityDate: "2026-09-30",
  });
  assert.equal(proposal.value, 250000);
  assert.equal(proposal.transportationTerms, null);
  assert.throws(
    () =>
      normalizeProposalInput({
        value: -1,
        paymentTerms: "À vista",
        validityDate: "2026-09-30",
      }),
    /inválido/,
  );
  assert.throws(
    () =>
      normalizeProposalInput({
        value: 100,
        paymentTerms: "",
        validityDate: "2026-09-30",
      }),
    /pagamento/,
  );
});

test("somente transições seguras são permitidas", () => {
  assert.equal(validateProposalTransition("DRAFT", "SENT"), "SENT");
  assert.equal(validateProposalTransition("SENT", "ACCEPTED"), "ACCEPTED");
  assert.equal(validateProposalTransition("SENT", "REJECTED"), "REJECTED");
  assert.equal(validateProposalTransition("SENT", "EXPIRED"), "EXPIRED");
  assert.throws(
    () => validateProposalTransition("DRAFT", "ACCEPTED"),
    /não permitida/,
  );
  assert.throws(
    () => validateProposalTransition("ACCEPTED", "SENT"),
    /não permitida/,
  );
});

test("numeração anual é legível", () => {
  assert.equal(formatProposalNumber(2026, 12), "PROP-2026-0012");
});

test("migration protege proposta por chaves compostas do tenant", async () => {
  const sql = await readFile(
    new URL("../drizzle/0008_gigantic_nitro.sql", import.meta.url),
    "utf8",
  );
  assert.match(sql, /CREATE TABLE `proposals`/);
  assert.match(sql, /FOREIGN KEY \(`opportunity_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`artist_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`customer_id`,`organization_id`\)/);
  assert.match(sql, /FOREIGN KEY \(`organization_id`,`created_by`\)/);
  assert.match(sql, /idx_proposals_number_tenant/);
});

test("rotas escopam tenant, preservam versões e registram histórico", async () => {
  const collection = await readFile(
    new URL(
      "../app/api/opportunities/[id]/proposals/route.ts",
      import.meta.url,
    ),
    "utf8",
  );
  const detail = await readFile(
    new URL("../app/api/proposals/[id]/route.ts", import.meta.url),
    "utf8",
  );
  const pdf = await readFile(
    new URL("../app/api/proposals/[id]/pdf/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(collection, /proposal\.organization_id=\?/);
  assert.match(collection, /sourceProposalId/);
  assert.match(collection, /PROPOSAL_CREATED/);
  assert.match(detail, /accessibleProposal/);
  assert.match(detail, /Somente propostas em rascunho/);
  assert.match(detail, /PROPOSAL_SENT/);
  assert.match(detail, /PROPOSAL_ACCEPTED/);
  assert.match(detail, /PROPOSAL_REJECTED/);
  assert.match(detail, /PROPOSAL_EXPIRED/);
  assert.match(pdf, /accessibleProposal/);
  assert.doesNotMatch(pdf, /internal_notes|lost_reason/);
});
