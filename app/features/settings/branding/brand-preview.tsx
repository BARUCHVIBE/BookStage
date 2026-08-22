"use client";

import type { CSSProperties } from "react";
import { useState } from "react";
import {
  BRANDING_FONT_STACKS,
  readableForeground,
  type OrganizationBranding,
} from "@/app/lib/organization-branding";

export function BrandPreview({
  companyName,
  branding,
  logoUrl,
}: {
  companyName: string;
  branding: OrganizationBranding;
  logoUrl: string | null;
}) {
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light");
  const valid = (color: string, fallback: string) =>
      /^#[0-9a-f]{6}$/i.test(color) ? color : fallback,
    primary = valid(branding.primaryColor, "#111827"),
    accent = valid(branding.accentColor, "#E2B002"),
    background = valid(branding.backgroundColor, "#F8F8F8"),
    style = {
      "--preview-primary": primary,
      "--preview-primary-foreground": readableForeground(primary),
      "--preview-accent": accent,
      "--preview-accent-foreground": readableForeground(accent),
      "--preview-brand-background": background,
      "--preview-brand-background-foreground": readableForeground(background),
      "--preview-heading-font": BRANDING_FONT_STACKS[branding.headingFont],
      "--preview-body-font": BRANDING_FONT_STACKS[branding.bodyFont],
    } as CSSProperties;
  return (
    <aside className="brand-preview" style={style} aria-label="Prévia do tema">
      <div className="brand-preview-heading">
        <p className="eyebrow">Preview</p>
        <div className="brand-preview-toggle" aria-label="Tema da prévia">
          {(["light", "dark"] as const).map((theme) => (
            <button
              type="button"
              key={theme}
              className={previewTheme === theme ? "is-active" : ""}
              aria-pressed={previewTheme === theme}
              onClick={() => setPreviewTheme(theme)}
            >
              {theme === "light" ? "Light" : "Dark"}
            </button>
          ))}
        </div>
      </div>
      <div className="brand-preview-window" data-preview-theme={previewTheme}>
        <div className="brand-preview-sidebar">
          <div>
            {logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- unsaved local preview uses a blob URL.
              <img src={logoUrl} alt="" />
            ) : (
              <span>{companyName.slice(0, 1)}</span>
            )}
            <b>{companyName}</b>
          </div>
          <nav>
            <span className="is-active">Dashboard</span>
            <span>Artistas</span>
            <span>Agenda</span>
          </nav>
        </div>
        <div className="brand-preview-content">
          <small>Visão geral</small>
          <h3>Operação comercial</h3>
          <div className="brand-preview-card">
            <span>Oportunidades abertas</span>
            <strong>24</strong>
          </div>
          <button>Nova oportunidade</button>
        </div>
      </div>
    </aside>
  );
}
