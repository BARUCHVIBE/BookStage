"use client";
/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps -- async calendar loader is intentionally invoked once on mount */

import {
  ArrowLeft,
  CalendarCheck2,
  CalendarDays,
  CalendarPlus,
  ChevronRight,
  CircleAlert,
  Clock3,
  Columns3,
  FilePlus2,
  List,
  MapPin,
  Plus,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { OpportunityProposals } from "./opportunity-proposals";
import { OpportunityGovernance } from "./opportunity-governance";

const stages = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "PROPOSAL",
  "NEGOTIATION",
  "DATE_OPTION",
  "CONTRACT",
  "CLOSED_WON",
  "CLOSED_LOST",
] as const;
type Stage = (typeof stages)[number];
const labels: Record<Stage, string> = {
  NEW: "Novo",
  CONTACTED: "Contatado",
  QUALIFIED: "Qualificado",
  PROPOSAL: "Proposta",
  NEGOTIATION: "Negociação",
  DATE_OPTION: "Opção de data",
  CONTRACT: "Contrato",
  CLOSED_WON: "Ganho",
  CLOSED_LOST: "Perdido",
};
type Item = {
  id: string;
  stage: Stage;
  source: string;
  eventDate: string;
  city: string;
  state: string;
  venue: string | null;
  eventType: string;
  estimatedAudience: number | null;
  budget: string | null;
  proposedValue: number | null;
  nextAction: string | null;
  nextActionAt: string | null;
  artistId: string;
  artistName: string;
  customerId: string;
  customerName: string;
  companyName: string | null;
  assignedUserId: string | null;
  assigneeName: string | null;
  updatedAt: string;
};
type Activity = {
  id: string;
  type: string;
  description: string;
  fromValue: string | null;
  toValue: string | null;
  createdAt: string;
  authorName: string | null;
};
type Detail = {
  opportunity: Record<string, unknown> & {
    id: string;
    stage: Stage;
    customerName: string;
    companyName: string | null;
    email: string;
    phone: string;
    artistName: string;
    assigneeName: string | null;
    originatorName: string | null;
    commercialValidatorName: string | null;
    assigned_user_id: string | null;
    proposed_value: number | null;
    event_date: string;
    event_type: string;
    estimated_audience: number | null;
    next_action: string | null;
    next_action_at: string | null;
    lost_reason: string | null;
    notes: string | null;
    city: string;
    state: string;
    venue: string | null;
    budget: string | null;
  };
  activities: Activity[];
  members: Array<{ id: string; name: string; role: string }>;
  canReassign: boolean;
  canEdit: boolean;
  role: string;
};
type OpportunityCalendarData = {
  interval: { startDatetime: string; endDatetime: string | null };
  linkedEntry: {
    id: string;
    status: string;
    startDatetime: string;
    endDatetime: string | null;
  } | null;
  conflicts: Array<{
    id: string;
    status: string;
    title: string;
    startDatetime: string;
    endDatetime: string | null;
  }>;
  availability: "AVAILABLE" | "ATTENTION" | "BLOCKED";
  show: { id: string; status: string } | null;
  identity: { customerName: string; assigneeName: string | null };
};
const money = (cents: number | null) =>
  cents === null
    ? null
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(cents / 100);
const date = (value: string) =>
  new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("pt-BR");

export function CrmModule({
  artists,
}: {
  artists: Array<{ id: string; name: string }>;
}) {
  const [items, setItems] = useState<Item[]>([]),
    [view, setView] = useState<"kanban" | "list">("kanban"),
    [q, setQ] = useState(""),
    [stage, setStage] = useState(""),
    [artistId, setArtistId] = useState(""),
    [detail, setDetail] = useState<Detail | null>(null),
    [creating, setCreating] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [createForm, setCreateForm] = useState({
    artistId: artists[0]?.id || "",
    customerName: "",
    companyName: "",
    email: "",
    phone: "",
    eventDate: "",
    city: "",
    state: "",
    venue: "",
    eventType: "",
    proposedValue: "",
    notes: "",
    createOption: true,
  });
  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (stage) params.set("stage", stage);
    if (artistId) params.set("artistId", artistId);
    const response = await fetch(`/api/opportunities?${params}`),
      data = (await response.json()) as {
        opportunities?: Item[];
        error?: string;
      };
    if (response.ok) {
      setItems(data.opportunities || []);
      setError("");
    } else setError(data.error || "Não foi possível carregar o CRM.");
    setLoading(false);
  }, [q, stage, artistId]);
  useEffect(() => {
    const timer = setTimeout(load, 200);
    return () => clearTimeout(timer);
  }, [load]);
  async function open(id: string) {
    const response = await fetch(`/api/opportunities/${id}`),
      data = (await response.json()) as Detail & { error?: string };
    if (response.ok) setDetail(data);
    else setError(data.error || "Oportunidade não encontrada.");
  }
  async function update(id: string, body: Record<string, unknown>) {
    const response = await fetch(`/api/opportunities/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setError(data.error || "Não foi possível atualizar.");
      return false;
    }
    setError("");
    await load();
    if (detail?.opportunity.id === id) await open(id);
    return true;
  }
  async function move(item: Item, next: Stage) {
    if (item.stage === next) return;
    let lostReason: unknown = undefined;
    if (next === "CLOSED_LOST") {
      lostReason = window.prompt("Qual foi o motivo da perda?");
      if (!lostReason) return;
    }
    await update(item.id, { stage: next, lostReason });
  }
  async function createOpportunity(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/opportunities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...createForm,
          proposedValue: createForm.proposedValue
            ? Math.round(Number(createForm.proposedValue) * 100)
            : null,
        }),
      }),
      data = (await response.json()) as { id?: string; error?: string };
    if (!response.ok) {
      setError(data.error || "Não foi possível criar a oportunidade.");
      return;
    }
    setCreating(false);
    setCreateForm((current) => ({
      ...current,
      customerName: "",
      companyName: "",
      email: "",
      phone: "",
      eventDate: "",
      city: "",
      state: "",
      venue: "",
      eventType: "",
      proposedValue: "",
      notes: "",
    }));
    await load();
    if (data.id) await open(data.id);
  }
  const grouped = useMemo(
    () =>
      Object.fromEntries(
        stages.map((value) => [
          value,
          items.filter((item) => item.stage === value),
        ]),
      ) as Record<Stage, Item[]>,
    [items],
  );
  if (detail)
    return (
      <>
        {detail.canEdit && (
          <div className="opportunity-action-bar">
            <div>
              <p className="eyebrow">Ação comercial</p>
              <strong>Propostas desta oportunidade</strong>
            </div>
            <button
              className="button button-primary"
              onClick={() => {
                const section = document.getElementById(
                  "opportunity-proposals",
                );
                section?.scrollIntoView({ behavior: "smooth", block: "start" });
                (
                  section?.querySelector(
                    "[data-create-proposal]",
                  ) as HTMLButtonElement | null
                )?.click();
              }}
            >
              <FilePlus2 />
              Criar proposta
            </button>
          </div>
        )}
        <OpportunityDetail
          key={`${detail.opportunity.id}-${detail.opportunity.stage}`}
          data={detail}
          back={() => {
            setDetail(null);
            load();
          }}
          update={(body) => update(detail.opportunity.id, body)}
          refresh={() => open(detail.opportunity.id)}
          error={error}
        />
        <OpportunityProposals
          opportunityId={detail.opportunity.id}
          refreshOpportunity={() => open(detail.opportunity.id)}
          readOnly={!detail.canEdit}
        />
        <OpportunityGovernance
          opportunityId={detail.opportunity.id}
          refresh={() => open(detail.opportunity.id)}
        />
      </>
    );
  return (
    <section className="crm">
      <div className="page-heading crm-heading">
        <div>
          <p className="eyebrow">CRM comercial</p>
          <h1>Pipeline de oportunidades</h1>
          <p>Acompanhe cada negociação da entrada ao fechamento.</p>
        </div>
        <div className="crm-heading-actions">
          <button
            className="button button-primary"
            onClick={() => setCreating((value) => !value)}
          >
            <Plus />
            Nova oportunidade
          </button>
          <div className="view-toggle" aria-label="Visualização">
            <button
              className={view === "kanban" ? "active" : ""}
              onClick={() => setView("kanban")}
            >
              <Columns3 />
              Kanban
            </button>
            <button
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              <List />
              Lista
            </button>
          </div>
        </div>
      </div>
      {creating && (
        <form className="quick-opportunity-form" onSubmit={createOpportunity}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">Fluxo rápido</p>
              <h2>Criar negociação</h2>
              <p>Cadastre o essencial e reserve a data em OPTION.</p>
            </div>
            <button
              type="button"
              className="icon-close"
              onClick={() => setCreating(false)}
            >
              ×
            </button>
          </div>
          <div className="form-row">
            <label>
              Artista
              <select
                required
                value={createForm.artistId}
                onChange={(e) =>
                  setCreateForm((v) => ({ ...v, artistId: e.target.value }))
                }
              >
                {artists.map((artist) => (
                  <option key={artist.id} value={artist.id}>
                    {artist.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Contratante
              <input
                required
                value={createForm.customerName}
                onChange={(e) =>
                  setCreateForm((v) => ({ ...v, customerName: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              E-mail
              <input
                required
                type="email"
                value={createForm.email}
                onChange={(e) =>
                  setCreateForm((v) => ({ ...v, email: e.target.value }))
                }
              />
            </label>
            <label>
              WhatsApp
              <input
                required
                value={createForm.phone}
                onChange={(e) =>
                  setCreateForm((v) => ({ ...v, phone: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Data
              <input
                required
                type="date"
                value={createForm.eventDate}
                onChange={(e) =>
                  setCreateForm((v) => ({ ...v, eventDate: e.target.value }))
                }
              />
            </label>
            <label>
              Cidade
              <input
                required
                value={createForm.city}
                onChange={(e) =>
                  setCreateForm((v) => ({ ...v, city: e.target.value }))
                }
              />
            </label>
            <label>
              UF
              <input
                required
                value={createForm.state}
                onChange={(e) =>
                  setCreateForm((v) => ({ ...v, state: e.target.value }))
                }
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Tipo de evento
              <input
                required
                value={createForm.eventType}
                onChange={(e) =>
                  setCreateForm((v) => ({ ...v, eventType: e.target.value }))
                }
              />
            </label>
            <label>
              Valor inicial (R$)
              <input
                type="number"
                min="0"
                step="0.01"
                value={createForm.proposedValue}
                onChange={(e) =>
                  setCreateForm((v) => ({
                    ...v,
                    proposedValue: e.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label className="publish-toggle">
            <input
              aria-label="Colocar a data em OPTION"
              type="checkbox"
              checked={createForm.createOption}
              onChange={(e) =>
                setCreateForm((v) => ({ ...v, createOption: e.target.checked }))
              }
            />
            <span>
              <b>Colocar a data em OPTION</b>
              <small>Validade inicial de 7 dias. Não confirma a venda.</small>
            </span>
          </label>
          <button className="button button-primary">Criar negociação</button>
        </form>
      )}
      <div className="crm-toolbar">
        <label className="crm-search">
          <Search />
          <span className="sr-only">Buscar</span>
          <input
            placeholder="Buscar cliente, artista ou cidade"
            value={q}
            onChange={(event) => setQ(event.target.value)}
          />
        </label>
        <label>
          <span className="sr-only">Filtrar por etapa</span>
          <select
            value={stage}
            onChange={(event) => setStage(event.target.value)}
          >
            <option value="">Todas as etapas</option>
            {stages.map((item) => (
              <option value={item} key={item}>
                {labels[item]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="sr-only">Filtrar por artista</span>
          <select
            value={artistId}
            onChange={(event) => setArtistId(event.target.value)}
          >
            <option value="">Todos os artistas</option>
            {artists.map((artist) => (
              <option key={artist.id} value={artist.id}>
                {artist.name}
              </option>
            ))}
          </select>
        </label>
        <span className="count-badge">{items.length} oportunidades</span>
      </div>
      {error && <div className="calendar-alert">{error}</div>}
      {loading ? (
        <div className="loading">
          <span className="spinner" />
          Carregando pipeline…
        </div>
      ) : view === "kanban" ? (
        <div className="kanban-board">
          {stages.map((column) => (
            <section
              className={`kanban-column stage-${column.toLowerCase()}`}
              key={column}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                const item = items.find(
                  (value) =>
                    value.id === event.dataTransfer.getData("text/plain"),
                );
                if (item) move(item, column);
              }}
            >
              <header>
                <span />
                {labels[column]}
                <b>{grouped[column].length}</b>
              </header>
              <div>
                {grouped[column].map((item) => (
                  <OpportunityCard key={item.id} item={item} open={open} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <OpportunityList items={items} open={open} />
      )}
    </section>
  );
}

function OpportunityCard({
  item,
  open,
}: {
  item: Item;
  open: (id: string) => void;
}) {
  return (
    <button
      type="button"
      className="opportunity-card"
      draggable
      onDragStart={(event) => event.dataTransfer.setData("text/plain", item.id)}
      onClick={() => open(item.id)}
    >
      <span className="opportunity-source">
        {item.source === "PUBLIC_CATALOG" ? "Catálogo público" : item.source}
      </span>
      <span className="opportunity-title">{item.customerName}</span>
      <span className="opportunity-artist">{item.artistName}</span>
      <span className="opportunity-meta">
        <span>
          <CalendarDays />
          {date(item.eventDate)}
        </span>
        <span>
          <MapPin />
          {item.city} · {item.state}
        </span>
        <span>
          <UserRound />
          {item.assigneeName || "Não atribuído"}
        </span>
      </span>
      {money(item.proposedValue) && (
        <strong>{money(item.proposedValue)}</strong>
      )}
      <span className="opportunity-open" aria-hidden="true">
        <ChevronRight />
      </span>
    </button>
  );
}
function OpportunityList({
  items,
  open,
}: {
  items: Item[];
  open: (id: string) => void;
}) {
  return (
    <div className="opportunity-table">
      <div className="opportunity-table-head">
        <span>Cliente</span>
        <span>Artista</span>
        <span>Evento</span>
        <span>Responsável</span>
        <span>Etapa</span>
        <span>Valor</span>
      </div>
      {items.map((item) => (
        <button
          className="opportunity-row"
          key={item.id}
          onClick={() => open(item.id)}
        >
          <span>
            <b>{item.customerName}</b>
            <small>{item.companyName}</small>
          </span>
          <span>{item.artistName}</span>
          <span>
            {date(item.eventDate)}
            <small>
              {item.city} · {item.state}
            </small>
          </span>
          <span>{item.assigneeName || "Não atribuído"}</span>
          <em className={`pipeline-badge stage-${item.stage.toLowerCase()}`}>
            {labels[item.stage]}
          </em>
          <strong>{money(item.proposedValue) || "—"}</strong>
        </button>
      ))}
      {!items.length && (
        <div className="table-empty">Nenhuma oportunidade encontrada.</div>
      )}
    </div>
  );
}

function OpportunityDetail({
  data,
  back,
  update,
  refresh,
  error,
}: {
  data: Detail;
  back: () => void;
  update: (body: Record<string, unknown>) => Promise<boolean>;
  refresh: () => Promise<void>;
  error: string;
}) {
  const opportunity = data.opportunity,
    [stage, setStage] = useState<Stage>(opportunity.stage),
    [assignee, setAssignee] = useState(opportunity.assigned_user_id || ""),
    [value, setValue] = useState(
      opportunity.proposed_value === null
        ? ""
        : String(opportunity.proposed_value / 100),
    ),
    [notes, setNotes] = useState(opportunity.notes || ""),
    [nextAction, setNextAction] = useState(opportunity.next_action || ""),
    [nextActionAt, setNextActionAt] = useState(
      opportunity.next_action_at?.slice(0, 16) || "",
    ),
    [lostReason, setLostReason] = useState(opportunity.lost_reason || ""),
    [notice, setNotice] = useState("");
  async function save() {
    const ok = await update({
      stage,
      assignedUserId: assignee || null,
      proposedValue: value === "" ? null : Math.round(Number(value) * 100),
      notes,
      nextAction,
      nextActionAt,
      lostReason,
    });
    if (ok) setNotice("Oportunidade atualizada.");
  }
  return (
    <section className="opportunity-detail">
      <button className="back-button" onClick={back}>
        <ArrowLeft />
        Voltar ao pipeline
      </button>
      <div className="opportunity-detail-head">
        <div>
          <p className="eyebrow">Oportunidade</p>
          <h1>{opportunity.customerName}</h1>
          <p>
            {opportunity.artistName} · {opportunity.event_type}
          </p>
        </div>
        <span className={`pipeline-badge stage-${stage.toLowerCase()}`}>
          {labels[stage]}
        </span>
      </div>
      {error && <div className="calendar-alert">{error}</div>}
      {notice && <div className="notice">{notice}</div>}
      <div className="opportunity-detail-grid">
        <form
          className="opportunity-form"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <fieldset
            disabled={!data.canEdit}
            className="opportunity-edit-fields"
          >
            <div className="section-heading">
              <div>
                <p className="eyebrow">Negociação</p>
                <h2>Dados comerciais</h2>
              </div>
            </div>
            <div className="form-row">
              <label>
                Etapa
                <select
                  value={stage}
                  onChange={(event) => setStage(event.target.value as Stage)}
                >
                  {stages.map((item) => (
                    <option key={item} value={item}>
                      {labels[item]}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Responsável
                <select
                  disabled={!data.canReassign}
                  value={assignee}
                  onChange={(event) => setAssignee(event.target.value)}
                >
                  <option value="">Não atribuído</option>
                  {data.members.map((member) => (
                    <option key={member.id} value={member.id}>
                      {member.name} · {member.role}
                    </option>
                  ))}
                  {!data.canReassign && assignee && (
                    <option value={assignee}>{opportunity.assigneeName}</option>
                  )}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Valor proposto (R$)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </label>
              <label>
                Próxima ação em
                <input
                  type="datetime-local"
                  value={nextActionAt}
                  onChange={(event) => setNextActionAt(event.target.value)}
                />
              </label>
            </div>
            <label>
              Próxima ação
              <input
                value={nextAction}
                onChange={(event) => setNextAction(event.target.value)}
                placeholder="Ex.: Retornar com disponibilidade"
              />
            </label>
            {stage === "CLOSED_LOST" && (
              <label>
                Motivo da perda *
                <textarea
                  required
                  value={lostReason}
                  onChange={(event) => setLostReason(event.target.value)}
                />
              </label>
            )}
            <label>
              Observações
              <textarea
                rows={5}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </label>
            {data.canEdit && (
              <button className="button button-primary">
                Salvar alterações
              </button>
            )}
          </fieldset>
        </form>
        <aside>
          <OpportunityCalendarPanel
            opportunity={opportunity}
            refresh={refresh}
            readOnly={!data.canEdit}
          />
          <article className="opportunity-summary">
            <p className="eyebrow">Evento</p>
            <h2>{date(opportunity.event_date)}</h2>
            <dl>
              <div>
                <dt>Originador</dt>
                <dd>
                  {opportunity.originatorName || "Origem direta da empresa"}
                </dd>
              </div>
              <div>
                <dt>Validador comercial</dt>
                <dd>{opportunity.commercialValidatorName || "Não definido"}</dd>
              </div>
              <div>
                <dt>Responsável atual</dt>
                <dd>{opportunity.assigneeName || "Não atribuído"}</dd>
              </div>
              <div>
                <dt>Local</dt>
                <dd>{opportunity.venue || "A definir"}</dd>
              </div>
              <div>
                <dt>Cidade</dt>
                <dd>
                  {opportunity.city} · {opportunity.state}
                </dd>
              </div>
              <div>
                <dt>Público</dt>
                <dd>
                  {opportunity.estimated_audience?.toLocaleString("pt-BR") ||
                    "Não informado"}
                </dd>
              </div>
              <div>
                <dt>Orçamento informado</dt>
                <dd>{opportunity.budget || "Não informado"}</dd>
              </div>
            </dl>
            <hr />
            <p className="eyebrow">Contato</p>
            <a href={`mailto:${opportunity.email}`}>{opportunity.email}</a>
            <a href={`tel:${opportunity.phone}`}>{opportunity.phone}</a>
          </article>
          <article className="activity-timeline">
            <p className="eyebrow">Histórico</p>
            <h2>Atividades</h2>
            {data.activities.map((activity) => (
              <div key={activity.id}>
                <i />
                <p>{activity.description}</p>
                <small>
                  {activity.authorName || "Catálogo público"} ·{" "}
                  {new Date(
                    activity.createdAt.replace(" ", "T") + "Z",
                  ).toLocaleString("pt-BR")}
                </small>
              </div>
            ))}
          </article>
        </aside>
      </div>
    </section>
  );
}

function OpportunityCalendarPanel({
  opportunity,
  refresh,
  readOnly,
}: {
  opportunity: Detail["opportunity"];
  refresh: () => Promise<void>;
  readOnly: boolean;
}) {
  const [start, setStart] = useState(`${opportunity.event_date}T18:00`),
    [end, setEnd] = useState(`${opportunity.event_date}T23:00`),
    [calendar, setCalendar] = useState<OpportunityCalendarData | null>(null),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const iso = (value: string) => (value ? new Date(value).toISOString() : null);
  const local = (value: string) => {
    const source = new Date(value),
      adjusted = new Date(
        source.getTime() - source.getTimezoneOffset() * 60000,
      );
    return adjusted.toISOString().slice(0, 16);
  };
  const load = useCallback(async () => {
    const params = new URLSearchParams({ start: iso(start)!, end: iso(end)! }),
      response = await fetch(
        `/api/opportunities/${opportunity.id}/calendar?${params}`,
      ),
      data = (await response.json()) as OpportunityCalendarData & {
        error?: string;
      };
    if (response.ok) {
      setCalendar(data);
      if (data.linkedEntry) {
        setStart(local(data.linkedEntry.startDatetime));
        setEnd(
          data.linkedEntry.endDatetime
            ? local(data.linkedEntry.endDatetime)
            : "",
        );
      }
    } else setMessage(data.error || "Não foi possível consultar a agenda.");
  }, [opportunity.id, start, end]);
  useEffect(() => {
    load();
  }, []);
  async function act(
    action: "INQUIRY" | "OPTION" | "CONFIRM" | "CANCEL_OPTION",
  ) {
    if (
      action === "CANCEL_OPTION" &&
      !window.confirm("Cancelar esta opção de data?")
    )
      return;
    setBusy(true);
    setMessage("");
    const response = await fetch(
        `/api/opportunities/${opportunity.id}/calendar`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            action,
            startDatetime: iso(start),
            endDatetime: iso(end),
          }),
        },
      ),
      data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Não foi possível atualizar a agenda.");
      return;
    }
    setMessage(
      action === "INQUIRY"
        ? "Consulta registrada."
        : action === "OPTION"
          ? "Opção criada."
          : action === "CONFIRM"
            ? "Data confirmada."
            : "Opção cancelada.",
    );
    await load();
    await refresh();
  }
  const status = calendar?.linkedEntry?.status;
  return (
    <article className="opportunity-calendar-card">
      <header>
        <div>
          <p className="eyebrow">Agenda comercial</p>
          <h2>Disponibilidade</h2>
        </div>
        {calendar && (
          <span
            className={`availability-pill availability-${calendar.availability.toLowerCase()}`}
          >
            {calendar.availability === "AVAILABLE"
              ? "Disponível"
              : calendar.availability === "ATTENTION"
                ? "Atenção"
                : "Conflito"}
          </span>
        )}
      </header>
      <div className="calendar-opportunity-dates">
        <label>
          Início
          <input
            type="datetime-local"
            disabled={readOnly}
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label>
          Término
          <input
            type="datetime-local"
            disabled={readOnly}
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
      </div>
      <button
        className="calendar-check-button"
        type="button"
        onClick={load}
        disabled={readOnly}
      >
        <Search />
        Consultar disponibilidade
      </button>
      {calendar?.conflicts.length ? (
        <div className="opportunity-conflicts">
          <b>
            <CircleAlert />
            Conflitos encontrados
          </b>
          {calendar.conflicts.map((conflict) => (
            <span key={conflict.id}>
              {conflict.title} · {conflict.status}
            </span>
          ))}
        </div>
      ) : (
        <p className="calendar-clear">
          <CalendarCheck2 />
          Nenhum bloqueio incompatível neste período.
        </p>
      )}
      {status && (
        <div className="linked-calendar-status">
          <Clock3 />
          <span>
            <small>Registro vinculado</small>
            <b>
              {status === "INQUIRY"
                ? "Consulta"
                : status === "OPTION"
                  ? "Opção ativa"
                  : "Data confirmada"}
            </b>
          </span>
        </div>
      )}
      {calendar?.show && (
        <div className="show-prepared">
          <CalendarCheck2 />
          <span>
            <small>Show</small>
            <b>Estrutura em preparação</b>
          </span>
        </div>
      )}
      {message && (
        <div
          className={message.includes("Conflito") ? "calendar-alert" : "notice"}
        >
          {message}
        </div>
      )}
      {!readOnly && (
        <div className="opportunity-calendar-actions">
          <button
            disabled={busy || status === "CONFIRMED"}
            onClick={() => act("INQUIRY")}
          >
            <Clock3 />
            Registrar consulta
          </button>
          <button
            disabled={busy || status === "CONFIRMED"}
            onClick={() => act("OPTION")}
          >
            <CalendarPlus />
            Criar opção
          </button>
          {status === "OPTION" && (
            <button
              className="cancel-option"
              disabled={busy}
              onClick={() => act("CANCEL_OPTION")}
            >
              <Trash2 />
              Cancelar opção
            </button>
          )}
          <button
            className="confirm-date"
            disabled={busy || status === "CONFIRMED"}
            onClick={() => act("CONFIRM")}
          >
            <CalendarCheck2 />
            Confirmar data
          </button>
        </div>
      )}
    </article>
  );
}
