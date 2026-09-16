"use client";

import { Building2, Copy, FilePlus2, Search, UserRound } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ResilientImage } from "@/app/components/resilient-image";
import { artistImageSources } from "@/app/lib/artist-assets";
import { fetchJson } from "@/app/lib/http-client";

type CatalogArtist = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  organizationLogo: string | null;
  artistId: string;
  artistName: string;
  artistSlug: string | null;
  photoUrl: string | null;
  coverUrl: string | null;
  genre: string | null;
  baseCity: string | null;
  isPublic: number;
};

export function CommercialCatalog({
  onCreateNegotiation,
}: {
  onCreateNegotiation: (organizationId: string, artistId: string) => void;
}) {
  const [artists, setArtists] = useState<CatalogArtist[]>([]),
    [bookingName, setBookingName] = useState(""),
    [organizationId, setOrganizationId] = useState(""),
    [query, setQuery] = useState(""),
    [profileUrl, setProfileUrl] = useState(""),
    [publicCode, setPublicCode] = useState(""),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchJson<{
          booking?: { name: string };
          artists?: CatalogArtist[];
          error?: string;
        }>("/api/commercial-catalog").then((result) => {
        if (result.ok) {
          setArtists(result.data?.artists || []);
          setBookingName(result.data?.booking?.name || "");
        } else
          setError(result.error || "Não foi possível carregar o catálogo.");
        setLoading(false);
      });
    fetchJson<{
      url?: string;
      profile?: { publicCode?: string };
    }>("/api/commercial-profile").then((result) => {
        if (!result.ok) return;
        setProfileUrl(result.data?.url || "");
        setPublicCode(result.data?.profile?.publicCode || "");
      });
  }, []);

  async function ensureProfile() {
    if (profileUrl && publicCode) return { url: profileUrl, code: publicCode };
    const result = await fetchJson<{
        url?: string;
        publicCode?: string;
        error?: string;
      }>("/api/commercial-profile", { method: "POST" });
    if (!result.ok || !result.data?.url || !result.data.publicCode) {
      setError(
        result.error || "Não foi possível preparar o link comercial.",
      );
      return null;
    }
    setProfileUrl(result.data.url);
    setPublicCode(result.data.publicCode);
    return { url: result.data.url, code: result.data.publicCode };
  }
  async function copyLink(kind: "personal" | "organization" | "artist", artist?: CatalogArtist) {
    const profile = await ensureProfile();
    if (!profile) return;
    let url = profile.url;
    if (kind === "organization" && artist)
      url = `${profile.url}?empresa=${encodeURIComponent(artist.organizationSlug)}`;
    if (kind === "artist" && artist)
      url = `${new URL(profile.url).origin}/bookings/${profile.code}/${artist.organizationSlug}/${artist.artistSlug}`;
    await navigator.clipboard.writeText(url);
    setNotice("Link comercial copiado.");
  }

  const organizations = useMemo(
      () =>
        Array.from(
          new Map(
            artists.map((artist) => [
              artist.organizationId,
              {
                id: artist.organizationId,
                name: artist.organizationName,
                logo: artist.organizationLogo,
              },
            ]),
          ).values(),
        ),
      [artists],
    ),
    filtered = artists.filter(
      (artist) =>
        (!organizationId || artist.organizationId === organizationId) &&
        (!query ||
          artist.artistName.toLowerCase().includes(query.toLowerCase())),
    ),
    grouped = organizations
      .filter((organization) =>
        filtered.some((artist) => artist.organizationId === organization.id),
      )
      .map((organization) => ({
        ...organization,
        artists: filtered.filter(
          (artist) => artist.organizationId === organization.id,
        ),
      }));

  if (loading)
    return (
      <div className="loading">
        <span className="spinner" /> Carregando catálogo comercial…
      </div>
    );

  return (
    <section className="commercial-catalog">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Carteira de {bookingName}</p>
          <h1>Meu Catálogo Comercial</h1>
          <p>Artistas autorizados, separados pela empresa responsável.</p>
        </div>
        <div className="catalog-summary">
          <span><UserRound /> {artists.length} artistas</span>
          <span><Building2 /> {organizations.length} empresas</span>
          <button className="button button-primary" onClick={() => copyLink("personal")}>
            <Copy /> Copiar meu link
          </button>
        </div>
      </div>
      {error && <div className="calendar-alert">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      <div className="crm-toolbar commercial-catalog-toolbar">
        <label className="crm-search">
          <Search />
          <span className="sr-only">Buscar artista</span>
          <input
            value={query}
            placeholder="Buscar artista"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Filtrar empresa</span>
          <select
            value={organizationId}
            onChange={(event) => setOrganizationId(event.target.value)}
          >
            <option value="">Todas as empresas</option>
            {organizations.map((organization) => (
              <option value={organization.id} key={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {grouped.map((organization) => (
        <section className="commercial-company" key={organization.id}>
          <header>
            <div className="commercial-company-identity">
              <span className="commercial-company-logo">
                <ResilientImage
                  sources={[organization.logo]}
                  alt=""
                  fallback={organization.name[0]}
                />
              </span>
              <div>
                <p className="eyebrow">Empresa responsável</p>
                <h2>{organization.name}</h2>
              </div>
            </div>
            <div className="commercial-company-actions">
              <span className="count-badge">{organization.artists.length} artistas</span>
              <button className="button button-secondary" onClick={() => copyLink("organization", organization.artists[0])}>
                <Copy /> Copiar link desta empresa
              </button>
            </div>
          </header>
          <div className="commercial-artist-grid">
            {organization.artists.map((artist) => (
              <article className="commercial-artist-card" key={artist.artistId}>
                <div className="commercial-artist-media">
                  <ResilientImage
                    sources={artistImageSources(artist.coverUrl, artist.photoUrl)}
                    alt={artist.artistName}
                    fallback={<UserRound aria-hidden="true" />}
                  />
                </div>
                <div className="commercial-artist-body">
                  <p>{artist.genre || "Artista"}</p>
                  <h3>{artist.artistName}</h3>
                  <small>{artist.baseCity || organization.name}</small>
                  <div>
                    {Boolean(artist.isPublic && artist.artistSlug) && (
                      <a
                        className="button button-secondary"
                        href={`/catalogo/${artist.organizationSlug}/${artist.artistSlug}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Ver perfil
                      </a>
                    )}
                    <button
                      className="button button-primary"
                      onClick={() =>
                        onCreateNegotiation(artist.organizationId, artist.artistId)
                      }
                    >
                      <FilePlus2 /> Criar proposta comercial
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={!artist.isPublic || !artist.artistSlug}
                      title={!artist.isPublic ? "Publique o artista para compartilhar" : undefined}
                      onClick={() => copyLink("artist", artist)}
                    >
                      <Copy /> Copiar link
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {!grouped.length && !error && (
        <div className="public-empty">Nenhum artista autorizado encontrado.</div>
      )}
    </section>
  );
}
