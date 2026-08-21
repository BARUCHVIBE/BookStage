"use client";
/* eslint-disable react-hooks/set-state-in-effect -- initial API load is intentionally triggered on mount */

import {
  Check,
  CopyPlus,
  Download,
  FileText,
  Plus,
  Send,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Status = "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
type Summary = {
  id: string;
  proposalNumber: string;
  value: number;
  validityDate: string;
  status: Status;
  createdAt: string;
  createdByName: string;
};
type Proposal = {
  id: string;
  proposal_number: string;
  value: number;
  payment_terms: string;
  transportation_terms: string | null;
  accommodation_terms: string | null;
  technical_terms: string | null;
  additional_terms: string | null;
  validity_date: string;
  status: Status;
  created_at: string;
  artistName: string;
  customerName: string;
  companyName: string | null;
  eventDate: string;
  city: string;
  state: string;
  venue: string | null;
  eventType: string;
  organizationName: string;
  organizationEmail: string;
  organizationPhone: string | null;
};

const labels: Record<Status, string> = {
  DRAFT: "Rascunho",
  SENT: "Enviada",
  ACCEPTED: "Aceita",
  REJECTED: "Recusada",
  EXPIRED: "Expirada",
};
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
const date = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");
const empty = {
  value: "",
  paymentTerms: "",
  transportationTerms: "",
  accommodationTerms: "",
  technicalTerms: "",
  additionalTerms: "",
  validityDate: "",
};

export function OpportunityProposals({
  opportunityId,
  refreshOpportunity,
  readOnly = false,
}: {
  opportunityId: string;
  refreshOpportunity: () => Promise<void>;
  readOnly?: boolean;
}) {
  const [items, setItems] = useState<Summary[]>([]),
    [selected, setSelected] = useState<Proposal | null>(null);
  const [form, setForm] = useState(empty),
    [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  const load = useCallback(async () => {
    const response = await fetch(
        `/api/opportunities/${opportunityId}/proposals`,
      ),
      data = (await response.json()) as {
        proposals?: Summary[];
        error?: string;
      };
    if (response.ok) setItems(data.proposals || []);
    else setMessage(data.error || "Não foi possível carregar as propostas.");
  }, [opportunityId]);
  useEffect(() => {
    load();
  }, [load]);
  async function open(id: string) {
    const response = await fetch(`/api/proposals/${id}`),
      data = (await response.json()) as { proposal?: Proposal; error?: string };
    if (!response.ok || !data.proposal) {
      setMessage(data.error || "Proposta não encontrada.");
      return;
    }
    setSelected(data.proposal);
    setCreating(false);
    setMessage("");
    setForm({
      value: String(data.proposal.value / 100),
      paymentTerms: data.proposal.payment_terms,
      transportationTerms: data.proposal.transportation_terms || "",
      accommodationTerms: data.proposal.accommodation_terms || "",
      technicalTerms: data.proposal.technical_terms || "",
      additionalTerms: data.proposal.additional_terms || "",
      validityDate: data.proposal.validity_date,
    });
  }
  function payload() {
    return { ...form, value: Math.round(Number(form.value) * 100) };
  }
  async function create(sourceProposalId?: string) {
    setBusy(true);
    setMessage("");
    const response = await fetch(
        `/api/opportunities/${opportunityId}/proposals`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(
            sourceProposalId ? { sourceProposalId } : payload(),
          ),
        },
      ),
      data = (await response.json()) as { id?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.id) {
      setMessage(data.error || "Não foi possível criar a proposta.");
      return;
    }
    setCreating(false);
    await load();
    await open(data.id);
    await refreshOpportunity();
  }
  async function save() {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/proposals/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload()),
      }),
      data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Não foi possível salvar.");
      return;
    }
    setMessage("Rascunho atualizado.");
    await load();
    await open(selected.id);
  }
  async function changeStatus(status: Exclude<Status, "DRAFT">) {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    const response = await fetch(`/api/proposals/${selected.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      }),
      data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Não foi possível atualizar o status.");
      return;
    }
    await load();
    await open(selected.id);
    await refreshOpportunity();
  }
  const input = (key: keyof typeof empty, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  return (
    <section className="proposal-workspace" id="opportunity-proposals">
      <div className="proposal-section-head">
        <div>
          <p className="eyebrow">Propostas comerciais</p>
          <h2>Condições e versões</h2>
          <p>Cada versão é preservada como um registro independente.</p>
        </div>
        {!readOnly && (
          <button
            data-create-proposal
            className="button button-primary"
            onClick={() => {
              setSelected(null);
              setForm(empty);
              setCreating(true);
              setMessage("");
            }}
          >
            <Plus />
            Criar proposta
          </button>
        )}
      </div>
      {message && (
        <div
          className={
            message.includes("atualizado") ? "notice" : "calendar-alert"
          }
        >
          {message}
        </div>
      )}
      <div className="proposal-layout">
        <aside className="proposal-list">
          <h3>Histórico de versões</h3>
          {items.map((item) => (
            <button
              key={item.id}
              className={selected?.id === item.id ? "active" : ""}
              onClick={() => open(item.id)}
            >
              <FileText />
              <span>
                <b>{item.proposalNumber}</b>
                <small>
                  {money(item.value)} · válida até {date(item.validityDate)}
                </small>
              </span>
              <em
                className={`proposal-status status-${item.status.toLowerCase()}`}
              >
                {labels[item.status]}
              </em>
            </button>
          ))}
          {!items.length && <p>Nenhuma proposta criada.</p>}
        </aside>
        <div className="proposal-main">
          {creating && (
            <ProposalForm
              title="Nova proposta"
              form={form}
              input={input}
              busy={busy}
              cancel={() => setCreating(false)}
              submit={() => create()}
            />
          )}
          {selected && (
            <>
              <div className="proposal-actions">
                {!readOnly && (
                  <button
                    className="button button-secondary"
                    onClick={() => create(selected.id)}
                    disabled={busy}
                  >
                    <CopyPlus />
                    Nova versão
                  </button>
                )}
                <a
                  className="button button-secondary"
                  href={`/api/proposals/${selected.id}/pdf`}
                >
                  <Download />
                  Baixar PDF
                </a>
                {!readOnly && selected.status === "DRAFT" && (
                  <button
                    className="button button-primary"
                    onClick={() => changeStatus("SENT")}
                    disabled={busy}
                  >
                    <Send />
                    Marcar enviada
                  </button>
                )}
                {!readOnly && selected.status === "SENT" && (
                  <>
                    <button
                      className="button button-primary"
                      onClick={() => changeStatus("ACCEPTED")}
                      disabled={busy}
                    >
                      <Check />
                      Aceitar
                    </button>
                    <button
                      className="button button-secondary proposal-reject"
                      onClick={() => changeStatus("REJECTED")}
                      disabled={busy}
                    >
                      <X />
                      Recusar
                    </button>
                    <button
                      className="button button-secondary"
                      onClick={() => changeStatus("EXPIRED")}
                      disabled={busy}
                    >
                      Expirar
                    </button>
                  </>
                )}
              </div>
              {!readOnly && selected.status === "DRAFT" && (
                <ProposalForm
                  title={`Editar ${selected.proposal_number}`}
                  form={form}
                  input={input}
                  busy={busy}
                  cancel={null}
                  submit={save}
                />
              )}
              <ProposalPreview proposal={selected} />
            </>
          )}
          {!creating && !selected && (
            <div className="proposal-empty">
              <FileText />
              <h3>Selecione uma proposta</h3>
              <p>
                Consulte uma versão existente ou crie a primeira proposta desta
                oportunidade.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function ProposalForm({
  title,
  form,
  input,
  busy,
  cancel,
  submit,
}: {
  title: string;
  form: typeof empty;
  input: (key: keyof typeof empty, value: string) => void;
  busy: boolean;
  cancel: (() => void) | null;
  submit: () => void;
}) {
  return (
    <form
      className="proposal-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="section-heading">
        <div>
          <p className="eyebrow">Condições comerciais</p>
          <h3>{title}</h3>
        </div>
      </div>
      <div className="form-row">
        <label>
          Valor (R$)
          <input
            required
            min="0"
            step="0.01"
            type="number"
            value={form.value}
            onChange={(event) => input("value", event.target.value)}
          />
        </label>
        <label>
          Validade
          <input
            required
            type="date"
            value={form.validityDate}
            onChange={(event) => input("validityDate", event.target.value)}
          />
        </label>
      </div>
      <label>
        Condições de pagamento
        <textarea
          required
          rows={3}
          value={form.paymentTerms}
          onChange={(event) => input("paymentTerms", event.target.value)}
        />
      </label>
      <div className="form-row">
        <label>
          Transporte
          <textarea
            rows={3}
            value={form.transportationTerms}
            onChange={(event) =>
              input("transportationTerms", event.target.value)
            }
          />
        </label>
        <label>
          Hospedagem
          <textarea
            rows={3}
            value={form.accommodationTerms}
            onChange={(event) =>
              input("accommodationTerms", event.target.value)
            }
          />
        </label>
      </div>
      <label>
        Condições técnicas
        <textarea
          rows={3}
          value={form.technicalTerms}
          onChange={(event) => input("technicalTerms", event.target.value)}
        />
      </label>
      <label>
        Condições adicionais
        <textarea
          rows={3}
          value={form.additionalTerms}
          onChange={(event) => input("additionalTerms", event.target.value)}
        />
      </label>
      <div className="form-actions">
        {cancel && (
          <button
            type="button"
            className="button button-secondary"
            onClick={cancel}
          >
            Cancelar
          </button>
        )}
        <button className="button button-primary" disabled={busy}>
          {busy ? "Salvando..." : "Salvar rascunho"}
        </button>
      </div>
    </form>
  );
}

function ProposalPreview({ proposal }: { proposal: Proposal }) {
  return (
    <article className="proposal-preview">
      <header>
        <div>
          <span /> <h3>{proposal.organizationName}</h3>
        </div>
        <div>
          <small>PROPOSTA COMERCIAL</small>
          <b>{proposal.proposal_number}</b>
        </div>
      </header>
      <div className="proposal-preview-body">
        <div className="proposal-preview-title">
          <div>
            <small>CONTRATANTE</small>
            <h2>{proposal.customerName}</h2>
            <p>{proposal.companyName}</p>
          </div>
          <em
            className={`proposal-status status-${proposal.status.toLowerCase()}`}
          >
            {labels[proposal.status]}
          </em>
        </div>
        <dl>
          <div>
            <dt>Artista</dt>
            <dd>{proposal.artistName}</dd>
          </div>
          <div>
            <dt>Evento</dt>
            <dd>{proposal.eventType}</dd>
          </div>
          <div>
            <dt>Data e local</dt>
            <dd>
              {date(proposal.eventDate)} · {proposal.venue || "A definir"}
              <br />
              {proposal.city} · {proposal.state}
            </dd>
          </div>
        </dl>
        <div className="proposal-value">
          <small>VALOR DA PROPOSTA</small>
          <strong>{money(proposal.value)}</strong>
        </div>
        <ProposalTerm
          title="Condições de pagamento"
          value={proposal.payment_terms}
        />
        <ProposalTerm
          title="Transporte"
          value={proposal.transportation_terms}
        />
        <ProposalTerm title="Hospedagem" value={proposal.accommodation_terms} />
        <ProposalTerm
          title="Condições técnicas"
          value={proposal.technical_terms}
        />
        <ProposalTerm
          title="Condições adicionais"
          value={proposal.additional_terms}
        />
        <footer>
          Válida até {date(proposal.validity_date)} ·{" "}
          {proposal.organizationEmail}
        </footer>
      </div>
    </article>
  );
}
function ProposalTerm({
  title,
  value,
}: {
  title: string;
  value: string | null;
}) {
  return value ? (
    <section className="proposal-term">
      <h4>{title}</h4>
      <p>{value}</p>
    </section>
  ) : null;
}
