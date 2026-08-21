export const contractEditableFields = [
  { key: "event_date", label: "Data do evento", max: 30 },
  { key: "show_time", label: "Horário do show", max: 30 },
  { key: "venue", label: "Local do evento", max: 200 },
  { key: "city", label: "Cidade", max: 120 },
  { key: "state", label: "Estado", max: 80 },
  { key: "address", label: "Endereço", max: 300 },
  { key: "fee", label: "Valor do cachê", max: 80 },
  { key: "payment_terms", label: "Condições de pagamento", max: 1200 },
  { key: "transportation_terms", label: "Transporte", max: 1200 },
  { key: "accommodation_terms", label: "Hospedagem", max: 1200 },
  { key: "meal_terms", label: "Alimentação", max: 1200 },
  { key: "local_contact", label: "Contato local", max: 300 },
  { key: "additional_terms", label: "Condições adicionais", max: 2000 },
] as const;

const automaticPlaceholders = [
  "contract_number",
  "organization_name",
  "organization_document",
  "customer_name",
  "customer_company",
  "customer_document",
  "artist_name",
] as const;

export const contractPlaceholders = [
  ...automaticPlaceholders,
  ...contractEditableFields.map((field) => field.key),
];

export const defaultContractTemplate = `CONTRATO DE PRESTAÇÃO DE SERVIÇOS ARTÍSTICOS

CONTRATADA: {{organization_name}}, documento {{organization_document}}.
CONTRATANTE: {{customer_name}} / {{customer_company}}, documento {{customer_document}}.
ARTISTA: {{artist_name}}.

1. OBJETO
Apresentação artística no dia {{event_date}}, às {{show_time}}, no local {{venue}}, situado em {{address}}, {{city}}/{{state}}.

2. VALOR E PAGAMENTO
O valor do cachê é {{fee}}. Condições de pagamento: {{payment_terms}}.

3. LOGÍSTICA
Transporte: {{transportation_terms}}.
Hospedagem: {{accommodation_terms}}.
Alimentação: {{meal_terms}}.
Contato local: {{local_contact}}.

4. CONDIÇÕES ADICIONAIS
{{additional_terms}}

Contrato nº {{contract_number}}.`;

export function normalizeTemplateInput(name: unknown, body: unknown) {
  const cleanName = typeof name === "string" ? name.trim().slice(0, 160) : "";
  const cleanBody = typeof body === "string" ? body.trim() : "";
  if (!cleanName) throw new Error("Informe o nome do modelo.");
  if (!cleanBody || cleanBody.length > 50_000)
    throw new Error("O modelo deve possuir entre 1 e 50.000 caracteres.");
  const placeholders = [...cleanBody.matchAll(/{{\s*([a-z0-9_]+)\s*}}/gi)].map(
    (match) => match[1].toLowerCase(),
  );
  const allowed = new Set<string>(contractPlaceholders);
  const unknown = placeholders.find((placeholder) => !allowed.has(placeholder));
  if (unknown)
    throw new Error(`Campo não permitido no modelo: {{${unknown}}}.`);
  return { name: cleanName, body: cleanBody };
}

export function normalizeContractFieldValues(value: unknown) {
  const input =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    contractEditableFields.map((field) => {
      const raw = input[field.key];
      return [
        field.key,
        typeof raw === "string" ? raw.trim().slice(0, field.max) : "",
      ];
    }),
  );
}

export function renderContractTemplate(
  body: string,
  values: Record<string, string>,
) {
  return body.replace(/{{\s*([a-z0-9_]+)\s*}}/gi, (_, key: string) => {
    const value = values[key.toLowerCase()];
    return value?.trim() || "[NÃO INFORMADO]";
  });
}
