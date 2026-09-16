import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, MapPin } from "lucide-react";
import { RequestShowButton } from "@/app/components/request-show-form";
import { ResilientImage } from "@/app/components/resilient-image";
import { artistImageSources } from "@/app/lib/artist-assets";
import { getBookingPortfolio } from "@/app/lib/booking-commercial";
import { getPublicArtist } from "@/app/lib/public-catalog";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Perfil comercial — BookBusiness",
  robots: { index: false, follow: false },
};

export default async function BookingArtistPage({ params }: { params: Promise<{ code: string; organizationSlug: string; artistSlug: string }> }) {
  const { code, organizationSlug, artistSlug } = await params,
    portfolio = await getBookingPortfolio(code, { organizationSlug, artistSlug }),
    access = portfolio?.artists[0],
    artist = access ? await getPublicArtist(organizationSlug, artistSlug) : null;
  if (!portfolio || !access || !artist) notFound();
  return (
    <main className="booking-public-catalog booking-artist-page">
      <header className="booking-public-header">
        <a href={`/bookings/${code}`} className="back-to-catalog"><ArrowLeft /> Voltar ao catálogo de {portfolio.profile.name}</a>
      </header>
      <section className="booking-artist-hero">
        <div>
          <p className="eyebrow">Perfil comercial</p>
          <h1>{artist.name}</h1>
          {artist.genre && <p>{artist.genre}</p>}
          {artist.baseCity && <span><MapPin /> {artist.baseCity}</span>}
          <RequestShowButton organizationSlug={organizationSlug} artistSlug={artistSlug} artistName={artist.name} bookingCode={code} />
        </div>
        <ResilientImage
          sources={artistImageSources(artist.coverUrl, artist.photoUrl)}
          alt={artist.name}
          fallback={null}
        />
      </section>
      <section className="booking-artist-about">
        <article><p className="eyebrow">Sobre</p><h2>{artist.name}</h2><p>{artist.description || "Consulte formatos e disponibilidade para seu evento."}</p></article>
        <aside><Building2 /><div><small>Representado por</small><b>{access.organizationName}</b><small>Contato comercial: {portfolio.profile.name} / Booking</small></div></aside>
      </section>
      <footer className="public-footer"><span>{access.organizationName}</span><small>Contato comercial via {portfolio.profile.name}</small></footer>
    </main>
  );
}
