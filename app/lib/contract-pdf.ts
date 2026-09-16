import {
  PDFCheckBox,
  PDFDocument,
  PDFDropdown,
  PDFOptionList,
  PDFRadioGroup,
  PDFTextField,
  StandardFonts,
  rgb,
} from "pdf-lib";
import { contractPlaceholders } from "./contract-template-rules";

export const contractTemplatePdfMaxBytes = 10_000_000;

export type DetectedPdfField = { name: string; type: string };
export type ContractTemplateType = "PDF_ACROFORM" | "PDF_STATIC";

function hasPdfSignature(bytes: Uint8Array) {
  return new TextDecoder("ascii").decode(bytes.slice(0, 5)) === "%PDF-";
}

export async function inspectContractTemplatePdf(bytes: Uint8Array) {
  if (!bytes.length || bytes.length > contractTemplatePdfMaxBytes)
    throw new Error("O PDF deve possuir no máximo 10 MB.");
  if (!hasPdfSignature(bytes))
    throw new Error("O arquivo não possui assinatura válida de PDF.");
  let document: PDFDocument;
  try {
    document = await PDFDocument.load(bytes, { ignoreEncryption: false });
  } catch {
    throw new Error("Não foi possível ler o PDF. Arquivos protegidos não são aceitos.");
  }
  const fields: DetectedPdfField[] = document
    .getForm()
    .getFields()
    .map((field) => ({ name: field.getName(), type: field.constructor.name }));
  return {
    type: (fields.length ? "PDF_ACROFORM" : "PDF_STATIC") as ContractTemplateType,
    fields,
    pages: document.getPageCount(),
  };
}

export function normalizePdfFieldMapping(
  value: unknown,
  detectedFields: DetectedPdfField[],
) {
  const input =
      value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {},
    detected = new Set(detectedFields.map((field) => field.name)),
    allowed = new Set<string>(contractPlaceholders),
    mapping: Record<string, string> = {};
  for (const [pdfField, variable] of Object.entries(input)) {
    if (!detected.has(pdfField))
      throw new Error(`Campo PDF não encontrado: ${pdfField}.`);
    if (typeof variable !== "string" || !allowed.has(variable))
      throw new Error(`Variável BookBusiness inválida para ${pdfField}.`);
    mapping[pdfField] = variable;
  }
  return mapping;
}

function safePdfText(value: string) {
  return Array.from(value.replace(/[\u2013\u2014]/g, "-"))
    .filter((character) => character.charCodeAt(0) <= 255)
    .join("");
}

export async function generateContractFromPdfTemplate(
  source: Uint8Array,
  type: ContractTemplateType,
  mapping: Record<string, string>,
  values: Record<string, string>,
) {
  const document = await PDFDocument.load(source, { ignoreEncryption: false });
  if (type === "PDF_ACROFORM") {
    const form = document.getForm();
    for (const [pdfFieldName, variable] of Object.entries(mapping)) {
      const field = form.getFieldMaybe(pdfFieldName),
        value = values[variable] || "";
      if (!field) continue;
      if (field instanceof PDFTextField) field.setText(value);
      else if (field instanceof PDFCheckBox) {
        if (value) field.check();
        else field.uncheck();
      }
      else if (
        field instanceof PDFDropdown ||
        field instanceof PDFOptionList ||
        field instanceof PDFRadioGroup
      ) {
        if (value) field.select(value);
      }
    }
    form.updateFieldAppearances();
  } else {
    const page = document.addPage([595.28, 841.89]),
      font = await document.embedFont(StandardFonts.Helvetica),
      bold = await document.embedFont(StandardFonts.HelveticaBold),
      entries = Object.entries(values).filter(([, value]) => value);
    page.drawText("DADOS PREENCHIDOS PELO BOOKBUSINESS", {
      x: 48,
      y: 790,
      size: 14,
      font: bold,
      color: rgb(0.07, 0.1, 0.16),
    });
    let y = 754;
    for (const [key, value] of entries) {
      const line = safePdfText(`${key.replaceAll("_", " ")}: ${value}`).slice(0, 105);
      page.drawText(line, { x: 48, y, size: 9.5, font, color: rgb(0.12, 0.15, 0.2) });
      y -= 18;
      if (y < 48) break;
    }
  }
  return document.save();
}
