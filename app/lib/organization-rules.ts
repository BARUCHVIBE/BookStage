export type OrganizationInput = {
  name: string;
  email: string;
  logo: string | null;
  phone: string | null;
  document: string | null;
  website: string | null;
  instagram: string | null;
  description: string | null;
  slug: string | null;
};

function value(body: Record<string, unknown>, key: string, max: number) {
  if (
    !(key in body) ||
    body[key] === null ||
    body[key] === undefined ||
    body[key] === ""
  )
    return null;
  if (typeof body[key] !== "string") throw new Error(`Campo ${key} inválido.`);
  const normalized = body[key].trim();
  if (normalized.length > max)
    throw new Error(`Campo ${key} excede o limite permitido.`);
  return normalized || null;
}

export function normalizeOrganizationInput(
  body: Record<string, unknown>,
): OrganizationInput {
  const name = value(body, "name", 160),
    email = value(body, "email", 180);
  if (!name || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("Nome ou e-mail inválido.");
  return {
    name,
    email,
    logo: value(body, "logo", 1000),
    phone: value(body, "phone", 40),
    document: value(body, "document", 30),
    website: value(body, "website", 1000),
    instagram: value(body, "instagram", 1000),
    description: value(body, "description", 4000),
    slug: value(body, "slug", 180),
  };
}
