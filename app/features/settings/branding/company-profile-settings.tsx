"use client";

import { Save } from "lucide-react";
import { useState } from "react";
import type { OrganizationProfile } from "./types";

export function CompanyProfileSettings({
  organization,
  onUpdated,
}: {
  organization: OrganizationProfile;
  onUpdated: (organization: OrganizationProfile) => void;
}) {
  const [form, setForm] = useState({
      name: organization.name,
      email: organization.email,
      phone: organization.phone ?? "",
      document: organization.document ?? "",
      website: organization.website ?? "",
      instagram: organization.instagram ?? "",
      description: organization.description ?? "",
    }),
    [message, setMessage] = useState("");
  async function save(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch(`/api/organizations/${organization.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, logo: organization.logo ?? null }),
      }),
      data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error || "Não foi possível salvar o perfil.");
      return;
    }
    onUpdated({ ...organization, ...form });
    setMessage("Perfil da empresa atualizado.");
  }
  return (
    <form className="company-profile-settings" onSubmit={save}>
      <div className="settings-section-heading">
        <div>
          <p className="eyebrow">Dados institucionais</p>
          <h2>Perfil da empresa</h2>
          <p>Informações operacionais e públicas da organização ativa.</p>
        </div>
      </div>
      {message && (
        <div className={message.includes("atualizado") ? "notice" : "calendar-alert"}>
          {message}
        </div>
      )}
      <div className="form-row">
        <label>
          Nome da empresa *
          <input
            required
            value={form.name}
            onChange={(event) => setForm({ ...form, name: event.target.value })}
          />
        </label>
        <label>
          E-mail *
          <input
            required
            type="email"
            value={form.email}
            onChange={(event) => setForm({ ...form, email: event.target.value })}
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Telefone
          <input
            value={form.phone}
            onChange={(event) => setForm({ ...form, phone: event.target.value })}
          />
        </label>
        <label>
          Documento/CNPJ
          <input
            value={form.document}
            onChange={(event) =>
              setForm({ ...form, document: event.target.value })
            }
          />
        </label>
      </div>
      <div className="form-row">
        <label>
          Site
          <input
            type="url"
            value={form.website}
            onChange={(event) =>
              setForm({ ...form, website: event.target.value })
            }
          />
        </label>
        <label>
          Instagram
          <input
            value={form.instagram}
            onChange={(event) =>
              setForm({ ...form, instagram: event.target.value })
            }
          />
        </label>
      </div>
      <label>
        Descrição
        <textarea
          value={form.description}
          maxLength={4000}
          onChange={(event) =>
            setForm({ ...form, description: event.target.value })
          }
        />
      </label>
      <div className="settings-save-bar">
        <span>Slug público: /catalogo/{organization.slug}</span>
        <button className="button button-primary">
          <Save />
          Salvar perfil
        </button>
      </div>
    </form>
  );
}
