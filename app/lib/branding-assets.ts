export const BRANDING_ASSET_LIMITS = {
  logo: 2_000_000,
  favicon: 2_000_000,
  "catalog-cover": 5_000_000,
} as const;

export type BrandingAssetKind = keyof typeof BRANDING_ASSET_LIMITS;

export const BRANDING_ASSET_ASPECT_RATIOS: Record<
  BrandingAssetKind,
  string
> = {
  logo: "1:1 (quadrada)",
  favicon: "1:1 (quadrada)",
  "catalog-cover": "16:5 (horizontal)",
};

export function brandingAssetHint(kind: BrandingAssetKind) {
  return `PNG, JPG ou WebP · proporção recomendada ${BRANDING_ASSET_ASPECT_RATIOS[kind]} · até ${(BRANDING_ASSET_LIMITS[kind] / 1_000_000).toFixed(0)} MB`;
}

const brandingAssetPattern =
  /^\/api\/public\/branding-assets\/([a-f0-9-]{36})$/i;

export function brandingAssetToken(value: string | null | undefined) {
  return value?.match(brandingAssetPattern)?.[1] ?? null;
}

export function brandingAssetKey(token: string) {
  return `public-branding/${token}`;
}

export function brandingAssetUrl(token: string) {
  return `/api/public/branding-assets/${token}`;
}

export async function brandingAssetBelongsToOrganization(
  bucket: R2Bucket,
  value: string | null,
  organizationId: string,
  kind: BrandingAssetKind,
  existingValue?: string | null,
) {
  const token = brandingAssetToken(value);
  if (!token) return true;
  const object = await bucket.head(brandingAssetKey(token));
  if (!object) return false;
  // Imported legacy objects may not retain R2 custom metadata. Their existing
  // tenant-scoped database reference remains the ownership source of truth.
  if (value === existingValue) return true;
  return (
    object.customMetadata?.organizationId === organizationId &&
    object.customMetadata?.kind === kind
  );
}

export function hasValidImageSignature(type: string, bytes: Uint8Array) {
  if (type === "image/png")
    return [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    );
  if (type === "image/jpeg")
    return bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255;
  if (type === "image/webp")
    return (
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP"
    );
  return false;
}
