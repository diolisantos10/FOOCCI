/**
 * POST /api/help/transcribe — áudio → texto.
 *
 * Aceita `multipart/form-data` com o campo `audio` (o caminho normal) **e**
 * o áudio cru no corpo com `Content-Type: audio/*` (o resgate — ver abaixo).
 *
 * ─── Por que este arquivo foi reescrito em 05/08/2026 ────────────────────────
 * O lojista via **"Não consegui ler o áudio."** e parava ali. Aquela frase era
 * montada num único ponto: o `catch` do `req.formData()`. Ela não dizia o que
 * fazer, não deixava rastro nenhum no log, e o áudio gravado ia embora junto.
 * Três defeitos num aviso de sete palavras.
 *
 * O que mudou:
 *  1. **Toda falha tem `code`.** A UI decide se oferece "tentar de novo" e o
 *     log diz a CAUSA (guardrail 6: o alerta carrega a própria evidência).
 *  2. **O corpo que não é multipart não é mais um beco sem saída.** Se vier
 *     `Content-Type: audio/*`, lemos o corpo como o próprio arquivo.
 *  3. **Validação de tamanho e de formato no SERVIDOR** (guardrail 4). O que
 *     o navegador checa é conveniência; a trava é aqui.
 *  4. **O log nunca publica o que a pessoa falou.** Sai tamanho, tipo,
 *     extensão, duração da chamada e o recado do provedor — nunca o texto.
 *
 * As frases e os códigos moram em `@/services/help/transcribeContract` —
 * route handler não pode exportar nada além dos verbos HTTP.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTenantContext } from "@/lib/tenant";
import {
  transcribeAudioResult,
  TRANSCRIPTION_MAX_BYTES,
} from "@/services/brain/engines/TranscriptionAdapter";
import {
  TRANSCRIBE_REPLIES,
  TRANSCRIBE_OUR_FAULT,
  isAcceptedAudioName,
  extensionOf,
  nameFromContentType,
  type TranscribeErrorCode,
} from "@/services/help/transcribeContract";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function fail(
  code: TranscribeErrorCode,
  evidence: Record<string, unknown>,
  providerMessage?: string,
) {
  const reply = TRANSCRIBE_REPLIES[code];
  // Guardrail 6 — o log carrega a causa e o caso concreto. NUNCA o que foi dito.
  const line = `[help/transcribe] ${code} ${JSON.stringify(evidence)}${
    providerMessage ? ` provider="${providerMessage}"` : ""
  }`;
  if (TRANSCRIBE_OUR_FAULT.has(code)) console.error(line);
  else console.warn(line);

  return NextResponse.json(
    { error: reply.error, code, retriable: reply.retriable },
    { status: reply.status },
  );
}

export async function POST(req: NextRequest) {
  const startedAt = Date.now();
  const ctx = getTenantContext(req);
  if (!ctx) {
    return NextResponse.json(
      { error: TRANSCRIBE_REPLIES.UNAUTHORIZED.error, code: "UNAUTHORIZED", retriable: false },
      { status: 401 },
    );
  }

  const contentType = req.headers.get("content-type") ?? "";
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  const base = { restaurantId: ctx.restaurantId, contentType, declaredLength };

  let audio: File | null = null;

  if (contentType.toLowerCase().includes("multipart/form-data")) {
    try {
      const form = await req.formData();
      const raw = form.get("audio");
      if (raw instanceof File) audio = raw;
    } catch (err) {
      // Era AQUI que nascia o "Não consegui ler o áudio." — corpo multipart que
      // não abre (upload cortado no meio, boundary perdido por proxy). Agora o
      // recado ensina o próximo passo e o cliente guarda o áudio para repetir.
      return fail("BODY_UNREADABLE", base, err instanceof Error ? err.message : String(err));
    }
  } else if (contentType.toLowerCase().startsWith("audio/")) {
    // Resgate: alguém mandou o áudio cru. Não é o caminho da nossa UI, mas
    // recusar seria jogar fora uma gravação que chegou perfeitamente.
    try {
      const buf = await req.arrayBuffer();
      if (buf.byteLength > 0) {
        audio = new File([buf], nameFromContentType(contentType), { type: contentType });
      }
    } catch (err) {
      return fail("BODY_UNREADABLE", base, err instanceof Error ? err.message : String(err));
    }
  } else {
    return fail("NO_AUDIO", base, `content-type inesperado: "${contentType}"`);
  }

  if (!audio) return fail("NO_AUDIO", base);

  const evidence = {
    ...base,
    bytes: audio.size,
    fileType: audio.type || "(vazio)",
    fileName: audio.name || "(sem nome)",
  };

  // ── As travas do SERVIDOR (guardrail 4) ────────────────────────────────────
  if (audio.size === 0) return fail("EMPTY_AUDIO", evidence);
  if (audio.size > TRANSCRIPTION_MAX_BYTES) return fail("TOO_LARGE", evidence);
  if (!isAcceptedAudioName(audio.name)) {
    return fail(
      "UNSUPPORTED_FORMAT",
      evidence,
      `extensão "${extensionOf(audio.name)}" fora da lista aceita`,
    );
  }

  const result = await transcribeAudioResult(audio);
  const ms = Date.now() - startedAt;

  if (!result.ok) return fail(result.code, { ...evidence, ms }, result.providerMessage);

  // Sucesso: mede, mas não publica o conteúdo — só o tamanho do que voltou.
  console.log(
    `[help/transcribe] OK ${JSON.stringify({ ...evidence, ms, chars: result.text.length })}`,
  );
  return NextResponse.json({ text: result.text });
}
