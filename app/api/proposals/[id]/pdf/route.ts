import { env } from "cloudflare:workers";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { accessibleProposal } from "@/app/lib/proposal-access";

type PdfProposal = {
  proposalNumber: string; value: number; paymentTerms: string; transportationTerms: string | null;
  accommodationTerms: string | null; technicalTerms: string | null; additionalTerms: string | null;
  validityDate: string; status: string; createdAt: string; artistName: string; customerName: string;
  companyName: string | null; customerEmail: string; customerPhone: string; eventDate: string;
  city: string; state: string; venue: string | null; eventType: string; organizationName: string;
  organizationEmail: string; organizationPhone: string | null; organizationWebsite: string | null;
};

const money = (value: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
const date = (value: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`));

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r/g, "").split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(""); continue; }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= width) line = candidate;
      else { if (line) lines.push(line); line = word; }
    }
    if (line) lines.push(line);
  }
  return lines;
}

export async function GET(_: Request, route: { params: Promise<{ id: string }> }) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params;
  const access = await accessibleProposal(id, context.organizationId, context.user.id, context.membership.role);
  if (!access) return Response.json({ error: "Proposta não encontrada." }, { status: 404 });
  const proposal = await env.DB.prepare(`SELECT proposal.proposal_number AS proposalNumber,proposal.value,proposal.payment_terms AS paymentTerms,proposal.transportation_terms AS transportationTerms,proposal.accommodation_terms AS accommodationTerms,proposal.technical_terms AS technicalTerms,proposal.additional_terms AS additionalTerms,proposal.validity_date AS validityDate,proposal.status,proposal.created_at AS createdAt,artist.name AS artistName,customer.name AS customerName,customer.company_name AS companyName,customer.email AS customerEmail,customer.phone AS customerPhone,opportunity.event_date AS eventDate,opportunity.city,opportunity.state,opportunity.venue,opportunity.event_type AS eventType,organization.name AS organizationName,organization.email AS organizationEmail,organization.phone AS organizationPhone,organization.website AS organizationWebsite FROM proposals proposal JOIN artists artist ON artist.id=proposal.artist_id AND artist.organization_id=proposal.organization_id JOIN customers customer ON customer.id=proposal.customer_id AND customer.organization_id=proposal.organization_id JOIN opportunities opportunity ON opportunity.id=proposal.opportunity_id AND opportunity.organization_id=proposal.organization_id JOIN organizations organization ON organization.id=proposal.organization_id WHERE proposal.id=? AND proposal.organization_id=?`).bind(id, context.organizationId).first<PdfProposal>();
  if (!proposal) return Response.json({ error: "Proposta não encontrada." }, { status: 404 });

  const pdf = await PDFDocument.create(), regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageWidth = 595.28, pageHeight = 841.89, margin = 48, contentWidth = pageWidth - margin * 2;
  let page = pdf.addPage([pageWidth, pageHeight]), y = pageHeight - 54;
  const addPage = () => { page = pdf.addPage([pageWidth, pageHeight]); y = pageHeight - 54; return page; };
  const ensure = (height: number) => { if (y - height < 62) addPage(); };
  const line = (text: string, options: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = options.size ?? 10, font = options.font ?? regular, lines = wrap(text, font, size, contentWidth);
    ensure(lines.length * (size + 4) + 4);
    for (const item of lines) { page.drawText(item, { x: margin, y, size, font, color: options.color ?? rgb(0.17, 0.2, 0.22) }); y -= size + 4; }
    y -= options.gap ?? 2;
  };
  const section = (title: string, content: string | null) => {
    if (!content) return;
    ensure(50); line(title.toUpperCase(), { size: 8, font: bold, color: rgb(0.63, 0.43, 0.1), gap: 7 }); line(content, { size: 10, gap: 14 });
  };

  page.drawRectangle({ x: 0, y: pageHeight - 150, width: pageWidth, height: 150, color: rgb(0.08, 0.1, 0.11) });
  page.drawRectangle({ x: margin, y: pageHeight - 42, width: 44, height: 4, color: rgb(0.79, 0.58, 0.2) });
  page.drawText(proposal.organizationName, { x: margin, y: pageHeight - 72, size: 18, font: bold, color: rgb(1, 1, 1) });
  page.drawText("PROPOSTA COMERCIAL", { x: margin, y: pageHeight - 105, size: 9, font: bold, color: rgb(0.79, 0.58, 0.2) });
  page.drawText(proposal.proposalNumber, { x: margin, y: pageHeight - 128, size: 13, font: bold, color: rgb(1, 1, 1) });
  y = pageHeight - 190;
  line(`Apresentamos a proposta para contratação de ${proposal.artistName}.`, { size: 16, font: bold, gap: 18 });
  section("Contratante", `${proposal.customerName}${proposal.companyName ? ` - ${proposal.companyName}` : ""}\n${proposal.customerEmail} | ${proposal.customerPhone}`);
  section("Evento", `${proposal.eventType}\n${date(proposal.eventDate)} | ${proposal.venue || "Local a definir"}\n${proposal.city} - ${proposal.state}`);
  ensure(70);
  page.drawRectangle({ x: margin, y: y - 48, width: contentWidth, height: 62, color: rgb(0.96, 0.94, 0.89) });
  page.drawText("VALOR DA PROPOSTA", { x: margin + 18, y: y - 8, size: 8, font: bold, color: rgb(0.44, 0.35, 0.2) });
  page.drawText(money(proposal.value), { x: margin + 18, y: y - 34, size: 20, font: bold, color: rgb(0.12, 0.14, 0.15) });
  y -= 82;
  section("Condições de pagamento", proposal.paymentTerms);
  section("Transporte", proposal.transportationTerms);
  section("Hospedagem", proposal.accommodationTerms);
  section("Condições técnicas", proposal.technicalTerms);
  section("Condições adicionais", proposal.additionalTerms);
  section("Validade", `Esta proposta é válida até ${date(proposal.validityDate)}.`);
  line(`Contato: ${proposal.organizationEmail}${proposal.organizationPhone ? ` | ${proposal.organizationPhone}` : ""}${proposal.organizationWebsite ? ` | ${proposal.organizationWebsite}` : ""}`, { size: 8, color: rgb(0.38, 0.4, 0.42) });

  const pages = pdf.getPages();
  pages.forEach((item, index) => {
    item.drawLine({ start: { x: margin, y: 43 }, end: { x: pageWidth - margin, y: 43 }, thickness: 0.6, color: rgb(0.82, 0.82, 0.8) });
    item.drawText(`${proposal.proposalNumber}  |  ${proposal.organizationName}`, { x: margin, y: 27, size: 7, font: regular, color: rgb(0.45, 0.47, 0.48) });
    item.drawText(`${index + 1}/${pages.length}`, { x: pageWidth - margin - 18, y: 27, size: 7, font: regular, color: rgb(0.45, 0.47, 0.48) });
  });
  const bytes = await pdf.save();
  return new Response(bytes as BodyInit, { headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${proposal.proposalNumber.toLowerCase()}.pdf"`, "cache-control": "private, no-store" } });
}
