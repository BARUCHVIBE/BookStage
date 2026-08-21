import { env } from "cloudflare:workers";
import { requireActiveMembership } from "@/app/lib/active-membership";
import { accessibleContract } from "@/app/lib/contract-access";
import {
  safeContractFileName,
  validateContractFile,
} from "@/app/lib/contract-rules";
import { rejectCrossOriginMutation } from "@/app/lib/request-security";

export async function GET(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params,
    contract = await accessibleContract(
      id,
      context.organizationId,
      context.user.id,
      context.membership.role,
    );
  if (!contract?.fileKey)
    return Response.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const object = await env.FILES.get(contract.fileKey);
  if (!object)
    return Response.json({ error: "Arquivo não encontrado." }, { status: 404 });
  const inline = new URL(request.url).searchParams.get("view") === "1",
    fileName = safeContractFileName(
      contract.fileName || `${contract.contractNumber}.pdf`,
    );
  return new Response(object.body, {
    headers: {
      "content-type": contract.fileType || "application/pdf",
      "content-length": String(object.size),
      "content-disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "cache-control": "private, no-store",
      "content-security-policy": "sandbox; default-src 'none'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}

export async function POST(
  request: Request,
  route: { params: Promise<{ id: string }> },
) {
  const rejected = rejectCrossOriginMutation(request);
  if (rejected) return rejected;
  const context = await requireActiveMembership();
  if ("error" in context) return context.error;
  const { id } = await route.params,
    contract = await accessibleContract(
      id,
      context.organizationId,
      context.user.id,
      context.membership.role,
    );
  if (!contract)
    return Response.json(
      { error: "Contrato não encontrado." },
      { status: 404 },
    );
  if (
    context.membership.role === "BOOKING_AGENT" ||
    contract.commercialApprovalStatus !== "APPROVED"
  )
    return Response.json(
      {
        error:
          "O arquivo final só pode ser incluído pelo comercial interno após a validação.",
      },
      { status: 403 },
    );
  if (contract.status !== "DRAFT")
    return Response.json(
      {
        error:
          "O arquivo só pode ser incluído ou substituído enquanto o contrato estiver em rascunho.",
      },
      { status: 409 },
    );
  const form = await request.formData(),
    entry = form.get("file");
  if (!(entry instanceof File))
    return Response.json(
      { error: "Selecione o arquivo do contrato." },
      { status: 400 },
    );
  try {
    validateContractFile(entry);
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Arquivo inválido." },
      { status: 400 },
    );
  }
  const bytes = new Uint8Array(await entry.arrayBuffer());
  if (new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-")
    return Response.json(
      { error: "O conteúdo enviado não é um PDF válido." },
      { status: 400 },
    );
  const fileName = safeContractFileName(entry.name),
    key = `contracts/${context.organizationId}/${id}/${crypto.randomUUID()}.pdf`,
    replacing = Boolean(contract.fileKey);
  await env.FILES.put(key, bytes, {
    httpMetadata: { contentType: "application/pdf" },
    customMetadata: { organizationId: context.organizationId, contractId: id },
  });
  const description = replacing
    ? `Arquivo do contrato ${contract.contractNumber} substituído.`
    : `Arquivo do contrato ${contract.contractNumber} enviado.`;
  const update = await env.DB.prepare(
    `UPDATE contracts SET file_key=?,file_name=?,file_type='application/pdf',file_size=?,file_uploaded_at=CURRENT_TIMESTAMP,generated_at=NULL,updated_at=CURRENT_TIMESTAMP WHERE id=? AND organization_id=? AND status='DRAFT' AND COALESCE(file_key,'')=?`,
  )
    .bind(
      key,
      fileName,
      entry.size,
      id,
      context.organizationId,
      contract.fileKey || "",
    )
    .run();
  if (update.meta.changes !== 1) {
    await env.FILES.delete(key);
    return Response.json(
      {
        error:
          "O contrato foi alterado por outro usuário. Atualize a página e tente novamente.",
      },
      { status: 409 },
    );
  }
  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO contract_activities (id,organization_id,contract_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      context.organizationId,
      id,
      replacing ? "FILE_REPLACED" : "FILE_UPLOADED",
      description,
      contract.fileName,
      fileName,
      context.user.id,
    ),
    env.DB.prepare(
      `INSERT INTO opportunity_activities (id,organization_id,opportunity_id,type,description,from_value,to_value,created_by) VALUES (?,?,?,?,?,?,?,?)`,
    ).bind(
      crypto.randomUUID(),
      context.organizationId,
      contract.opportunityId,
      replacing ? "CONTRACT_FILE_REPLACED" : "CONTRACT_FILE_UPLOADED",
      description,
      contract.fileName,
      fileName,
      context.user.id,
    ),
  ]);
  if (contract.fileKey) await env.FILES.delete(contract.fileKey);
  return Response.json({ ok: true, fileName, fileSize: entry.size });
}
