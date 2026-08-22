/* eslint-disable @next/next/no-html-link-for-pages, @next/next/no-img-element -- catálogo aceita imagens externas configuradas pela organização. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  CalendarDays,
  ExternalLink,
  Instagram,
  MapPin,
  Music,
  Play,
  Youtube,
} from "lucide-react";
import { RequestShowButton } from "@/app/components/request-show-form";
import {
  getPublicArtist,
  getPublicAvailability,
  getPublicOrganization,
  getPublicOrganizationBranding,
} from "@/app/lib/public-catalog";
import { publicThemeStyle } from "@/app/lib/public-theme";

export const dynamic = "force-dynamic";
const external = (value: string) =>
  /^https?:\/\//i.test(value) ? value : `https://${value}`;
export async function generateMetadata({
  params,
}: {
  params: Promise<{ organizationSlug: string; artistSlug: string }>;
}): Promise<Metadata> {
  const { organizationSlug, artistSlug } = await params,
    artist = await getPublicArtist(organizationSlug, artistSlug);
  return artist
    ? {
        title: `${artist.name} — Catálogo`,
        description: artist.description || `Conheça ${artist.name}.`,
      }
    : { title: "Artista não encontrado" };
}

export default async function PublicArtistPage({
  params,
  searchParams,
}: {
  params: Promise<{ organizationSlug: string; artistSlug: string }>;
  searchParams: Promise<{ r?: string }>;
}) {
  const { organizationSlug, artistSlug } = await params,
    { r } = await searchParams,
    [organization, artist, branding] = await Promise.all([
      getPublicOrganization(organizationSlug),
      getPublicArtist(organizationSlug, artistSlug),
      getPublicOrganizationBranding(organizationSlug),
    ]);
  if (!organization || !artist || !branding) notFound();
  const availability = await getPublicAvailability(
    organizationSlug,
    artistSlug,
  );
  return (
    <main
      className="public-catalog artist-public-page"
      style={publicThemeStyle(branding)}
    >
      <header className="public-header">
        <a href={`/catalogo/${organizationSlug}`} className="back-to-catalog">
          <ArrowLeft />
          {organization.name}
        </a>
        <a href="/" className="public-brand">
          <span className="brand-mark">
            B<span />
          </span>
          <b>BookStage</b>
        </a>
      </header>
      <section className="artist-public-hero">
        <div className="artist-cover">
          {artist.coverUrl ? (
            <img src={artist.coverUrl} alt={`Capa de ${artist.name}`} />
          ) : (
            <div />
          )}
        </div>
        <div className="artist-public-intro">
          {artist.photoUrl && (
            <img
              className="artist-public-photo"
              src={artist.photoUrl}
              alt={artist.name}
            />
          )}
          <div>
            <p className="eyebrow">{artist.genre || "Artista"}</p>
            <h1>{artist.name}</h1>
            {artist.baseCity && (
              <span>
                <MapPin />
                {artist.baseCity}
              </span>
            )}
          </div>
          <RequestShowButton
            organizationSlug={organizationSlug}
            artistSlug={artistSlug}
            artistName={artist.name}
            referralToken={r}
          />
        </div>
      </section>
      <div className="artist-public-content">
        <article>
          <section className="public-copy">
            <p className="eyebrow">Sobre</p>
            <h2>Uma experiência para o seu público</h2>
            <p>
              {artist.description ||
                "Conheça este projeto artístico e consulte formatos disponíveis para o seu evento."}
            </p>
          </section>
          {artist.showFormats.length > 0 && (
            <section>
              <p className="eyebrow">Formatos de show</p>
              <div className="show-format-list">
                {artist.showFormats.map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </section>
          )}
          {artist.videos.length > 0 && (
            <section>
              <p className="eyebrow">Vídeos</p>
              <div className="public-link-list">
                {artist.videos.map((url, index) => (
                  <a
                    href={external(url)}
                    target="_blank"
                    rel="noreferrer"
                    key={url}
                  >
                    <Play />
                    Assistir vídeo {index + 1}
                    <ExternalLink />
                  </a>
                ))}
              </div>
            </section>
          )}
          {artist.materials.length > 0 && (
            <section>
              <p className="eyebrow">Materiais públicos</p>
              <div className="public-link-list">
                {artist.materials.map((url, index) => (
                  <a
                    href={external(url)}
                    target="_blank"
                    rel="noreferrer"
                    key={url}
                  >
                    <ExternalLink />
                    Material {index + 1}
                  </a>
                ))}
              </div>
            </section>
          )}
        </article>
        <aside>
          <section className="availability-card">
            <p className="eyebrow">Agenda pública</p>
            <h2>Próximas datas</h2>
            <p className="availability-help">
              Visão simplificada de disponibilidade. Consulte a equipe para
              confirmação.
            </p>
            <div>
              {availability.slice(0, 10).map((item) => (
                <div className="availability-row" key={item.date}>
                  <span>
                    <CalendarDays />
                    {new Date(`${item.date}T12:00:00`).toLocaleDateString(
                      "pt-BR",
                      { day: "2-digit", month: "short" },
                    )}
                  </span>
                  <b
                    className={`availability-${item.availability === "Indisponível" ? "unavailable" : item.availability === "Disponível" ? "available" : "consult"}`}
                  >
                    {item.availability}
                  </b>
                </div>
              ))}
              {!availability.length && (
                <p className="availability-empty">
                  Consulte a disponibilidade para sua data.
                </p>
              )}
            </div>
          </section>
          <section className="artist-socials">
            <p className="eyebrow">Ouça e acompanhe</p>
            {artist.instagram && (
              <a
                href={external(artist.instagram)}
                target="_blank"
                rel="noreferrer"
              >
                <Instagram />
                Instagram
              </a>
            )}
            {artist.spotify && (
              <a
                href={external(artist.spotify)}
                target="_blank"
                rel="noreferrer"
              >
                <Music />
                Spotify
              </a>
            )}
            {artist.youtube && (
              <a
                href={external(artist.youtube)}
                target="_blank"
                rel="noreferrer"
              >
                <Youtube />
                YouTube
              </a>
            )}
          </section>
        </aside>
      </div>
      <footer className="public-footer">
        <span>{organization.name}</span>
        <small>Catálogo comercial powered by BookStage</small>
      </footer>
    </main>
  );
}
