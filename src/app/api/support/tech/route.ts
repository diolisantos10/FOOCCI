/**
 * POST /api/support/tech — o lojista relata um problema (texto ou voz) e o Agente
 * de Suporte Técnico devolve um DIAGNÓSTICO: o que provavelmente está acontecendo,
 * o próximo passo, a ação candidata e se escala para humano.
 *
 * • JSON  { report }          → diagnostica do texto
 * • multipart form-data audio → transcreve (Whisper) e diagnostica
 *
 * Shadow-safe: NUNCA executa remediação — só decide e explica (executed: false).
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantId } from "@/lib/tenant";
import { reasonSupportIncident } from "@/services/support/SupportIncidentReasoner";
import { transcribeAudio } from "@/services/brain/engines/TranscriptionAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  let restaurantId: string;
  try { restaurantId = getTenantId(); }
  catch { return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 }); }

  let report = "";
  const contentType = req.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const audio = form.get("audio");
      const typed = form.get("report") ?? form.get("text");
      if (typeof typed === "string" && typed.trim()) {
        report = typed.trim();
      } else if (audio instanceof File && audio.size > 0) {
        report = await transcribeAudio(audio);
      }
    } else {
      const body = (await req.json().catch(() => ({}))) as { report?: string; text?: string };
      report = (body.report ?? body.text ?? "").trim();
    }
  } catch {
    return NextResponse.json({ ok: false, error: "não consegui ler o relato (áudio/texto)." }, { status: 400 });
  }

  if (!report) {
    return NextResponse.json({ ok: false, error: "Me conta o que está acontecendo." }, { status: 400 });
  }

  const diagnosis = await reasonSupportIncident({ restaurantId, report });
  return NextResponse.json({ ok: true, diagnosis, transcript: report });
}
