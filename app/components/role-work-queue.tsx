"use client";
/* eslint-disable react-hooks/set-state-in-effect -- loaders synchronize authenticated queue state when the role, tab, or selected opportunity changes. */

import {
  ArrowRight,
  Banknote,
  CalendarDays,
  Check,
  CircleDollarSign,
  Clock3,
  FileCheck2,
  MapPin,
  RefreshCw,
  RotateCcw,
  UserRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson } from "@/app/lib/http-client";
import {
  commercialNextAction,
  commercialQueueBucket,
  financeQueueBucket,
} from "@/app/lib/work-queue-rules";

type Opportunity = {
  id: string;
  stage: string;
  source: string;
  eventDate: string;
  city: string;
  state: string;
  venue: string | null;
  eventType: string;
  proposedValue: number | null;
  budget: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  commercialApprovalStatus: string;
  financialApprovalStatus: string;
  artistName: string;
  customerName: string;
  companyName: string | null;
  assigneeName: string | null;
  originatorName: string | null;
  commercialValidatorName: string | null;
  contractStatus: string | null;
  financialReviewNotes: string | null;
};
type Receipt = {
  id: string;
  amount: number;
  scheduledAmount: number;
  receivedAmount: number;
  dueDate: string;
  overdueCount: number;
  eventDate: string;
  artistName: string;
  customerName: string;
};
type FinanceData = {
  items: Array<{
    id: string;
    category: string;
    description: string;
    totalAmount: number;
    kind: string;
  }>;
  summary: {
    grossRevenue: number;
    costs: number;
    commissions: number;
    result: number;
    marginPercentage: number | null;
  };
  approvalStatus: string;
};
type PaymentData = {
  payments: Array<{
    id: string;
    description: string;
    amount: number;
    receivedAmount: number;
    balance: number;
    dueDate: string;
    status: string;
  }>;
  summary: {
    totalValue: number;
    scheduled: number;
    received: number;
    balance: number;
    nextDueDate: string | null;
    overdueCount: number;
    situation: string;
  };
};
type WorkDialog =
  | {
      kind: "APPROVAL";
      approvalKind: "COMMERCIAL" | "FINANCIAL";
      action: "APPROVE" | "REQUEST_CHANGES";
      opportunityId: string;
    }
  | { kind: "INSTALLMENT" }
  | { kind: "RECEIPT"; payment: PaymentData["payments"][number] };

const money = (value: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value || 0) / 100,
  );
const date = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(
        new Date(`${value.slice(0, 10)}T12:00:00Z`),
      )
    : "A definir";
const approvalLabel: Record<string, string> = {
  NOT_REQUESTED: "Não solicitada",
  PENDING_APPROVAL: "Aguardando comercial",
  PENDING: "Aguardando financeiro",
  APPROVED: "Aprovada",
  REJECTED: "Negada",
  CHANGES_REQUESTED: "Ajustes solicitados",
};

export function RoleWorkQueue({
  role,
  initialView = "queue",
  onOpenOpportunity,
}: {
  role: string;
  initialView?: "queue" | "analysis" | "receipts";
  onOpenOpportunity: (id: string) => void;
}) {
  const isFinance = role === "FINANCE";
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [tab, setTab] = useState(
    initialView === "receipts"
      ? "RECEIPTS"
      : isFinance
        ? initialView === "analysis"
          ? "TO_VALIDATE"
          : "TO_VALIDATE"
        : "TO_ANALYZE",
  );
  const [selectedId, setSelectedId] = useState("");
  const [finance, setFinance] = useState<FinanceData | null>(null);
  const [paymentOpportunity, setPaymentOpportunity] = useState<Receipt | null>(
    null,
  );
  const [paymentData, setPaymentData] = useState<PaymentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [dialog, setDialog] = useState<WorkDialog | null>(null);
  const [dialogNotes, setDialogNotes] = useState("");
  const [installment, setInstallment] = useState({
    description: "Parcela",
    amount: "",
    dueDate: "",
    notes: "",
  });
  const [receiptForm, setReceiptForm] = useState({
    amount: "",
    receivedAt: new Date().toISOString().slice(0, 10),
    method: "PIX",
    notes: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    const result = await fetchJson<{
      opportunities?: Opportunity[];
      receipts?: Receipt[];
    }>("/api/work-queue", { cache: "no-store" });
    if (result.ok) {
      setOpportunities(result.data?.opportunities || []);
      setReceipts(result.data?.receipts || []);
      setMessage("");
    } else setMessage(result.error || "Não foi possível carregar sua fila.");
    setLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const buckets = useMemo(() => {
    const map: Record<string, Opportunity[]> = {
      TO_ANALYZE: [],
      VALIDATED: [],
      IN_PROGRESS: [],
      TO_VALIDATE: [],
      ADJUSTMENTS: [],
      APPROVED: [],
    };
    opportunities.forEach((item) => {
      const bucket = isFinance
        ? financeQueueBucket(item)
        : commercialQueueBucket(item);
      if (bucket) map[bucket].push(item);
    });
    return map;
  }, [isFinance, opportunities]);
  const current = tab === "RECEIPTS" ? [] : buckets[tab] || [];
  const selected =
    opportunities.find((item) => item.id === selectedId) || current[0] || null;
  const metrics = isFinance
    ? [
        {
          label: "Para validar",
          value: buckets.TO_VALIDATE.length,
          Icon: CircleDollarSign,
        },
        {
          label: "Ajustes solicitados",
          value: buckets.ADJUSTMENTS.length,
          Icon: RotateCcw,
        },
        { label: "Aprovadas", value: buckets.APPROVED.length, Icon: Check },
        {
          label: "Recebimentos pendentes",
          value: receipts.filter((item) => item.receivedAmount < item.amount)
            .length,
          Icon: Banknote,
        },
      ]
    : [
        {
          label: "Para analisar",
          value: buckets.TO_ANALYZE.length,
          Icon: Clock3,
        },
        { label: "Validadas", value: buckets.VALIDATED.length, Icon: Check },
        {
          label: "Em andamento",
          value: buckets.IN_PROGRESS.length,
          Icon: ArrowRight,
        },
      ];

  useEffect(() => {
    if (!isFinance || !selected?.id || tab === "RECEIPTS") {
      setFinance(null);
      return;
    }
    let cancelled = false;
    setDetailLoading(true);
    fetchJson<FinanceData>(`/api/opportunities/${selected.id}/finance`, {
      cache: "no-store",
    }).then((result) => {
      if (!cancelled) {
        setFinance(result.ok ? result.data || null : null);
        if (!result.ok)
          setMessage(result.error || "Não foi possível carregar a análise.");
        setDetailLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isFinance, selected?.id, tab]);

  async function decide(
    kind: "COMMERCIAL" | "FINANCIAL",
    action: "APPROVE" | "REQUEST_CHANGES",
    opportunityId = selected?.id,
    notes = "",
  ) {
    if (!opportunityId || busy) return;
    if (action === "REQUEST_CHANGES" && !notes?.trim()) return;
    setBusy(true);
    const result = await fetchJson(
      `/api/opportunities/${opportunityId}/approvals`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, action, notes: notes?.trim() || null }),
      },
    );
    setBusy(false);
    setMessage(
      result.ok
        ? "Análise registrada com sucesso."
        : result.error || "Não foi possível registrar a análise.",
    );
    if (result.ok) {
      setDialog(null);
      setDialogNotes("");
      setSelectedId("");
      await load();
    }
  }
  async function loadPayments(item: Receipt) {
    setPaymentOpportunity(item);
    const result = await fetchJson<PaymentData>(
      `/api/opportunities/${item.id}/payments`,
      { cache: "no-store" },
    );
    if (result.ok) setPaymentData(result.data || null);
    else setMessage(result.error || "Não foi possível carregar as parcelas.");
  }
  async function createInstallment(event: React.FormEvent) {
    event.preventDefault();
    if (!paymentOpportunity) return;
    setBusy(true);
    const result = await fetchJson(
      `/api/opportunities/${paymentOpportunity.id}/payments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: "installment",
          description: installment.description,
          amount: Math.round(
            Number(installment.amount.replace(",", ".")) * 100,
          ),
          dueDate: installment.dueDate,
          notes: installment.notes,
        }),
      },
    );
    setBusy(false);
    if (!result.ok)
      setMessage(result.error || "Não foi possível criar a parcela.");
    else {
      setDialog(null);
      setInstallment({
        description: "Parcela",
        amount: "",
        dueDate: "",
        notes: "",
      });
      await loadPayments(paymentOpportunity);
      await load();
    }
  }
  async function registerReceipt(
    event: React.FormEvent,
    payment: PaymentData["payments"][number],
  ) {
    event.preventDefault();
    if (!paymentOpportunity) return;
    setBusy(true);
    const result = await fetchJson(
      `/api/opportunities/${paymentOpportunity.id}/payments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity: "receipt",
          paymentId: payment.id,
          amount: Math.round(
            Number(receiptForm.amount.replace(",", ".")) * 100,
          ),
          receivedAt: receiptForm.receivedAt,
          method: receiptForm.method,
          notes: receiptForm.notes,
          idempotencyKey: crypto.randomUUID(),
        }),
      },
    );
    setBusy(false);
    if (!result.ok)
      setMessage(result.error || "Não foi possível registrar o recebimento.");
    else {
      setDialog(null);
      await loadPayments(paymentOpportunity);
      await load();
    }
  }
  function openApproval(
    approvalKind: "COMMERCIAL" | "FINANCIAL",
    action: "APPROVE" | "REQUEST_CHANGES",
    opportunityId = selected?.id,
  ) {
    if (!opportunityId) return;
    setDialogNotes("");
    setDialog({ kind: "APPROVAL", approvalKind, action, opportunityId });
  }
  function openReceipt(payment: PaymentData["payments"][number]) {
    setReceiptForm({
      amount: (payment.balance / 100).toFixed(2).replace(".", ","),
      receivedAt: new Date().toISOString().slice(0, 10),
      method: "PIX",
      notes: "",
    });
    setDialog({ kind: "RECEIPT", payment });
  }

  if (loading)
    return (
      <section className="role-queue-loading">
        <span className="spinner" /> Carregando sua fila de trabalho…
      </section>
    );
  return (
    <section className="role-queue">
      <header className="role-queue-heading">
        <div>
          <p className="eyebrow">
            {isFinance ? "OPERAÇÃO FINANCEIRA" : "OPERAÇÃO COMERCIAL"}
          </p>
          <h1>{isFinance ? "Central financeira" : "Minha fila comercial"}</h1>
          <p>
            {isFinance
              ? "Valide custos e acompanhe os recebimentos que exigem sua atenção."
              : "Analise novas negociações e acompanhe os próximos passos do seu pipeline."}
          </p>
        </div>
        <button className="button button-secondary" onClick={() => void load()}>
          <RefreshCw size={16} /> Atualizar
        </button>
      </header>
      {message && (
        <p
          className={message.includes("sucesso") ? "notice success" : "notice"}
        >
          {message}
        </p>
      )}
      <div className="role-queue-metrics">
        {metrics.map(({ label, value, Icon }) => (
          <article key={label}>
            <span>
              <Icon size={18} />
            </span>
            <small>{label}</small>
            <strong>{value}</strong>
          </article>
        ))}
      </div>
      <div className="role-queue-tabs" role="tablist">
        {(isFinance
          ? [
              ["TO_VALIDATE", "Para validar"],
              ["ADJUSTMENTS", "Ajustes solicitados"],
              ["APPROVED", "Aprovadas"],
              ["RECEIPTS", "Recebimentos"],
            ]
          : [
              ["TO_ANALYZE", "Para analisar"],
              ["VALIDATED", "Validadas"],
              ["IN_PROGRESS", "Em andamento"],
            ]
        ).map(([value, label]) => (
          <button
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "active" : ""}
            key={value}
            onClick={() => {
              setTab(value);
              setSelectedId("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "RECEIPTS" ? (
        <>
          {paymentOpportunity && paymentData && (
            <PaymentManager
              item={paymentOpportunity}
              data={paymentData}
              busy={busy}
              close={() => {
                setPaymentOpportunity(null);
                setPaymentData(null);
              }}
              createInstallment={() => setDialog({ kind: "INSTALLMENT" })}
              receive={openReceipt}
            />
          )}
          <ReceiptsList
            receipts={receipts}
            open={(item) => void loadPayments(item)}
          />
        </>
      ) : isFinance ? (
        <div className="finance-queue-layout">
          <div className="finance-queue-list">
            {current.length ? (
              current.map((item) => (
                <QueueCard
                  key={item.id}
                  item={item}
                  active={selected?.id === item.id}
                  compact
                  onClick={() => setSelectedId(item.id)}
                />
              ))
            ) : (
              <EmptyQueue />
            )}
          </div>
          <FinanceDetail
            item={selected}
            data={finance}
            loading={detailLoading}
            busy={busy}
            onOpen={() => selected && onOpenOpportunity(selected.id)}
            onApprove={() => openApproval("FINANCIAL", "APPROVE")}
            onChanges={() => openApproval("FINANCIAL", "REQUEST_CHANGES")}
          />
        </div>
      ) : (
        <div className="commercial-queue-list">
          {current.length ? (
            current.map((item) => (
              <QueueCard
                key={item.id}
                item={item}
                onClick={() => {
                  setSelectedId(item.id);
                  onOpenOpportunity(item.id);
                }}
                onApprove={
                  tab === "TO_ANALYZE"
                    ? () => openApproval("COMMERCIAL", "APPROVE", item.id)
                    : undefined
                }
                onChanges={
                  tab === "TO_ANALYZE"
                    ? () =>
                        openApproval("COMMERCIAL", "REQUEST_CHANGES", item.id)
                    : undefined
                }
              />
            ))
          ) : (
            <EmptyQueue />
          )}
        </div>
      )}
      {dialog && (
        <div className="system-dialog-backdrop">
          <section
            className="system-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="work-dialog-title"
          >
            <header>
              <div>
                <p className="eyebrow">
                  {dialog.kind === "INSTALLMENT"
                    ? "PLANEJAMENTO FINANCEIRO"
                    : dialog.kind === "RECEIPT"
                      ? "CONFIRMAÇÃO MANUAL"
                      : "ANÁLISE"}
                </p>
                <h2 id="work-dialog-title">
                  {dialog.kind === "INSTALLMENT"
                    ? "Definir nova parcela"
                    : dialog.kind === "RECEIPT"
                      ? "Registrar recebimento"
                      : dialog.action === "APPROVE"
                        ? "Confirmar aprovação"
                        : "Solicitar ajustes"}
                </h2>
                <p>
                  {dialog.kind === "RECEIPT"
                    ? "Confirme somente após verificar a entrada do dinheiro na conta da empresa."
                    : dialog.kind === "INSTALLMENT"
                      ? "Informe o valor e o vencimento combinados."
                      : "Registre a decisão e deixe uma observação quando necessário."}
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                disabled={busy}
                onClick={() => setDialog(null)}
              >
                <X />
              </button>
            </header>
            {dialog.kind === "INSTALLMENT" ? (
              <form onSubmit={createInstallment}>
                <label>
                  Descrição
                  <input
                    required
                    maxLength={200}
                    value={installment.description}
                    onChange={(e) =>
                      setInstallment({
                        ...installment,
                        description: e.target.value,
                      })
                    }
                  />
                </label>
                <div className="form-row">
                  <label>
                    Valor (R$)
                    <input
                      required
                      inputMode="decimal"
                      placeholder="0,00"
                      value={installment.amount}
                      onChange={(e) =>
                        setInstallment({
                          ...installment,
                          amount: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Vencimento
                    <input
                      required
                      type="date"
                      value={installment.dueDate}
                      onChange={(e) =>
                        setInstallment({
                          ...installment,
                          dueDate: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Observação
                  <textarea
                    rows={3}
                    value={installment.notes}
                    onChange={(e) =>
                      setInstallment({ ...installment, notes: e.target.value })
                    }
                  />
                </label>
                <footer>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => setDialog(null)}
                  >
                    Cancelar
                  </button>
                  <button className="button" disabled={busy}>
                    {busy ? "Salvando…" : "Criar parcela"}
                  </button>
                </footer>
              </form>
            ) : dialog.kind === "RECEIPT" ? (
              <form
                onSubmit={(event) => registerReceipt(event, dialog.payment)}
              >
                <div className="system-dialog-balance">
                  <span>Saldo da parcela</span>
                  <strong>{money(dialog.payment.balance)}</strong>
                </div>
                <div className="form-row">
                  <label>
                    Valor recebido (R$)
                    <input
                      required
                      inputMode="decimal"
                      value={receiptForm.amount}
                      onChange={(e) =>
                        setReceiptForm({
                          ...receiptForm,
                          amount: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Data efetiva
                    <input
                      required
                      type="date"
                      value={receiptForm.receivedAt}
                      onChange={(e) =>
                        setReceiptForm({
                          ...receiptForm,
                          receivedAt: e.target.value,
                        })
                      }
                    />
                  </label>
                </div>
                <label>
                  Forma de pagamento
                  <select
                    value={receiptForm.method}
                    onChange={(e) =>
                      setReceiptForm({ ...receiptForm, method: e.target.value })
                    }
                  >
                    <option value="PIX">Pix</option>
                    <option value="TRANSFER">Transferência</option>
                    <option value="CASH">Dinheiro</option>
                    <option value="CARD">Cartão</option>
                    <option value="BOLETO">Boleto</option>
                    <option value="OTHER">Outra</option>
                  </select>
                </label>
                <label>
                  Observação
                  <textarea
                    rows={3}
                    value={receiptForm.notes}
                    onChange={(e) =>
                      setReceiptForm({ ...receiptForm, notes: e.target.value })
                    }
                  />
                </label>
                <footer>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => setDialog(null)}
                  >
                    Cancelar
                  </button>
                  <button className="button" disabled={busy}>
                    {busy ? "Registrando…" : "Confirmar recebimento"}
                  </button>
                </footer>
              </form>
            ) : (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void decide(
                    dialog.approvalKind,
                    dialog.action,
                    dialog.opportunityId,
                    dialogNotes,
                  );
                }}
              >
                <label>
                  {dialog.action === "REQUEST_CHANGES"
                    ? "Descreva os ajustes necessários *"
                    : "Observação (opcional)"}
                  <textarea
                    required={dialog.action === "REQUEST_CHANGES"}
                    rows={4}
                    value={dialogNotes}
                    onChange={(e) => setDialogNotes(e.target.value)}
                  />
                </label>
                <footer>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => setDialog(null)}
                  >
                    Cancelar
                  </button>
                  <button className="button" disabled={busy}>
                    {busy
                      ? "Registrando…"
                      : dialog.action === "APPROVE"
                        ? "Aprovar"
                        : "Solicitar ajustes"}
                  </button>
                </footer>
              </form>
            )}
          </section>
        </div>
      )}
    </section>
  );
}

function QueueCard({
  item,
  active,
  compact,
  onClick,
  onApprove,
  onChanges,
}: {
  item: Opportunity;
  active?: boolean;
  compact?: boolean;
  onClick: () => void;
  onApprove?: () => void;
  onChanges?: () => void;
}) {
  return (
    <article
      className={`queue-card ${active ? "active" : ""} ${compact ? "compact" : ""}`}
    >
      <header>
        <div>
          <p className="eyebrow">{item.artistName}</p>
          <h3>
            {item.customerName}
            {item.companyName ? ` · ${item.companyName}` : ""}
          </h3>
        </div>
        <span
          className={`status-badge ${item.commercialApprovalStatus === "APPROVED" ? "status-badge--success" : item.commercialApprovalStatus === "REJECTED" ? "status-badge--danger" : "status-badge--info"}`}
        >
          {approvalLabel[item.commercialApprovalStatus] ||
            item.commercialApprovalStatus}
        </span>
      </header>
      <div className="queue-card-facts">
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
          {item.originatorName || item.assigneeName || "Equipe interna"}
        </span>
        {item.proposedValue !== null && (
          <strong>{money(item.proposedValue)}</strong>
        )}
      </div>
      {!compact && (
        <div className="queue-next-action">
          <Clock3 />
          <span>
            <small>Próxima ação</small>
            <b>{item.nextAction || commercialNextAction(item)}</b>
          </span>
        </div>
      )}
      <footer>
        <button className="button button-secondary" onClick={onClick}>
          {compact ? "Selecionar" : "Abrir no CRM"}
          <ArrowRight size={15} />
        </button>
        {onChanges && (
          <button
            className="button button-secondary"
            onClick={(event) => {
              event.stopPropagation();
              onChanges();
            }}
          >
            <RotateCcw size={15} /> Solicitar ajustes
          </button>
        )}
        {onApprove && (
          <button
            className="button"
            onClick={(event) => {
              event.stopPropagation();
              onApprove();
            }}
          >
            <Check size={15} /> Aprovar
          </button>
        )}
      </footer>
    </article>
  );
}

function FinanceDetail({
  item,
  data,
  loading,
  busy,
  onOpen,
  onApprove,
  onChanges,
}: {
  item: Opportunity | null;
  data: FinanceData | null;
  loading: boolean;
  busy: boolean;
  onOpen: () => void;
  onApprove: () => void;
  onChanges: () => void;
}) {
  if (!item)
    return (
      <div className="finance-queue-detail">
        <EmptyQueue label="Nenhuma análise nesta fila." />
      </div>
    );
  return (
    <div className="finance-queue-detail">
      <header>
        <div>
          <p className="eyebrow">ANÁLISE FINANCEIRA</p>
          <h2>{item.artistName}</h2>
          <p>
            {item.customerName} · {date(item.eventDate)} · {item.city}/
            {item.state}
          </p>
        </div>
        <span className="status-badge status-badge--info">
          {approvalLabel[item.financialApprovalStatus] ||
            item.financialApprovalStatus}
        </span>
      </header>
      {loading ? (
        <p className="finance-detail-loading">
          <span className="spinner" /> Calculando operação…
        </p>
      ) : data ? (
        <>
          <div className="finance-detail-summary">
            <article>
              <small>Cachê / receita</small>
              <b>{money(data.summary.grossRevenue)}</b>
            </article>
            <article>
              <small>Custos operacionais</small>
              <b>{money(data.summary.costs)}</b>
            </article>
            <article>
              <small>Comissões</small>
              <b>{money(data.summary.commissions)}</b>
            </article>
            <article className="result">
              <small>Resultado projetado</small>
              <b>{money(data.summary.result)}</b>
              <span>
                {data.summary.marginPercentage === null
                  ? "Margem não calculada"
                  : `${data.summary.marginPercentage}% de margem`}
              </span>
            </article>
          </div>
          <section className="finance-cost-breakdown">
            <h3>Composição da operação</h3>
            {data.items.length ? (
              data.items.map((cost) => (
                <div key={cost.id}>
                  <span>{cost.description}</span>
                  <b>
                    {cost.kind === "COST" ? "− " : "+ "}
                    {money(cost.totalAmount)}
                  </b>
                </div>
              ))
            ) : (
              <p>Nenhum custo detalhado foi informado.</p>
            )}
          </section>
        </>
      ) : (
        <p>Não foi possível carregar os valores desta negociação.</p>
      )}
      {item.financialReviewNotes && (
        <div className="finance-review-note">
          <RotateCcw size={16} />
          <div>
            <b>Observação da análise</b>
            <p>{item.financialReviewNotes}</p>
          </div>
        </div>
      )}
      <footer>
        <button className="button button-secondary" onClick={onOpen}>
          <FileCheck2 size={16} /> Abrir negociação
        </button>
        {item.financialApprovalStatus === "PENDING" && (
          <>
            <button
              className="button button-secondary danger"
              disabled={busy}
              onClick={onChanges}
            >
              <X size={16} /> Solicitar ajustes
            </button>
            <button className="button" disabled={busy} onClick={onApprove}>
              <Check size={16} /> Aprovar operação
            </button>
          </>
        )}
      </footer>
      <small className="finance-disclaimer">
        A aprovação registra a validação financeira; contratos, agenda e
        fechamento continuam seguindo o fluxo atual.
      </small>
    </div>
  );
}
function ReceiptsList({
  receipts,
  open,
}: {
  receipts: Receipt[];
  open: (item: Receipt) => void;
}) {
  return (
    <div className="receipts-list">
      {receipts.length ? (
        receipts.map((item) => {
          const situation = !item.scheduledAmount
            ? "Sem parcelas definidas"
            : item.receivedAmount >= item.amount
              ? "Quitado"
              : item.overdueCount
                ? item.receivedAmount
                  ? "Parcial · vencido"
                  : "Vencido"
                : item.receivedAmount
                  ? "Recebido parcialmente"
                  : "A receber";
          return (
            <article key={item.id}>
              <span
                className={`status-badge ${situation === "Quitado" ? "status-badge--success" : item.overdueCount ? "status-badge--danger" : "status-badge--info"}`}
              >
                {situation}
              </span>
              <div>
                <b>{item.artistName}</b>
                <p>
                  {item.customerName} · evento em {date(item.eventDate)}
                </p>
              </div>
              <span>
                <small>Próximo vencimento</small>
                <b>{date(item.dueDate)}</b>
              </span>
              <span>
                <small>Recebido</small>
                <b>{money(item.receivedAmount)}</b>
              </span>
              <strong>
                Saldo {money(Math.max(item.amount - item.receivedAmount, 0))}
              </strong>
              <button
                className="button button-secondary"
                onClick={() => open(item)}
              >
                Ver parcelas
              </button>
            </article>
          );
        })
      ) : (
        <EmptyQueue label="Nenhuma negociação aprovada para acompanhamento." />
      )}
    </div>
  );
}
function PaymentManager({
  item,
  data,
  busy,
  close,
  createInstallment,
  receive,
}: {
  item: Receipt;
  data: PaymentData;
  busy: boolean;
  close: () => void;
  createInstallment: () => void;
  receive: (payment: PaymentData["payments"][number]) => void;
}) {
  return (
    <section className="finance-queue-detail">
      <header>
        <div>
          <p className="eyebrow">RECEBIMENTOS</p>
          <h2>{item.artistName}</h2>
          <p>
            {item.customerName} · {data.summary.situation}
          </p>
        </div>
        <button className="button button-secondary" onClick={close}>
          Fechar
        </button>
      </header>
      <div className="finance-detail-summary">
        <article>
          <small>Valor combinado</small>
          <b>{money(data.summary.totalValue)}</b>
        </article>
        <article>
          <small>Recebido</small>
          <b>{money(data.summary.received)}</b>
        </article>
        <article>
          <small>Saldo</small>
          <b>{money(data.summary.balance)}</b>
        </article>
      </div>
      <button
        className="button button-secondary"
        disabled={busy}
        onClick={createInstallment}
      >
        Definir nova parcela
      </button>
      <div className="receipts-list">
        {data.payments.map((payment) => (
          <article key={payment.id}>
            <div>
              <b>{payment.description}</b>
              <p>Vence em {date(payment.dueDate)}</p>
            </div>
            <span>
              <small>Recebido</small>
              <b>{money(payment.receivedAmount)}</b>
            </span>
            <strong>Saldo {money(payment.balance)}</strong>
            {payment.balance > 0 && payment.status !== "CANCELLED" && (
              <button
                className="button"
                disabled={busy}
                onClick={() => receive(payment)}
              >
                Registrar recebimento
              </button>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
function EmptyQueue({
  label = "Tudo certo por aqui. Nenhuma negociação exige atenção nesta fila.",
}: {
  label?: string;
}) {
  return (
    <div className="queue-empty">
      <FileCheck2 />
      <b>Fila em dia</b>
      <p>{label}</p>
    </div>
  );
}
