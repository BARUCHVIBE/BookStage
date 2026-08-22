"use client";

/* eslint-disable jsx-a11y/no-static-element-interactions -- backdrop click is an optional pointer shortcut; accessible close and cancel buttons remain available. */

import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

export type CalendarArtist = { id: string; name: string };
type CalendarStatus =
  "AVAILABLE" | "INQUIRY" | "OPTION" | "CONFIRMED" | "BLOCKED";
type CalendarEntry = {
  id: string;
  artistId: string;
  artistName: string;
  startDatetime: string;
  endDatetime: string | null;
  status: CalendarStatus | null;
  title: string;
  internalNotes: string | null;
  canEdit: boolean | number;
  displayTone:
    | "positive"
    | "notice"
    | "attention"
    | "highlight"
    | "critical"
    | null;
  displayPriority: number | null;
};
type EntryForm = {
  artistId: string;
  start: string;
  end: string;
  status: CalendarStatus;
  title: string;
  internalNotes: string;
};
const statuses: Array<{ value: CalendarStatus; label: string }> = [
  { value: "AVAILABLE", label: "Disponível" },
  { value: "INQUIRY", label: "Consulta" },
  { value: "OPTION", label: "Opção" },
  { value: "CONFIRMED", label: "Confirmado" },
  { value: "BLOCKED", label: "Bloqueado" },
];
const weekdays = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const statusPriority: Record<CalendarStatus, number> = {
  AVAILABLE: 1,
  INQUIRY: 2,
  OPTION: 3,
  CONFIRMED: 4,
  BLOCKED: 5,
};

function monthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
function localInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso),
    offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}
function initialForm(
  artists: CalendarArtist[],
  artistId = "",
  date = new Date(),
): EntryForm {
  const start = new Date(date);
  start.setHours(10, 0, 0, 0);
  return {
    artistId: artistId || artists[0]?.id || "",
    start: localInput(start.toISOString()),
    end: "",
    status: "INQUIRY",
    title: "",
    internalNotes: "",
  };
}
function formatTime(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function CalendarModule({
  artists,
  initialArtistId = "",
}: {
  artists: CalendarArtist[];
  initialArtistId?: string;
}) {
  const [cursor, setCursor] = useState(
    () => new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  const [artistId, setArtistId] = useState(initialArtistId),
    [status, setStatus] = useState("");
  const [entries, setEntries] = useState<CalendarEntry[]>([]),
    [canCreate, setCanCreate] = useState(false),
    [canViewInternalNotes, setCanViewInternalNotes] = useState(false),
    [canViewStatuses, setCanViewStatuses] = useState(false),
    [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<CalendarEntry | null>(null),
    [form, setForm] = useState<EntryForm>(() =>
      initialForm(artists, initialArtistId),
    );
  const [panelOpen, setPanelOpen] = useState(false),
    [notice, setNotice] = useState(""),
    [error, setError] = useState(""),
    [confirmDelete, setConfirmDelete] = useState(false);
  const month = monthKey(cursor);
  const requestEntries = useCallback(async () => {
    const params = new URLSearchParams({ month });
    if (artistId) params.set("artistId", artistId);
    if (canViewStatuses && status) params.set("status", status);
    const response = await fetch(`/api/calendar?${params}`),
      data = (await response.json()) as {
        entries?: CalendarEntry[];
        canCreate?: boolean;
        canViewInternalNotes?: boolean;
        canViewStatuses?: boolean;
        error?: string;
      };
    return { response, data };
  }, [month, artistId, status, canViewStatuses]);
  const load = useCallback(async () => {
    const { response, data } = await requestEntries();
    if (response.ok) {
      setEntries(data.entries || []);
      setCanCreate(Boolean(data.canCreate));
      setCanViewInternalNotes(Boolean(data.canViewInternalNotes));
      setCanViewStatuses(Boolean(data.canViewStatuses));
      setError("");
    } else setError(data.error || "Não foi possível carregar a agenda.");
    setLoading(false);
  }, [requestEntries]);
  useEffect(() => {
    let active = true;
    requestEntries().then(({ response, data }) => {
      if (!active) return;
      if (response.ok) {
        setEntries(data.entries || []);
        setCanCreate(Boolean(data.canCreate));
        setCanViewInternalNotes(Boolean(data.canViewInternalNotes));
        setCanViewStatuses(Boolean(data.canViewStatuses));
        setError("");
      } else setError(data.error || "Não foi possível carregar a agenda.");
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [requestEntries]);

  const days = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1),
      offset = (first.getDay() + 6) % 7,
      start = new Date(first);
    start.setDate(first.getDate() - offset);
    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [cursor]);
  const selectedArtist = artists.find((artist) => artist.id === artistId);
  function openNew(date = new Date()) {
    setEditing(null);
    setForm(initialForm(artists, artistId, date));
    setError("");
    setNotice("");
    setConfirmDelete(false);
    setPanelOpen(true);
  }
  function openEdit(entry: CalendarEntry) {
    setEditing(entry);
    setForm({
      artistId: entry.artistId,
      start: localInput(entry.startDatetime),
      end: localInput(entry.endDatetime),
      status: entry.status || "OPTION",
      title: entry.title,
      internalNotes: canViewInternalNotes ? entry.internalNotes || "" : "",
    });
    setError("");
    setNotice("");
    setConfirmDelete(false);
    setPanelOpen(true);
  }
  const editingAllowed = !editing || Boolean(editing.canEdit);
  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const payload = {
      artistId: form.artistId,
      startDatetime: form.start ? new Date(form.start).toISOString() : "",
      endDatetime: form.end ? new Date(form.end).toISOString() : null,
      status: canViewStatuses ? form.status : "OPTION",
      title: form.title,
      ...(canViewInternalNotes ? { internalNotes: form.internalNotes } : {}),
    };
    const response = await fetch(
        editing ? `/api/calendar/${editing.id}` : "/api/calendar",
        {
          method: editing ? "PUT" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        },
      ),
      data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Não foi possível salvar o evento.");
      return;
    }
    setPanelOpen(false);
    setNotice(editing ? "Evento atualizado." : "Evento criado.");
    await load();
  }
  async function remove() {
    if (!editing) return;
    const response = await fetch(`/api/calendar/${editing.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      }),
      data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Não foi possível remover o evento.");
      return;
    }
    setPanelOpen(false);
    setNotice("Evento removido com segurança.");
    await load();
  }
  function moveMonth(delta: number) {
    setCursor(
      (current) =>
        new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  }
  return (
    <section className="calendar-module">
      <div className="page-heading calendar-heading">
        <div>
          <p className="eyebrow">
            {selectedArtist ? "Agenda do artista" : "Agenda geral"}
          </p>
          <h1>
            {selectedArtist ? selectedArtist.name : "Agenda dos artistas"}
          </h1>
          <p>
            Disponibilidade, consultas, opções e bloqueios em uma visão
            operacional única.
          </p>
        </div>
        {canCreate && (
          <button className="button button-primary" onClick={() => openNew()}>
            <Plus size={16} />
            Novo evento
          </button>
        )}
      </div>
      {notice && <div className="notice">{notice}</div>}
      {error && !panelOpen && <div className="calendar-alert">{error}</div>}
      <div className="calendar-toolbar">
        <div className="month-navigation">
          <button aria-label="Mês anterior" onClick={() => moveMonth(-1)}>
            <ChevronLeft />
          </button>
          <button
            className="today-button"
            onClick={() =>
              setCursor(
                new Date(new Date().getFullYear(), new Date().getMonth(), 1),
              )
            }
          >
            Hoje
          </button>
          <button aria-label="Próximo mês" onClick={() => moveMonth(1)}>
            <ChevronRight />
          </button>
          <h2>
            {new Intl.DateTimeFormat("pt-BR", {
              month: "long",
              year: "numeric",
            }).format(cursor)}
          </h2>
        </div>
        <div className="calendar-filters">
          <label>
            Artista
            <select
              value={artistId}
              onChange={(event) => setArtistId(event.target.value)}
            >
              <option value="">Todos os artistas</option>
              {artists.map((artist) => (
                <option value={artist.id} key={artist.id}>
                  {artist.name}
                </option>
              ))}
            </select>
          </label>
          {canViewStatuses && (
            <label>
              Status
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">Todos os status</option>
                {statuses.map((item) => (
                  <option value={item.value} key={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      {canViewStatuses && (
        <div className="status-legend">
          {statuses.map((item) => (
            <span
              key={item.value}
              className={`status-${item.value.toLowerCase()}`}
            >
              <i />
              {item.label}
            </span>
          ))}
        </div>
      )}
      <div className="month-calendar">
        {weekdays.map((day) => (
          <div className="weekday" key={day}>
            {day}
          </div>
        ))}
        {days.map((day) => {
          const key = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`,
            dayEntries = entries.filter((entry) =>
              localInput(entry.startDatetime).startsWith(key),
            ),
            dayStatus = dayEntries.reduce<CalendarStatus | null>(
              (current, entry) => {
                if (!entry.status) return current;
                return !current ||
                  statusPriority[entry.status] > statusPriority[current]
                  ? entry.status
                  : current;
              },
              null,
            ),
            privateVisual = dayEntries.reduce<CalendarEntry | null>(
              (current, entry) =>
                !entry.displayPriority ||
                (current?.displayPriority ?? 0) >= entry.displayPriority
                  ? current
                  : entry,
              null,
            ),
            privateTone = privateVisual?.displayTone;
          return (
            <div
              className={`calendar-day ${day.getMonth() !== cursor.getMonth() ? "outside-month" : ""} ${dayStatus ? `day-status-${dayStatus.toLowerCase()}` : ""} ${privateTone ? `day-visual-status calendar-tone-${privateTone}` : ""}`}
              key={key}
            >
              <button
                type="button"
                className="day-hitbox"
                disabled={!canCreate}
                onClick={() => openNew(day)}
                aria-label={`Criar evento em ${day.toLocaleDateString("pt-BR")}`}
              />
              <span className="day-number" aria-hidden="true">
                {day.getDate()}
              </span>
              <div className="day-events">
                {dayEntries.slice(0, 3).map((entry) => (
                  <button
                    key={entry.id}
                    className={`calendar-event ${entry.status ? `status-${entry.status.toLowerCase()}` : `calendar-event-private${entry.displayTone ? ` calendar-tone-${entry.displayTone}` : ""}`}`}
                    onClick={() => openEdit(entry)}
                    title={`${entry.artistName} — ${entry.title}`}
                  >
                    <span>{formatTime(entry.startDatetime)}</span>
                    <b>{entry.title}</b>
                    {!artistId && <small>{entry.artistName}</small>}
                  </button>
                ))}
                {dayEntries.length > 3 && (
                  <span className="more-events">
                    +{dayEntries.length - 3} eventos
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {loading && (
          <div className="calendar-loading">
            <span className="spinner" />
            Atualizando agenda…
          </div>
        )}
      </div>
      {panelOpen && (
        <div
          className="calendar-panel-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPanelOpen(false);
          }}
        >
          <form className="calendar-panel" onSubmit={save}>
            <div className="calendar-panel-head">
              <div>
                <p className="eyebrow">
                  {editing
                    ? editingAllowed
                      ? "Editar evento"
                      : "Visualizar evento"
                    : "Novo evento"}
                </p>
                <h2>{editing ? editing.title : "Adicionar à agenda"}</h2>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setPanelOpen(false)}
              >
                <X />
              </button>
            </div>
            {error && <div className="calendar-alert">{error}</div>}
            <label>
              Artista *
              <select
                required
                disabled={!editingAllowed}
                value={form.artistId}
                onChange={(event) =>
                  setForm({ ...form, artistId: event.target.value })
                }
              >
                <option value="" disabled>
                  Selecione um artista
                </option>
                {artists.map((artist) => (
                  <option value={artist.id} key={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Título *
              <input
                required
                disabled={!editingAllowed}
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="Ex.: Consulta — Festival Aurora"
              />
            </label>
            <div className="form-row">
              <label>
                Início *
                <input
                  required
                  disabled={!editingAllowed}
                  type="datetime-local"
                  value={form.start}
                  onChange={(event) =>
                    setForm({ ...form, start: event.target.value })
                  }
                />
              </label>
              <label>
                Término
                <input
                  type="datetime-local"
                  disabled={!editingAllowed}
                  value={form.end}
                  onChange={(event) =>
                    setForm({ ...form, end: event.target.value })
                  }
                />
              </label>
            </div>
            {canViewStatuses && (
              <label>
                Status *
                <select
                  value={form.status}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      status: event.target.value as CalendarStatus,
                    })
                  }
                >
                  {statuses.map((item) => (
                    <option value={item.value} key={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {canViewInternalNotes && (
              <label>
                Notas internas
                <textarea
                  value={form.internalNotes}
                  onChange={(event) =>
                    setForm({ ...form, internalNotes: event.target.value })
                  }
                  placeholder="Informações visíveis apenas para a equipe"
                />
              </label>
            )}
            {canViewStatuses && editingAllowed && (
              <div className="calendar-form-hint">
                <Clock3 />
                Confirmações e bloqueios são verificados contra conflitos antes
                de salvar.
              </div>
            )}
            {!editingAllowed ? null : confirmDelete ? (
              <div className="delete-confirm">
                <p>Remover este evento definitivamente?</p>
                <div>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => setConfirmDelete(false)}
                  >
                    Manter evento
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    onClick={remove}
                  >
                    Confirmar remoção
                  </button>
                </div>
              </div>
            ) : (
              <div className="calendar-panel-actions">
                {editing && (
                  <button
                    type="button"
                    className="danger-link"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 />
                    Remover
                  </button>
                )}
                <span />
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setPanelOpen(false)}
                >
                  Cancelar
                </button>
                <button className="button button-primary">
                  <Pencil size={15} />
                  {editing ? "Salvar alterações" : "Criar evento"}
                </button>
              </div>
            )}
          </form>
        </div>
      )}
    </section>
  );
}
