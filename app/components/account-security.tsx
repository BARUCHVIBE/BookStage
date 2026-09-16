"use client";

import { KeyRound, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { fetchJson } from "@/app/lib/http-client";
import { passwordPolicyError } from "@/app/lib/password-policy";

export function AccountSecurity({ email }: { email: string }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (newPassword !== confirmation) {
      setError("A confirmação não corresponde à nova senha.");
      return;
    }
    const policyError = passwordPolicyError(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }
    setSaving(true);
    const result = await fetchJson<{ ok?: boolean }>(
      "/api/auth/change-password",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      },
    );
    setSaving(false);
    if (!result.ok) {
      setError(result.error || "Não foi possível alterar a senha.");
      return;
    }
    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
    setMessage("Senha alterada. As outras sessões foram encerradas.");
  }

  return (
    <section className="account-security">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Minha conta</p>
          <h1>Segurança</h1>
          <p>Gerencie suas credenciais pessoais de acesso ao BookBusiness.</p>
        </div>
      </div>
      <div className="account-security-card">
        <div className="settings-section-heading">
          <div>
            <p className="eyebrow">Acesso</p>
            <h2>Alterar senha</h2>
            <p>{email}</p>
          </div>
          <span className="account-security-icon" aria-hidden="true">
            <ShieldCheck />
          </span>
        </div>
        {error && <div className="login-error" role="alert">{error}</div>}
        {message && <div className="notice success" role="status">{message}</div>}
        <form onSubmit={submit} className="account-password-form">
          <label>
            Senha atual
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Nova senha
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              required
            />
          </label>
          <label>
            Confirmar nova senha
            <input
              type="password"
              autoComplete="new-password"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              required
            />
          </label>
          <p className="field-help">
            Use no mínimo 12 caracteres, com letras maiúsculas, minúsculas e número.
          </p>
          <button className="button button-primary" disabled={saving}>
            <KeyRound size={16} />
            {saving ? "Alterando…" : "Alterar senha"}
          </button>
        </form>
      </div>
    </section>
  );
}
