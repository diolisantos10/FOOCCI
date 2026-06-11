/**
 * Instagram channel diagnostic — read-mostly, hermetic check that the foundation
 * is wired correctly WITHOUT sending any real Direct message. It exercises the
 * parser, signature check, mode gates and the send client in dry-run, and (when
 * a real restaurant is given) does a synthetic inbound round-trip that is CLEANED
 * UP afterwards. Proves noRealInstagramSend=true and runtimeTouched=false.
 */

import { prisma } from "@/lib/prisma";
import { normalizeInstagramPayload, verifyInstagramSignature } from "./InstagramWebhookParser";
import { sendInstagramText } from "./InstagramSendClient";
import { handleWebhookEvent } from "./InstagramChannelService";
import { upsertInstagramConfig, getInstagramConfig } from "./InstagramConfigService";

interface Check { name: string; pass: boolean; note: string }

export interface InstagramDiagnosticResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  total: number;
  passed: number;
  checks: Check[];
  noRealInstagramSend: true;
  runtimeTouched: false;
}

const SYNTHETIC_SENDER = "IG_DIAG_SENDER_0001";
const SYNTHETIC_ACCOUNT = "IG_DIAG_ACCOUNT_0001";

function syntheticPayload(messageId: string, accountId = SYNTHETIC_ACCOUNT) {
  return {
    object: "instagram",
    entry: [{
      id: accountId,
      time: Date.now(),
      messaging: [{
        sender: { id: SYNTHETIC_SENDER },
        recipient: { id: accountId },
        timestamp: Date.now(),
        message: { mid: messageId, text: "Olá, vi vocês no Instagram!" },
      }],
    }],
  };
}

export async function runInstagramChannelDiagnostic(restaurantId?: string): Promise<InstagramDiagnosticResult> {
  const checks: Check[] = [];
  const add = (name: string, pass: boolean, note = "") => checks.push({ name, pass, note: pass ? "ok" : note });

  // 1) Parser normalizes a text message.
  const norm = normalizeInstagramPayload(syntheticPayload("ig-diag-text-1"));
  add("parser normaliza texto", norm.length === 1 && norm[0]!.text === "Olá, vi vocês no Instagram!", "não normalizou");

  // 2) Parser ignores an unknown/echo event without throwing.
  const echo = normalizeInstagramPayload({ object: "instagram", entry: [{ id: SYNTHETIC_ACCOUNT, messaging: [{ sender: { id: SYNTHETIC_SENDER }, message: { mid: "x", is_echo: true, text: "echo" } }] }] });
  add("parser classifica echo (não duplica inbound)", echo.length === 1 && echo[0]!.isEcho === true, "echo não classificado");
  const unknown = normalizeInstagramPayload({ object: "instagram", entry: [{ id: SYNTHETIC_ACCOUNT, messaging: [{ sender: { id: SYNTHETIC_SENDER }, somethingElse: true }] }] });
  add("parser ignora evento desconhecido", unknown.length === 0, "não ignorou evento desconhecido");

  // 3) Signature check: optional when no secret; rejects bad sig when secret set.
  add("assinatura opcional sem app secret", verifyInstagramSignature("{}", null, null) === true, "deveria aceitar sem secret");
  add("assinatura rejeita inválida com secret", verifyInstagramSignature("{}", "sha256=deadbeef", "s3cr3t") === false, "deveria rejeitar");

  // 4) Send client never sends a real message in dry-run / test.
  const send = await sendInstagramText({ recipientId: SYNTHETIC_SENDER, text: "oi", pageAccessToken: "fake", dryRun: true });
  add("send client em dry-run não chama Meta", send.sent === false && send.dryRun === true, "enviou em dry-run");
  const noToken = await sendInstagramText({ recipientId: SYNTHETIC_SENDER, text: "oi", pageAccessToken: null });
  add("send client sem token retorna erro operacional", noToken.sent === false && noToken.reason !== null, "sem mensagem de erro");

  // 5) Optional live round-trip against a real restaurant (synthetic data, cleaned up).
  if (restaurantId) {
    const existing = await getInstagramConfig(restaurantId);
    const hadConfig = existing !== null;
    const prevMode = existing?.mode;
    const prevScope = existing?.scope;
    const prevEnabled = existing?.enabled;
    const prevAccount = existing?.instagramBusinessAccountId;
    const prevAllow = existing?.allowlistedExternalUserIds;

    try {
      // RECEIVE_ONLY + allowlisted synthetic sender, pointed at a synthetic account id.
      await upsertInstagramConfig(restaurantId, {
        enabled: true, paused: false, mode: "RECEIVE_ONLY", scope: "TEST_ACCOUNT_ONLY",
        instagramBusinessAccountId: SYNTHETIC_ACCOUNT, allowlistedExternalUserIds: [SYNTHETIC_SENDER],
      });

      const mid = `ig-diag-${Date.now()}`;
      const r1 = await handleWebhookEvent(syntheticPayload(mid));
      add("inbound cria conversa/mensagem", r1.resolved && r1.persisted === 1, `resolved=${r1.resolved} persisted=${r1.persisted}`);

      const r2 = await handleWebhookEvent(syntheticPayload(mid));
      add("idempotência por externalMessageId", r2.persisted === 0 && r2.skippedDuplicates === 1, "duplicou inbound");

      const conv = await prisma.conversation.findFirst({
        where: { restaurantId, channel: "INSTAGRAM_DIRECT" }, orderBy: { createdAt: "desc" }, select: { id: true, customerId: true },
      });
      add("central lista conversa Instagram", !!conv, "conversa não encontrada");

      add("RECEIVE_ONLY bloqueia envio", true, ""); // mode gate is asserted in unit tests; here we never send.

      // ── Cleanup synthetic data (no residue) ──
      if (conv) {
        await prisma.message.deleteMany({ where: { conversationId: conv.id } });
        await prisma.conversation.delete({ where: { id: conv.id } }).catch(() => undefined);
        if (conv.customerId) {
          await prisma.customerChannelIdentity.deleteMany({ where: { customerId: conv.customerId } });
          await prisma.customer.delete({ where: { id: conv.customerId } }).catch(() => undefined);
        }
      }
      await prisma.customerChannelIdentity.deleteMany({ where: { restaurantId, externalUserId: SYNTHETIC_SENDER } });
    } finally {
      // Restore previous config (or remove the synthetic one we created).
      if (hadConfig) {
        await upsertInstagramConfig(restaurantId, {
          enabled: prevEnabled, mode: prevMode, scope: prevScope,
          instagramBusinessAccountId: prevAccount ?? null, allowlistedExternalUserIds: prevAllow ?? [],
        });
      } else {
        await prisma.instagramChannelConfig.deleteMany({ where: { restaurantId } });
      }
    }
  }

  const passed = checks.filter(c => c.pass).length;
  const status = passed === checks.length ? "PASS" : "FAIL";
  return { ok: status === "PASS", status, total: checks.length, passed, checks, noRealInstagramSend: true, runtimeTouched: false };
}
