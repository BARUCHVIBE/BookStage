import { env } from "cloudflare:workers";
import type { PublicArtist, PublicArtistCard, PublicOrganization } from "./public-catalog-dto";

export { publicArtistDto, publicCatalogDto } from "./public-catalog-dto";

function lines(value: string | null) {
  return value?.split("\n").map(item=>item.trim()).filter(Boolean) ?? [];
}

function safeUrl(value: string | null) {
  if (!value) return null;
  try { const url=new URL(value); return url.protocol==="http:"||url.protocol==="https:"?url.toString():null; }
  catch { return null; }
}

function urls(value: string | null) { return lines(value).map(item=>safeUrl(item)).filter((item):item is string=>Boolean(item)); }

export async function getPublicOrganization(slug: string) {
  const row=await env.DB.prepare(`SELECT slug,name,logo,description,instagram,website FROM organizations WHERE slug=? AND status='ACTIVE'`).bind(slug).first<PublicOrganization>();
  return row?{...row,logo:safeUrl(row.logo),instagram:safeUrl(row.instagram),website:safeUrl(row.website)}:null;
}

export async function getPublicArtists(organizationSlug: string) {
  const rows = await env.DB.prepare(`SELECT artist.slug,artist.name,artist.photo_url AS photoUrl,artist.cover_url AS coverUrl,artist.genre,artist.base_city AS baseCity FROM artists artist JOIN organizations organization ON organization.id=artist.organization_id WHERE organization.slug=? AND organization.status='ACTIVE' AND artist.status='ACTIVE' AND artist.is_public=1 AND artist.slug IS NOT NULL ORDER BY artist.name`).bind(organizationSlug).all<PublicArtistCard>();
  return rows.results.map(artist=>({...artist,photoUrl:safeUrl(artist.photoUrl),coverUrl:safeUrl(artist.coverUrl)}));
}

export async function getPublicArtist(organizationSlug: string, artistSlug: string) {
  const row = await env.DB.prepare(`SELECT artist.slug,artist.name,artist.photo_url AS photoUrl,artist.cover_url AS coverUrl,artist.genre,artist.description,artist.base_city AS baseCity,artist.show_formats AS showFormats,artist.video_urls AS videoUrls,artist.instagram,artist.spotify,artist.youtube,artist.public_materials AS publicMaterials FROM artists artist JOIN organizations organization ON organization.id=artist.organization_id WHERE organization.slug=? AND artist.slug=? AND organization.status='ACTIVE' AND artist.status='ACTIVE' AND artist.is_public=1`).bind(organizationSlug,artistSlug).first<Omit<PublicArtist,"showFormats"|"videos"|"materials"> & {showFormats:string|null;videoUrls:string|null;publicMaterials:string|null}>();
  if (!row) return null;
  const {showFormats,videoUrls,publicMaterials,...artist}=row;
  return { ...artist, photoUrl:safeUrl(row.photoUrl),coverUrl:safeUrl(row.coverUrl),instagram:safeUrl(row.instagram),spotify:safeUrl(row.spotify),youtube:safeUrl(row.youtube),showFormats:lines(showFormats),videos:urls(videoUrls),materials:urls(publicMaterials) } as PublicArtist;
}

export async function getPublicAvailability(organizationSlug: string, artistSlug: string) {
  const rows = await env.DB.prepare(`SELECT substr(entry.start_datetime,1,10) AS date,MAX(CASE WHEN entry.status IN ('CONFIRMED','BLOCKED') THEN 3 WHEN entry.status IN ('INQUIRY','OPTION') THEN 2 ELSE 1 END) AS level FROM calendar_entries entry JOIN artists artist ON artist.id=entry.artist_id AND artist.organization_id=entry.organization_id JOIN organizations organization ON organization.id=entry.organization_id WHERE organization.slug=? AND artist.slug=? AND organization.status='ACTIVE' AND artist.status='ACTIVE' AND artist.is_public=1 AND entry.start_datetime>=CURRENT_TIMESTAMP AND entry.start_datetime<datetime(CURRENT_TIMESTAMP,'+120 days') GROUP BY substr(entry.start_datetime,1,10) ORDER BY date LIMIT 24`).bind(organizationSlug,artistSlug).all<{date:string;level:number}>();
  return rows.results.map(item=>({date:item.date,availability:item.level===3?"Indisponível":item.level===2?"Consultar disponibilidade":"Disponível"}));
}
