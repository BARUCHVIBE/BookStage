export const BRANDING_FONTS = ["Inter", "System", "Georgia"] as const;
export type BrandingFont = (typeof BRANDING_FONTS)[number];

export type OrganizationBranding = {
  logoUrl: string | null;
  faviconUrl: string | null;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  primaryForeground: string;
  secondaryForeground: string;
  accentForeground: string;
  headingFont: BrandingFont;
  bodyFont: BrandingFont;
  catalogCoverUrl: string | null;
  catalogTitle: string | null;
  catalogDescription: string | null;
};

export const DEFAULT_BOOKSTAGE_THEME: OrganizationBranding = {
  logoUrl: null,
  faviconUrl: null,
  primaryColor: "#111827",
  secondaryColor: "#374151",
  accentColor: "#E2B002",
  backgroundColor: "#F8F8F8",
  primaryForeground: "#FFFFFF",
  secondaryForeground: "#FFFFFF",
  accentForeground: "#111827",
  headingFont: "Inter",
  bodyFont: "Inter",
  catalogCoverUrl: null,
  catalogTitle: null,
  catalogDescription: null,
};

type BrandingRow = Partial<
  Omit<
    OrganizationBranding,
    "primaryForeground" | "secondaryForeground" | "accentForeground"
  >
>;

function field(
  body: Record<string, unknown>,
  key: string,
  max: number,
): string | null {
  const raw = body[key];
  if (raw === null || raw === undefined || raw === "") return null;
  if (typeof raw !== "string") throw new Error(`Campo ${key} inválido.`);
  const normalized = raw.trim();
  if (normalized.length > max)
    throw new Error(`Campo ${key} excede o limite permitido.`);
  return normalized || null;
}

export function normalizeHexColor(value: unknown, label = "cor") {
  if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value.trim()))
    throw new Error(`${label} inválida. Use o formato #RRGGBB.`);
  return value.trim().toUpperCase();
}

function normalizeUrl(value: string | null, label: string) {
  if (!value) return null;
  if (/^\/api\/public\/branding-assets\/[a-f0-9-]{36}$/i.test(value))
    return value;
  try {
    const parsed = new URL(value);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error(`${label} deve usar uma URL HTTP ou HTTPS válida.`);
  }
}

function safeStoredUrl(value: string | null | undefined) {
  try {
    return normalizeUrl(value ?? null, "Arquivo");
  } catch {
    return null;
  }
}

function normalizeFont(value: unknown, label: string): BrandingFont {
  if (
    typeof value !== "string" ||
    !BRANDING_FONTS.includes(value as BrandingFont)
  )
    throw new Error(`${label} inválida.`);
  return value as BrandingFont;
}

function channel(value: number) {
  const normalized = value / 255;
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function contrastRatio(first: string, second: string) {
  const luminance = (color: string) => {
    const hex = normalizeHexColor(color);
    const values = [1, 3, 5].map((index) =>
      Number.parseInt(hex.slice(index, index + 2), 16),
    );
    return (
      0.2126 * channel(values[0]) +
      0.7152 * channel(values[1]) +
      0.0722 * channel(values[2])
    );
  };
  const light = Math.max(luminance(first), luminance(second));
  const dark = Math.min(luminance(first), luminance(second));
  return (light + 0.05) / (dark + 0.05);
}

export function readableForeground(background: string) {
  return contrastRatio(background, "#FFFFFF") >=
    contrastRatio(background, "#111827")
    ? "#FFFFFF"
    : "#111827";
}

export function mixHexColor(first: string, second: string, weight: number) {
  const left = normalizeHexColor(first),
    right = normalizeHexColor(second),
    ratio = Math.min(1, Math.max(0, weight)),
    channelAt = (color: string, index: number) =>
      Number.parseInt(color.slice(index, index + 2), 16),
    mixed = [1, 3, 5].map((index) =>
      Math.round(
        channelAt(left, index) * (1 - ratio) +
          channelAt(right, index) * ratio,
      )
        .toString(16)
        .padStart(2, "0"),
    );
  return `#${mixed.join("")}`.toUpperCase();
}

export function interactiveHoverColor(background: string) {
  const foreground = readableForeground(background);
  return mixHexColor(
    background,
    foreground === "#FFFFFF" ? "#FFFFFF" : "#111827",
    foreground === "#FFFFFF" ? 0.12 : 0.1,
  );
}

export function resolveOrganizationBranding(
  row: BrandingRow | null | undefined,
): OrganizationBranding {
  const base = {
    ...DEFAULT_BOOKSTAGE_THEME,
    logoUrl: safeStoredUrl(row?.logoUrl),
    faviconUrl: safeStoredUrl(row?.faviconUrl),
    primaryColor:
      row?.primaryColor ?? DEFAULT_BOOKSTAGE_THEME.primaryColor,
    secondaryColor:
      row?.secondaryColor ?? DEFAULT_BOOKSTAGE_THEME.secondaryColor,
    accentColor: row?.accentColor ?? DEFAULT_BOOKSTAGE_THEME.accentColor,
    backgroundColor:
      row?.backgroundColor ?? DEFAULT_BOOKSTAGE_THEME.backgroundColor,
    headingFont: row?.headingFont ?? DEFAULT_BOOKSTAGE_THEME.headingFont,
    bodyFont: row?.bodyFont ?? DEFAULT_BOOKSTAGE_THEME.bodyFont,
    catalogCoverUrl: safeStoredUrl(row?.catalogCoverUrl),
    catalogTitle: row?.catalogTitle ?? DEFAULT_BOOKSTAGE_THEME.catalogTitle,
    catalogDescription:
      row?.catalogDescription ?? DEFAULT_BOOKSTAGE_THEME.catalogDescription,
  };
  const safeColor = (value: string, fallback: string, label: string) => {
      try {
        return normalizeHexColor(value, label);
      } catch {
        return fallback;
      }
    },
    safeFont = (value: string, fallback: BrandingFont, label: string) => {
      try {
        return normalizeFont(value, label);
      } catch {
        return fallback;
      }
    },
    primaryColor = safeColor(
      base.primaryColor,
      DEFAULT_BOOKSTAGE_THEME.primaryColor,
      "Cor primária",
    ),
    secondaryColor = safeColor(
      base.secondaryColor,
      DEFAULT_BOOKSTAGE_THEME.secondaryColor,
      "Cor secundária",
    ),
    accentColor = safeColor(
      base.accentColor,
      DEFAULT_BOOKSTAGE_THEME.accentColor,
      "Cor de destaque",
    ),
    backgroundColor = safeColor(
      base.backgroundColor,
      DEFAULT_BOOKSTAGE_THEME.backgroundColor,
      "Cor de fundo",
    );
  return {
    ...base,
    primaryColor,
    secondaryColor,
    accentColor,
    backgroundColor,
    headingFont: safeFont(
      base.headingFont,
      DEFAULT_BOOKSTAGE_THEME.headingFont,
      "Fonte de título",
    ),
    bodyFont: safeFont(
      base.bodyFont,
      DEFAULT_BOOKSTAGE_THEME.bodyFont,
      "Fonte de texto",
    ),
    primaryForeground: readableForeground(primaryColor),
    secondaryForeground: readableForeground(secondaryColor),
    accentForeground: readableForeground(accentColor),
  };
}

export function normalizeOrganizationBranding(
  body: Record<string, unknown>,
): OrganizationBranding {
  return resolveOrganizationBranding({
    logoUrl: normalizeUrl(field(body, "logoUrl", 1000), "Logo"),
    faviconUrl: normalizeUrl(field(body, "faviconUrl", 1000), "Favicon"),
    primaryColor: normalizeHexColor(body.primaryColor, "Cor primária"),
    secondaryColor: normalizeHexColor(
      body.secondaryColor,
      "Cor secundária",
    ),
    accentColor: normalizeHexColor(body.accentColor, "Cor de destaque"),
    backgroundColor: normalizeHexColor(body.backgroundColor, "Cor de fundo"),
    headingFont: normalizeFont(body.headingFont, "Fonte de título"),
    bodyFont: normalizeFont(body.bodyFont, "Fonte de texto"),
    catalogCoverUrl: normalizeUrl(
      field(body, "catalogCoverUrl", 1000),
      "Capa do catálogo",
    ),
    catalogTitle: field(body, "catalogTitle", 120),
    catalogDescription: field(body, "catalogDescription", 500),
  });
}

export const BRANDING_FONT_STACKS: Record<BrandingFont, string> = {
  Inter: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  System: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  Georgia: 'Georgia, "Times New Roman", serif',
};
