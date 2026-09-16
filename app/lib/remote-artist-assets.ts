import {
  ARTIST_ASSET_LIMITS,
  artistAssetKey,
  artistAssetUrl,
  type ArtistAssetKind,
} from "./artist-assets";
import { hasValidImageSignature } from "./branding-assets";

const discordImageHosts = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
]);
const allowedImageTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export function isDiscordArtistAssetUrl(value: string) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      discordImageHosts.has(url.hostname.toLowerCase())
    );
  } catch {
    return false;
  }
}

export async function importDiscordArtistAsset({
  bucket,
  sourceUrl,
  organizationId,
  artistId,
  kind,
}: {
  bucket: R2Bucket;
  sourceUrl: string;
  organizationId: string;
  artistId: string;
  kind: ArtistAssetKind;
}) {
  if (!isDiscordArtistAssetUrl(sourceUrl))
    throw new Error("A URL externa não pertence a um CDN autorizado.");
  const response = await fetch(sourceUrl, {
    method: "GET",
    redirect: "error",
    headers: { accept: "image/png,image/jpeg,image/webp" },
  }).catch(() => null);
  if (!response?.ok)
    throw new Error(
      "O link do Discord expirou ou não está acessível. Copie um link novo do arquivo e tente novamente.",
    );
  const contentType = response.headers
    .get("content-type")
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();
  if (!contentType || !allowedImageTypes.has(contentType))
    throw new Error("O link informado não retornou uma imagem PNG, JPG ou WebP.");
  const declaredLength = Number(response.headers.get("content-length") || 0),
    limit = ARTIST_ASSET_LIMITS[kind];
  if (declaredLength > limit)
    throw new Error(`A imagem excede o limite de ${limit / 1_000_000} MB.`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length || bytes.length > limit)
    throw new Error(`A imagem excede o limite de ${limit / 1_000_000} MB.`);
  if (!hasValidImageSignature(contentType, bytes.slice(0, 12)))
    throw new Error("O conteúdo recebido não corresponde ao formato da imagem.");
  const token = crypto.randomUUID(),
    key = artistAssetKey(token);
  await bucket.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: { organizationId, artistId, kind, importedFrom: "discord" },
  });
  return { key, url: artistAssetUrl(token) };
}
