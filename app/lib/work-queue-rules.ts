export type CommercialQueueBucket = "TO_ANALYZE" | "VALIDATED" | "IN_PROGRESS";
export type FinanceQueueBucket = "TO_VALIDATE" | "ADJUSTMENTS" | "APPROVED" | null;

type QueueOpportunity = {
  stage: string;
  commercialApprovalStatus: string;
  financialApprovalStatus: string;
};

export function commercialQueueBucket(
  opportunity: QueueOpportunity,
): CommercialQueueBucket | null {
  if (["CLOSED_WON", "CLOSED_LOST"].includes(opportunity.stage)) return null;
  if (opportunity.commercialApprovalStatus === "PENDING_APPROVAL")
    return "TO_ANALYZE";
  if (opportunity.commercialApprovalStatus === "APPROVED")
    return opportunity.financialApprovalStatus === "APPROVED"
      ? "IN_PROGRESS"
      : "VALIDATED";
  return "IN_PROGRESS";
}

export function financeQueueBucket(
  opportunity: QueueOpportunity,
): FinanceQueueBucket {
  if (opportunity.stage === "CLOSED_LOST") return null;
  if (opportunity.financialApprovalStatus === "PENDING") return "TO_VALIDATE";
  if (
    ["CHANGES_REQUESTED", "REJECTED"].includes(
      opportunity.financialApprovalStatus,
    )
  )
    return "ADJUSTMENTS";
  if (opportunity.financialApprovalStatus === "APPROVED") return "APPROVED";
  return null;
}

export function commercialNextAction(opportunity: QueueOpportunity) {
  if (opportunity.commercialApprovalStatus === "PENDING_APPROVAL")
    return "Analisar negociação";
  if (opportunity.commercialApprovalStatus === "CHANGES_REQUESTED")
    return "Revisar ajustes solicitados";
  if (opportunity.commercialApprovalStatus === "REJECTED")
    return "Reavaliar negociação";
  if (
    opportunity.commercialApprovalStatus === "APPROVED" &&
    opportunity.financialApprovalStatus !== "APPROVED"
  )
    return "Acompanhar validação financeira";
  if (opportunity.stage === "CONTRACT") return "Acompanhar contrato";
  if (opportunity.stage === "DATE_OPTION") return "Acompanhar opção de data";
  return "Continuar negociação";
}
