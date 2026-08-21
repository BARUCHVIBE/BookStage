export type PublicOrganization = { slug:string;name:string;logo:string|null;description:string|null;instagram:string|null;website:string|null };
export type PublicArtistCard = { slug:string;name:string;photoUrl:string|null;coverUrl:string|null;genre:string|null;baseCity:string|null };
export type PublicArtist = PublicArtistCard & { description:string|null;showFormats:string[];videos:string[];instagram:string|null;spotify:string|null;youtube:string|null;materials:string[] };

export function publicCatalogDto(organization: PublicOrganization, artists: PublicArtistCard[]) {
  return { organization, artists };
}

export function publicArtistDto(organization: PublicOrganization, artist: PublicArtist, availability: Array<{date:string;availability:string}>) {
  return { organization, artist, availability };
}
