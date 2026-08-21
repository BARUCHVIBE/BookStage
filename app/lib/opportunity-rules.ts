import type { Role } from "./tenant";

export const opportunityStages=["NEW","CONTACTED","QUALIFIED","PROPOSAL","NEGOTIATION","DATE_OPTION","CONTRACT","CLOSED_WON","CLOSED_LOST"] as const;
export type OpportunityStage=(typeof opportunityStages)[number];

export const opportunityStageLabels:Record<OpportunityStage,string>={NEW:"Novo",CONTACTED:"Contatado",QUALIFIED:"Qualificado",PROPOSAL:"Proposta",NEGOTIATION:"Negociação",DATE_OPTION:"Opção de data",CONTRACT:"Contrato",CLOSED_WON:"Ganho",CLOSED_LOST:"Perdido"};

export function canAccessOpportunity(role:Role,assignedUserId:string|null,currentUserId:string){return role==="OWNER"||role==="MANAGER"||(role==="SALES"&&assignedUserId===currentUserId)}
export function canEditOpportunity(role:Role,assignedUserId:string|null,currentUserId:string){return canAccessOpportunity(role,assignedUserId,currentUserId)}

export function validateOpportunityStage(value:unknown):OpportunityStage{
  if(typeof value!=="string"||!opportunityStages.includes(value as OpportunityStage))throw new Error("Etapa inválida.");
  return value as OpportunityStage;
}

export function validateOpportunityTransition(current: OpportunityStage, next: OpportunityStage) {
  if ((current === "CLOSED_WON" || current === "CLOSED_LOST") && next !== current) throw new Error("Oportunidades encerradas não podem retornar ao pipeline.");
  return next;
}

export function validateStageChange(stage:OpportunityStage,lostReason:unknown){
  const reason=typeof lostReason==="string"?lostReason.trim().slice(0,500):"";
  if(stage==="CLOSED_LOST"&&!reason)throw new Error("Informe o motivo da perda.");
  return stage==="CLOSED_LOST"?reason:null;
}

export function parseProposedValue(value:unknown){
  if(value===null||value==="")return null;
  const parsed=Number(value);
  if(!Number.isInteger(parsed)||parsed<0||parsed>999_999_999_99)throw new Error("Valor proposto inválido.");
  return parsed;
}
