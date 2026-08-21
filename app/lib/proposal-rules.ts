export const proposalStatuses = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
] as const;
export type ProposalStatus = (typeof proposalStatuses)[number];
export type ProposalInput = {
  value: number;
  paymentTerms: string;
  transportationTerms: string | null;
  accommodationTerms: string | null;
  technicalTerms: string | null;
  additionalTerms: string | null;
  validityDate: string;
};

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
export function normalizeProposalInput(
  body: Record<string, unknown>,
): ProposalInput {
  const value = Number(body.value),
    paymentTerms = clean(body.paymentTerms, 2000),
    transportationTerms = clean(body.transportationTerms, 2000) || null,
    accommodationTerms = clean(body.accommodationTerms, 2000) || null,
    technicalTerms = clean(body.technicalTerms, 4000) || null,
    additionalTerms = clean(body.additionalTerms, 4000) || null,
    validityDate = clean(body.validityDate, 10);
  if (!Number.isInteger(value) || value < 0 || value > 999_999_999_99)
    throw new Error("Valor da proposta inválido.");
  if (!paymentTerms) throw new Error("Informe as condições de pagamento.");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(validityDate) ||
    Number.isNaN(new Date(`${validityDate}T12:00:00Z`).getTime())
  )
    throw new Error("Informe uma data de validade válida.");
  return {
    value,
    paymentTerms,
    transportationTerms,
    accommodationTerms,
    technicalTerms,
    additionalTerms,
    validityDate,
  };
}

export function validateProposalTransition(
  current: ProposalStatus,
  next: unknown,
): ProposalStatus {
  if (
    typeof next !== "string" ||
    !proposalStatuses.includes(next as ProposalStatus)
  )
    throw new Error("Status de proposta inválido.");
  const allowed: Record<ProposalStatus, ProposalStatus[]> = {
    DRAFT: ["SENT"],
    SENT: ["ACCEPTED", "REJECTED", "EXPIRED"],
    ACCEPTED: [],
    REJECTED: [],
    EXPIRED: [],
  };
  if (!allowed[current].includes(next as ProposalStatus))
    throw new Error("Transição de status não permitida.");
  return next as ProposalStatus;
}

export function formatProposalNumber(year: number, number: number) {
  return `PROP-${year}-${String(number).padStart(4, "0")}`;
}
