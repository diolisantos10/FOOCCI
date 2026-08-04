/**
 * POST /api/help/transcribe — áudio (multipart `audio`) → texto.
 *
 * O microfone da barra do Assistente escreve no campo; quem responde continua
 * sendo /api/help/message. Reusa o TranscriptionAdapter (Whisper) que a Ajuda
 * técnica já usava — nenhum cérebro novo aqui, só voz virando texto.
 *
 * Quando a transcrição não está configurada/não entendeu, devolve 422 com um
 * recado em português: a UI diz a verdade em vez de engolir o áudio.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import { transcribeAudio } from "@/services/brain/engines/TranscriptionAdapter";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const ctx = getTenantContext(req);
  if (!ctx) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let audio: File | null = null;
  try {
    const form = await req.formData();
    const raw = form.get("audio");
    if (raw instanceof File && raw.size > 0) audio = raw;
  } catch {
    return NextResponse.json({ error: "Não consegui ler o áudio." }, { status: 400 });
  }

  if (!audio) {
    return NextResponse.json({ error: "Nenhum áudio recebido." }, { status: 400 });
  }

  try {
    const text = await transcribeAudio(audio);
    if (!text) {
      return NextResponse.json(
        { error: "Não consegui entender o áudio. Pode digitar?" },
        { status: 422 },
      );
    }
    return NextResponse.json({ text });
  } catch (err) {
    console.error("[POST /api/help/transcribe]", err);
    return NextResponse.json(
      { error: "Falhou ao transcrever. Tente de novo ou digite." },
      { status: 500 },
    );
  }
}
