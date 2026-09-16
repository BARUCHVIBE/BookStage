"use client";

/* eslint-disable react-hooks/set-state-in-effect -- loader synchronizes the inbox after navigation and mutations. */

import {
  CalendarDays,
  Check,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/app/lib/http-client";

type RequestItem = {
  id: string;
  organizationId: string;
  organizationName: string;
  artistId: string;
  artistName: string;
  status: "NEW" | "ACCEPTED" | "DECLINED" | "CONVERTED";
  customerName: string;
  companyName: string | null;
  phone: string;
  email: string;
  document: string | null;
  eventDate: string;
  city: string;
  state: string;
  venue: string | null;
  eventType: string;
  estimatedAudience: number | null;
  budget: string | null;
  notes: string | null;
  decisionNotes: string | null;
  decidedAt: string | null;
  opportunityId: string | null;
  createdAt: string;
  capabilities: {
    canAccept: boolean;
    canDecline: boolean;
    canConvert: boolean;
    canOpenOpportunity: boolean;
  };
};

const requestStatus = {
  NEW: { label: "Pendente", tone: "info" },
  ACCEPTED: { label: "Aceita · aguardando CRM", tone: "success" },
  DECLINED: { label: "Negada", tone: "danger" },
  CONVERTED: { label: "No CRM", tone: "success" },
} as const;

function RequestStatusBadge({ status }: { status: RequestItem["status"] }) {
  const definition = requestStatus[status];
  return (
    <span className={`status-badge status-badge--${definition.tone}`}>
      {definition.label}
    </span>
  );
}

export function CommercialRequestsModule({
  onOpenOpportunity,
}: {
  onOpenOpportunity: (organizationId: string, opportunityId: string) => void;
}) {
  const [items, setItems] = useState<RequestItem[]>([]),
    [view, setView] = useState<"PENDING" | "ACCEPTED" | "DECLINED">(
      "PENDING",
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busyId, setBusyId] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJson<{
      requests?: RequestItem[];
      error?: string;
    }>("/api/commercial-requests", { cache: "no-store" });
    if (result.ok) {
      setItems(result.data?.requests || []);
      setError("");
    } else
      setError(
        result.error || "Não foi possível carregar as solicitações.",
      );
    setLoading(false);
  }, []);
  useEffect(() => void load(), [load]);

  async function action(item: RequestItem, actionName: "ACCEPT" | "DECLINE" | "CONVERT") {
    let notes: string | null = null;
    if (actionName === "DECLINE") {
      notes = window.prompt("Informe o motivo da recusa:");
      if (!notes) return;
    }
    setBusyId(item.id);
    const result = await fetchJson<{ opportunityId?: string; error?: string }>(
      `/api/commercial-requests/${item.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: actionName, notes }),
      },
    );
    setBusyId("");
    if (!result.ok) {
      const message = result.error || "Não foi possível processar a solicitação.";
      if (result.status === 409) await load();
      setError(message);
      return;
    }
    await load();
    if (actionName === "ACCEPT") setView("ACCEPTED");
    if (actionName === "DECLINE") setView("DECLINED");
    if (result.data?.opportunityId)
      onOpenOpportunity(item.organizationId, result.data.opportunityId);
  }

  const visibleItems = items.filter((item) =>
    view === "PENDING"
      ? item.status === "NEW"
      : view === "ACCEPTED"
        ? item.status === "ACCEPTED" || item.status === "CONVERTED"
        : item.status === "DECLINED",
  );
  return (
    <section className="commercial-requests">
      <div className="page-heading">
        <div><p className="eyebrow">Entrada comercial</p><h1>Solicitações recebidas</h1><p>Analise os pedidos antes de transformá-los em negociações formais.</p></div>
        <div className="request-heading-actions">
          <div className="view-toggle" aria-label="Visualização das solicitações">
            <button
              className={view === "PENDING" ? "active" : ""}
              onClick={() => setView("PENDING")}
            >
              Pendentes
            </button>
            <button
              className={view === "ACCEPTED" ? "active" : ""}
              onClick={() => setView("ACCEPTED")}
            >
              Aceitas
            </button>
            <button
              className={view === "DECLINED" ? "active" : ""}
              onClick={() => setView("DECLINED")}
            >
              Negadas
            </button>
          </div>
          <span className="count-badge">
            {items.filter((item) => item.status === "NEW").length} pendentes
          </span>
        </div>
      </div>
      {error && (
        <div className="section-load-error" role="alert">
          <span>{error}</span>
          <button type="button" onClick={() => void load()}>
            <RefreshCw /> Tentar novamente
          </button>
        </div>
      )}
      {loading ? <div className="loading"><span className="spinner" /> Carregando…</div> : !error && (
        <div className="request-inbox">
          {visibleItems.map((item) => (
            <article className="request-card" key={item.id}>
              <header>
                <div><span className="request-source">{item.organizationName}</span><h2>{item.artistName}</h2><p>{item.eventType}</p></div>
                <RequestStatusBadge status={item.status} />
              </header>
              <div className="request-card-grid">
                <span><CalendarDays /> {new Date(`${item.eventDate}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                <span><MapPin /> {item.city} · {item.state}{item.venue ? ` · ${item.venue}` : ""}</span>
                <span>{item.customerName}{item.companyName ? ` · ${item.companyName}` : ""}</span>
                <a href={`tel:${item.phone}`}><Phone /> {item.phone}</a>
                <a href={`mailto:${item.email}`}><Mail /> {item.email}</a>
              </div>
              {item.notes && <p className="request-notes">{item.notes}</p>}
              {item.decisionNotes && (
                <p className="request-decision">
                  <b>{item.status === "DECLINED" ? "Motivo da recusa:" : "Observação da decisão:"}</b>{" "}
                  {item.decisionNotes}
                  {item.decidedAt && (
                    <small>
                      {" · "}
                      {new Date(item.decidedAt).toLocaleString("pt-BR")}
                    </small>
                  )}
                </p>
              )}
              <footer>
                <span>Orçamento informado: <b>{item.budget || "Não informado"}</b></span>
                <div className="request-actions">
                  {item.capabilities.canDecline && <button className="button button-secondary" disabled={busyId === item.id} onClick={() => action(item, "DECLINE")}><X /> Recusar</button>}
                  {item.capabilities.canAccept &&
                    <button className="button button-primary" disabled={busyId === item.id} onClick={() => action(item, "ACCEPT")}><Check /> Aceitar negociação</button>}
                  {item.capabilities.canConvert && <button className="button button-primary" disabled={busyId === item.id} onClick={() => action(item, "CONVERT")}><Check /> Criar negociação no CRM</button>}
                  {item.capabilities.canOpenOpportunity && item.opportunityId && <button className="button button-secondary" onClick={() => onOpenOpportunity(item.organizationId, item.opportunityId!)}>Ver negociação no CRM</button>}
                </div>
              </footer>
            </article>
          ))}
          {!visibleItems.length && (
            <div className="public-empty">
              {view === "PENDING"
                ? "Nenhuma solicitação pendente."
                : view === "ACCEPTED"
                  ? "Nenhuma solicitação aceita."
                  : "Nenhuma solicitação negada."}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
