/**
 * TranscriptionAdapter — voz → texto (Whisper), na camada de engines (o único
 * lugar que fala com a IA-piloto direto). Usado p/ o lojista criar campanha por áudio.
 */

import { openai } from "@/lib/openai";

/** Transcreve um áudio para texto (pt). Vazio se não configurado / falhar. */
export async function transcribeAudio(file: File): Promise<string> {
  if (!process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === "not-configured") return "";
  const r = await openai.audio.transcriptions.create({ file, model: "whisper-1", language: "pt" });
  return (r.text ?? "").trim();
}
