import {
  getPublicArtist,
  getPublicAvailability,
  getPublicOrganization,
  publicArtistDto,
} from "@/app/lib/public-catalog";

export async function GET(
  _: Request,
  context: {
    params: Promise<{ organizationSlug: string; artistSlug: string }>;
  },
) {
  const { organizationSlug, artistSlug } = await context.params;
  const [organization, artist] = await Promise.all([
    getPublicOrganization(organizationSlug),
    getPublicArtist(organizationSlug, artistSlug),
  ]);
  if (!organization || !artist)
    return Response.json({ error: "Artista não encontrado." }, { status: 404 });
  return Response.json(
    publicArtistDto(
      organization,
      artist,
      await getPublicAvailability(organizationSlug, artistSlug),
    ),
  );
}
