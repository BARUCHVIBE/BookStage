import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { accessibleShow } from "@/app/lib/show-access";
import { canEditProduction, safeShowFileName, validateShowDocument } from "@/app/lib/show-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

type Kind = "rider" | "stage-map";
function validKind(value: string): value is Kind { return value === "rider" || value === "stage-map"; }
function fileInfo(show: NonNullable<Awaited<ReturnType<typeof accessibleShow>>>, kind: Kind) { return kind === "rider" ? { key: show.riderFileKey, name: show.riderFileName, type: show.riderFileType, size: show.riderFileSize } : { key: show.stageMapFileKey, name: show.stageMapFileName, type: show.stageMapFileType, size: show.stageMapFileSize }; }

export async function GET(_: Request, route: { params: Promise<{ id: string; kind: string }> }) {
  const context = await requireActiveMembership(); if ("error" in context) return context.error;
  const { id, kind } = await route.params; if (!validKind(kind)) return Response.json({ error: "Documento inválido." }, { status: 404 });
  const show = await accessibleShow(id, context.organizationId, context.user.id, context.membership.role); if (!show) return Response.json({ error: "Show não encontrado." }, { status: 404 });
  const info = fileInfo(show, kind); if (!info.key) return Response.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const object = await env.FILES.get(info.key); if (!object) return Response.json({ error: "Arquivo não encontrado." }, { status: 404 });
  return new Response(object.body, { headers: { "content-type": info.type || "application/octet-stream", "content-length": String(object.size), "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(safeShowFileName(info.name || kind))}`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
}

export async function POST(request: Request, route: { params: Promise<{ id: string; kind: string }> }) {
  const rejected = rejectCrossOriginMutation(request); if (rejected) return rejected;
  const context = await requireActiveMembership(); if ("error" in context) return context.error;
  const { id, kind } = await route.params; if (!validKind(kind)) return Response.json({ error: "Documento inválido." }, { status: 404 });
  const show = await accessibleShow(id, context.organizationId, context.user.id, context.membership.role); if (!show) return Response.json({ error: "Show não encontrado." }, { status: 404 });
  if (!canEditProduction(context.membership.role)) return Response.json({ error: "Sem permissão para enviar documentos da produção." }, { status: 403 });
  if (["COMPLETED", "CANCELLED"].includes(show.status)) return Response.json({ error: "Não é possível alterar documentos de um show encerrado." }, { status: 409 });
  const form = await request.formData(), entry = form.get("file"); if (!(entry instanceof File)) return Response.json({ error: "Selecione um arquivo." }, { status: 400 });
  try { validateShowDocument(entry); } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Arquivo inválido." }, { status: 400 }); }
  const bytes = new Uint8Array(await entry.arrayBuffer()), signature = Array.from(bytes.slice(0, 8));
  const validPdf = entry.type === "application/pdf" && new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-", validPng = entry.type === "image/png" && signature.slice(0, 8).join(",") === "137,80,78,71,13,10,26,10", validJpeg = entry.type === "image/jpeg" && signature[0] === 255 && signature[1] === 216 && signature[2] === 255;
  if (!validPdf && !validPng && !validJpeg) return Response.json({ error: "O conteúdo do arquivo não corresponde ao formato informado." }, { status: 400 });
  const old = fileInfo(show, kind), name = safeShowFileName(entry.name), key = `shows/${context.organizationId}/${id}/${kind}/${crypto.randomUUID()}`, prefix = kind === "rider" ? "rider" : "stage_map", replacing = Boolean(old.key);
  await env.FILES.put(key, bytes, { httpMetadata: { contentType: entry.type }, customMetadata: { organizationId: context.organizationId, showId: id, kind } });
  const update = await env.DB.prepare(`UPDATE shows SET ${prefix}_file_key=?,${prefix}_file_name=?,${prefix}_file_type=?,${prefix}_file_size=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND COALESCE(${prefix}_file_key,'')=?`).bind(key, name, entry.type, entry.size, id, context.organizationId, old.key || "").run();
  if (update.meta.changes !== 1) { await env.FILES.delete(key); return Response.json({ error: "O show foi alterado por outro usuário. Atualize a página." }, { status: 409 }); }
  const label = kind === "rider" ? "Rider" : "Mapa de palco", type = kind === "rider" ? (replacing ? "RIDER_REPLACED" : "RIDER_UPLOADED") : (replacing ? "STAGE_MAP_REPLACED" : "STAGE_MAP_UPLOADED");
  await env.DB.prepare(`INSERT INTO show_activities (id,organization_id,show_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,?,?,?,?,?)`).bind(crypto.randomUUID(), context.organizationId, id, type, `${label} ${replacing ? "substituído" : "enviado"}.`, old.name, name, context.user.id).run();
  if (old.key) await env.FILES.delete(old.key); return Response.json({ ok: true, fileName: name, fileSize: entry.size });
}
