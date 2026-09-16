import type { Role } from "@/app/lib/tenant";

export type NavigationScreen =
  | "dashboard"
  | "artists"
  | "agenda"
  | "catalog"
  | "requests"
  | "crm"
  | "contracts"
  | "shows"
  | "team"
  | "settings"
  | "account"
  | "workQueue"
  | "financeAnalysis"
  | "receipts";

export type NavigationIcon =
  | "dashboard"
  | "artists"
  | "agenda"
  | "crm"
  | "requests"
  | "contracts"
  | "shows"
  | "booking"
  | "team"
  | "settings"
  | "workQueue"
  | "analysis"
  | "receipts";

export type NavigationCapability =
  | "dashboard:view"
  | "artists:view"
  | "calendar:view"
  | "crm:view"
  | "booking-requests:view"
  | "contracts:view"
  | "shows:view"
  | "booking:view"
  | "team:view"
  | "organization:manage"
  | "work-queue:view"
  | "finance-analysis:view"
  | "receipts:view";

type NavigationItem = {
  capability: NavigationCapability;
  icon: NavigationIcon;
  label: string | ((role: Role) => string);
  destination: NavigationScreen;
  roles?: readonly Role[];
};

const bookingLabel = (role: Role) =>
  role === "SALES" ? "Catálogo público" : "Booking";

export const navigationItems: readonly NavigationItem[] = [
  {
    capability: "work-queue:view",
    icon: "workQueue",
    label: "Minha fila",
    destination: "workQueue",
    roles: ["SALES", "FINANCE"],
  },
  {
    capability: "finance-analysis:view",
    icon: "analysis",
    label: "Análises",
    destination: "financeAnalysis",
    roles: ["FINANCE"],
  },
  {
    capability: "receipts:view",
    icon: "receipts",
    label: "Recebimentos",
    destination: "receipts",
    roles: ["FINANCE"],
  },
  {
    capability: "dashboard:view",
    icon: "dashboard",
    label: "Visão geral",
    destination: "dashboard",
  },
  {
    capability: "artists:view",
    icon: "artists",
    label: "Artistas",
    destination: "artists",
  },
  {
    capability: "calendar:view",
    icon: "agenda",
    label: "Agenda",
    destination: "agenda",
  },
  {
    capability: "crm:view",
    icon: "crm",
    label: "CRM",
    destination: "crm",
    roles: ["OWNER", "MANAGER", "SALES", "BOOKING_AGENT", "FINANCE"],
  },
  {
    capability: "booking-requests:view",
    icon: "requests",
    label: "Solicitações",
    destination: "requests",
    roles: ["BOOKING_AGENT"],
  },
  {
    capability: "contracts:view",
    icon: "contracts",
    label: "Contratos",
    destination: "contracts",
    roles: ["OWNER", "MANAGER", "SALES", "BOOKING_AGENT", "FINANCE"],
  },
  {
    capability: "shows:view",
    icon: "shows",
    label: "Shows",
    destination: "shows",
  },
  {
    capability: "booking:view",
    icon: "booking",
    label: bookingLabel,
    destination: "catalog",
  },
  {
    capability: "team:view",
    icon: "team",
    label: "Equipe",
    destination: "team",
    roles: ["OWNER", "MANAGER"],
  },
  {
    capability: "organization:manage",
    icon: "settings",
    label: "Configurações",
    destination: "settings",
    roles: ["OWNER", "MANAGER"],
  },
] as const;

export function navigationForRole(role: Role) {
  return navigationItems
    .filter((item) => !item.roles || item.roles.includes(role))
    .filter((item) => {
      if (role === "SALES")
        return ["workQueue", "crm", "agenda", "contracts", "shows"].includes(item.destination);
      if (role === "FINANCE")
        return ["workQueue", "financeAnalysis", "receipts", "contracts", "crm"].includes(item.destination);
      return !["workQueue", "financeAnalysis", "receipts"].includes(item.destination);
    })
    .map((item) => ({
      ...item,
      label: typeof item.label === "function" ? item.label(role) : item.label,
    }));
}
