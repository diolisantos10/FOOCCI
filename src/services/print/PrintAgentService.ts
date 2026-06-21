/**
 * PrintAgentService — pairing + heartbeat for the local print agent ("Carteiro").
 *
 * The agent runs on the restaurant's PC and reaches OUT to Foocci (the cloud can't
 * reach into the LAN). Pairing flow:
 *   1. Panel shows a short `pairingCode` (one per restaurant).
 *   2. Owner types it into the Carteiro → POST /api/print-agent/pair.
 *   3. We issue a durable `token`, rotate the code (single-use), and the agent
 *      authenticates with the token from then on (poll/ack).
 *
 * Server-side only. No printing happens here — that runs on the PC.
 */

import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import type { PrintAgent } from "@prisma/client";

// Unambiguous alphabet (no O/0, I/1) so the code is easy to read & type.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(len = 8): string {
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += CODE_ALPHABET.charAt((bytes[i] ?? 0) % CODE_ALPHABET.length);
  return out;
}

function randomToken(): string {
  return randomBytes(32).toString("hex");
}

/** Ensure the restaurant has a print agent row (with a pairing code). Idempotent. */
export async function getOrCreateAgent(restaurantId: string): Promise<PrintAgent> {
  const existing = await prisma.printAgent.findUnique({ where: { restaurantId } });
  if (existing) return existing;
  try {
    return await prisma.printAgent.create({ data: { restaurantId, pairingCode: randomCode() } });
  } catch {
    // Race (another request created it) or a rare code collision → re-fetch / retry.
    const again = await prisma.printAgent.findUnique({ where: { restaurantId } });
    if (again) return again;
    return prisma.printAgent.create({ data: { restaurantId, pairingCode: randomCode() } });
  }
}

/** Pair using the code the owner typed. Returns the agent (with token) or null. */
export async function pairByCode(pairingCode: string): Promise<PrintAgent | null> {
  const code = pairingCode.trim().toUpperCase();
  if (!code) return null;
  const agent = await prisma.printAgent.findUnique({ where: { pairingCode: code } });
  if (!agent) return null;
  return prisma.printAgent.update({
    where: { id: agent.id },
    // Issue a token and rotate the code so the used code can't be reused.
    data: { token: randomToken(), pairingCode: randomCode(), lastSeenAt: new Date() },
  });
}

export async function resolveByToken(token: string): Promise<PrintAgent | null> {
  if (!token || typeof token !== "string") return null;
  return prisma.printAgent.findUnique({ where: { token } });
}

const ONLINE_WINDOW_MS = 30_000;

export function isOnline(agent: { lastSeenAt: Date | null }): boolean {
  return agent.lastSeenAt != null && Date.now() - agent.lastSeenAt.getTime() < ONLINE_WINDOW_MS;
}
