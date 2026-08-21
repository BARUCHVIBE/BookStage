/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element -- catálogo aceita imagens externas configuradas pela organização. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, Instagram, MapPin, Music2 } from "lucide-react";
import { getPublicArtists, getPublicOrganization } from "@/app/lib/public-catalog";

export const dynamic = "force-dynamic";

export async function generateMetadata({params}:{params:Promise<{organizationSlug:string}>}):Promise<Metadata>{const {organizationSlug}=await params,organization=await getPublicOrganization(organizationSlug);return organization?{title:`${organization.name} — Catálogo`,description:organization.description||`Conheça os artistas de ${organization.name}.`}:{title:"Catálogo não encontrado"}}

export default async function PublicCatalogPage({params}:{params:Promise<{organizationSlug:string}>}) {
  const {organizationSlug}=await params,organization=await getPublicOrganization(organizationSlug);
  if(!organization)notFound();
  const artists=await getPublicArtists(organizationSlug);
  return <main className="public-catalog"><header className="public-header"><a href="/" className="public-brand"><span className="brand-mark">B<span/></span><b>BookStage</b></a><nav>{organization.instagram&&<a href={organization.instagram} target="_blank" rel="noreferrer"><Instagram/>Instagram</a>}{organization.website&&<a href={organization.website} target="_blank" rel="noreferrer"><ExternalLink/>Site</a>}</nav></header><section className="catalog-hero"><div className="catalog-org-logo">{organization.logo?<img src={organization.logo} alt={`Logo ${organization.name}`}/>:organization.name[0]}</div><p className="eyebrow">Catálogo oficial</p><h1>{organization.name}</h1><p>{organization.description||"Artistas, projetos e experiências ao vivo para o seu evento."}</p></section><section className="public-artists"><div className="public-section-heading"><div><p className="eyebrow">Nosso casting</p><h2>Artistas</h2></div><span>{artists.length} {artists.length===1?"artista":"artistas"}</span></div><div className="public-artist-grid">{artists.map(artist=><a className="public-artist-card" href={`/catalogo/${organizationSlug}/${artist.slug}`} key={artist.slug}><div className="artist-card-media">{artist.coverUrl||artist.photoUrl?<img src={artist.coverUrl||artist.photoUrl!} alt={artist.name}/>:<Music2/>}</div><div><p>{artist.genre||"Artista"}</p><h3>{artist.name}</h3>{artist.baseCity&&<span><MapPin/> {artist.baseCity}</span>}</div></a>)}</div>{!artists.length&&<div className="public-empty">O catálogo de artistas será publicado em breve.</div>}</section><footer className="public-footer"><span>{organization.name}</span><small>Catálogo comercial powered by BookStage</small></footer></main>;
}
