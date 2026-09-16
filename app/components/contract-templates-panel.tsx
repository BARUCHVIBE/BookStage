"use client";

import { ArrowLeft, FilePlus2, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { fetchJson } from "@/app/lib/http-client";

export type ContractTemplate = {
  id: string;
  artistId: string | null;
  artistName: string | null;
  name: string;
  category: string | null;
  description: string | null;
  templateType: "TEXT" | "PDF_ACROFORM" | "PDF_STATIC";
  fileName: string | null;
  detectedFields: Array<{ name: string; type: string }>;
  fieldMapping: Record<string, string>;
  version: number;
  isDefault: number;
  body: string;
};

export function ContractTemplatesPanel({
  back,
  onChanged,
}: {
  back?: () => void;
  onChanged: () => Promise<void>;
}) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([]),
    [artists, setArtists] = useState<Array<{ id: string; name: string }>>([]),
    [placeholders, setPlaceholders] = useState<string[]>([]),
    [canManage, setCanManage] = useState(false),
    [selectedId, setSelectedId] = useState(""),
    [name, setName] = useState(""),
    [artistId, setArtistId] = useState(""),
    [category, setCategory] = useState(""),
    [description, setDescription] = useState(""),
    [templateType, setTemplateType] = useState<"TEXT" | "PDF">("PDF"),
    [detectedFields, setDetectedFields] = useState<Array<{ name: string; type: string }>>([]),
    [fieldMapping, setFieldMapping] = useState<Record<string, string>>({}),
    [pdfFile, setPdfFile] = useState<File | null>(null),
    [body, setBody] = useState(""),
    [starterBody, setStarterBody] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const select = useCallback((template: ContractTemplate) => {
    setSelectedId(template.id);
    setName(template.name);
    setArtistId(template.artistId || "");
    setCategory(template.category || "");
    setDescription(template.description || "");
    setTemplateType(template.templateType === "TEXT" ? "TEXT" : "PDF");
    setDetectedFields(template.detectedFields || []);
    setFieldMapping(template.fieldMapping || {});
    setPdfFile(null);
    setBody(template.body);
    setMessage("");
  }, []);
  const load = useCallback(async () => {
    const result = await fetchJson<{
        templates?: ContractTemplate[];
        artists?: Array<{ id: string; name: string }>;
        placeholders?: string[];
        starterBody?: string;
        canManage?: boolean;
        error?: string;
      }>("/api/contract-templates");
    if (!result.ok) {
      setMessage(result.error || "Não foi possível carregar os modelos.");
      return;
    }
    const data = result.data || {};
    const loadedTemplates = data.templates || [];
    setTemplates(loadedTemplates);
    setArtists(data.artists || []);
    setPlaceholders(data.placeholders || []);
    setStarterBody(data.starterBody || "");
    setCanManage(Boolean(data.canManage));
    if (!data.canManage && loadedTemplates.length) select(loadedTemplates[0]);
  }, [select]);
  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);
  function start() {
    setSelectedId("");
    setName("Contrato padrão de shows");
    setArtistId(artists[0]?.id || "");
    setCategory("Padrão");
    setDescription("");
    setTemplateType("PDF");
    setDetectedFields([]);
    setFieldMapping({});
    setPdfFile(null);
    setBody(starterBody);
    setMessage("");
  }
  async function save() {
    setBusy(true);
    const result = await fetchJson<{ id?: string; error?: string }>(
        selectedId
          ? `/api/contract-templates/${selectedId}`
          : "/api/contract-templates",
        {
          method: selectedId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name,
            body,
            artistId,
            category,
            description,
            templateType,
            fieldMapping,
            isDefault: true,
          }),
        },
      );
    setBusy(false);
    if (!result.ok) {
      setMessage(result.error || "Não foi possível salvar o modelo.");
      return;
    }
    let savedId = result.data?.id || selectedId;
    if (templateType === "PDF" && pdfFile && savedId) {
      const upload = new FormData();
      upload.set("file", pdfFile);
      const fileResult = await fetchJson<{ id?: string; error?: string }>(`/api/contract-templates/${savedId}/file`, {
          method: "POST",
          body: upload,
        });
      if (!fileResult.ok) {
        setMessage(fileResult.error || "Modelo criado, mas o PDF não pôde ser anexado.");
        await load();
        return;
      }
      savedId = fileResult.data?.id || savedId;
    }
    setMessage(
      selectedId
        ? "Nova versão criada. Contratos anteriores foram preservados."
        : "Modelo criado e definido como padrão.",
    );
    setSelectedId(savedId || "");
    await load();
    await onChanged();
  }
  return (
    <section className="contract-templates-page">
      {back && (
        <button className="back-button" onClick={back}>
          <ArrowLeft />
          Voltar para contratos
        </button>
      )}
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
      {!canManage && (
        <div className="notice">
          Consulta de modelos autorizados. A criação e alteração pertencem ao
          Owner da empresa.
        </div>
      )}
      {message && <div className="notice">{message}</div>}
      <div className="contract-template-layout">
        <aside className="contract-template-list">
          <p className="eyebrow">Versões ativas</p>
          {templates.map((template) => (
            <button key={template.id} onClick={() => select(template)}>
              <b>{template.name}</b>
              <small>
                {template.artistName || "Modelo geral"} · Versão {template.version}
                {template.isDefault ? " · padrão" : ""}
              </small>
            </button>
          ))}
          {!templates.length && (
            <p className="table-empty">Nenhum modelo cadastrado.</p>
          )}
        </aside>
        {!canManage ? (
          <article className="contract-template-reader">
            {selectedId ? (
              <>
                <header>
                  <div>
                    <p className="eyebrow">Modelo autorizado</p>
                    <h2>{name}</h2>
                    <p>{description || "Sem descrição adicional."}</p>
                  </div>
                  <span className="status-badge status-badge--info">
                    Versão {templates.find((item) => item.id === selectedId)?.version}
                  </span>
                </header>
                <dl className="contract-template-metadata">
                  <div><dt>Artista</dt><dd>{templates.find((item) => item.id === selectedId)?.artistName || "Modelo geral"}</dd></div>
                  <div><dt>Categoria</dt><dd>{category || "Sem categoria"}</dd></div>
                  <div><dt>Formato</dt><dd>{templateType === "TEXT" ? "Texto BookBusiness" : "Arquivo PDF"}</dd></div>
                </dl>
                {templateType === "TEXT" ? (
                  <pre className="contract-template-body">{body}</pre>
                ) : (
                  <div className="contract-template-file-actions">
                    <a className="button button-secondary" href={`/api/contract-templates/${selectedId}/file`} target="_blank" rel="noreferrer">Visualizar modelo</a>
                    <a className="button button-secondary" href={`/api/contract-templates/${selectedId}/file?download=1`}>Baixar PDF</a>
                  </div>
                )}
              </>
            ) : (
              <div className="public-empty">Selecione um modelo autorizado para consultar.</div>
            )}
          </article>
        ) : <article className="contract-template-editor">
          <div className="form-row">
            <label>
              Artista
              <select
                value={artistId}
                disabled={!canManage || Boolean(selectedId)}
                onChange={(event) => setArtistId(event.target.value)}
              >
                <option value="">Selecione</option>
                {artists.map((artist) => (
                  <option value={artist.id} key={artist.id}>{artist.name}</option>
                ))}
              </select>
            </label>
            <label>
              Tipo do modelo
              <select
                value={templateType}
                disabled={!canManage || Boolean(selectedId)}
                onChange={(event) => setTemplateType(event.target.value as "TEXT" | "PDF")}
              >
                <option value="PDF">Arquivo PDF</option>
                <option value="TEXT">Texto BookBusiness</option>
              </select>
            </label>
          </div>
          <label>
            Nome do modelo
            <input
              value={name}
              disabled={!canManage}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="form-row">
            <label>Categoria<input value={category} disabled={!canManage} onChange={(event) => setCategory(event.target.value)} /></label>
            <label>Descrição<input value={description} disabled={!canManage} onChange={(event) => setDescription(event.target.value)} /></label>
          </div>
          {templateType === "TEXT" ? <>
            <label>
              Cláusulas protegidas
              <textarea rows={24} value={body} disabled={!canManage} onChange={(event) => setBody(event.target.value)} placeholder="Selecione ou crie um modelo." />
            </label>
            <div className="contract-placeholder-list">
              <small>Campos disponíveis</small>
              {placeholders.map((placeholder) => (
                <button type="button" key={placeholder} disabled={!canManage} onClick={() => setBody((current) => `${current} {{${placeholder}}}`)}>{`{{${placeholder}}}`}</button>
              ))}
            </div>
          </> : <section className="pdf-template-settings">
            <label>
              PDF do modelo
              <input type="file" accept="application/pdf,.pdf" disabled={!canManage} onChange={(event) => setPdfFile(event.target.files?.[0] || null)} />
              <small>PDF real, até 10 MB. O original será preservado no R2.</small>
            </label>
            {selectedId && (
              <a className="button button-secondary" href={`/api/contract-templates/${selectedId}/file`} target="_blank" rel="noreferrer">Visualizar PDF original</a>
            )}
            {detectedFields.length ? <div className="pdf-field-mapping">
              <p className="eyebrow">Campos AcroForm detectados</p>
              {detectedFields.map((field) => (
                <label key={field.name}>
                  {field.name} <small>{field.type}</small>
                  <select value={fieldMapping[field.name] || ""} disabled={!canManage} onChange={(event) => setFieldMapping((current) => ({ ...current, [field.name]: event.target.value }))}>
                    <option value="">Não preencher</option>
                    {placeholders.map((placeholder) => <option value={placeholder} key={placeholder}>{`{{${placeholder}}}`}</option>)}
                  </select>
                </label>
              ))}
            </div> : selectedId && <div className="notice">PDF estático: o BookBusiness preservará o documento e anexará uma página confiável com os dados revisados.</div>}
          </section>}
          {canManage && (
            <button
              className="button button-primary"
              disabled={busy || !name || !artistId || (templateType === "TEXT" && !body) || (templateType === "PDF" && !selectedId && !pdfFile)}
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
        </article>}
      </div>
    </section>
  );
}
