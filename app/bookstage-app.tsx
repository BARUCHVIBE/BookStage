"use client";

import {
  ArrowLeft,
  ArrowRight,
  Building2,
  CalendarCheck2,
  CalendarDays,
  FileText,
  Handshake,
  Inbox,
  ListChecks,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Music2,
  Plus,
  Save,
  Settings,
  ShieldCheck,
  Sparkles,
  WalletCards,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { CalendarModule } from "@/app/components/calendar-module";
import { CatalogManager } from "@/app/components/catalog-manager";
import { CommercialCatalog } from "@/app/components/commercial-catalog";
import { CommercialRequestsModule } from "@/app/components/commercial-requests-module";
import { CrmModule } from "@/app/components/crm-module";
import { ContractsModule } from "@/app/components/contracts-module";
import { ShowsModule } from "@/app/components/shows-module";
import { RoleWorkQueue } from "@/app/components/role-work-queue";
import { DashboardModule } from "@/app/components/dashboard-module";
import { TeamModule } from "@/app/components/team-module";
import { OrganizationThemeProvider } from "@/app/components/organization-theme-provider";
import { AppearanceSelector } from "@/app/components/appearance-selector";
import { AccountSecurity } from "@/app/components/account-security";
import { SettingsModule } from "@/app/features/settings/branding/settings-module";
import {
  PlatformBrand,
  PlatformWatermark,
} from "@/app/components/platform-brand";
import { fetchJson } from "@/app/lib/http-client";
import { BRANDING_ASSET_ASPECT_RATIOS } from "@/app/lib/branding-assets";
import {
  navigationForRole,
  type NavigationIcon,
  type NavigationScreen,
} from "@/app/lib/navigation";
import type { Role } from "@/app/lib/tenant";
import { resolveInitialWorkspace } from "@/app/lib/workspace-selection";

type Org = {
  id: string;
  name: string;
  slug: string;
  email: string;
  phone?: string;
  document?: string;
  website?: string;
  instagram?: string;
  logo?: string;
  description?: string;
  role: string;
};
type Member = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  department?: string;
  artistAccessScope?: string;
  artistCount?: number;
  artistNames?: string[];
  opportunityCount?: number;
  salesCount?: number;
  commissionAmount?: number;
};
type PrimaryCommercial = {
  artistId: string;
  organizationId: string;
  userId: string;
  name: string;
  email: string;
  role: "OWNER" | "MANAGER" | "SALES";
};
type Artist = {
  id: string;
  name: string;
  status: string;
  primaryUserId?: string | null;
  primaryUserName?: string | null;
  primaryCommercial?: PrimaryCommercial | null;
  requiresPrimaryCommercial?: boolean;
  authorizedCount: number;
};
type PublicArtistFields = {
  id: string;
  name: string;
  slug?: string | null;
  status: string;
  photoUrl?: string | null;
  coverUrl?: string | null;
  genre?: string | null;
  description?: string | null;
  baseCity?: string | null;
  showFormats?: string | null;
  videoUrls?: string | null;
  instagram?: string | null;
  spotify?: string | null;
  youtube?: string | null;
  publicMaterials?: string | null;
  isPublic?: number | boolean;
};
type ArtistDetail = {
  artist: PublicArtistFields;
  primaryCommercial: PrimaryCommercial | null;
  assignments: Array<Member & { isPrimary: number }>;
  bookingCollaborators: Array<Pick<Member, "id" | "name" | "email" | "status">>;
  canManageAssignments: boolean;
};
const blank = {
  name: "",
  email: "",
  phone: "",
  document: "",
  website: "",
  instagram: "",
  logo: "",
  description: "",
};
const navigationIcons: Record<NavigationIcon, typeof LayoutDashboard> = {
  dashboard: LayoutDashboard,
  artists: Music2,
  agenda: CalendarDays,
  crm: Handshake,
  requests: Inbox,
  contracts: FileText,
  shows: CalendarCheck2,
  booking: Sparkles,
  team: Users,
  settings: Settings,
  workQueue: ListChecks,
  analysis: ShieldCheck,
  receipts: WalletCards,
};

function roleHome(role: string): NavigationScreen {
  return ["SALES", "FINANCE"].includes(role) ? "workQueue" : "dashboard";
}
function Brand() {
  return <PlatformBrand />;
}

export function BookStageApp({
  user,
}: {
  user: { id: string; email: string; name: string };
}) {
  const [organizations, setOrganizations] = useState<Org[]>([]),
    [active, setActive] = useState<Org | null>(null),
    [members, setMembers] = useState<Member[]>([]),
    [artists, setArtists] = useState<Artist[]>([]);
  const [screen, setScreen] = useState<NavigationScreen>("dashboard"),
    [selectedArtist, setSelectedArtist] = useState<ArtistDetail | null>(null),
    [responsibleFilter, setResponsibleFilter] = useState(""),
    [newArtistName, setNewArtistName] = useState(""),
    [newArtistPrimaryUserId, setNewArtistPrimaryUserId] = useState(""),
    [agendaArtistId, setAgendaArtistId] = useState(""),
    [crmInitialArtistId, setCrmInitialArtistId] = useState(""),
    [crmInitialOpportunityId, setCrmInitialOpportunityId] = useState("");
  const [primaryUserId, setPrimaryUserId] = useState(""),
    [authorizedUserIds, setAuthorizedUserIds] = useState<string[]>([]),
    [canManageAssignments, setCanManageAssignments] = useState(false),
    [artistNotice, setArtistNotice] = useState("");
  const [editing, setEditing] = useState(false),
    [formOpen, setFormOpen] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    [openingOrganization, setOpeningOrganization] = useState<Org | null>(null),
    [form, setForm] = useState(blank),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  const requestOrganizations = useCallback(
    () =>
      fetchJson<{
      organizations?: Org[];
      activeOrganizationId?: string | null;
      }>("/api/organizations", { cache: "no-store" }),
    [],
  );
  const loadOrganizations = useCallback(async () => {
    const result = await requestOrganizations();
    if (!result.ok) {
      setNotice(result.error || "Não foi possível carregar seus ambientes.");
      return null;
    }
    const d = result.data || {};
    setOrganizations(d.organizations || []);
    return d;
  }, [requestOrganizations]);
  const loadArtists = useCallback(async (filter = "") => {
    const suffix = filter ? `?responsibleId=${encodeURIComponent(filter)}` : "",
      result = await fetchJson<{
        artists?: Artist[];
        canManageAssignments?: boolean;
      }>(`/api/artists${suffix}`, { cache: "no-store" });
    if (result.ok) {
      setArtists(result.data?.artists || []);
      setCanManageAssignments(Boolean(result.data?.canManageAssignments));
    } else {
      setNotice(result.error || "Não foi possível carregar os artistas.");
    }
  }, []);
  useEffect(() => {
    let cancelled = false;
    void requestOrganizations()
      .then(async (result) => {
        if (cancelled) return;
        if (!result.ok) {
          setNotice(
            result.error || "Não foi possível carregar seus ambientes.",
          );
          return;
        }
        const data = result.data || {};
        const available = data.organizations || [],
          initial = resolveInitialWorkspace(
            available,
            data.activeOrganizationId,
          );
        setOrganizations(available);
        if (!initial.organization) return;
        setOpeningOrganization(initial.organization);
        if (initial.needsActivation) {
          const response = await fetchJson("/api/active-organization", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ organizationId: initial.organization.id }),
          });
          if (!response.ok || cancelled) {
            if (!cancelled) setNotice(response.error || "Não foi possível abrir esta organização.");
            return;
          }
        }
        if (!cancelled) {
          setActive(initial.organization);
          setScreen(roleHome(initial.organization.role));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setOpeningOrganization(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [requestOrganizations]);
  useEffect(() => {
    let cancelled = false;
    if (active) {
      if (["OWNER", "MANAGER"].includes(active.role))
        fetchJson<{ members?: Member[] }>(
          `/api/organizations/${active.id}/members`,
        ).then((result) => {
            if (!cancelled && result.ok)
              setMembers(result.data?.members || []);
          });
      else
        Promise.resolve().then(() => {
          if (!cancelled) setMembers([]);
        });
      const suffix = responsibleFilter
        ? `?responsibleId=${encodeURIComponent(responsibleFilter)}`
        : "";
      fetchJson<{
        artists?: Artist[];
        canManageAssignments?: boolean;
      }>(`/api/artists${suffix}`, { cache: "no-store" }).then((result) => {
          if (cancelled) return;
          if (result.ok) {
            setArtists(result.data?.artists || []);
            setCanManageAssignments(
              Boolean(result.data?.canManageAssignments),
            );
          } else {
            setArtists([]);
            setNotice(result.error || "Não foi possível carregar os artistas.");
          }
        });
    }
    return () => {
      cancelled = true;
    };
  }, [active, responsibleFilter]);
  async function saveOrganization(e: React.FormEvent) {
    e.preventDefault();
    const url =
        editing && active
          ? `/api/organizations/${active.id}`
          : "/api/organizations",
      result = await fetchJson<{ error?: string; organization?: Org }>(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
    if (!result.ok) {
      setNotice(result.error || "Não foi possível salvar.");
      return;
    }
    setNotice(editing ? "Organização atualizada." : "Organização criada.");
    setEditing(false);
    setFormOpen(false);
    setForm(blank);
    await loadOrganizations();
    if (result.data?.organization)
      await chooseOrganization(result.data.organization);
  }
  async function chooseOrganization(org: Org) {
    if (!org || openingOrganization) return;
    const previous = active;
    setOpeningOrganization(org);
    setActive(null);
    setMenuOpen(false);
    setMembers([]);
    setArtists([]);
    const result = await fetchJson<{ error?: string }>(
      "/api/active-organization",
      {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ organizationId: org.id }),
      },
    );
    if (result.ok) {
      setActive(org);
      setScreen(roleHome(org.role));
      setSelectedArtist(null);
      setAgendaArtistId("");
      setNotice("");
      setResponsibleFilter("");
    } else {
      setActive(previous);
      setNotice(result.error || "Não foi possível abrir esta organização.");
    }
    setOpeningOrganization(null);
  }
  async function openCommercialNegotiation(
    organizationId: string,
    artistId: string,
  ) {
    const organization = organizations.find(
      (item) => item.id === organizationId,
    );
    if (!organization) return;
    const activation = await fetchJson<{ error?: string }>(
      "/api/active-organization",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId }),
      },
    );
    if (!activation.ok) {
      setNotice(activation.error || "Não foi possível abrir esta organização.");
      return;
    }
    setArtists([]);
    setMembers([]);
    setResponsibleFilter("");
    setActive(organization);
    setCrmInitialArtistId(artistId);
    setCrmInitialOpportunityId("");
    setScreen("crm");
    setSelectedArtist(null);
  }
  async function openRequestOpportunity(
    organizationId: string,
    opportunityId: string,
  ) {
    const organization = organizations.find((item) => item.id === organizationId);
    if (!organization) return;
    const activation = await fetchJson<{ error?: string }>(
      "/api/active-organization",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ organizationId }),
      },
    );
    if (!activation.ok) {
      setNotice(activation.error || "Não foi possível abrir esta organização.");
      return;
    }
    setArtists([]);
    setMembers([]);
    setResponsibleFilter("");
    setActive(organization);
    setCrmInitialArtistId("");
    setCrmInitialOpportunityId(opportunityId);
    setScreen("crm");
  }
  function editOrganization() {
    if (!active) return;
    setForm({
      name: active.name,
      email: active.email,
      phone: active.phone || "",
      document: active.document || "",
      website: active.website || "",
      instagram: active.instagram || "",
      logo: active.logo || "",
      description: active.description || "",
    });
    setEditing(true);
    setFormOpen(true);
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    location.reload();
  }
  async function createArtist(e: React.FormEvent) {
    e.preventDefault();
    const result = await fetchJson<{ error?: string; artist?: Artist }>(
      "/api/artists",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: newArtistName,
          primaryUserId: newArtistPrimaryUserId,
        }),
      },
    );
    if (!result.ok) {
      setArtistNotice(result.error || "Não foi possível criar o artista.");
      return;
    }
    setNewArtistName("");
    setNewArtistPrimaryUserId("");
    setArtistNotice("Artista criado.");
    await loadArtists(responsibleFilter);
    if (result.data?.artist) await openArtist(result.data.artist.id);
  }
  async function openArtist(id: string) {
    const result = await fetchJson<ArtistDetail>(`/api/artists/${id}`, {
      cache: "no-store",
    });
    if (!result.ok || !result.data) {
      setArtistNotice(result.error || "Não foi possível carregar o artista.");
      return;
    }
    const d = result.data;
    setSelectedArtist(d);
    setPrimaryUserId(d.primaryCommercial?.userId || "");
    setAuthorizedUserIds(
      d.assignments.filter((item) => !item.isPrimary).map((item) => item.id),
    );
    setArtistNotice("");
  }
  async function saveAssignments() {
    if (!selectedArtist) return;
    const result = await fetchJson<{ error?: string }>(
        `/api/artists/${selectedArtist.artist.id}/sales-team`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            primaryUserId: primaryUserId || null,
            authorizedUserIds,
          }),
        },
      );
    if (!result.ok) {
      setArtistNotice(
        result.error || "Não foi possível salvar as atribuições.",
      );
      return;
    }
    setArtistNotice("Equipe comercial atualizada.");
    await openArtist(selectedArtist.artist.id);
    await loadArtists(responsibleFilter);
  }
  function toggleAuthorized(userId: string) {
    setAuthorizedUserIds((current) =>
      current.includes(userId)
        ? current.filter((id) => id !== userId)
        : [...current, userId],
    );
  }
  function openNavigation(destination: NavigationScreen) {
    if (destination === "agenda") {
      setResponsibleFilter("");
      setAgendaArtistId("");
    }
    setScreen(destination);
    setSelectedArtist(null);
    setMenuOpen(false);
  }
  function openQueueOpportunity(opportunityId: string) {
    setCrmInitialArtistId("");
    setCrmInitialOpportunityId(opportunityId);
    setScreen("crm");
    setSelectedArtist(null);
  }
  const commercialMembers = members.filter(
    (member) =>
      member.status === "ACTIVE" &&
      ["OWNER", "MANAGER", "SALES"].includes(member.role),
  );
  if (loading)
    return (
      <main className="center">
        <div className="loading">
          <span className="spinner" />
          Preparando seu ambiente…
        </div>
      </main>
    );
  if (!organizations.length || formOpen)
    return (
      <Onboarding
        form={form}
        setForm={setForm}
        save={saveOrganization}
        editing={editing}
        cancel={() => {
          setEditing(false);
          setFormOpen(false);
        }}
        notice={notice}
      />
    );
  if (!active)
    return (
      <OrganizationThemeProvider organizationId={null} userId={user.id}>
        <OrganizationSelection
          user={user}
          organizations={organizations}
          openingOrganization={openingOrganization}
          notice={notice}
          choose={chooseOrganization}
          logout={logout}
          createOrganization={() => {
            setForm(blank);
            setEditing(false);
            setFormOpen(true);
          }}
        />
      </OrganizationThemeProvider>
    );
  return (
    <OrganizationThemeProvider
      key={active.id}
      organizationId={active.id}
      userId={user.id}
      fallback={<WorkspaceOpening organization={active} />}
    >
      <div className="app-shell">
      <button
        className="mobile-menu-button"
        aria-label="Abrir menu"
        onClick={() => setMenuOpen(true)}
      >
        <Menu size={21} />
      </button>
      {menuOpen && (
        <button
          className="sidebar-backdrop"
          aria-label="Fechar menu"
          onClick={() => setMenuOpen(false)}
        />
      )}
      <aside className={`sidebar ${menuOpen ? "is-open" : ""}`}>
        <div className="sidebar-head">
          <Brand />
          <button
            className="mobile-close"
            aria-label="Fechar menu"
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} />
          </button>
        </div>
        <div className="sidebar-org">
          <div className={`org-avatar ${active.logo ? "has-logo" : ""}`}>
            {active.logo ? (
              // eslint-disable-next-line @next/next/no-img-element -- organization assets may be served by R2 or an existing HTTPS URL.
              <img src={active.logo} alt={`Logo de ${active.name}`} />
            ) : (
              active.name[0]
            )}
          </div>
          <div>
            <small>Workspace</small>
            <strong>{active.name}</strong>
          </div>
        </div>
        <nav aria-label="Navegação principal">
          {navigationForRole(active.role as Role).map((item) => {
            const Icon = navigationIcons[item.icon];
            return (
              <button
                key={item.capability}
                className={screen === item.destination ? "nav-active" : ""}
                aria-label={item.label}
                title={item.label}
                onClick={() => openNavigation(item.destination)}
              >
                <Icon />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-user">
          <div className="avatar">{user.name[0]}</div>
          <button
            className="sidebar-user-account"
            aria-label="Abrir segurança da conta"
            title="Segurança da conta"
            onClick={() => openNavigation("account")}
          >
            <b>{user.name}</b>
            <small>{user.email}</small>
          </button>
          <button
            className="logout-button"
            aria-label="Segurança da conta"
            title="Segurança da conta"
            onClick={() => openNavigation("account")}
          >
            <KeyRound size={17} />
          </button>
          <button
            className="logout-button"
            aria-label="Sair"
            title="Sair"
            onClick={logout}
          >
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <main className="workspace">
        <header className="topbar">
          <div className="org-picker">
            <small>Organização ativa</small>
            <div>
              <Building2 size={16} />
              <select
                aria-label="Organização ativa"
                value={active.id}
                onChange={(e) =>
                  chooseOrganization(
                    organizations.find((o) => o.id === e.target.value)!,
                  )
                }
              >
                {organizations.map((o) => (
                  <option value={o.id} key={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="topbar-actions">
            <AppearanceSelector />
            <button
              className="button button-secondary"
              onClick={() => {
                setForm(blank);
                setEditing(false);
                setFormOpen(true);
              }}
            >
              <Plus size={16} />
              Nova organização
            </button>
          </div>
        </header>
        <div className="page-content">
          <PlatformWatermark />
          {screen === "workQueue" || screen === "financeAnalysis" || screen === "receipts" ? (
            <RoleWorkQueue
              key={`${active.id}:${screen}`}
              role={active.role}
              initialView={screen === "receipts" ? "receipts" : screen === "financeAnalysis" ? "analysis" : "queue"}
              onOpenOpportunity={openQueueOpportunity}
            />
          ) : screen === "crm" ? (
            <CrmModule
              key={`${active.id}:${crmInitialArtistId}:${crmInitialOpportunityId}`}
              artists={artists}
              initialArtistId={crmInitialArtistId}
              startCreating={Boolean(crmInitialArtistId)}
              initialOpportunityId={crmInitialOpportunityId}
            />
          ) : screen === "requests" ? (
            <CommercialRequestsModule onOpenOpportunity={openRequestOpportunity} />
          ) : screen === "contracts" ? (
            <ContractsModule key={active.id} role={active.role} />
          ) : screen === "shows" ? (
            <ShowsModule key={active.id} />
          ) : screen === "catalog" ? (
            active.role === "BOOKING_AGENT" ? (
              <CommercialCatalog
                key={user.id}
                onCreateNegotiation={openCommercialNegotiation}
              />
            ) : (
              <CatalogManager
                key={active.id}
                organization={active}
                artists={artists}
                canManage={canManageAssignments}
              />
            )
          ) : screen === "team" ? (
            <TeamModule
              key={active.id}
              organizationId={active.id}
              onMembersChanged={() =>
                fetchJson<{ members?: Member[] }>(
                  `/api/organizations/${active.id}/members`,
                ).then((result) => {
                  if (result.ok) setMembers(result.data?.members || []);
                  else
                    setNotice(
                      result.error || "Não foi possível atualizar a equipe.",
                    );
                })
              }
            />
          ) : screen === "settings" ? (
            <SettingsModule
              key={active.id}
              organization={active}
              onOrganizationUpdated={(organization) => {
                const updated: Org = {
                  ...organization,
                  phone: organization.phone ?? undefined,
                  document: organization.document ?? undefined,
                  website: organization.website ?? undefined,
                  instagram: organization.instagram ?? undefined,
                  logo: organization.logo ?? undefined,
                  description: organization.description ?? undefined,
                };
                setActive(updated);
                setOrganizations((current) =>
                  current.map((item) =>
                    item.id === organization.id ? updated : item,
                  ),
                );
              }}
            />
          ) : screen === "account" ? (
            <AccountSecurity email={user.email} />
          ) : screen === "agenda" ? (
            <CalendarModule
              key={active.id}
              artists={artists}
              initialArtistId={agendaArtistId}
            />
          ) : screen === "artists" ? (
            <ArtistsModule
              artists={artists}
              members={commercialMembers}
              selected={selectedArtist}
              filter={responsibleFilter}
              setFilter={setResponsibleFilter}
              canManage={canManageAssignments}
              newArtistName={newArtistName}
              setNewArtistName={setNewArtistName}
              newArtistPrimaryUserId={newArtistPrimaryUserId}
              setNewArtistPrimaryUserId={setNewArtistPrimaryUserId}
              createArtist={createArtist}
              openArtist={openArtist}
              closeArtist={() => setSelectedArtist(null)}
              openAgenda={(id) => {
                setAgendaArtistId(id);
                setResponsibleFilter("");
                setScreen("agenda");
                setSelectedArtist(null);
              }}
              primaryUserId={primaryUserId}
              setPrimaryUserId={setPrimaryUserId}
              authorizedUserIds={authorizedUserIds}
              toggleAuthorized={toggleAuthorized}
              saveAssignments={saveAssignments}
              notice={artistNotice}
            />
          ) : (
            <Dashboard
              user={user}
              active={active}
              members={members}
              editOrganization={editOrganization}
            />
          )}
        </div>
      </main>
      </div>
    </OrganizationThemeProvider>
  );
}

const roleLabels: Record<string, string> = {
  OWNER: "Owner",
  MANAGER: "Gestão",
  SALES: "Comercial",
  BOOKING_AGENT: "Booking",
  PRODUCTION: "Produção",
  FINANCE: "Financeiro",
};

function WorkspaceOpening({ organization }: { organization: Org }) {
  return (
    <main className="workspace-opening" aria-live="polite" aria-busy="true">
      <PlatformWatermark />
      <span className="spinner" />
      <div>
        <strong>Abrindo {organization.name}...</strong>
        <small>Carregando permissões e identidade visual.</small>
      </div>
    </main>
  );
}

function OrganizationSelection({
  user,
  organizations,
  openingOrganization,
  notice,
  choose,
  logout,
  createOrganization,
}: {
  user: { name: string; email: string };
  organizations: Org[];
  openingOrganization: Org | null;
  notice: string;
  choose: (org: Org) => void;
  logout: () => void;
  createOrganization: () => void;
}) {
  return (
    <div className="organization-selection-shell">
      <header className="organization-selection-header">
        <Brand />
        <div className="organization-selection-actions">
          <AppearanceSelector />
          <div className="selection-user">
            <span className="avatar">{user.name[0]}</span>
            <div>
              <b>{user.name}</b>
              <small>{user.email}</small>
            </div>
          </div>
          <button
            className="selection-logout"
            aria-label="Sair"
            title="Sair"
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <main className="organization-selection-main">
        <PlatformWatermark />
        <section className="organization-selection-intro">
          <div className="empty-icon">
            <Building2 />
          </div>
          <p className="eyebrow">Seleção de organização</p>
          <h1>Bem-vindo(a) ao BookBusiness</h1>
          <p>Selecione o ambiente que deseja acessar.</p>
        </section>
        {notice && <p className="notice selection-notice">{notice}</p>}
        <section className="organization-card-grid" aria-label="Suas organizações">
          {organizations.map((organization) => {
            const opening = openingOrganization?.id === organization.id;
            return (
              <button
                className="organization-choice-card"
                key={organization.id}
                disabled={Boolean(openingOrganization)}
                aria-busy={opening}
                onClick={() => choose(organization)}
              >
                <span
                  className={`organization-card-logo ${organization.logo ? "has-logo" : ""}`}
                >
                  {organization.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- tenant logos can be served by private R2-backed routes.
                    <img src={organization.logo} alt="" />
                  ) : (
                    organization.name[0]
                  )}
                </span>
                <span className="organization-card-copy">
                  <b>{organization.name}</b>
                  <small>{roleLabels[organization.role] || organization.role}</small>
                </span>
                <span className="organization-card-action" aria-hidden="true">
                  {opening ? <span className="spinner" /> : <ArrowRight size={18} />}
                </span>
                {opening && <small className="organization-opening-label">Abrindo ambiente...</small>}
              </button>
            );
          })}
        </section>
        <button className="button button-secondary selection-create" onClick={createOrganization}>
          <Plus size={16} />
          Nova organização
        </button>
      </main>
    </div>
  );
}
function Dashboard({
  user,
  active,
}: {
  user: { name: string };
  active: Org;
  members: Member[];
  editOrganization: () => void;
}) {
  return (
    <DashboardModule userName={user.name} organizationName={active.name} />
  );
}

function ArtistsModule(props: {
  artists: Artist[];
  members: Member[];
  selected: ArtistDetail | null;
  filter: string;
  setFilter: (v: string) => void;
  canManage: boolean;
  newArtistName: string;
  setNewArtistName: (v: string) => void;
  newArtistPrimaryUserId: string;
  setNewArtistPrimaryUserId: (v: string) => void;
  createArtist: (e: React.FormEvent) => void;
  openArtist: (id: string) => void;
  closeArtist: () => void;
  openAgenda: (id: string) => void;
  primaryUserId: string;
  setPrimaryUserId: (id: string) => void;
  authorizedUserIds: string[];
  toggleAuthorized: (id: string) => void;
  saveAssignments: () => void;
  notice: string;
}) {
  if (props.selected)
    return (
      <section className="artist-profile">
        <button className="back-button" onClick={props.closeArtist}>
          <ArrowLeft />
          Voltar para artistas
        </button>
        <div className="artist-profile-head">
          <div className="artist-monogram">{props.selected.artist.name[0]}</div>
          <div>
            <p className="eyebrow">Perfil do artista</p>
            <h1>{props.selected.artist.name}</h1>
            <span className="status-badge">{props.selected.artist.status}</span>
          </div>
          <button
            className="button button-secondary artist-agenda-button"
            onClick={() => props.openAgenda(props.selected!.artist.id)}
          >
            <CalendarDays size={16} />
            Ver agenda do artista
          </button>
        </div>
        <section className="commercial-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Equipe comercial</p>
              <h2>Responsáveis pelo relacionamento</h2>
              <p>
                Esta definição poderá ser herdada automaticamente por
                oportunidades futuras.
              </p>
            </div>
            {props.selected.canManageAssignments && (
              <button
                className="button button-primary"
                onClick={props.saveAssignments}
              >
                <Save size={16} />
                Salvar atribuições
              </button>
            )}
          </div>
          {props.notice && <div className="notice">{props.notice}</div>}
          {props.selected.artist.status === "ACTIVE" &&
            !props.selected.primaryCommercial && (
              <div className="notice notice-warning">
                Este artista ativo precisa de um responsável comercial
                principal.
              </div>
            )}
          <div className="assignment-grid">
            <label>
              Responsável comercial principal
              <select
                value={props.primaryUserId}
                disabled={!props.selected.canManageAssignments}
                onChange={(e) => props.setPrimaryUserId(e.target.value)}
              >
                <option value="">Sem responsável principal</option>
                {props.selected.primaryCommercial &&
                  !props.members.some(
                    (member) =>
                      member.id === props.selected!.primaryCommercial!.userId,
                  ) && (
                    <option value={props.selected.primaryCommercial.userId}>
                      {props.selected.primaryCommercial.name} ·{" "}
                      {props.selected.primaryCommercial.role}
                    </option>
                  )}
                {props.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} · {member.role}
                  </option>
                ))}
              </select>
              <small>Será o responsável padrão em oportunidades futuras.</small>
            </label>
            <fieldset disabled={!props.selected.canManageAssignments}>
              <legend>Comerciais autorizados</legend>
              <div className="authorized-list">
                {props.members
                  .filter((member) => member.id !== props.primaryUserId)
                  .map((member) => (
                    <label className="authorized-option" key={member.id}>
                      <span className="sr-only">Autorizar comercial</span>
                      <input
                        type="checkbox"
                        checked={props.authorizedUserIds.includes(member.id)}
                        onChange={() => props.toggleAuthorized(member.id)}
                      />
                      <span>
                        <b>{member.name}</b>
                        <small>
                          {member.email} · {member.role}
                        </small>
                      </span>
                    </label>
                  ))}
              </div>
            </fieldset>
          </div>
        </section>
        <section className="commercial-card">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Colaboradores de Booking</p>
              <h2>Parceiros autorizados para este artista</h2>
              <p>
                Estes colaboradores podem negociar e preparar uma venda, mas a
                validação permanece com o comercial interno acima.
              </p>
            </div>
            <span className="count-badge">
              {props.selected.bookingCollaborators.length}
            </span>
          </div>
          <div className="authorized-list">
            {props.selected.bookingCollaborators.map((member) => (
              <div className="authorized-option" key={member.id}>
                <Users size={18} />
                <span>
                  <b>{member.name}</b>
                  <small>{member.email} · Booking</small>
                </span>
              </div>
            ))}
            {!props.selected.bookingCollaborators.length && (
              <p className="table-empty">
                Nenhum colaborador de Booking autorizado. Faça a vinculação pela
                aba Equipe.
              </p>
            )}
          </div>
        </section>
      </section>
    );
  return (
    <section>
      <div className="page-heading artists-heading">
        <div>
          <p className="eyebrow">Artistas</p>
          <h1>Gestão de artistas</h1>
          <p>
            Visualize responsáveis e organize a cobertura comercial da sua
            equipe.
          </p>
        </div>
        {props.canManage && (
          <form className="quick-create" onSubmit={props.createArtist}>
            <input
              aria-label="Nome do novo artista"
              placeholder="Nome do artista"
              value={props.newArtistName}
              onChange={(e) => props.setNewArtistName(e.target.value)}
            />
            <select
              aria-label="Responsável principal do novo artista"
              value={props.newArtistPrimaryUserId}
              onChange={(e) =>
                props.setNewArtistPrimaryUserId(e.target.value)
              }
              required
            >
              <option value="">Responsável principal</option>
              {props.members.map((member) => (
                <option key={member.id} value={member.id}>
                  {member.name}
                </option>
              ))}
            </select>
            <button className="button button-primary">
              <Plus size={16} />
              Adicionar artista
            </button>
          </form>
        )}
      </div>
      {props.notice && <div className="notice">{props.notice}</div>}
      <div className="artists-toolbar">
        <label>
          Filtrar por responsável
          <select
            value={props.filter}
            onChange={(e) => props.setFilter(e.target.value)}
          >
            <option value="">Todos os responsáveis</option>
            {props.members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name}
              </option>
            ))}
          </select>
        </label>
        <span>
          {props.artists.length}{" "}
          {props.artists.length === 1 ? "artista" : "artistas"}
        </span>
      </div>
      <div className="artists-table">
        <div className="artists-table-head">
          <span>Artista</span>
          <span>Responsável principal</span>
          <span>Autorizados</span>
          <span>Status</span>
          <span />
        </div>
        {props.artists.map((artist) => (
          <div className="artist-row" key={artist.id}>
            <div className="artist-cell">
              <span>{artist.name[0]}</span>
              <b>{artist.name}</b>
            </div>
            <span>
              {artist.primaryCommercial?.name ||
                artist.primaryUserName ||
                "Não atribuído · ação necessária"}
            </span>
            <span>{Number(artist.authorizedCount) || 0}</span>
            <em className="status-badge">{artist.status}</em>
            <button
              className="table-action"
              onClick={() => props.openArtist(artist.id)}
            >
              Abrir
            </button>
          </div>
        ))}
        {!props.artists.length && (
          <div className="table-empty">
            Nenhum artista encontrado para este filtro.
          </div>
        )}
      </div>
    </section>
  );
}
function Onboarding({
  form,
  setForm,
  save,
  editing,
  cancel,
  notice,
}: {
  form: typeof blank;
  setForm: (x: typeof blank) => void;
  save: (e: React.FormEvent) => void;
  editing: boolean;
  cancel: () => void;
  notice: string;
}) {
  const field = (
    key: keyof typeof blank,
    label: string,
    placeholder = "",
    hint?: string,
  ) => (
    <label>
      {label}
      {hint && <small className="image-field-hint">{hint}</small>}
      <input
        value={form[key]}
        placeholder={placeholder}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
      />
    </label>
  );
  return (
    <main className="onboarding">
      <section className="onboard-intro">
        <Brand />
        <div>
          <p className="eyebrow">
            {editing ? "Configurações" : "Primeiro passo"}
          </p>
          <h1>
            {editing
              ? "Ajuste os dados da organização."
              : "Vamos preparar seu ambiente."}
          </h1>
          <p>
            Essa organização será o espaço seguro e isolado onde sua operação de
            shows vai acontecer.
          </p>
          <ul>
            <li>
              <ShieldCheck />
              Isolamento por organização
            </li>
            <li>
              <Users />
              Perfis e permissões no servidor
            </li>
            <li>
              <LayoutDashboard />
              Base pronta para crescer
            </li>
          </ul>
        </div>
        <p className="product-line">
          Todo o modelo operacional de shows em um só lugar.
        </p>
      </section>
      <form className="organization-form" onSubmit={save}>
        <div className="form-heading">
          <span className="form-step">01</span>
          <div>
            <p className="eyebrow">Dados da organização</p>
            <h2>{editing ? "Editar organização" : "Crie sua organização"}</h2>
          </div>
        </div>
        {notice && <div className="notice">{notice}</div>}
        {field("name", "Nome da organização *", "Ex.: Aurora Produções")}
        {field("email", "E-mail comercial *", "contato@empresa.com.br")}
        <div className="form-row">
          {field("phone", "Telefone", "(11) 99999-9999")}
          {field("document", "CNPJ (opcional)", "00.000.000/0001-00")}
        </div>
        {field("website", "Website", "https://")}
        {field("instagram", "Instagram", "@suaempresa")}
        {field(
          "logo",
          "URL do logo",
          "https://...",
          `Proporção recomendada ${BRANDING_ASSET_ASPECT_RATIOS.logo}`,
        )}
        <div className="form-actions">
          {editing && (
            <button
              type="button"
              className="button button-secondary"
              onClick={cancel}
            >
              Cancelar
            </button>
          )}
          <button className="button button-primary">
            {editing ? "Salvar alterações" : "Criar meu ambiente"}
          </button>
        </div>
      </form>
    </main>
  );
}
