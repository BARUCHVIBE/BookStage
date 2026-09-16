export const ARTIST_ASSET_LIMITS = {
  photo: 5_000_000,
  cover: 8_000_000,
} as const;

export type ArtistAssetKind = keyof typeof ARTIST_ASSET_LIMITS;

export const ARTIST_ASSET_ASPECT_RATIOS: Record<ArtistAssetKind, string> = {
  photo: "1:1 (quadrada)",
  cover: "2:3 (vertical)",
};

export function artistAssetHint(kind: ArtistAssetKind) {
  return `PNG, JPG ou WebP · proporção recomendada ${ARTIST_ASSET_ASPECT_RATIOS[kind]} · até ${(ARTIST_ASSET_LIMITS[kind] / 1_000_000).toFixed(0)} MB`;
}

const internalAssetPattern =
  /^\/api\/public\/artist-assets\/([a-f0-9-]{36})$/i;

export function artistAssetKey(token: string) {
  return `public-artists/${token}`;
}

export function artistAssetToken(value: string | null | undefined) {
  return value?.match(internalAssetPattern)?.[1] ?? null;
}

export function artistAssetUrl(token: string) {
  return `/api/public/artist-assets/${token}`;
}

export function normalizeArtistImageUrl(
  value: string | null | undefined,
  label: string,
) {
  const normalized = value?.trim();
  if (!normalized) return null;
  if (internalAssetPattern.test(normalized)) return normalized;
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${label} deve usar uma URL HTTPS válida ou um upload do BookBusiness.`);
  }
  if (parsed.protocol !== "https:")
    throw new Error(`${label} deve usar HTTPS.`);
  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname.endsWith(".localhost")
  )
    throw new Error(`${label} não pode apontar para um endereço local.`);
  if (parsed.username || parsed.password)
    throw new Error(`${label} não pode conter credenciais.`);
  return parsed.toString();
}

export function artistImageSources(
  coverUrl: string | null | undefined,
  photoUrl: string | null | undefined,
) {
  return [...new Set([coverUrl, photoUrl].filter(Boolean))] as string[];
}
