import type { Role } from "./tenant";

export const contractStatuses = [
  "DRAFT",
  "SENT",
  "SIGNED",
  "CANCELLED",
] as const;
export type ContractStatus = (typeof contractStatuses)[number];

export function canAccessContract(
  role: Role,
  assignedUserId: string | null,
  currentUserId: string,
  originatorUserId: string | null = null,
  commercialValidatorUserId: string | null = null,
) {
  return (
    role === "OWNER" ||
    role === "MANAGER" ||
    (["SALES", "BOOKING_AGENT"].includes(role) &&
      (assignedUserId === currentUserId ||
        originatorUserId === currentUserId ||
        (role === "SALES" && commercialValidatorUserId === currentUserId)))
  );
}

export function formatContractNumber(year: number, number: number) {
  return `CONT-${year}-${String(number).padStart(4, "0")}`;
}

export function normalizeContractNotes(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 4000) || null : null;
}

export function validateContractTransition(
  current: ContractStatus,
  next: unknown,
  hasFile: boolean,
) {
  if (
    typeof next !== "string" ||
    !contractStatuses.includes(next as ContractStatus)
  )
    throw new Error("Status de contrato inválido.");
  const allowed: Record<ContractStatus, ContractStatus[]> = {
    DRAFT: ["SENT", "CANCELLED"],
    SENT: ["SIGNED", "CANCELLED"],
    SIGNED: [],
    CANCELLED: [],
  };
  if (!allowed[current].includes(next as ContractStatus))
    throw new Error("Transição de status não permitida.");
  if (next === "SENT" && !hasFile)
    throw new Error(
      "Faça o upload do contrato antes de marcá-lo como enviado.",
    );
  return next as ContractStatus;
}

export function validateContractFile(file: File) {
  const maxBytes = 10 * 1024 * 1024;
  if (!file.size || file.size > maxBytes)
    throw new Error("O contrato deve ter no máximo 10 MB.");
  if (
    file.type !== "application/pdf" ||
    !file.name.toLowerCase().endsWith(".pdf")
  )
    throw new Error("Envie um arquivo PDF válido.");
}

export function safeContractFileName(value: string) {
  const cleaned = value
    .replace(/[\r\n"\\/]/g, "_")
    .replace(/[^a-zA-Z0-9À-ÿ._ -]/g, "_")
    .slice(0, 180)
    .trim();
  return cleaned || "contrato.pdf";
}
