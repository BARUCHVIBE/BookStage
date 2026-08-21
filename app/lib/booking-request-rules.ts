export type PublicBookingInput = {
  name: string;
  companyName: string | null;
  phone: string;
  email: string;
  eventDate: string;
  city: string;
  state: string;
  venue: string | null;
  eventType: string;
  estimatedAudience: number | null;
  budget: string | null;
  notes: string | null;
  submittedAt: number;
  website: string;
};

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";
export const normalizeEmail = (value: string) => value.trim().toLowerCase();
export const normalizePhone = (value: string) => value.replace(/\D/g, "");

export function validatePublicBooking(
  body: Record<string, unknown>,
  now = Date.now(),
): PublicBookingInput {
  const name = clean(body.name, 120),
    companyName = clean(body.companyName, 160) || null,
    phone = clean(body.phone, 30),
    email = normalizeEmail(clean(body.email, 180)),
    eventDate = clean(body.eventDate, 10),
    city = clean(body.city, 100),
    state = clean(body.state, 2).toUpperCase(),
    venue = clean(body.venue, 160) || null,
    eventType = clean(body.eventType, 100),
    budget = clean(body.budget, 80) || null,
    notes = clean(body.notes, 2000) || null,
    website = clean(body.website, 200),
    submittedAt = Number(body.submittedAt),
    audienceText = clean(body.estimatedAudience, 12),
    estimatedAudience = audienceText ? Number(audienceText) : null;
  if (website) throw new Error("Não foi possível enviar a solicitação.");
  if (
    !Number.isFinite(submittedAt) ||
    now - submittedAt < 1500 ||
    now - submittedAt > 7_200_000
  )
    throw new Error("Atualize a página e tente novamente.");
  if (
    !name ||
    !phone ||
    !email ||
    !eventDate ||
    !city ||
    state.length !== 2 ||
    !eventType
  )
    throw new Error("Preencha todos os campos obrigatórios.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Informe um e-mail válido.");
  if (normalizePhone(phone).length < 10 || normalizePhone(phone).length > 15)
    throw new Error("Informe um WhatsApp válido.");
  const event = new Date(`${eventDate}T12:00:00Z`);
  if (
    Number.isNaN(event.getTime()) ||
    event.getTime() <
      new Date(
        new Date(now).toISOString().slice(0, 10) + "T00:00:00Z",
      ).getTime()
  )
    throw new Error("Informe uma data de evento válida.");
  if (
    estimatedAudience !== null &&
    (!Number.isInteger(estimatedAudience) ||
      estimatedAudience < 1 ||
      estimatedAudience > 10_000_000)
  )
    throw new Error("Informe um público estimado válido.");
  return {
    name,
    companyName,
    phone,
    email,
    eventDate,
    city,
    state,
    venue,
    eventType,
    estimatedAudience,
    budget,
    notes,
    submittedAt,
    website,
  };
}
