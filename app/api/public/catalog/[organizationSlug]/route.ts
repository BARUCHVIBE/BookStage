import {
  getPublicArtists,
  getPublicOrganization,
  publicCatalogDto,
} from "@/app/lib/public-catalog";

export async function GET(
  _: Request,
  context: { params: Promise<{ organizationSlug: string }> },
) {
  const { organizationSlug } = await context.params;
  const organization = await getPublicOrganization(organizationSlug);
  if (!organization)
    return Response.json(
      { error: "Catálogo não encontrado." },
      { status: 404 },
    );
  return Response.json(
    publicCatalogDto(organization, await getPublicArtists(organizationSlug)),
  );
}
