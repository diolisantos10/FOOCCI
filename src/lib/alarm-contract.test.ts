/**
 * Alarm system contract — raio-x 2 (2026-07-14).
 *
 * Locks the fixes for "apita em página aleatória / pedido e chat mudos":
 *   1. The floating "Silenciar alarme" balloon is GONE (owner's explicit order) —
 *      GlobalAlertEngine renders nothing, ever.
 *   2. Replying IS acknowledging: every human-outbound writer also sets
 *      handoffAlarmAckAt, so answering a customer (painel, WhatsApp do celular,
 *      Instagram) silences the handoff alarm durably. This was the #1 source of
 *      the chronic beep — phone-answered conversations kept ringing for hours.
 *   3. Sound is bounded: the engine rings handoffs inside the SOUND window
 *      (10 min), not the VISUAL window (2h), and overdue re-beeps only while the
 *      wait is recent.
 *
 * Source-level guards (same pattern as WaiterBrainV2.release-candidate): they
 * fail loudly if a future edit reintroduces the balloon, drops an auto-ack, or
 * points the sound back at the 2h window.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("alarm contract — no floating silence balloon", () => {
  const engine = read("src/components/layout/GlobalAlertEngine.tsx");

  it("GlobalAlertEngine renders nothing (no button, no 'Silenciar alarme' UI)", () => {
    expect(engine).not.toContain("Silenciar alarme");
    expect(engine).not.toContain("<button");
    expect(engine).toMatch(/return null;\s*\}\s*$/);
  });
});

describe("alarm contract — replying IS acknowledging (auto-ack on human outbound)", () => {
  it("MessageService sets handoffAlarmAckAt on BOTH outbound paths (internal/cardápio + WhatsApp)", () => {
    const src = read("src/services/conversation/MessageService.ts");
    const count = (src.match(/handoffAlarmAckAt:\s*now/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ⚠️ LACUNA CONHECIDA, registrada de propósito em vez de apagada.
  //
  // Até 04/08/2026 o webhook da Evolution tratava `fromMe`: resposta dada pelo
  // celular do atendente entrava na Central e carimbava `handoffAlarmAckAt` — a
  // correção do crônico "apita e não para". A Evolution saiu do Foocci por ordem
  // do CEO e o equivalente na Meta (`smb_message_echoes`) NÃO foi implementado:
  // o formato do payload nunca foi validado contra um evento ao vivo, e escrever
  // no banco a partir de um formato adivinhado cria mensagem fantasma e silencia
  // alarme que deveria tocar.
  //
  // Este teste trava o estado HONESTO: o webhook da Meta reconhece o evento e diz
  // que NÃO o ingere. Quando o eco for implementado, este teste deve ser trocado
  // por um que exija `handoffAlarmAckAt` — e não simplesmente apagado.
  it("eco de resposta pelo celular: a lacuna está declarada, não escondida", () => {
    const src = read("src/app/api/webhooks/meta/whatsapp/route.ts");
    expect(src).toContain("smb_message_echoes");
    expect(src).toContain("NÃO ingerido");
    // E não ingere de fato: nenhuma escrita de mensagem a partir do eco.
    expect(src).not.toMatch(/smb_message_echoes[\s\S]{0,400}prisma\.message\.create/);
  });

  it("operator chat route auto-acks", () => {
    const src = read("src/app/api/chat/conversations/[id]/messages/route.ts");
    expect(src).toMatch(/handoffAlarmAckAt:\s*now/);
  });

  it("Instagram human replies auto-ack (DM + comment reply)", () => {
    const src = read("src/services/instagram/InstagramChannelService.ts");
    const count = (src.match(/handoffAlarmAckAt:\s*now/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

describe("alarm contract — sound is bounded (sound window ≠ visual window)", () => {
  const engine = read("src/components/layout/GlobalAlertEngine.tsx");

  it("the app-wide engine rings handoffs with the SOUND window, not the 2h visual one", () => {
    expect(engine).toContain("HANDOFF_SOUND_MAX_AGE_MS");
    expect(engine).toContain("OVERDUE_SOUND_MAX_WAIT_MINUTES");
    expect(engine).not.toContain("HANDOFF_ALARM_MAX_AGE_MS");
  });

  it("Atendimento rings with the SOUND window while keeping the 2h VISUAL banner", () => {
    const src = read("src/app/(dashboard)/atendimento/AtendimentoClient.tsx");
    expect(src).toContain("HANDOFF_SOUND_MAX_AGE_MS");  // sound
    expect(src).toContain("HANDOFF_ALARM_MAX_AGE_MS");  // visual banner stays generous
    expect(src).toContain("OVERDUE_SOUND_MAX_WAIT_MINUTES");
  });

  it("the engine remembers handled orders so accepting one never re-rings it", () => {
    expect(engine).toContain("resolvedOrderIds");
  });

  // 2026-08-08 — "o pedido já foi aceito mas o som continua". A memória de aba
  // acima é ATALHO; quem decide "já foi tratado" é o servidor. Se um dia o poll
  // voltar a montar o ring-set na mão dentro do componente, o carimbo
  // alarmAckAt volta a ser esquecido em silêncio — e o defeito volta.
  it("o poll do pedido decide pelo seletor compartilhado (que honra o carimbo do servidor)", () => {
    expect(engine).toContain("ringIdsFromOrdersResponse");
    expect(engine).not.toMatch(/rows\.map\(/);           // sem mapeamento próprio
    expect(engine).toMatch(/if \(ids === null\) return;/); // servidor mudo → mantém tocando
  });

  it("Aceitar/Recusar no painel persiste no servidor antes de calar o alarme", () => {
    const orders = read("src/app/(dashboard)/orders/OrdersClient.tsx");
    // persistStatus (PATCH /api/orders/[id]) é o que carimba alarmAckAt no banco;
    // o evento local só antecipa o silêncio nesta aba.
    expect(orders).toMatch(/await persistStatus\([\s\S]{0,600}?foocci:order-resolved/);
  });

  it("each alarm rings on any FOREGROUND tab, gated only by visibility (owner's request, 2026-07-23)", () => {
    // The rule that ends the cross-screen bleed WITHOUT muting off-screen tabs:
    // sound = this tab is in the foreground. Which screen you are on no longer
    // gates (the 2026-07-14 per-screen over-correction is gone — it forced the
    // owner to keep Pedidos open to hear anything). Both alarms use the visibility
    // gate, and neither is pinned to a specific route anymore.
    expect(engine).toContain("isVisibleRef");
    expect(engine).toContain("canRingOrder");
    expect(engine).toContain("canRingHandoff");
    expect(engine).not.toContain("isOrdersScreenRef");
    expect(engine).not.toContain("isAtendimentoScreenRef");
  });

  it("the old app-wide leader machinery that bled sound across screens is gone", () => {
    // Web Locks / cross-tab BroadcastChannel / device lease made one sound play
    // on several unrelated screens — all removed.
    expect(engine).not.toContain("navigator.locks");
    expect(engine).not.toContain("BroadcastChannel");
    expect(engine).not.toContain("claim-leader");
  });
});
