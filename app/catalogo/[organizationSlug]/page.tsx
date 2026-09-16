/* eslint-disable @next/next/no-html-link-for-pages -- catálogo público utiliza rotas internas sem Link. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, Instagram, MapPin, Music2 } from "lucide-react";
import { ResilientImage } from "@/app/components/resilient-image";
import { PlatformBrand } from "@/app/components/platform-brand";
import { artistImageSources } from "@/app/lib/artist-assets";
import {
  getPublicArtists,
  getPublicOrganization,
  getPublicOrganizationBranding,
} from "@/app/lib/public-catalog";
import {
  publicCatalogPresentation,
  publicThemeStyle,
} from "@/app/lib/public-theme";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}): Promise<Metadata> {
  const { organizationSlug } = await params,
    [organization, branding] = await Promise.all([
      getPublicOrganization(organizationSlug),
      getPublicOrganizationBranding(organizationSlug),
    ]);
  const presentation =
    organization && branding
      ? publicCatalogPresentation(organization, branding)
      : null;
  return organization
    ? {
        title: `${presentation?.title || organization.name} — ${organization.name}`,
        description:
          presentation?.description || `Conheça os artistas de ${organization.name}.`,
      }
    : { title: "Catálogo não encontrado" };
}

export default async function PublicCatalogPage({
  params,
}: {
  params: Promise<{ organizationSlug: string }>;
}) {
  const { organizationSlug } = await params,
    organization = await getPublicOrganization(organizationSlug);
  if (!organization) notFound();
  const [artists, branding] = await Promise.all([
    getPublicArtists(organizationSlug),
    getPublicOrganizationBranding(organizationSlug),
  ]);
  if (!branding) notFound();
  const presentation = publicCatalogPresentation(organization, branding),
    logoUrl = branding.logoUrl || organization.logo;
  return (
    <main
      className={`public-catalog catalog-index-page${presentation.coverUrl ? " has-catalog-cover" : ""}`}
      style={publicThemeStyle(branding)}
    >
      <header className="public-header">
        <a href="/" className="public-brand">
          <PlatformBrand />
        </a>
        <nav>
          {organization.instagram && (
            <a href={organization.instagram} target="_blank" rel="noreferrer">
              <Instagram />
              Instagram
            </a>
          )}
          {organization.website && (
            <a href={organization.website} target="_blank" rel="noreferrer">
              <ExternalLink />
              Site
            </a>
          )}
        </nav>
      </header>
      <section
        className={`catalog-hero${presentation.coverUrl ? " has-cover" : ""}`}
      >
        {presentation.coverUrl && (
          <ResilientImage
            sources={[presentation.coverUrl]}
            className="catalog-hero-cover"
            alt=""
            aria-hidden="true"
            fallback={null}
          />
        )}
        {presentation.coverUrl && (
          <span className="catalog-hero-overlay" aria-hidden="true" />
        )}
        <div className="catalog-hero-content">
          <div className="catalog-org-logo">
            <ResilientImage
              sources={[logoUrl]}
              alt={`Logo ${organization.name}`}
              fallback={organization.name[0]}
            />
          </div>
          <p className="eyebrow">Catálogo oficial</p>
          <h1>{presentation.title}</h1>
          <p>{presentation.description}</p>
        </div>
      </section>
      <section className="public-artists">
        <div className="public-section-heading">
          <div>
            <p className="eyebrow">Nosso casting</p>
            <h2>Artistas</h2>
          </div>
          <span>
            {artists.length} {artists.length === 1 ? "artista" : "artistas"}
          </span>
        </div>
        <div className="public-artist-grid">
          {artists.map((artist) => (
            <a
              className="public-artist-card"
              href={`/catalogo/${organizationSlug}/${artist.slug}`}
              key={artist.slug}
            >
              <div className="artist-card-media">
                <ResilientImage
                  sources={artistImageSources(artist.coverUrl, artist.photoUrl)}
                  alt={artist.name}
                  fallback={<Music2 aria-hidden="true" />}
                />
              </div>
              <div>
                <p>{artist.genre || "Artista"}</p>
                <h3>{artist.name}</h3>
                {artist.baseCity && (
                  <span>
                    <MapPin /> {artist.baseCity}
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
        {!artists.length && (
          <div className="public-empty">
            O catálogo de artistas será publicado em breve.
          </div>
        )}
      </section>
      <footer className="public-footer">
        <span>{organization.name}</span>
        <small>Catálogo comercial powered by BookBusiness</small>
      </footer>
    </main>
  );
}
