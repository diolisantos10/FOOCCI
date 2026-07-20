/**
 * POST /api/admin/brain/probe — banco de teste AUTOMÁTICO do Brain no WhatsApp.
 *
 * Roda um LOTE de perguntas pelo MESMO caminho de decisão do WhatsApp ao vivo
 * (menu-anchor → reasonAsAgent → crítico → juiz → responde), SEM enviar nada e
 * SEM precisar de celular. Para cada pergunta devolve o veredito exato:
 *   • gate: "menu" | "critic" | "judge" | "replied"
 *   • wouldReply: true só quando o Brain responderia de verdade
 *   • reasoningMode / coherence / confidence / minConfidence
 *   • snapshotSources: as fontes de verdade que o Brain tinha na hora
 *   • reply: a resposta candidata (o que ele responderia)
 *
 * Assim dá pra diagnosticar CONSISTÊNCIA (por que uma pergunta responde e outra
 * cai no recepcionista) sem mandar mensagem no braço.
 *
 * Body: { restaurantId: string, questions: string[] }  (ADMIN_SECRET)
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { reasonAsAgent } from "@/services/brain/reasoning/BrainReasoner";
import { getFreeFormConfig } from "@/services/brain/runtime/BrainFreeFormConfigService";
import { sanitizeText } from "@/services/simulation/simulationSanitizer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

interface ProbeRow {
  question: string;
  gate: "menu" | "critic" | "judge" | "replied" | "error";
  wouldReply: boolean;
  reasoningMode?: string;
  coherence?: string;
  confidence?: number;
  minConfidence?: number;
  intent?: string;
  snapshotSources?: string[];
  reply?: string;
  note?: string;
}

export async function POST(req: NextRequest) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "ADMIN_SECRET não configurado." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as { restaurantId?: string; questions?: string[] };
  const restaurantId = body.restaurantId;
  const questions = Array.isArray(body.questions) ? body.questions.filter((q) => typeof q === "string" && q.trim()).slice(0, 40) : [];
  if (!restaurantId || questions.length === 0) {
    return NextResponse.json({ ok: false, error: "restaurantId e questions[] são obrigatórios." }, { status: 400 });
  }

  const recep = await import("@/services/ai/WhatsAppReceptionistService");
  const { judgeReply } = await import("@/services/brain/reasoning/BrainCoherenceCritic");
  const cfg = await getFreeFormConfig(restaurantId);
  const minConfidence = cfg.minConfidence ?? 0.6;

  const rows: ProbeRow[] = [];
  for (const raw of questions) {
    const question = raw.trim();
    try {
      // 1) Âncora de menu — mesma regra do runtime.
      const intent = recep.detectIntent(question);
      const isMenu =
        intent === "GREETING" || intent === "MENU_REQUEST" || recep.BACK_TO_MENU_RE.test(question) || /^\d+$/.test(question);
      if (isMenu) {
        rows.push({ question, gate: "menu", wouldReply: false, intent, note: "tratado como interação de menu (não vai ao Brain)" });
        continue;
      }

      // 2) Raciocínio — mesmo caminho do ao vivo.
      const outcome = await reasonAsAgent({
        businessId: restaurantId,
        businessType: "RESTAURANT",
        agentId: "whatsapp",
        agentRole: "WhatsApp",
        sourceType: "REAL_CONVERSATION",
        sanitizedInput: sanitizeText(question),
        sanitizedHistory: [],
      });
      const reply = (outcome.result.idealResponse ?? "").trim();
      const snapshotSources = Object.keys(outcome.snapshot?.truthSources ?? {});
      const base: ProbeRow = {
        question,
        gate: "replied",
        wouldReply: true,
        reasoningMode: outcome.reasoningMode,
        coherence: outcome.result.coherenceCheck.verdict,
        confidence: Number(outcome.result.confidence.toFixed(2)),
        minConfidence,
        intent: outcome.result.primaryIntent,
        snapshotSources,
        reply: reply.slice(0, 240),
      };

      // 3) Crítico determinístico (piso).
      const criticOk =
        outcome.reasoningMode === "LLM" &&
        outcome.result.coherenceCheck.verdict === "PASS" &&
        outcome.result.confidence >= minConfidence;
      if (!reply) {
        rows.push({ ...base, gate: "critic", wouldReply: false, note: "Brain não produziu resposta" });
        continue;
      }
      if (!criticOk) {
        // Em FALLBACK, o motivo real (erro do motor de IA) fica em escalationReason —
        // expõe aqui para diagnosticar causa externa (ex.: cota/chave OpenAI).
        const why = outcome.reasoningMode === "FALLBACK" && outcome.result.escalationReason
          ? ` — motor: ${outcome.result.escalationReason}`
          : "";
        rows.push({ ...base, gate: "critic", wouldReply: false, note: `reprovado no piso (modo/coerência/confiança)${why}` });
        continue;
      }

      // 4) Juiz LLM.
      const verdict = await judgeReply({
        agentId: "whatsapp",
        businessId: restaurantId,
        customerMessage: sanitizeText(question),
        candidateReply: reply,
        snapshot: outcome.snapshot ?? { truthSources: {}, missingContext: [] },
      });
      if (!verdict.approved) {
        rows.push({ ...base, gate: "judge", wouldReply: false, note: `juiz reprovou: ${verdict.reason}` });
        continue;
      }

      rows.push(base);
    } catch (err) {
      rows.push({ question, gate: "error", wouldReply: false, note: err instanceof Error ? err.message.slice(0, 160) : "erro" });
    }
  }

  const replied = rows.filter((r) => r.wouldReply).length;
  return NextResponse.json({
    ok: true,
    restaurantId,
    minConfidence,
    summary: { total: rows.length, wouldReply: replied, fellBack: rows.length - replied },
    rows,
    runtimeTouched: false,
  });
}
