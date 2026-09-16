import type { Role } from "./tenant";

export function conflictResponse(conflict: {
  id: string;
  title: string;
  status: string;
  startDatetime: string;
  endDatetime: string | null;
}, role: Role) {
  if (role === 'BOOKING_AGENT')
    return Response.json({
      error: 'Existe um compromisso incompatível neste horário. Escolha outro período.',
      conflict: { startDatetime: conflict.startDatetime, endDatetime: conflict.endDatetime },
    }, { status: 409 });
  return Response.json(
    {
      error: `Conflito com “${conflict.title}” (${conflict.status}). Revise a data antes de confirmar ou bloquear.`,
      conflict,
    },
    { status: 409 },
  );
}
