/* eslint-disable @next/next/no-html-link-for-pages -- catálogo compartilhável utiliza rotas internas sem Link. */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Building2, MapPin, Music2 } from "lucide-react";
import { ResilientImage } from "@/app/components/resilient-image";
import { PlatformBrand } from "@/app/components/platform-brand";
import { artistImageSources } from "@/app/lib/artist-assets";
import { getBookingPortfolio } from "@/app/lib/booking-commercial";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Catálogo Comercial — BookBusiness",
  robots: { index: false, follow: false },
};

export default async function BookingCatalogPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ empresa?: string }>;
}) {
  const { code } = await params,
    { empresa } = await searchParams,
    portfolio = await getBookingPortfolio(code, {
      organizationSlug: empresa,
    });
  if (!portfolio) notFound();
  const organizations = Array.from(
    new Map(
      portfolio.artists.map((artist) => [
        artist.organizationId,
        {
          id: artist.organizationId,
          name: artist.organizationName,
          slug: artist.organizationSlug,
          logo: artist.organizationLogo,
        },
      ]),
    ).values(),
  );
  return (
    <main className="booking-public-catalog">
      <header className="booking-public-header">
        <a href="/" className="public-brand">
          <PlatformBrand />
        </a>
      </header>
      <section className="booking-profile-hero">
        <div className="booking-profile-avatar">
          <ResilientImage
            sources={[portfolio.profile.avatarUrl]}
            alt={portfolio.profile.name}
            fallback={portfolio.profile.name[0]}
          />
        </div>
        <p className="eyebrow">Catálogo comercial</p>
        <h1>{portfolio.profile.name}</h1>
        <p>{portfolio.profile.title}</p>
        <span>{portfolio.artists.length} artistas · {organizations.length} empresas</span>
      </section>
      <section className="booking-public-content">
        {organizations.map((organization) => (
          <section className="booking-public-company" key={organization.id}>
            <header>
              <span className="booking-company-mark">
                <ResilientImage
                  sources={[organization.logo]}
                  alt=""
                  fallback={<Building2 aria-hidden="true" />}
                />
              </span>
              <div><p className="eyebrow">Empresa responsável</p><h2>{organization.name}</h2></div>
            </header>
            <div className="public-artist-grid">
              {portfolio.artists
                .filter((artist) => artist.organizationId === organization.id)
                .map((artist) => (
                  <a className="public-artist-card" href={`/bookings/${code}/${artist.organizationSlug}/${artist.artistSlug}`} key={artist.artistId}>
                    <div className="artist-card-media">
                      <ResilientImage
                        sources={artistImageSources(artist.coverUrl, artist.photoUrl)}
                        alt={artist.artistName}
                        fallback={<Music2 aria-hidden="true" />}
                      />
                    </div>
                    <div><p>{artist.genre || "Artista"}</p><h3>{artist.artistName}</h3>{artist.baseCity && <span><MapPin /> {artist.baseCity}</span>}</div>
                  </a>
                ))}
            </div>
          </section>
        ))}
        {!portfolio.artists.length && <div className="public-empty">Nenhum artista disponível neste link.</div>}
      </section>
      <footer className="public-footer"><span>{portfolio.profile.name}</span><small>Catálogo comercial powered by BookBusiness</small></footer>
    </main>
  );
}
