"use client";

import { AlertTriangle, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_BOOKSTAGE_THEME,
  contrastRatio,
  readableForeground,
  type OrganizationBranding,
} from "@/app/lib/organization-branding";
import {
  BRANDING_ASSET_LIMITS,
  type BrandingAssetKind,
} from "@/app/lib/branding-assets";
import { AssetUploader } from "./asset-uploader";
import { BrandPreview } from "./brand-preview";
import { ColorSelector } from "./color-selector";
import { FontSelector } from "./font-selector";
import type { OrganizationProfile } from "./types";

type AssetKind = BrandingAssetKind;

async function responseData(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json"))
    return (await response.json()) as { url?: string; error?: string };
  const detail = (await response.text()).trim();
  return {
    error:
      response.status === 413
        ? "A imagem excede o limite aceito pelo servidor. Comprima o arquivo e tente novamente."
        : detail || "O servidor devolveu uma resposta inválida.",
  };
}

export function BrandingSettings({
  organization,
  onUpdated,
}: {
  organization: OrganizationProfile;
  onUpdated: (organization: OrganizationProfile) => void;
}) {
  const [draft, setDraft] = useState<OrganizationBranding>(
      DEFAULT_BOOKSTAGE_THEME,
    ),
    [files, setFiles] = useState<Partial<Record<AssetKind, File>>>({}),
    [logoPreview, setLogoPreview] = useState<string | null>(
      organization.logo ?? null,
    ),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    fetch("/api/organization-branding")
      .then(
        (response) =>
          response.json() as Promise<{
            branding?: OrganizationBranding;
            error?: string;
          }>,
      )
      .then((data) => {
        if (!active) return;
        if (data.branding) {
          setDraft(data.branding);
          setLogoPreview(data.branding.logoUrl);
        } else setMessage(data.error || "Não foi possível carregar o tema.");
        setLoading(false);
      });
    return () => void (active = false);
  }, [organization.id]);
  const warnings = useMemo(() => {
    const items: string[] = [];
    for (const [label, color, comparison] of [
      ["cor primária", draft.primaryColor, draft.backgroundColor],
      ["cor secundária", draft.secondaryColor, draft.backgroundColor],
      ["cor de destaque", draft.accentColor, draft.backgroundColor],
    ] as const) {
      if (
        !/^#[0-9a-f]{6}$/i.test(color) ||
        !/^#[0-9a-f]{6}$/i.test(comparison)
      )
        continue;
      if (contrastRatio(color, comparison) < 3)
        items.push(`A ${label} está muito próxima da cor de fundo.`);
      const foreground = readableForeground(color);
      if (contrastRatio(color, foreground) < 4.5)
        items.push(`A ${label} pode dificultar a leitura de textos menores.`);
    }
    return items;
  }, [draft]);
  function update<K extends keyof OrganizationBranding>(
    key: K,
    value: OrganizationBranding[K],
  ) {
    setDraft((current) => ({ ...current, [key]: value }));
    setMessage("");
  }
  function setAsset(kind: AssetKind, file: File | null) {
    setFiles((current) => {
      const next = { ...current };
      if (file) next[kind] = file;
      else delete next[kind];
      return next;
    });
  }
  async function upload(kind: AssetKind, file: File) {
    const form = new FormData();
    form.set("kind", kind);
    form.set("asset", file);
    const response = await fetch("/api/organization-branding/assets", {
        method: "POST",
        body: form,
      }),
      data = await responseData(response);
    if (!response.ok || !data.url)
      throw new Error(data.error || "Não foi possível enviar a imagem.");
    return data.url;
  }
  async function save() {
    if (saving) return;
    setSaving(true);
    setMessage("");
    try {
      const next = { ...draft };
      await Promise.all(
        (Object.entries(files) as Array<[AssetKind, File]>).map(
          async ([kind, file]) => {
            const url = await upload(kind, file);
            if (kind === "logo") next.logoUrl = url;
            else if (kind === "favicon") next.faviconUrl = url;
            else next.catalogCoverUrl = url;
          },
        ),
      );
      const response = await fetch("/api/organization-branding", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(next),
        }),
        data = (await response.json()) as {
          branding?: OrganizationBranding;
          error?: string;
        };
      if (!response.ok || !data.branding)
        throw new Error(data.error || "Não foi possível salvar o tema.");
      setDraft(data.branding);
      setLogoPreview(data.branding.logoUrl);
      setFiles({});
      setMessage("Identidade visual salva com sucesso.");
      onUpdated({ ...organization, logo: data.branding.logoUrl });
      window.dispatchEvent(new Event("bookstage:branding-updated"));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Não foi possível salvar.",
      );
    } finally {
      setSaving(false);
    }
  }
  if (loading)
    return <div className="settings-loading">Carregando identidade visual…</div>;
  return (
    <div className="branding-settings-layout">
      <section className="branding-settings-form">
        <div className="settings-section-heading">
          <div>
            <p className="eyebrow">Identidade visual</p>
            <h2>Personalização da empresa</h2>
            <p>Use cores e arquivos controlados para preservar a legibilidade.</p>
          </div>
        </div>
        {message && (
          <div className={message.includes("sucesso") ? "notice" : "calendar-alert"}>
            {message}
          </div>
        )}
        <div className="branding-assets-grid">
          <AssetUploader
            key={draft.logoUrl ?? "logo"}
            label="Logo da empresa"
            value={draft.logoUrl}
            hint="PNG, JPG ou WebP · até 2 MB"
            maxBytes={BRANDING_ASSET_LIMITS.logo}
            onValidationError={setMessage}
            onChange={(file) => setAsset("logo", file)}
            onPreview={setLogoPreview}
          />
          <AssetUploader
            key={draft.faviconUrl ?? "favicon"}
            compact
            label="Favicon"
            value={draft.faviconUrl}
            hint="Imagem quadrada · até 2 MB"
            maxBytes={BRANDING_ASSET_LIMITS.favicon}
            onValidationError={setMessage}
            onChange={(file) => setAsset("favicon", file)}
          />
        </div>
        <div className="branding-color-grid">
          <ColorSelector
            label="Cor primária"
            value={draft.primaryColor}
            onChange={(value) => update("primaryColor", value)}
          />
          <ColorSelector
            label="Cor secundária"
            value={draft.secondaryColor}
            onChange={(value) => update("secondaryColor", value)}
          />
          <ColorSelector
            label="Cor de destaque"
            value={draft.accentColor}
            onChange={(value) => update("accentColor", value)}
          />
          <ColorSelector
            label="Cor de fundo"
            value={draft.backgroundColor}
            onChange={(value) => update("backgroundColor", value)}
          />
        </div>
        {warnings.length > 0 && (
          <div className="branding-contrast-warning" role="status">
            <AlertTriangle />
            <div>
              {warnings.map((warning) => (
                <p key={warning}>{warning}</p>
              ))}
            </div>
          </div>
        )}
        <div className="form-row">
          <FontSelector
            label="Fonte dos títulos"
            value={draft.headingFont}
            onChange={(value) => update("headingFont", value)}
          />
          <FontSelector
            label="Fonte dos textos"
            value={draft.bodyFont}
            onChange={(value) => update("bodyFont", value)}
          />
        </div>
        <div className="catalog-branding-fields">
          <h3>Catálogo público</h3>
          <AssetUploader
            key={draft.catalogCoverUrl ?? "catalog-cover"}
            label="Imagem de capa"
            value={draft.catalogCoverUrl}
            hint="Proporção horizontal · até 5 MB"
            maxBytes={BRANDING_ASSET_LIMITS["catalog-cover"]}
            onValidationError={setMessage}
            onChange={(file) => setAsset("catalog-cover", file)}
          />
          <label>
            Título do catálogo
            <input
              value={draft.catalogTitle ?? ""}
              maxLength={120}
              onChange={(event) => update("catalogTitle", event.target.value)}
              placeholder="Nossa programação"
            />
          </label>
          <label>
            Descrição curta
            <textarea
              value={draft.catalogDescription ?? ""}
              maxLength={500}
              onChange={(event) =>
                update("catalogDescription", event.target.value)
              }
              placeholder="Apresente brevemente o catálogo da sua empresa."
            />
          </label>
        </div>
        <div className="settings-save-bar">
          <span>As alterações só serão aplicadas depois de salvar.</span>
          <button
            className="button button-primary"
            onClick={save}
            disabled={saving}
          >
            <Save />
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </div>
      </section>
      <BrandPreview
        companyName={organization.name}
        branding={draft}
        logoUrl={logoPreview}
      />
    </div>
  );
}
