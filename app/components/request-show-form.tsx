"use client";

import { CheckCircle2, Send, X } from "lucide-react";
import { useEffect, useState } from "react";

const initial = {
  name: "",
  companyName: "",
  phone: "",
  email: "",
  eventDate: "",
  city: "",
  state: "",
  venue: "",
  eventType: "",
  estimatedAudience: "",
  budget: "",
  notes: "",
  website: "",
};

export function RequestShowButton({
  organizationSlug,
  artistSlug,
  artistName,
  referralToken,
}: {
  organizationSlug: string;
  artistSlug: string;
  artistName: string;
  referralToken?: string;
}) {
  const [open, setOpen] = useState(false),
    [form, setForm] = useState(initial),
    [submittedAt, setSubmittedAt] = useState(0),
    [error, setError] = useState(""),
    [success, setSuccess] = useState(""),
    [sending, setSending] = useState(false);
  useEffect(() => {
    if (referralToken && /^[A-Za-z0-9_-]{30,200}$/.test(referralToken))
      void fetch(`/api/public/referrals/${encodeURIComponent(referralToken)}`, {
        method: "POST",
      });
  }, [referralToken]);
  function show() {
    setOpen(true);
    setSubmittedAt(Date.now());
    setError("");
    setSuccess("");
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSending(true);
    setError("");
    const response = await fetch(
        `/api/public/catalog/${organizationSlug}/${artistSlug}/requests`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...form, submittedAt, referralToken }),
        },
      ),
      data = (await response.json()) as { error?: string; message?: string };
    setSending(false);
    if (!response.ok) {
      setError(data.error || "Não foi possível enviar sua solicitação.");
      return;
    }
    setSuccess(data.message || "Solicitação enviada.");
    setForm(initial);
  }
  const field = (
    key: keyof typeof initial,
    label: string,
    required = false,
    type = "text",
    placeholder = "",
  ) => (
    <label>
      {label}
      {required && " *"}
      <input
        required={required}
        type={type}
        value={form[key]}
        placeholder={placeholder}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      />
    </label>
  );
  return (
    <>
      <button className="button public-cta" onClick={show}>
        Solicitar show <Send />
      </button>
      {open && (
        <div className="public-request-backdrop">
          <section
            className="public-request-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="request-title"
          >
            <header>
              <div>
                <p className="eyebrow">Solicitar show</p>
                <h2 id="request-title">Leve {artistName} ao seu evento</h2>
                <p>
                  Conte os detalhes e a equipe comercial entrará em contato.
                </p>
              </div>
              <button aria-label="Fechar" onClick={() => setOpen(false)}>
                <X />
              </button>
            </header>
            {success ? (
              <div className="request-success">
                <CheckCircle2 />
                <h3>Solicitação recebida</h3>
                <p>{success}</p>
                <button
                  className="button button-primary"
                  onClick={() => setOpen(false)}
                >
                  Concluir
                </button>
              </div>
            ) : (
              <form onSubmit={submit}>
                <input
                  className="request-honeypot"
                  tabIndex={-1}
                  autoComplete="off"
                  aria-hidden="true"
                  value={form.website}
                  onChange={(event) =>
                    setForm({ ...form, website: event.target.value })
                  }
                />
                <div className="request-form-grid">
                  {field("name", "Nome", true)}
                  {field("companyName", "Empresa")}
                  {field("phone", "WhatsApp", true, "tel", "(11) 99999-9999")}
                  {field("email", "E-mail", true, "email", "voce@empresa.com")}
                  {field("eventDate", "Data do evento", true, "date")}
                  {field("city", "Cidade", true)}
                  {field("state", "Estado", true, "text", "UF")}
                  {field("venue", "Local")}
                  {field("eventType", "Tipo de evento", true)}
                  {field(
                    "estimatedAudience",
                    "Público estimado",
                    false,
                    "number",
                  )}
                  {field("budget", "Orçamento opcional")}
                </div>
                <label>
                  Artista
                  <input value={artistName} disabled />
                </label>
                <label>
                  Observações
                  <textarea
                    value={form.notes}
                    maxLength={2000}
                    onChange={(event) =>
                      setForm({ ...form, notes: event.target.value })
                    }
                    placeholder="Conte mais sobre o evento, formato desejado e necessidades especiais."
                  />
                </label>
                {error && <div className="calendar-alert">{error}</div>}
                <footer>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setOpen(false)}
                  >
                    Cancelar
                  </button>
                  <button className="button button-primary" disabled={sending}>
                    {sending ? "Enviando…" : "Enviar solicitação"}
                    <Send />
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  );
}
