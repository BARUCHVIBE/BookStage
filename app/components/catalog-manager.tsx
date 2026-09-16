"use client";

/* eslint-disable jsx-a11y/label-has-associated-control -- os controles são aninhados visualmente em labels gerados pelo editor. */

import { Save } from "lucide-react";
import { useEffect, useState } from "react";
import { AssetUploader } from "@/app/features/settings/branding/asset-uploader";
import {
  ARTIST_ASSET_LIMITS,
  artistAssetHint,
  type ArtistAssetKind,
} from "@/app/lib/artist-assets";
import { fetchJson } from "@/app/lib/http-client";

type Organization = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  document?: string;
  website?: string;
  instagram?: string;
  logo?: string;
  description?: string;
  role: string;
};
type Artist = { id: string; name: string };
type ArtistFields = {
  name: string;
  slug: string;
  photoUrl: string;
  coverUrl: string;
  genre: string;
  description: string;
  baseCity: string;
  showFormats: string;
  videoUrls: string;
  instagram: string;
  spotify: string;
  youtube: string;
  publicMaterials: string;
  isPublic: boolean;
};
const emptyArtist: ArtistFields = {
  name: "",
  slug: "",
  photoUrl: "",
  coverUrl: "",
  genre: "",
  description: "",
  baseCity: "",
  showFormats: "",
  videoUrls: "",
  instagram: "",
  spotify: "",
  youtube: "",
  publicMaterials: "",
  isPublic: false,
};

export function CatalogManager({
  organization,
  artists,
  canManage,
}: {
  organization: Organization;
  artists: Artist[];
  canManage: boolean;
}) {
  const [selectedId, setSelectedId] = useState(artists[0]?.id || ""),
    [form, setForm] = useState(emptyArtist),
    [photoFile, setPhotoFile] = useState<File | null>(null),
    [coverFile, setCoverFile] = useState<File | null>(null),
    [description, setDescription] = useState(organization.description || ""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let active = true;
    if (!selectedId) return;
    fetchJson<{
            artist?: Partial<ArtistFields> & { name: string };
            error?: string;
          }>(`/api/artists/${selectedId}`)
      .then((result) => {
        if (!active) return;
        if (!result.ok || !result.data?.artist) {
          setNotice(result.error || "Não foi possível carregar o artista.");
          return;
        }
        const artist = result.data.artist;
        setForm({
          name: artist.name,
          slug: artist.slug || "",
          photoUrl: artist.photoUrl || "",
          coverUrl: artist.coverUrl || "",
          genre: artist.genre || "",
          description: artist.description || "",
          baseCity: artist.baseCity || "",
          showFormats: artist.showFormats || "",
          videoUrls: artist.videoUrls || "",
          instagram: artist.instagram || "",
          spotify: artist.spotify || "",
          youtube: artist.youtube || "",
          publicMaterials: artist.publicMaterials || "",
          isPublic: Boolean(artist.isPublic),
        });
        setPhotoFile(null);
        setCoverFile(null);
        setNotice("");
      });
    return () => {
      active = false;
    };
  }, [selectedId]);
  async function uploadAsset(kind: ArtistAssetKind, asset: File) {
    const data = new FormData();
    data.set("kind", kind);
    data.set("asset", asset);
    const result = await fetchJson<{ url?: string; error?: string }>(`/api/artists/${selectedId}/assets`, {
        method: "POST",
        body: data,
      });
    if (!result.ok || !result.data?.url)
      throw new Error(result.error || "Não foi possível enviar a imagem.");
    return result.data.url;
  }
  async function saveArtist(event: React.FormEvent) {
    event.preventDefault();
    let nextForm = { ...form };
    try {
      if (photoFile)
        nextForm.photoUrl = await uploadAsset("photo", photoFile);
      if (coverFile)
        nextForm.coverUrl = await uploadAsset("cover", coverFile);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : "Não foi possível enviar a imagem.",
      );
      return;
    }
    const result = await fetchJson<{ error?: string; slug?: string }>(`/api/artists/${selectedId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(nextForm),
      });
    if (!result.ok) {
      setNotice(result.error || "Não foi possível salvar o catálogo.");
      return;
    }
    nextForm = { ...nextForm, slug: result.data?.slug || nextForm.slug };
    setForm(nextForm);
    setPhotoFile(null);
    setCoverFile(null);
    setNotice("Dados públicos do artista atualizados.");
  }
  async function saveOrganizationDescription() {
    const result = await fetchJson(`/api/organizations/${organization.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...organization, description }),
    });
    setNotice(
      result.ok
        ? "Apresentação da organização atualizada."
        : "Não foi possível atualizar a apresentação.",
    );
  }
  const field = (
    key: Exclude<keyof ArtistFields, "isPublic">,
    label: string,
    placeholder = "",
    hint?: string,
  ) => (
    <label>
      {label}
      {hint && <small className="image-field-hint">{hint}</small>}
      <input
        disabled={!canManage}
        value={form[key]}
        placeholder={placeholder}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      />
    </label>
  );
  return (
    <section className="catalog-manager">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Booking</p>
          <h1>Vitrine comercial</h1>
          <p>Controle somente as informações autorizadas para visitantes.</p>
        </div>
        <a
          className="button button-secondary"
          href={`/catalogo/${organization.slug}`}
          target="_blank"
          rel="noreferrer"
        >
          Abrir catálogo público
        </a>
      </div>
      {notice && <div className="notice">{notice}</div>}
      <section className="catalog-settings-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Organização</p>
            <h2>Apresentação do catálogo</h2>
          </div>
          {canManage && (
            <button
              className="button button-secondary"
              onClick={saveOrganizationDescription}
            >
              Salvar apresentação
            </button>
          )}
        </div>
        <label>
          Descrição pública
          <textarea
            disabled={!canManage}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Apresente o escritório, label ou agência ao mercado."
          />
        </label>
        <small className="catalog-url">
          URL pública: /catalogo/{organization.slug}
        </small>
      </section>
      <section className="catalog-settings-card">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Artistas</p>
            <h2>Informações públicas</h2>
          </div>
          <label className="catalog-artist-picker">
            Artista
            <select
              value={selectedId}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              {artists.map((artist) => (
                <option value={artist.id} key={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        {artists.length ? (
          <form onSubmit={saveArtist}>
            <label className="publish-toggle">
              <input
                type="checkbox"
                disabled={!canManage}
                checked={form.isPublic}
                onChange={(event) =>
                  setForm({ ...form, isPublic: event.target.checked })
                }
              />
              <span>
                <b>Publicar este artista</b>
                <small>
                  Somente artistas ativos e publicados aparecem no catálogo.
                </small>
              </span>
            </label>
            <div className="branding-assets-grid">
              <AssetUploader
                key={`${selectedId}:photo:${form.photoUrl}`}
                label="Foto do artista"
                value={form.photoUrl || null}
                hint={artistAssetHint("photo")}
                maxBytes={ARTIST_ASSET_LIMITS.photo}
                onChange={setPhotoFile}
                onValidationError={setNotice}
              />
              <AssetUploader
                key={`${selectedId}:cover:${form.coverUrl}`}
                label="Capa do artista"
                value={form.coverUrl || null}
                hint={artistAssetHint("cover")}
                maxBytes={ARTIST_ASSET_LIMITS.cover}
                onChange={setCoverFile}
                onValidationError={setNotice}
              />
            </div>
            <div className="catalog-form-grid">
              {field("name", "Nome artístico *")}
              {field("slug", "URL do artista", "artista-x")}
              {field("genre", "Gênero musical")}
              {field("baseCity", "Cidade-base")}
              {field(
                "photoUrl",
                "URL da foto",
                "Link HTTPS ou anexo do Discord",
                artistAssetHint("photo"),
              )}
              {field(
                "coverUrl",
                "URL da capa",
                "Link HTTPS ou anexo do Discord",
                artistAssetHint("cover"),
              )}
              {field("instagram", "Instagram")}
              {field("spotify", "Spotify")}
              {field("youtube", "YouTube")}
            </div>
            <label>
              Descrição pública
              <textarea
                disabled={!canManage}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
              />
            </label>
            <div className="catalog-form-grid public-list-fields">
              <label>
                Formatos de show <small>Um por linha</small>
                <textarea
                  disabled={!canManage}
                  value={form.showFormats}
                  onChange={(event) =>
                    setForm({ ...form, showFormats: event.target.value })
                  }
                />
              </label>
              <label>
                Vídeos públicos <small>Uma URL por linha</small>
                <textarea
                  disabled={!canManage}
                  value={form.videoUrls}
                  onChange={(event) =>
                    setForm({ ...form, videoUrls: event.target.value })
                  }
                />
              </label>
              <label>
                Materiais públicos <small>Uma URL por linha</small>
                <textarea
                  disabled={!canManage}
                  value={form.publicMaterials}
                  onChange={(event) =>
                    setForm({ ...form, publicMaterials: event.target.value })
                  }
                />
              </label>
            </div>
            <div className="catalog-manager-actions">
              {form.isPublic && form.slug && (
                <a
                  href={`/catalogo/${organization.slug}/${form.slug}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Visualizar página pública
                </a>
              )}
              {canManage && (
                <button className="button button-primary">
                  <Save size={16} />
                  Salvar artista
                </button>
              )}
            </div>
          </form>
        ) : (
          <div className="public-empty">
            Cadastre um artista antes de configurar o catálogo.
          </div>
        )}
      </section>
    </section>
  );
}
