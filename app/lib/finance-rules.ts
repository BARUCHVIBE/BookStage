import type { Role } from "./tenant";

export const paymentStatuses = [
  "PENDING",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;
export type PaymentStatus = (typeof paymentStatuses)[number];
export const commissionStatuses = [
  "ESTIMATED",
  "APPROVED",
  "PAYABLE",
  "PAID",
  "CANCELLED",
] as const;
export type CommissionStatus = (typeof commissionStatuses)[number];

export function canManageFinance(role: Role) {
  return role === "OWNER" || role === "FINANCE";
}
const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T12:00:00Z`).getTime());

export function normalizePaymentInput(body: Record<string, unknown>) {
  const description = clean(body.description, 200),
    amount = Number(body.amount),
    dueDate = clean(body.dueDate, 10),
    notes = clean(body.notes, 2000) || null;
  if (!description) throw new Error("Informe a descrição do pagamento.");
  if (!Number.isInteger(amount) || amount <= 0 || amount > 999_999_999_99)
    throw new Error("Valor do pagamento inválido.");
  if (!validDate(dueDate)) throw new Error("Informe um vencimento válido.");
  return { description, amount, dueDate, notes };
}

export function effectivePaymentStatus(
  status: PaymentStatus,
  dueDate: string,
  today: string,
) {
  return status === "PENDING" && dueDate < today
    ? ("OVERDUE" as const)
    : status;
}

export function calculateFinancialSummary(
  totalValue: number,
  payments: Array<{ amount: number; dueDate: string; status: PaymentStatus }>,
  today: string,
) {
  const normalized = payments.map((item) => ({
    ...item,
    status: effectivePaymentStatus(item.status, item.dueDate, today),
  }));
  const received = normalized
      .filter((item) => item.status === "PAID")
      .reduce((sum, item) => sum + item.amount, 0),
    open = normalized.filter(
      (item) => item.status === "PENDING" || item.status === "OVERDUE",
    ),
    overdue = open.filter((item) => item.status === "OVERDUE");
  return {
    totalValue,
    received,
    pending: Math.max(totalValue - received, 0),
    nextDueDate: open.map((item) => item.dueDate).sort()[0] || null,
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((sum, item) => sum + item.amount, 0),
  };
}

export function validatePaymentTransition(
  current: PaymentStatus,
  next: unknown,
) {
  if (
    typeof next !== "string" ||
    !paymentStatuses.includes(next as PaymentStatus)
  )
    throw new Error("Status de pagamento inválido.");
  const allowed: Record<PaymentStatus, PaymentStatus[]> = {
    PENDING: ["PAID", "CANCELLED"],
    OVERDUE: ["PAID", "CANCELLED"],
    PAID: [],
    CANCELLED: [],
  };
  if (!allowed[current].includes(next as PaymentStatus))
    throw new Error("Transição de pagamento não permitida.");
  return next as PaymentStatus;
}

export function normalizeCommissionInput(
  body: Record<string, unknown>,
  showFee: number | null,
) {
  const userId = clean(body.userId, 100),
    percentageValue = Number(body.percentage),
    fixedAmount = Number(body.amount),
    type = clean(body.type, 20) || "SALES",
    method = clean(body.method, 20) || "PERCENTAGE",
    calculationBase = clean(body.calculationBase, 30) || "GROSS_REVENUE",
    baseAmount =
      calculationBase === "CUSTOM"
        ? Number(body.baseAmount)
        : Number(showFee || 0),
    notes = clean(body.notes, 2000) || null;
  if (!userId) throw new Error("Selecione o comercial comissionado.");
  if (
    !["REFERRAL", "SALES", "CLOSING", "PARTNER", "OTHER"].includes(type) ||
    !["PERCENTAGE", "FIXED"].includes(method) ||
    !["GROSS_REVENUE", "NET_REVENUE", "PROFIT", "CUSTOM"].includes(
      calculationBase,
    )
  )
    throw new Error("Configuração da comissão inválida.");
  if (
    method === "PERCENTAGE" &&
    (!Number.isFinite(percentageValue) ||
      percentageValue <= 0 ||
      percentageValue > 100)
  )
    throw new Error("Percentual de comissão inválido.");
  if (
    method === "FIXED" &&
    (!Number.isInteger(fixedAmount) || fixedAmount <= 0)
  )
    throw new Error("Valor fixo da comissão inválido.");
  if (
    method === "PERCENTAGE" &&
    (!Number.isInteger(baseAmount) || baseAmount <= 0)
  )
    throw new Error("Defina uma base de cálculo válida.");
  const percentage =
      method === "PERCENTAGE" ? Math.round(percentageValue * 100) : null,
    amount =
      method === "PERCENTAGE"
        ? Math.round((baseAmount * percentage!) / 10_000)
        : fixedAmount;
  return {
    userId,
    type,
    method,
    calculationBase,
    percentage,
    baseAmount: method === "PERCENTAGE" ? baseAmount : 0,
    amount,
    notes,
  };
}

export function validateCommissionTransition(
  current: CommissionStatus,
  next: unknown,
) {
  if (
    typeof next !== "string" ||
    !commissionStatuses.includes(next as CommissionStatus)
  )
    throw new Error("Status de comissão inválido.");
  const allowed: Record<CommissionStatus, CommissionStatus[]> = {
    ESTIMATED: ["APPROVED", "CANCELLED"],
    APPROVED: ["PAYABLE", "CANCELLED"],
    PAYABLE: ["PAID", "CANCELLED"],
    PAID: [],
    CANCELLED: [],
  };
  if (!allowed[current].includes(next as CommissionStatus))
    throw new Error("Transição de comissão não permitida.");
  return next as CommissionStatus;
}
