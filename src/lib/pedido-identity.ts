/**
 * Proof-of-phone-possession gate for the public "área do cliente" (/pedido).
 *
 * WHY THIS EXISTS: the `customerId` is NOT a credential. `/identify-customer`
 * hands it out from a phone number, so anyone holding the victim's phone + the
 * store slug could read/write the victim's PII (home address, e-mail) — a live
 * LGPD leak (CR-seguranca-cibernetica-2026-08-03, C1). This gate requires a
 * SIGNED proof that the caller possesses the phone.
 *
 * The proof is the same HMAC `waToken` already minted for the WhatsApp → /pedido
 * identity handoff (delivered to the phone over WhatsApp, so holding it proves
 * possession) — reused here instead of inventing a new mechanism. When OTP lands
 * (domínio `canais`), the OTP-verify step mints the SAME token via signWaToken,
 * so this gate needs no change.
 *
 * The token carries the phone; we resolve the customer from THAT phone within the
 * restaurant. A client-supplied customerId is NEVER trusted — it is resolved from
 * the proven phone, not accepted from the request.
 *
 * Server-only (Node crypto via verifyWaToken). Never import from a client component.
 */

import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWaToken } from "@/lib/wa-token";
import { phoneCandidates, CUSTOMER_LOOKUP_ORDER } from "@/lib/phone";

/** Header the client attaches to carry the proof token on GET and mutations. */
export const PEDIDO_TOKEN_HEADER = "x-pedido-token";

export interface PedidoIdentity {
  customerId: string;
  phone: string;
}

/**
 * Extract the raw proof token from the request. Header is preferred; `?t=` is a
 * query fallback so a plain GET link can still carry it. Both accept the same
 * signed waToken value.
 */
export function readPedidoToken(req: NextRequest): string | null {
  const header = req.headers.get(PEDIDO_TOKEN_HEADER)?.trim();
  if (header) return header;
  const query = req.nextUrl.searchParams.get("t")?.trim();
  return query || null;
}

/**
 * Resolve the identified customer ONLY when the caller proves possession of the
 * phone (a valid waToken) AND that phone belongs to a customer of this restaurant.
 *
 * Returns null when there is no token, the token is invalid/expired/forged, or the
 * proven phone is not a customer here. Callers MUST treat null as "unauthorized —
 * reveal nothing / refuse the write".
 */
export async function resolvePedidoIdentity(
  req: NextRequest,
  restaurantId: string,
): Promise<PedidoIdentity | null> {
  const token = readPedidoToken(req);
  if (!token) return null;

  const payload = verifyWaToken(token);
  if (!payload?.phone) return null;

  const candidates = phoneCandidates(payload.phone);
  if (candidates.length === 0) return null;

  const customer = await prisma.customer.findFirst({
    where: { restaurantId, phone: { in: candidates }, isActive: true },
    orderBy: CUSTOMER_LOOKUP_ORDER, // duplicata sem histórico nunca vence o cadastro rico
    select: { id: true, phone: true },
  });
  if (!customer) return null;

  return { customerId: customer.id, phone: customer.phone ?? payload.phone };
}
