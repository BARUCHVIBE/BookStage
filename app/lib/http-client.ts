export type JsonResult<T> = {
  ok: boolean;
  status: number;
  data: T | null;
  error: string | null;
};

const STATUS_MESSAGES: Record<number, string> = {
  400: "A requisição enviada é inválida.",
  401: "Sua sessão expirou. Entre novamente para continuar.",
  403: "Você não tem permissão para realizar esta ação.",
  404: "O recurso solicitado não foi encontrado.",
  409: "A operação entrou em conflito com o estado atual do registro.",
  413: "O arquivo enviado excede o tamanho permitido.",
};

function responseError(data: unknown, status: number) {
  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string" &&
    data.error.trim()
  )
    return data.error;
  if (!status) return "Não foi possível conectar ao servidor.";
  if (STATUS_MESSAGES[status]) return STATUS_MESSAGES[status];
  if (status >= 500)
    return `O servidor não conseguiu concluir a requisição (HTTP ${status}).`;
  return `A requisição falhou (HTTP ${status}).`;
}

/** Parses API responses without allowing an empty/non-JSON body to mask the
 * original HTTP status. Intended for resilient, independently loaded panels. */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<JsonResult<T>> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    return { ok: false, status: 0, data: null, error: responseError(null, 0) };
  }

  let body = "";
  try {
    body = await response.text();
  } catch {
    return {
      ok: false,
      status: response.status,
      data: null,
      error: responseError(null, response.status),
    };
  }
  // 204 and other successful empty responses are valid and intentionally
  // represented by `data: null`.
  let data: T | null = null;
  if (body.trim()) {
    try {
      data = JSON.parse(body) as T;
    } catch {
      return {
        ok: false,
        status: response.status,
        data: null,
        error: response.ok
          ? "O servidor retornou uma resposta inválida."
          : responseError(null, response.status),
      };
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    data,
    error: response.ok ? null : responseError(data, response.status),
  };
}
