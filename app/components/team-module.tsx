"use client";
/* eslint-disable react-hooks/set-state-in-effect -- loader synchronizes the active tenant's team after organization changes. */

import {
  ArrowLeft,
  BadgeDollarSign,
  BriefcaseBusiness,
  Building2,
  Check,
  Link2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  department: string;
  artistAccessScope: string;
  status: string;
  artistCount: number;
  artistNames: string[];
  opportunityCount: number;
  salesCount: number;
  commissionAmount: number;
};
type Detail = {
  member: Member;
  artists: Array<{
    id: string;
    name: string;
    assigned: number;
    isPrimary: number;
  }>;
  activities: Array<{
    id: string;
    description: string;
    createdAt: string;
    createdByName: string;
  }>;
  links: Array<{
    id: string;
    artistName: string;
    status: string;
    tokenPrefix: string;
    visits: number;
    leads: number;
    proposals: number;
    sales: number;
  }>;
  opportunities: { total: number; won: number; soldValue: number };
  commissions: Array<{ status: string; count: number; amount: number }>;
  canManage: boolean;
  canManageLinks: boolean;
};
const departments = [
  ["MANAGEMENT", "Gestão"],
  ["COMMERCIAL", "Comercial"],
  ["PRODUCTION", "Produção"],
  ["FINANCE", "Financeiro"],
] as const;
const roleLabel: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Manager",
  SALES: "Sales",
  BOOKING_AGENT: "Booking Agent",
  PRODUCTION: "Production",
  FINANCE: "Finance",
};
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0) / 100,
  );

export function TeamModule({
  organizationId,
  onMembersChanged,
}: {
  organizationId: string;
  onMembersChanged?: () => void;
}) {
  const [members, setMembers] = useState<Member[]>([]),
    [artists, setArtists] = useState<Array<{ id: string; name: string }>>([]),
    [selected, setSelected] = useState<Detail | null>(null),
    [canManage, setCanManage] = useState(false),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [creationKind, setCreationKind] = useState<"MEMBER" | "BOOKING" | null>(null),
    [linkArtistId, setLinkArtistId] = useState(""),
    [generatedLink, setGeneratedLink] = useState("");
  const [newMember, setNewMember] = useState({
    name: "",
    email: "",
    password: "",
    role: "SALES",
    department: "COMMERCIAL",
    artistIds: [] as string[],
  });
  const [form, setForm] = useState({
    name: "",
    role: "SALES",
    department: "COMMERCIAL",
    status: "ACTIVE",
    artistAccessScope: "ASSIGNED",
    artistIds: [] as string[],
  });
  const load = useCallback(async () => {
    const response = await fetch(
        `/api/organizations/${organizationId}/members`,
      ),
      data = (await response.json()) as {
        members?: Member[];
        artists?: Array<{ id: string; name: string }>;
        canManage?: boolean;
        error?: string;
      };
    if (response.ok) {
      setMembers(data.members || []);
      setArtists(data.artists || []);
      setCanManage(Boolean(data.canManage));
      setMessage("");
    } else setMessage(data.error || "Não foi possível carregar a equipe.");
  }, [organizationId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function open(userId: string) {
    const response = await fetch(
        `/api/organizations/${organizationId}/members/${userId}`,
      ),
      data = (await response.json()) as Detail & { error?: string };
    if (!response.ok) {
      setMessage(data.error || "Não foi possível abrir o perfil.");
      return;
    }
    setSelected(data);
    setForm({
      name: data.member.name,
      role: data.member.role,
      department: data.member.department,
      status: data.member.status,
      artistAccessScope: data.member.artistAccessScope,
      artistIds: data.artists
        .filter((item) => item.assigned)
        .map((item) => item.id),
    });
    setCanManage(data.canManage);
    setLinkArtistId(
      data.artists.find((item) => item.assigned)?.id ||
        data.artists[0]?.id ||
        "",
    );
  }
  async function generateLink() {
    if (!selected?.member.id || !linkArtistId) {
      setMessage("Não foi possível identificar o colaborador selecionado.");
      return;
    }
    setBusy(true);
    const response = await fetch("/api/referral-links", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          userId: selected.member.id,
          artistId: linkArtistId,
        }),
      }),
      data = (await response.json()) as { url?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.url) {
      setMessage(data.error || "Não foi possível gerar o link.");
      return;
    }
    setGeneratedLink(data.url);
    await navigator.clipboard?.writeText(data.url);
    setMessage(
      "Link comercial gerado e copiado. Ele será exibido somente agora.",
    );
    await open(selected.member.id);
  }
  async function revokeLink(id: string) {
    if (
      !window.confirm(
        "Revogar este link? Leads e métricas anteriores serão preservados.",
      )
    )
      return;
    const response = await fetch("/api/referral-links", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id }),
      }),
      data = (await response.json()) as { error?: string };
    if (!response.ok) {
      setMessage(data.error || "Não foi possível revogar.");
      return;
    }
    if (selected) await open(selected.member.id);
  }
  async function save() {
    if (!selected?.member.id) {
      setMessage("Não foi possível identificar o colaborador selecionado.");
      return;
    }
    setBusy(true);
    const response = await fetch(
        `/api/organizations/${organizationId}/members/${selected.member.id}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(form),
        },
      ),
      data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Não foi possível salvar.");
      return;
    }
    setMessage("Perfil atualizado com histórico de auditoria.");
    await load();
    await open(selected.member.id);
    onMembersChanged?.();
  }
  function toggleArtist(id: string) {
    setForm((current) => ({
      ...current,
      artistIds: current.artistIds.includes(id)
        ? current.artistIds.filter((item) => item !== id)
        : [...current.artistIds, id],
    }));
  }
  function toggleNewBookingArtist(id: string) {
    setNewMember((current) => ({
      ...current,
      artistIds: current.artistIds.includes(id)
        ? current.artistIds.filter((item) => item !== id)
        : [...current.artistIds, id],
    }));
  }
  async function createAccess() {
    if (busy) return;
    setBusy(true);
    const response = await fetch(
        `/api/organizations/${organizationId}/members`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...newMember,
            role:
              creationKind === "BOOKING" ? "BOOKING_AGENT" : newMember.role,
          }),
        },
      ),
      data = (await response.json()) as { id?: string; error?: string };
    setBusy(false);
    if (!response.ok || !data.id) {
      setMessage(data.error || "Não foi possível criar o acesso.");
      return;
    }
    setMessage(
      "Acesso criado. Entregue o e-mail e a senha inicial ao usuário.",
    );
    setCreationKind(null);
    setNewMember({
      name: "",
      email: "",
      password: "",
      role: "SALES",
      department: "COMMERCIAL",
      artistIds: [],
    });
    await load();
    await open(data.id);
    onMembersChanged?.();
  }
  async function removeAccess() {
    if (!selected?.member.id) return;
    if (
      !window.confirm(
        `Remover o acesso de ${selected.member.name}? O histórico será preservado.`,
      )
    )
      return;
    setBusy(true);
    const response = await fetch(
        `/api/organizations/${organizationId}/members/${selected.member.id}`,
        { method: "DELETE" },
      ),
      data = (await response.json()) as { error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Não foi possível remover o acesso.");
      return;
    }
    setSelected(null);
    setMessage("Acesso removido da empresa. O histórico foi preservado.");
    await load();
    onMembersChanged?.();
  }
  const internalMembers = members.filter(
      (member) => member.role !== "BOOKING_AGENT",
    ),
    bookingMembers = members.filter(
      (member) => member.role === "BOOKING_AGENT",
    );
  if (selected)
    return (
      <section className="team-module">
        <button className="back-button" onClick={() => setSelected(null)}>
          <ArrowLeft />
          Voltar para equipe
        </button>
        <div className="team-profile-head">
          <div className="team-avatar">{selected.member.name[0]}</div>
          <div>
            <p className="eyebrow">
              {selected.member.role === "BOOKING_AGENT"
                ? "Colaborador de Booking"
                : "Membro da empresa"}
            </p>
            <h1>{selected.member.name}</h1>
            <span>
              {roleLabel[selected.member.role] || selected.member.role} ·{" "}
              {selected.member.email}
            </span>
          </div>
        </div>
        {message && <div className="notice">{message}</div>}
        <div className="team-stats">
          <Metric
            icon={<BriefcaseBusiness />}
            label="Oportunidades"
            value={String(selected.opportunities?.total || 0)}
          />
          <Metric
            icon={<Check />}
            label="Vendas"
            value={String(selected.opportunities?.won || 0)}
          />
          <Metric
            icon={<BadgeDollarSign />}
            label="Valor vendido"
            value={money(selected.opportunities?.soldValue || 0)}
          />
          <Metric
            icon={<Link2 />}
            label="Links comerciais"
            value={String(selected.links.length)}
          />
        </div>
        <div className="team-profile-grid">
          <section className="team-editor">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Acesso e função</p>
                <h2>Configuração do perfil</h2>
              </div>
              {canManage && (
                <div className="team-heading-actions">
                  {selected.member.role !== "OWNER" && (
                    <button
                      className="button button-danger"
                      disabled={busy}
                      onClick={removeAccess}
                    >
                      <Trash2 size={16} />
                      Remover acesso
                    </button>
                  )}
                  <button
                    className="button button-primary"
                    disabled={busy}
                    onClick={save}
                  >
                    <Save size={16} />
                    {busy ? "Salvando…" : "Salvar"}
                  </button>
                </div>
              )}
            </div>
            <div className="form-row">
              <label>
                Nome
                <input
                  disabled={!canManage}
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>
              <label>
                Setor
                <select
                  disabled={!canManage}
                  value={form.department}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      department: event.target.value,
                    }))
                  }
                >
                  {departments.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Papel
                <select
                  disabled={!canManage}
                  value={form.role}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      role: event.target.value,
                    }))
                  }
                >
                  {Object.entries(roleLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Status
                <select
                  disabled={!canManage}
                  value={form.status}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      status: event.target.value,
                    }))
                  }
                >
                  <option value="ACTIVE">Ativo</option>
                  <option value="INACTIVE">Inativo</option>
                  <option value="INVITED">Convidado</option>
                </select>
              </label>
            </div>
            <label>
              Escopo de artistas
              <select
                disabled={!canManage}
                value={form.artistAccessScope}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    artistAccessScope: event.target.value,
                  }))
                }
              >
                <option value="ALL">Todos os artistas</option>
                <option value="ASSIGNED">Somente artistas selecionados</option>
              </select>
            </label>
            {form.artistAccessScope === "ASSIGNED" && (
              <fieldset className="team-artist-picker" disabled={!canManage}>
                <legend>Artistas autorizados</legend>
                {selected.artists.map((artist) => (
                  <label key={artist.id}>
                    <input
                      type="checkbox"
                      checked={form.artistIds.includes(artist.id)}
                      onChange={() => toggleArtist(artist.id)}
                    />
                    <span>
                      {artist.name}
                      {artist.isPrimary ? " · responsável principal" : ""}
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
          </section>
          <aside className="team-history">
            <p className="eyebrow">Links comerciais</p>
            <h2>Origem rastreável</h2>
            {selected.canManageLinks &&
              selected.member.role === "BOOKING_AGENT" && (
                <div className="team-link-create">
                  <select
                    value={linkArtistId}
                    onChange={(event) => setLinkArtistId(event.target.value)}
                  >
                    {selected.artists
                      .filter(
                        (artist) =>
                          form.artistAccessScope === "ALL" ||
                          form.artistIds.includes(artist.id),
                      )
                      .map((artist) => (
                        <option value={artist.id} key={artist.id}>
                          {artist.name}
                        </option>
                      ))}
                  </select>
                  <button
                    className="button button-secondary"
                    disabled={busy || !linkArtistId}
                    onClick={generateLink}
                  >
                    <Link2 />
                    Gerar link
                  </button>
                </div>
              )}
            {selected.member.role !== "BOOKING_AGENT" && (
              <p className="table-empty">
                Links por artista são exclusivos para colaboradores de Booking e
                são gerados pela empresa.
              </p>
            )}
            {generatedLink && (
              <div className="generated-link">
                <input readOnly value={generatedLink} />
                <button
                  onClick={() => navigator.clipboard?.writeText(generatedLink)}
                >
                  Copiar
                </button>
              </div>
            )}
            {selected.links.map((link) => (
              <article key={link.id}>
                <Link2 />
                <div>
                  <b>{link.artistName}</b>
                  <small>
                    {link.status} · token {link.tokenPrefix}…
                  </small>
                  <small>
                    {link.visits || 0} visitas · {link.leads || 0} leads ·{" "}
                    {link.proposals || 0} propostas · {link.sales || 0} vendas
                  </small>
                </div>
                {selected.canManageLinks && link.status === "ACTIVE" && (
                  <button
                    className="link-revoke"
                    onClick={() => revokeLink(link.id)}
                  >
                    Revogar
                  </button>
                )}
              </article>
            ))}
            <hr />
            <p className="eyebrow">Rastreabilidade</p>
            <h2>Atividade do perfil</h2>
            {selected.activities.map((item) => (
              <article key={item.id}>
                <ShieldCheck />
                <div>
                  <b>{item.description}</b>
                  <small>
                    {item.createdByName} ·{" "}
                    {new Date(item.createdAt).toLocaleString("pt-BR")}
                  </small>
                </div>
              </article>
            ))}
            {!selected.activities.length && (
              <p className="table-empty">Nenhuma alteração registrada.</p>
            )}
          </aside>
        </div>
      </section>
    );
  return (
    <section className="team-module">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Equipe</p>
          <h1>Equipe da empresa e Booking</h1>
          <p>
            Separe a operação interna dos colaboradores externos autorizados por
            artista.
          </p>
        </div>
        <div className="team-heading-actions">
          {canManage && (
            <>
              <button
                className="button button-secondary"
                onClick={() => {
                  setCreationKind("MEMBER");
                  setNewMember((current) => ({
                    ...current,
                    role: "SALES",
                    department: "COMMERCIAL",
                    artistIds: [],
                  }));
                }}
              >
                <Building2 size={16} />
                Adicionar membro
              </button>
              <button
                className="button button-primary"
                onClick={() => {
                  setCreationKind("BOOKING");
                  setNewMember((current) => ({
                    ...current,
                    role: "SALES",
                    department: "COMMERCIAL",
                    artistIds: [],
                  }));
                }}
              >
                <Plus size={16} />
                Adicionar Booking
              </button>
            </>
          )}
          <span className="count-badge">
            <Users size={16} />
            {members.length} pessoas
          </span>
        </div>
      </div>
      {message && <div className="calendar-alert">{message}</div>}
      {creationKind && (
        <section className="team-create-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Novo acesso</p>
              <h2>
                {creationKind === "BOOKING"
                  ? "Adicionar colaborador de Booking"
                  : "Adicionar membro da empresa"}
              </h2>
              <p>
                {creationKind === "BOOKING"
                  ? "Crie as credenciais e determine quais agendas poderão ser acessadas."
                  : "Crie as credenciais e defina a função e o setor do membro interno."}
              </p>
            </div>
          </div>
          <div className="form-row">
            <label>
              Nome
              <input
                value={newMember.name}
                autoComplete="name"
                onChange={(event) =>
                  setNewMember((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              E-mail de acesso
              <input
                type="email"
                value={newMember.email}
                autoComplete="email"
                onChange={(event) =>
                  setNewMember((current) => ({
                    ...current,
                    email: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <label>
            Senha inicial
            <input
              type="password"
              value={newMember.password}
              autoComplete="new-password"
              placeholder="Mínimo de 12 caracteres"
              onChange={(event) =>
                setNewMember((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
            />
            <small>
              Use letra maiúscula, minúscula e número. A senha não será exibida
              novamente.
            </small>
          </label>
          {creationKind === "MEMBER" && (
            <div className="form-row">
              <label>
                Função
                <select
                  value={newMember.role}
                  onChange={(event) => {
                    const role = event.target.value;
                    setNewMember((current) => ({
                      ...current,
                      role,
                      department:
                        role === "MANAGER"
                          ? "MANAGEMENT"
                          : role === "PRODUCTION"
                            ? "PRODUCTION"
                            : role === "FINANCE"
                              ? "FINANCE"
                              : "COMMERCIAL",
                      artistIds: role === "SALES" ? current.artistIds : [],
                    }));
                  }}
                >
                  <option value="MANAGER">Manager</option>
                  <option value="SALES">Comercial</option>
                  <option value="PRODUCTION">Produção</option>
                  <option value="FINANCE">Financeiro</option>
                </select>
              </label>
              <label>
                Setor
                <select
                  value={newMember.department}
                  onChange={(event) =>
                    setNewMember((current) => ({
                      ...current,
                      department: event.target.value,
                    }))
                  }
                >
                  {departments.map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {(creationKind === "BOOKING" || newMember.role === "SALES") && (
            <fieldset className="team-artist-picker">
              <legend>
                Artistas autorizados
                {creationKind === "BOOKING" ? " (obrigatório)" : " (opcional)"}
              </legend>
              {artists.map((artist) => (
                <label key={artist.id}>
                  <input
                    type="checkbox"
                    checked={newMember.artistIds.includes(artist.id)}
                    onChange={() => toggleNewBookingArtist(artist.id)}
                  />
                  <span>{artist.name}</span>
                </label>
              ))}
              {!artists.length && (
                <p className="table-empty">Nenhum artista ativo disponível.</p>
              )}
            </fieldset>
          )}
          <div className="team-create-actions">
            <button
              className="button button-secondary"
              disabled={busy}
              onClick={() => setCreationKind(null)}
            >
              Cancelar
            </button>
            <button
              className="button button-primary"
              disabled={
                busy ||
                (creationKind === "BOOKING" && !newMember.artistIds.length)
              }
              onClick={createAccess}
            >
              <Save size={16} />
              {busy ? "Criando…" : "Criar acesso"}
            </button>
          </div>
        </section>
      )}
      <section className="team-group-section">
        <header className="team-group-heading">
          <div className="team-group-title">
            <Building2 />
            <div>
              <p className="eyebrow">Escritório</p>
              <h2>Membros da empresa</h2>
              <p>Equipe interna organizada por setor e função.</p>
            </div>
          </div>
          <span className="count-badge">{internalMembers.length} membros</span>
        </header>
        <div className="department-sections">
        {departments.map(([key, label]) => {
          const group = internalMembers.filter(
            (item) => item.department === key,
          );
          return (
            <section key={key} className="department-panel">
              <header>
                <div>
                  <p className="eyebrow">Setor</p>
                  <h2>{label}</h2>
                </div>
                <span>{group.length}</span>
              </header>
              <div className="team-cards">
                {group.map((member) => (
                  <button
                    key={member.id}
                    className="team-card"
                    onClick={() => open(member.id)}
                  >
                    <span className="team-avatar small">{member.name[0]}</span>
                    <span>
                      <b>{member.name}</b>
                      <small>{member.email}</small>
                      <em>{roleLabel[member.role] || member.role}</em>
                    </span>
                    <span
                      className={`member-status ${member.status.toLowerCase()}`}
                    >
                      {member.status === "ACTIVE"
                        ? "Ativo"
                        : member.status === "INACTIVE"
                          ? "Inativo"
                          : "Convidado"}
                    </span>
                    <span className="team-card-scope">
                      <UserRoundCheck />
                      {member.artistAccessScope === "ALL"
                        ? "Todos os artistas"
                        : `${Number(member.artistCount) || 0} artistas`}
                    </span>
                    <span className="team-card-result">
                      {Number(member.opportunityCount) || 0} oportunidades ·{" "}
                      {Number(member.salesCount) || 0} vendas
                    </span>
                  </button>
                ))}
                {!group.length && (
                  <p className="table-empty">Nenhum membro neste setor.</p>
                )}
              </div>
            </section>
          );
        })}
        </div>
      </section>
      <section className="team-group-section">
        <header className="team-group-heading">
          <div className="team-group-title">
            <Users />
            <div>
              <p className="eyebrow">Rede comercial externa</p>
              <h2>Colaboradores de Booking</h2>
              <p>
                Acessam somente as agendas dos artistas autorizados pela empresa.
              </p>
            </div>
          </div>
          <span className="count-badge">{bookingMembers.length} bookings</span>
        </header>
        <div className="department-panel">
          <div className="team-cards">
            {bookingMembers.map((member) => (
              <button
                key={member.id}
                className="team-card"
                onClick={() => open(member.id)}
              >
                <span className="team-avatar small">{member.name[0]}</span>
                <span>
                  <b>{member.name}</b>
                  <small>{member.email}</small>
                  <em>Booking Agent</em>
                </span>
                <span
                  className={`member-status ${member.status.toLowerCase()}`}
                >
                  {member.status === "ACTIVE"
                    ? "Ativo"
                    : member.status === "INACTIVE"
                      ? "Inativo"
                      : "Convidado"}
                </span>
                <span className="team-card-scope">
                  <UserRoundCheck />
                  {Number(member.artistCount) || 0} artistas
                </span>
                <span className="team-card-result">
                  {Number(member.opportunityCount) || 0} oportunidades ·{" "}
                  {Number(member.salesCount) || 0} vendas
                </span>
              </button>
            ))}
            {!bookingMembers.length && (
              <p className="table-empty">
                Nenhum colaborador de Booking cadastrado.
              </p>
            )}
          </div>
        </div>
      </section>
    </section>
  );
}

function Metric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article>
      {icon}
      <span>
        <small>{label}</small>
        <b>{value}</b>
      </span>
    </article>
  );
}
