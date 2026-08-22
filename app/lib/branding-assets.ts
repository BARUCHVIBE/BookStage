export const BRANDING_ASSET_LIMITS = {
  logo: 2_000_000,
  favicon: 2_000_000,
  "catalog-cover": 5_000_000,
} as const;

export type BrandingAssetKind = keyof typeof BRANDING_ASSET_LIMITS;

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
