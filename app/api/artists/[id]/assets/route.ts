import { env } from "cloudflare:workers";
import { canManageArtistAssignments } from "@/app/lib/artist-access";
import {
  ARTIST_ASSET_LIMITS,
  artistAssetKey,
  artistAssetToken,
  artistAssetUrl,
  type ArtistAssetKind,
} from "@/app/lib/artist-assets";
import { hasValidImageSignature } from "@/app/lib/branding-assets";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

const mimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]),
  kinds = Object.keys(ARTIST_ASSET_LIMITS) as ArtistAssetKind[];

export async function POST(
  request: Request,
  routeContext: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (!canManageArtistAssignments(context.membership.role))
    return Response.json(
      { error: "Sem permissão para alterar imagens do artista." },
      { status: 403 },
    );
  const { id } = await routeContext.params,
    artist = await env.DB.prepare(
      "SELECT id,photo_url AS photoUrl,cover_url AS coverUrl FROM artists WHERE id=? AND organization_id=?",
    )
      .bind(id, context.organizationId)
      .first<{ id: string; photoUrl: string | null; coverUrl: string | null }>();
  if (!artist)
    return Response.json({ error: "Artista não encontrado." }, { status: 404 });
  const form = await request.formData().catch(() => null),
    asset = form?.get("asset"),
    kind = form?.get("kind");
  if (
    !(asset instanceof File) ||
    typeof kind !== "string" ||
    !kinds.includes(kind as ArtistAssetKind)
  )
    return Response.json({ error: "Arquivo inválido." }, { status: 400 });
  const typedKind = kind as ArtistAssetKind,
    maxSize = ARTIST_ASSET_LIMITS[typedKind];
  if (!mimeTypes.has(asset.type) || asset.size < 1 || asset.size > maxSize)
    return Response.json(
      { error: "Use PNG, JPG ou WebP dentro do limite permitido." },
      { status: 400 },
    );
  const signature = new Uint8Array(await asset.slice(0, 12).arrayBuffer());
  if (!hasValidImageSignature(asset.type, signature))
    return Response.json(
      { error: "O conteúdo do arquivo não corresponde ao formato informado." },
      { status: 400 },
    );
  const token = crypto.randomUUID(),
    key = artistAssetKey(token),
    previousUrl = typedKind === "photo" ? artist.photoUrl : artist.coverUrl,
    column = typedKind === "photo" ? "photo_url" : "cover_url";
  await env.FILES.put(key, asset.stream(), {
    httpMetadata: { contentType: asset.type },
    customMetadata: {
      organizationId: context.organizationId,
      artistId: id,
      kind: typedKind,
    },
  });
  try {
    await env.DB.prepare(
      `UPDATE artists SET ${column}=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=?`,
    )
      .bind(artistAssetUrl(token), id, context.organizationId)
      .run();
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
  const previousToken = artistAssetToken(previousUrl);
  if (previousToken) {
    const previous = await env.FILES.head(artistAssetKey(previousToken));
    if (
      previous?.customMetadata?.organizationId === context.organizationId &&
      previous.customMetadata.artistId === id &&
      previous.customMetadata.kind === typedKind
    )
      await env.FILES.delete(artistAssetKey(previousToken));
  }
  return Response.json(
    { url: artistAssetUrl(token), kind: typedKind },
    { status: 201 },
  );
}
