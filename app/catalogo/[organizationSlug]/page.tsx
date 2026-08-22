/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element -- catálogo aceita imagens externas configuradas pela organização. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ExternalLink, Instagram, MapPin, Music2 } from "lucide-react";
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
          <span className="brand-mark">
            B<span />
          </span>
          <b>BookStage</b>
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
          <img
            className="catalog-hero-cover"
            src={presentation.coverUrl}
            alt=""
            aria-hidden="true"
          />
        )}
        {presentation.coverUrl && (
          <span className="catalog-hero-overlay" aria-hidden="true" />
        )}
        <div className="catalog-hero-content">
          <div className="catalog-org-logo">
            {logoUrl ? (
              <img src={logoUrl} alt={`Logo ${organization.name}`} />
            ) : (
              organization.name[0]
            )}
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
                {artist.coverUrl || artist.photoUrl ? (
                  <img
                    src={artist.coverUrl || artist.photoUrl!}
                    alt={artist.name}
                  />
                ) : (
                  <Music2 />
                )}
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
        <small>Catálogo comercial powered by BookStage</small>
      </footer>
    </main>
  );
}
