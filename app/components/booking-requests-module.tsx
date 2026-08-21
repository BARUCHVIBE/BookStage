"use client";

import { CalendarDays, Mail, MapPin, Phone, UserRound } from "lucide-react";
import { useEffect, useState } from "react";

type Item = {
  id: string;
  eventDate: string;
  city: string;
  state: string;
  venue: string | null;
  eventType: string;
  estimatedAudience: number | null;
  budget: string | null;
  notes: string | null;
  artistName: string;
  customerName: string;
  companyName: string | null;
  email: string;
  phone: string;
  assigneeName: string | null;
};

export function BookingRequestsModule() {
  const [items, setItems] = useState<Item[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    fetch("/api/booking-requests")
      .then((response) =>
        response
          .json()
          .then((data) => ({
            response,
            data: data as { requests?: Item[]; error?: string },
          })),
      )
      .then(({ response, data }) => {
        if (response.ok) setItems(data.requests || []);
        else
          setError(data.error || "Não foi possível carregar as solicitações.");
        setLoading(false);
      });
  }, []);
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Canal público</p>
          <h1>Novas solicitações</h1>
          <p>
            Entradas recebidas pelo catálogo enquanto o CRM completo ainda não
            está disponível.
          </p>
        </div>
        <span className="count-badge">{items.length} novas</span>
      </div>
      {error && <div className="calendar-alert">{error}</div>}
      {loading ? (
        <div className="loading">
          <span className="spinner" />
          Carregando solicitações…
        </div>
      ) : (
        <div className="request-inbox">
          {items.map((item) => (
            <article className="request-card" key={item.id}>
              <header>
                <div>
                  <span className="request-source">Catálogo público</span>
                  <h2>{item.artistName}</h2>
                  <p>{item.eventType}</p>
                </div>
                <span className="status-badge">Nova</span>
              </header>
              <div className="request-card-grid">
                <span>
                  <CalendarDays />
                  {new Date(`${item.eventDate}T12:00:00`).toLocaleDateString(
                    "pt-BR",
                  )}
                </span>
                <span>
                  <MapPin />
                  {item.city} · {item.state}
                  {item.venue ? ` · ${item.venue}` : ""}
                </span>
                <span>
                  <UserRound />
                  {item.customerName}
                  {item.companyName ? ` · ${item.companyName}` : ""}
                </span>
                <a href={`tel:${item.phone}`}>
                  <Phone />
                  {item.phone}
                </a>
                <a href={`mailto:${item.email}`}>
                  <Mail />
                  {item.email}
                </a>
              </div>
              {item.notes && <p className="request-notes">{item.notes}</p>}
              <footer>
                <span>
                  Responsável: <b>{item.assigneeName || "Não atribuído"}</b>
                </span>
                {item.estimatedAudience && (
                  <span>
                    Público:{" "}
                    <b>{item.estimatedAudience.toLocaleString("pt-BR")}</b>
                  </span>
                )}
                {item.budget && (
                  <span>
                    Orçamento: <b>{item.budget}</b>
                  </span>
                )}
              </footer>
            </article>
          ))}
          {!items.length && (
            <div className="public-empty">
              Nenhuma solicitação recebida até agora.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
