"use client";
/* eslint-disable react-hooks/set-state-in-effect -- loaders synchronize authenticated server state when the selected opportunity changes. */
import {
  BadgeCheck,
  Check,
  CircleDollarSign,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "@/app/lib/http-client";
import {
  approvalStatusLabel,
  commissionStatusLabel,
  commissionTypeLabel,
} from "@/app/lib/status-labels";
type Approval = {
  id: string;
  kind: "COMMERCIAL" | "FINANCIAL";
  status: string;
  requestedAt: string;
  reviewedAt: string | null;
  notes: string | null;
  requestedByName: string;
  reviewedByName: string | null;
};
type Item = {
  id: string;
  kind: "REVENUE" | "COST";
  category: string;
  description: string;
  quantity: number;
  unitAmount: number;
  totalAmount: number;
  status: string;
};
type Summary = {
  grossRevenue: number;
  costs: number;
  taxes: number;
  commissions: number;
  result: number;
  marginPercentage: number | null;
};
type Commission = {
  id: string;
  userId: string;
  userName: string;
  type: string;
  method: string;
  calculationBase: string;
  percentage: number | null;
  baseAmount: number;
  amount: number;
  status: string;
};
type Beneficiary = {
  userId: string;
  name: string;
  baseRole: string;
  professionalRole: string | null;
  role: string;
  status: "ACTIVE";
};
const money = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0) / 100,
  );
const costCategories = [
  "TRANSPORT",
  "FLIGHTS",
  "FUEL",
  "HOTEL",
  "FOOD",
  "RIDER",
  "CREW",
  "PRODUCTION",
  "TAX",
  "OTHER",
];
export function OpportunityGovernance({
  opportunityId,
  refresh,
}: {
  opportunityId: string;
  refresh: () => Promise<void>;
}) {
  const [approvals, setApprovals] = useState<Approval[]>([]),
    [role, setRole] = useState(""),
    [canReviewCommercial, setCanReviewCommercial] = useState(false),
    [items, setItems] = useState<Item[]>([]),
    [summary, setSummary] = useState<Summary | null>(null),
    [financialStatus, setFinancialStatus] = useState(""),
    [canManageItems, setCanManageItems] = useState(false),
    [commissions, setCommissions] = useState<Commission[]>([]),
    [beneficiaries, setBeneficiaries] = useState<Beneficiary[]>([]),
    [canManageCommission, setCanManageCommission] = useState(false),
    [message, setMessage] = useState(""),
    [approvalError, setApprovalError] = useState(""),
    [financeError, setFinanceError] = useState(""),
    [commissionError, setCommissionError] = useState(""),
    [loadingFinance, setLoadingFinance] = useState(true),
    [loadingCommissions, setLoadingCommissions] = useState(true),
    [busy, setBusy] = useState(false),
    [costOpen, setCostOpen] = useState(false),
    [commissionOpen, setCommissionOpen] = useState(false),
    [editingCostId, setEditingCostId] = useState<string | null>(null),
    [editingCommissionId, setEditingCommissionId] = useState<string | null>(null);
  const mutationLock = useRef(false);
  const [cost, setCost] = useState({
      kind: "COST",
      category: "TRANSPORT",
      description: "",
      quantity: "1",
      unitAmount: "",
      notes: "",
    }),
    [commission, setCommission] = useState({
      userId: "",
      type: "REFERRAL",
      method: "PERCENTAGE",
      percentage: "",
      amount: "",
    });
  const load = useCallback(async () => {
    setLoadingFinance(true);
    setLoadingCommissions(true);
    const [a, f, c] = await Promise.all([
        fetchJson<Record<string, unknown>>(
          `/api/opportunities/${opportunityId}/approvals`,
        ),
        fetchJson<Record<string, unknown>>(
          `/api/opportunities/${opportunityId}/finance`,
        ),
        fetchJson<Record<string, unknown>>(
          `/api/opportunities/${opportunityId}/commissions`,
        ),
      ]),
      ad = a.data || {},
      fd = f.data || {},
      cd = c.data || {};
    if (a.ok) {
      setApprovals((ad.approvals as Approval[]) || []);
      setRole(String(ad.role || ""));
      setCanReviewCommercial(Boolean(ad.canReviewCommercial));
      setApprovalError("");
    } else setApprovalError(a.error || "Não foi possível carregar as aprovações.");
    if (f.ok) {
      setItems((fd.items as Item[]) || []);
      setSummary(fd.summary as Summary);
      setFinancialStatus(String(fd.approvalStatus || ""));
      setCanManageItems(Boolean(fd.canManage));
      setFinanceError("");
    } else setFinanceError(f.error || "Não foi possível carregar os itens financeiros.");
    if (c.ok) {
      setCommissions((cd.commissions as Commission[]) || []);
      setBeneficiaries((cd.beneficiaries as Beneficiary[]) || []);
      setCanManageCommission(Boolean(cd.canManage));
      setCommissionError("");
    } else setCommissionError(c.error || "Não foi possível carregar as comissões.");
    setLoadingFinance(false);
    setLoadingCommissions(false);
  }, [opportunityId]);
  useEffect(() => {
    void load();
  }, [load]);
  async function approval(
    kind: "COMMERCIAL" | "FINANCIAL",
    action: "REQUEST" | "APPROVE" | "REJECT" | "REQUEST_CHANGES",
  ) {
    if (mutationLock.current) return;
    const prompted =
      action === "REQUEST"
        ? null
        : window.prompt("Observação da decisão (opcional):");
    if (action !== "REQUEST" && prompted === null) return;
    const notes = prompted?.trim() || null;
    mutationLock.current = true;
    setBusy(true);
    const result = await fetchJson<{ error?: string }>(
      `/api/opportunities/${opportunityId}/approvals`,
      {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ kind, action, notes }),
      },
    );
    mutationLock.current = false;
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Não foi possível registrar a aprovação.");
      return;
    }
    setMessage("Fluxo de aprovação atualizado.");
    await load();
    await refresh();
  }
  async function addCost(event: React.FormEvent) {
    event.preventDefault();
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    const result = await fetchJson<{ error?: string }>(
      `/api/opportunities/${opportunityId}/finance`,
      {
          method: editingCostId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...cost,
            id: editingCostId,
            quantity: Math.round(Number(cost.quantity) * 100),
            unitAmount: Math.round(Number(cost.unitAmount) * 100),
          }),
      },
    );
    mutationLock.current = false;
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Não foi possível salvar o item.");
      return;
    }
    setCostOpen(false);
    setEditingCostId(null);
    setCost({ ...cost, description: "", unitAmount: "", notes: "" });
    await load();
    await refresh();
  }
  async function addCommission(event: React.FormEvent) {
    event.preventDefault();
    if (mutationLock.current) return;
    mutationLock.current = true;
    setBusy(true);
    const result = await fetchJson<{ error?: string }>(
      `/api/opportunities/${opportunityId}/commissions`,
      {
          method: editingCommissionId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            ...commission,
            id: editingCommissionId,
            action: editingCommissionId ? "UPDATE" : undefined,
            beneficiaryUserId: commission.userId,
            amount: Math.round(Number(commission.amount) * 100),
          }),
      },
    );
    mutationLock.current = false;
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Não foi possível salvar a comissão.");
      return;
    }
    setCommissionOpen(false);
    setEditingCommissionId(null);
    setCommission({
      userId: "",
      type: "REFERRAL",
      method: "PERCENTAGE",
      percentage: "",
      amount: "",
    });
    await load();
  }

  async function cancelCost(id: string) {
    if (mutationLock.current || !window.confirm("Remover este item financeiro?"))
      return;
    mutationLock.current = true;
    setBusy(true);
    const result = await fetchJson<{ error?: string }>(
      `/api/opportunities/${opportunityId}/finance`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status: "CANCELLED" }),
      },
    );
    mutationLock.current = false;
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Não foi possível remover o item.");
      return;
    }
    await load();
    await refresh();
  }
  const pending = (kind: string) =>
      approvals.find((item) => item.kind === kind && item.status === "PENDING"),
    latest = (kind: string) => approvals.find((item) => item.kind === kind);
  return (
    <section className="opportunity-governance">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Governança da venda</p>
          <h2>Aprovação, resultado e comissões</h2>
          <p>O fechamento depende das validações comercial e financeira.</p>
        </div>
      </div>
      {message && <div className="notice">{message}</div>}
      {approvalError && (
        <SectionError message={approvalError} retry={load} />
      )}
      <div className="approval-grid">
        <ApprovalCard
          title="Aprovação comercial"
          icon={<BadgeCheck />}
          status={latest("COMMERCIAL")?.status || "NOT_REQUESTED"}
          detail={latest("COMMERCIAL")}
        >
          <ApprovalActions
            kind="COMMERCIAL"
            role={role}
            canReviewCommercial={canReviewCommercial}
            pending={Boolean(pending("COMMERCIAL"))}
            busy={busy}
            act={approval}
          />
        </ApprovalCard>
        <ApprovalCard
          title="Validação financeira"
          icon={<ShieldCheck />}
          status={
            financialStatus || latest("FINANCIAL")?.status || "NOT_REQUESTED"
          }
          detail={latest("FINANCIAL")}
        >
          <ApprovalActions
            kind="FINANCIAL"
            role={role}
            canReviewCommercial={canReviewCommercial}
            pending={Boolean(pending("FINANCIAL"))}
            busy={busy}
            act={approval}
          />
        </ApprovalCard>
      </div>
      <section className="opportunity-financial">
        <header>
          <div>
            <p className="eyebrow">Resultado estimado</p>
            <h3>Receitas e custos</h3>
          </div>
          {canManageItems && (
            <button
              className="button button-secondary"
              onClick={() => {
                setEditingCostId(null);
                setCostOpen((value) => !value);
              }}
            >
              <Plus />
              Adicionar item
            </button>
          )}
        </header>
        {financeError && <SectionError message={financeError} retry={load} />}
        {loadingFinance && <p className="table-empty">Carregando valores…</p>}
        {summary && (
          <div className="margin-metrics">
            <Metric label="Receita bruta" value={money(summary.grossRevenue)} />
            <Metric label="Custos" value={money(summary.costs)} />
            <Metric label="Comissões" value={money(summary.commissions)} />
            <Metric label="Resultado" value={money(summary.result)} strong />
            <Metric
              label="Margem"
              value={
                summary.marginPercentage === null
                  ? "—"
                  : `${summary.marginPercentage.toLocaleString("pt-BR")}%`
              }
              strong
            />
          </div>
        )}
        {costOpen && (
          <form className="finance-form" onSubmit={addCost}>
            <div className="form-row">
              <label>
                Tipo
                <select
                  value={cost.kind}
                  onChange={(e) =>
                    setCost((v) => ({
                      ...v,
                      kind: e.target.value,
                      category:
                        e.target.value === "REVENUE"
                          ? "ADDITIONAL"
                          : "TRANSPORT",
                    }))
                  }
                >
                  <option value="COST">Custo</option>
                  <option value="REVENUE">Receita</option>
                </select>
              </label>
              <label>
                Categoria
                <select
                  value={cost.category}
                  onChange={(e) =>
                    setCost((v) => ({ ...v, category: e.target.value }))
                  }
                >
                  {cost.kind === "REVENUE"
                    ? ["FEE", "ADDITIONAL", "OTHER_REVENUE"].map((v) => (
                        <option key={v}>{v}</option>
                      ))
                    : costCategories.map((v) => <option key={v}>{v}</option>)}
                </select>
              </label>
            </div>
            <label>
              Descrição
              <input
                required
                value={cost.description}
                onChange={(e) =>
                  setCost((v) => ({ ...v, description: e.target.value }))
                }
              />
            </label>
            <div className="form-row">
              <label>
                Quantidade
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={cost.quantity}
                  onChange={(e) =>
                    setCost((v) => ({ ...v, quantity: e.target.value }))
                  }
                />
              </label>
              <label>
                Valor unitário (R$)
                <input
                  required
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost.unitAmount}
                  onChange={(e) =>
                    setCost((v) => ({ ...v, unitAmount: e.target.value }))
                  }
                />
              </label>
            </div>
            <button className="button button-primary" disabled={busy}>
              <Check />
              {busy ? "Salvando…" : editingCostId ? "Salvar alterações" : "Salvar item"}
            </button>
          </form>
        )}
        <div className="financial-item-list">
          {items.map((item) => (
            <article key={item.id}>
              <span className={`financial-kind ${item.kind.toLowerCase()}`}>
                {item.kind === "REVENUE" ? "Receita" : "Custo"}
              </span>
              <div>
                <b>{item.description}</b>
                <small>
                  {item.category} ·{" "}
                  {(item.quantity / 100).toLocaleString("pt-BR")} ×{" "}
                  {money(item.unitAmount)}
                </small>
              </div>
              <strong>{money(item.totalAmount)}</strong>
              {canManageItems && (
                <div className="financial-row-actions">
                  <button
                    type="button"
                    aria-label={`Editar ${item.description}`}
                    disabled={busy}
                    onClick={() => {
                      setEditingCostId(item.id);
                      setCost({
                        kind: item.kind,
                        category: item.category,
                        description: item.description,
                        quantity: String(item.quantity / 100),
                        unitAmount: String(item.unitAmount / 100),
                        notes: "",
                      });
                      setCostOpen(true);
                    }}
                  >
                    <Pencil />
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover ${item.description}`}
                    disabled={busy}
                    onClick={() => void cancelCost(item.id)}
                  >
                    <Trash2 />
                  </button>
                </div>
              )}
            </article>
          ))}
          {!items.length && (
            <p className="table-empty">
              Nenhum item detalhado. O cachê proposto é usado como receita
              inicial.
            </p>
          )}
        </div>
      </section>
      <section className="opportunity-financial">
        <header>
          <div>
            <p className="eyebrow">Participação comercial</p>
            <h3>Comissões</h3>
          </div>
          {canManageCommission && (
            <button
              className="button button-secondary"
              onClick={() => setCommissionOpen((value) => !value)}
            >
              <CircleDollarSign />
              Nova comissão
            </button>
          )}
        </header>
        {commissionError && (
          <SectionError message={commissionError} retry={load} />
        )}
        {loadingCommissions && (
          <p className="table-empty">Carregando comissões…</p>
        )}
        {commissionOpen && (
          <form className="finance-form" onSubmit={addCommission}>
            <div className="form-row">
              <label>
                Beneficiário
                <select
                  required
                  value={commission.userId}
                  onChange={(e) =>
                    setCommission((v) => ({ ...v, userId: e.target.value }))
                  }
                >
                  <option value="">Selecione</option>
                  {beneficiaries.map((member) => (
                    <option value={member.userId} key={member.userId}>
                      {member.name} · {member.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tipo
                <select
                  value={commission.type}
                  onChange={(e) =>
                    setCommission((v) => ({ ...v, type: e.target.value }))
                  }
                >
                  {["REFERRAL", "SALES", "CLOSING", "PARTNER", "OTHER"].map(
                    (v) => (
                      <option key={v}>{v}</option>
                    ),
                  )}
                </select>
              </label>
            </div>
            <div className="form-row">
              <label>
                Método
                <select
                  value={commission.method}
                  onChange={(e) =>
                    setCommission((v) => ({ ...v, method: e.target.value }))
                  }
                >
                  <option value="PERCENTAGE">Percentual</option>
                  <option value="FIXED">Valor fixo</option>
                </select>
              </label>
              {commission.method === "PERCENTAGE" ? (
                <label>
                  Percentual (%)
                  <input
                    required
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    value={commission.percentage}
                    onChange={(e) =>
                      setCommission((v) => ({
                        ...v,
                        percentage: e.target.value,
                      }))
                    }
                  />
                </label>
              ) : (
                <label>
                  Valor (R$)
                  <input
                    required
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={commission.amount}
                    onChange={(e) =>
                      setCommission((v) => ({ ...v, amount: e.target.value }))
                    }
                  />
                </label>
              )}
            </div>
            <button className="button button-primary" disabled={busy || !beneficiaries.length}>
              {busy
                ? "Salvando…"
                : editingCommissionId
                  ? "Salvar comissão"
                  : "Criar estimativa"}
            </button>
          </form>
        )}
        <div className="financial-item-list">
          {commissions.map((item) => (
            <article key={item.id}>
              <span className="financial-kind commission">{commissionTypeLabel(item.type)}</span>
              <div>
                <b>{item.userName}</b>
                <small>
                  {item.method === "PERCENTAGE"
                    ? `${Number(item.percentage || 0) / 100}% sobre ${money(item.baseAmount)}`
                    : "Valor fixo"}{" "}
                  · {commissionStatusLabel(item.status)}
                </small>
              </div>
              <strong>{money(item.amount)}</strong>
              {canManageCommission && item.status === "ESTIMATED" && (
                <div className="financial-row-actions">
                  <button
                    type="button"
                    aria-label={`Editar comissão de ${item.userName}`}
                    disabled={busy}
                    onClick={() => {
                      setEditingCommissionId(item.id);
                      setCommission({
                        userId: item.userId,
                        type: item.type,
                        method: item.method,
                        percentage:
                          item.percentage === null
                            ? ""
                            : String(item.percentage / 100),
                        amount:
                          item.method === "FIXED"
                            ? String(item.amount / 100)
                            : "",
                      });
                      setCommissionOpen(true);
                    }}
                  >
                    <Pencil />
                  </button>
                </div>
              )}
            </article>
          ))}
          {!commissions.length && (
            <p className="table-empty">Nenhuma comissão definida.</p>
          )}
        </div>
      </section>
    </section>
  );
}
function ApprovalCard({
  title,
  icon,
  status,
  detail,
  children,
}: {
  title: string;
  icon: React.ReactNode;
  status: string;
  detail?: Approval;
  children: React.ReactNode;
}) {
  return (
    <article className="approval-card">
      <header>
        {icon}
        <div>
          <small>{title}</small>
          <b>{approvalStatusLabel(status)}</b>
        </div>
      </header>
      {detail && (
        <p>
          {detail.requestedByName}
          {detail.reviewedByName ? ` → ${detail.reviewedByName}` : ""}
        </p>
      )}
      <footer>{children}</footer>
    </article>
  );
}
function ApprovalActions({
  kind,
  role,
  canReviewCommercial,
  pending,
  busy,
  act,
}: {
  kind: "COMMERCIAL" | "FINANCIAL";
  role: string;
  canReviewCommercial: boolean;
  pending: boolean;
  busy: boolean;
  act: (
    k: "COMMERCIAL" | "FINANCIAL",
    a: "REQUEST" | "APPROVE" | "REJECT" | "REQUEST_CHANGES",
  ) => void;
}) {
  const reviewer =
      kind === "COMMERCIAL"
        ? canReviewCommercial
        : ["OWNER", "FINANCE"].includes(role),
    requester =
      kind === "FINANCIAL"
        ? ["OWNER", "MANAGER", "SALES", "BOOKING_AGENT", "FINANCE"].includes(
            role,
          )
        : ["OWNER", "MANAGER", "SALES", "BOOKING_AGENT"].includes(role);
  if (pending && reviewer)
    return (
      <>
        <button disabled={busy} onClick={() => act(kind, "APPROVE")}>
          <Check />
          Aprovar
        </button>
        <button disabled={busy} onClick={() => act(kind, "REQUEST_CHANGES")}>
          Pedir ajustes
        </button>
        <button
          disabled={busy}
          className="danger"
          onClick={() => act(kind, "REJECT")}
        >
          <X />
          Rejeitar
        </button>
      </>
    );
  if (!pending && requester)
    return (
      <button disabled={busy} onClick={() => act(kind, "REQUEST")}>
        <Send />
        Solicitar análise
      </button>
    );
  return null;
}
function Metric({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <article className={strong ? "strong" : ""}>
      <small>{label}</small>
      <b>{value}</b>
    </article>
  );
}

function SectionError({
  message,
  retry,
}: {
  message: string;
  retry: () => Promise<void>;
}) {
  return (
    <div className="finance-section-error" role="alert">
      <span>{message}</span>
      <button type="button" onClick={() => void retry()}>
        <RefreshCw />
        Tentar novamente
      </button>
    </div>
  );
}
