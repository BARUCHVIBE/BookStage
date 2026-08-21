"use client";

import { ArrowLeft, FilePlus2, Save } from "lucide-react";
import { useEffect, useState } from "react";

export type ContractTemplate = {
  id: string;
  name: string;
  version: number;
  isDefault: number;
  body: string;
};

export function ContractTemplatesPanel({
  back,
  onChanged,
}: {
  back: () => void;
  onChanged: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]),
    [placeholders, setPlaceholders] = useState<string[]>([]),
    [canManage, setCanManage] = useState(false),
    [selectedId, setSelectedId] = useState(""),
    [name, setName] = useState(""),
    [body, setBody] = useState(""),
    [starterBody, setStarterBody] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch("/api/contract-templates"),
      data = (await response.json()) as {
        templates?: ContractTemplate[];
        placeholders?: string[];
        starterBody?: string;
        canManage?: boolean;
        error?: string;
      };
    if (!response.ok) {
      setMessage(data.error || "Não foi possível carregar os modelos.");
      return;
    }
    setTemplates(data.templates || []);
    setPlaceholders(data.placeholders || []);
    setStarterBody(data.starterBody || "");
    setCanManage(Boolean(data.canManage));
  }
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, []);
  function select(template: ContractTemplate) {
    setSelectedId(template.id);
    setName(template.name);
    setBody(template.body);
    setMessage("");
  }
  function start() {
    setSelectedId("");
    setName("Contrato padrão de shows");
    setBody(starterBody);
    setMessage("");
  }
  async function save() {
    setBusy(true);
    const response = await fetch(
        selectedId
          ? `/api/contract-templates/${selectedId}`
          : "/api/contract-templates",
        {
          method: selectedId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, body, isDefault: true }),
        },
      ),
      data = (await response.json()) as { id?: string; error?: string };
    setBusy(false);
    if (!response.ok) {
      setMessage(data.error || "Não foi possível salvar o modelo.");
      return;
    }
    setMessage(
      selectedId
        ? "Nova versão criada. Contratos anteriores foram preservados."
        : "Modelo criado e definido como padrão.",
    );
    setSelectedId(data.id || "");
    await load();
    await onChanged();
  }
  return (
    <section className="contract-templates-page">
      <button className="back-button" onClick={back}>
        <ArrowLeft />
        Voltar para contratos
      </button>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Padronização jurídica</p>
          <h1>Modelos de contrato</h1>
          <p>As cláusulas são controladas pelo Owner e salvas por versão.</p>
        </div>
        {canManage && (
          <button className="button button-primary" onClick={start}>
            <FilePlus2 />
            Novo modelo
          </button>
        )}
      </div>
      {message && <div className="notice">{message}</div>}
      <div className="contract-template-layout">
        <aside className="contract-template-list">
          <p className="eyebrow">Versões ativas</p>
          {templates.map((template) => (
            <button key={template.id} onClick={() => select(template)}>
              <b>{template.name}</b>
              <small>
                Versão {template.version}
                {template.isDefault ? " · padrão" : ""}
              </small>
            </button>
          ))}
          {!templates.length && (
            <p className="table-empty">Nenhum modelo cadastrado.</p>
          )}
        </aside>
        <article className="contract-template-editor">
          <label>
            Nome do modelo
            <input
              value={name}
              disabled={!canManage}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label>
            Cláusulas protegidas
            <textarea
              rows={24}
              value={body}
              disabled={!canManage}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Selecione ou crie um modelo."
            />
          </label>
          <div className="contract-placeholder-list">
            <small>Campos disponíveis</small>
            {placeholders.map((placeholder) => (
              <button
                type="button"
                key={placeholder}
                disabled={!canManage}
                onClick={() =>
                  setBody((current) => `${current} {{${placeholder}}}`)
                }
              >
                {`{{${placeholder}}}`}
              </button>
            ))}
          </div>
          {canManage && (
            <button
              className="button button-primary"
              disabled={busy || !name || !body}
              onClick={save}
            >
              <Save />
              {busy
                ? "Salvando…"
                : selectedId
                  ? "Criar nova versão"
                  : "Salvar modelo"}
            </button>
          )}
        </article>
      </div>
    </section>
  );
}
