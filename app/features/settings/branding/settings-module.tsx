"use client";

import { Building2, Palette } from "lucide-react";
import { useState } from "react";
import { BrandingSettings } from "./branding-settings";
import { CompanyProfileSettings } from "./company-profile-settings";
import type { OrganizationProfile } from "./types";

export function SettingsModule({
  organization,
  onOrganizationUpdated,
}: {
  organization: OrganizationProfile;
  onOrganizationUpdated: (organization: OrganizationProfile) => void;
}) {
  const [tab, setTab] = useState<"profile" | "branding">("profile");
  return (
    <section className="settings-module">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Configurações</p>
          <h1>Empresa</h1>
          <p>Gerencie o perfil e a identidade visual da organização ativa.</p>
        </div>
      </div>
      <div className="settings-tabs" role="tablist" aria-label="Configurações da empresa">
        <button
          role="tab"
          aria-selected={tab === "profile"}
          className={tab === "profile" ? "is-active" : ""}
          onClick={() => setTab("profile")}
        >
          <Building2 /> Perfil
        </button>
        {organization.role === "OWNER" && (
          <button
            role="tab"
            aria-selected={tab === "branding"}
            className={tab === "branding" ? "is-active" : ""}
            onClick={() => setTab("branding")}
          >
            <Palette /> Personalização
          </button>
        )}
      </div>
      {tab === "branding" && organization.role === "OWNER" ? (
        <BrandingSettings
          organization={organization}
          onUpdated={onOrganizationUpdated}
        />
      ) : (
        <CompanyProfileSettings
          organization={organization}
          onUpdated={onOrganizationUpdated}
        />
      )}
    </section>
  );
}
