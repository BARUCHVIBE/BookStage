import type { Role } from "./tenant";

export const dashboardPeriods = ["30", "90", "year", "all"] as const;
export type DashboardPeriod = typeof dashboardPeriods[number];
export function normalizeDashboardPeriod(value: string | null): DashboardPeriod { return dashboardPeriods.includes(value as DashboardPeriod) ? value as DashboardPeriod : "30"; }
export function dashboardVisibility(role: Role) {
  return { commercial: role === "OWNER" || role === "MANAGER" || role === "SALES", agenda: true, tasks: role === "OWNER" || role === "MANAGER" || role === "SALES", finance: role === "OWNER" || role === "FINANCE", commercialFilter: role === "OWNER" || role === "MANAGER" };
}
export function dashboardWindow(period: DashboardPeriod, now = new Date()) {
  const today = now.toISOString().slice(0, 10), year = now.getUTCFullYear();
  if (period === "all") return { commercialStart: "0000-01-01", commercialEnd: "9999-12-31", operationalStart: today, operationalEnd: "9999-12-31" };
  if (period === "year") return { commercialStart: `${year}-01-01`, commercialEnd: `${year}-12-31`, operationalStart: today, operationalEnd: `${year}-12-31` };
  const days = Number(period), past = new Date(now), future = new Date(now); past.setUTCDate(past.getUTCDate() - days); future.setUTCDate(future.getUTCDate() + days);
  return { commercialStart: past.toISOString().slice(0, 10), commercialEnd: today, operationalStart: today, operationalEnd: future.toISOString().slice(0, 10) };
}
