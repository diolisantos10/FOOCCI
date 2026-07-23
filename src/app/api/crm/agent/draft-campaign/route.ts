/**
 * POST /api/crm/agent/draft-campaign — o lojista pede uma campanha (texto ou voz)
 * e a IA monta o RASCUNHO (objetivo, público, mensagem, cupom). Não cria nem envia.
 *
 * • JSON  { text }            → monta do texto
 * • multipart form-data audio → transcreve (Whisper) e monta
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { draftCampaign, transcribeAudio } from "@/services/crm/CrmCampaignDrafter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  let text = "";
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");
      const typed = form.get("text");
      if (typeof typed === "string" && typed.trim()) {
        text = typed.trim();
      } else if (audio instanceof File && audio.size > 0) {
        text = await transcribeAudio(audio);
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as { text?: string };
      text = (body.text ?? "").trim();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "não consegui ler o pedido (áudio/texto)." }, { status: 400 });
  }

  if (!text) return NextResponse.json({ ok: false, error: "Nenhum pedido recebido. Fale ou digite o que você quer." }, { status: 400 });

  const result = await draftCampaign(restaurantId, text);
  return NextResponse.json({ ...result, transcript: text });
}
