export const approvalStatusLabels: Record<string, string> = {
  NOT_REQUESTED: "Não solicitada",
  PENDING: "Pendente",
  PENDING_APPROVAL: "Aguardando aprovação",
  APPROVED: "Aprovada",
  REJECTED: "Recusada",
  CHANGES_REQUESTED: "Ajustes solicitados",
};

export const commissionTypeLabels: Record<string, string> = {
  REFERRAL: "Indicação",
  SALES: "Comercial",
  CLOSING: "Fechamento",
  PARTNER: "Parceiro",
  OTHER: "Outra",
};
export const commissionStatusLabels: Record<string, string> = {
  ESTIMATED: "Estimada",
  APPROVED: "Aprovada",
  PAYABLE: "A pagar",
  PAID: "Paga",
  CANCELLED: "Cancelada",
};

export function approvalStatusLabel(status: string) {
  return approvalStatusLabels[status] || status.replaceAll("_", " ");
}

export function commissionTypeLabel(type: string) {
  return commissionTypeLabels[type] || type.replaceAll("_", " ");
}
export function commissionStatusLabel(status: string) {
  return commissionStatusLabels[status] || status.replaceAll("_", " ");
}

export function formatActivityDescription(description: string) {
  return description
    .replace(/Decisão comercial: APPROVED\./g, "Decisão comercial: aprovada.")
    .replace(/Decisão comercial: REJECTED\./g, "Decisão comercial: recusada.")
    .replace(/Decisão comercial: CHANGES_REQUESTED\./g, "Decisão comercial: ajustes solicitados.")
    .replace(/Validação financeira: APPROVED\./g, "Validação financeira: aprovada.")
    .replace(/Validação financeira: REJECTED\./g, "Validação financeira: recusada.")
    .replace(/Validação financeira: CHANGES_REQUESTED\./g, "Validação financeira: ajustes solicitados.")
    .replace(/comissão estimada REFERRAL de (\d+) centavos/g, (_, value) =>
      `comissão estimada de indicação de ${new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value) / 100)}`,
    )
    .replace(/de (\d+) para (\d+) centavos/g, (_, from, to) =>
      `de ${formatCents(from)} para ${formatCents(to)}`,
    )
    .replace(/(\d+) centavos/g, (_, value) => formatCents(value))
    .replace(/\bFOOD\b/g, "alimentação")
    .replace(/\bTRANSPORT\b/g, "transporte")
    .replace(/\bACCOMMODATION\b/g, "hospedagem")
    .replace(/\bTECHNICAL\b/g, "técnico")
    .replace(/\bREFERRAL\b/g, "indicação");
}

function formatCents(value: string) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(Number(value) / 100);
}
