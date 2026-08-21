export function rejectCrossOriginMutation(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin" && fetchSite !== "none")
    return Response.json(
      { error: "Origem da requisição não permitida." },
      { status: 403 },
    );
  const origin = request.headers.get("origin");
  if (origin) {
    let expected: string;
    try {
      expected = new URL(request.url).origin;
    } catch {
      return Response.json(
        { error: "Origem da requisição não permitida." },
        { status: 403 },
      );
    }
    if (origin !== expected)
      return Response.json(
        { error: "Origem da requisição não permitida." },
        { status: 403 },
      );
  }
  return null;
}
