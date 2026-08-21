export const financialKinds = ["REVENUE", "COST"] as const;
export const financialCategories = [
  "FEE",
  "ADDITIONAL",
  "OTHER_REVENUE",
  "TRANSPORT",
  "FLIGHTS",
  "FUEL",
  "HOTEL",
  "FOOD",
  "RIDER",
  "CREW",
  "PRODUCTION",
  "TAX",
  "COMMISSION",
  "OTHER",
] as const;
export const financialItemStatuses = [
  "ESTIMATED",
  "CONFIRMED",
  "CANCELLED",
] as const;
export type FinancialItem = {
  kind: (typeof financialKinds)[number];
  category: (typeof financialCategories)[number];
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  status: (typeof financialItemStatuses)[number];
};
export function calculateItemTotal(quantity: number, unitAmount: number) {
  return Math.round((quantity * unitAmount) / 100);
}
export function normalizeFinancialItem(body: Record<string, unknown>) {
  const kind = String(body.kind || ""),
    category = String(body.category || ""),
    description =
      typeof body.description === "string"
        ? body.description.trim().slice(0, 240)
        : "",
    quantity = Number(body.quantity ?? 100),
    unitAmount = Number(body.unitAmount),
    notes =
      typeof body.notes === "string" ? body.notes.trim().slice(0, 2000) : null,
    responsibleUserId =
      typeof body.responsibleUserId === "string" && body.responsibleUserId
        ? body.responsibleUserId
        : null,
    status = String(body.status || "ESTIMATED");
  if (
    !financialKinds.includes(kind as never) ||
    !financialCategories.includes(category as never) ||
    !financialItemStatuses.includes(status as never) ||
    !description ||
    !Number.isInteger(quantity) ||
    quantity <= 0 ||
    quantity > 100000 ||
    !Number.isInteger(unitAmount) ||
    unitAmount < 0 ||
    unitAmount > 999_999_999_99
  )
    throw new Error("Item financeiro inválido.");
  if (
    kind === "REVENUE" &&
    !["FEE", "ADDITIONAL", "OTHER_REVENUE"].includes(category)
  )
    throw new Error("Categoria incompatível com receita.");
  if (
    kind === "COST" &&
    ["FEE", "ADDITIONAL", "OTHER_REVENUE"].includes(category)
  )
    throw new Error("Categoria incompatível com custo.");
  return {
    kind: kind as FinancialItem["kind"],
    category: category as FinancialItem["category"],
    description,
    quantity,
    unitAmount,
    totalAmount: calculateItemTotal(quantity, unitAmount),
    notes,
    responsibleUserId,
    status: status as FinancialItem["status"],
  };
}
export function calculateOpportunityMargin(
  items: FinancialItem[],
  fallbackRevenue = 0,
) {
  const active = items.filter((item) => item.status !== "CANCELLED"),
    revenues = active.filter((item) => item.kind === "REVENUE"),
    grossRevenue = revenues.length
      ? revenues.reduce((sum, item) => sum + item.totalAmount, 0)
      : fallbackRevenue,
    costs = active
      .filter((item) => item.kind === "COST")
      .reduce((sum, item) => sum + item.totalAmount, 0),
    taxes = active
      .filter((item) => item.kind === "COST" && item.category === "TAX")
      .reduce((sum, item) => sum + item.totalAmount, 0),
    commissions = active
      .filter((item) => item.kind === "COST" && item.category === "COMMISSION")
      .reduce((sum, item) => sum + item.totalAmount, 0),
    result = grossRevenue - costs;
  return {
    grossRevenue,
    costs,
    taxes,
    commissions,
    result,
    marginAmount: result,
    marginPercentage:
      grossRevenue > 0
        ? Math.round((result / grossRevenue) * 10000) / 100
        : null,
  };
}
