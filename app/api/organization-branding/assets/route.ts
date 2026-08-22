import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import {
  BRANDING_ASSET_LIMITS,
  hasValidImageSignature,
  type BrandingAssetKind,
} from "@/app/lib/branding-assets";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

const kinds = Object.keys(BRANDING_ASSET_LIMITS) as BrandingAssetKind[];
const mimeTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

export async function POST(request: Request) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  if (context.membership.role !== "OWNER")
    return Response.json(
      { error: "Somente o Owner pode enviar arquivos de identidade visual." },
      { status: 403 },
    );
  const form = await request.formData().catch(() => null),
    asset = form?.get("asset"),
    kind = form?.get("kind");
  if (
    !(asset instanceof File) ||
    typeof kind !== "string" ||
    !kinds.includes(kind as BrandingAssetKind)
  )
    return Response.json({ error: "Arquivo inválido." }, { status: 400 });
  const maxSize = BRANDING_ASSET_LIMITS[kind as BrandingAssetKind];
  if (!mimeTypes.has(asset.type) || asset.size < 1 || asset.size > maxSize)
    return Response.json(
      {
        error:
          "Use PNG, JPG ou WebP dentro do limite permitido para este arquivo.",
      },
      { status: 400 },
    );
  const signature = new Uint8Array(await asset.slice(0, 12).arrayBuffer());
  if (!hasValidImageSignature(asset.type, signature))
    return Response.json(
      { error: "O conteúdo do arquivo não corresponde ao formato informado." },
      { status: 400 },
    );
  const token = crypto.randomUUID(),
    key = `public-branding/${token}`;
  await env.FILES.put(key, asset.stream(), {
    httpMetadata: { contentType: asset.type },
    customMetadata: {
      organizationId: context.organizationId,
      kind,
    },
  });
  return Response.json(
    { url: `/api/public/branding-assets/${token}` },
    { status: 201 },
  );
}
