/**
 * realChunkExtractor — production per-chunk technique extractor (OpenAI).
 *
 * One LLM call per chunk, asking for deep, APPLICABLE techniques (not generic
 * phrases), with short synthesized evidence only — never long copyrighted
 * excerpts. Throws a controlled error when OPENAI_API_KEY is missing so the
 * orchestrator can retry / mark the chunk FAILED without crashing.
 */

import { openai } from "@/lib/openai";
import { parseExtractedTechniques } from "../agentLibraryHelpers";
import type { ChunkExtractor } from "./DeepExtractionService";

const SYSTEM = [
  "Você é um curador de formação técnica para o agente garçom-vendedor (Foocci).",
  "A partir do TRECHO fornecido (parte de um material maior), extraia de 0 a 6 técnicas",
  "APLICÁVEIS e operacionais para venda consultiva, atendimento, recomendação, redução de",
  "fricção, escolha guiada, fechamento, retenção e experiência em restaurante.",
  "NUNCA reproduza trechos longos da obra — produza apenas SÍNTESES operacionais próprias.",
  "Ignore conteúdo genérico, resumo de capítulo sem aplicação e citações longas.",
  'Responda em JSON: { "techniques": [ { "techniqueName", "category", "purpose", "principle",',
  '"application", "usageRule", "qualityTest", "goodExample", "badExample", "confidence" } ] }.',
  "confidence é 0..1. application deve dizer COMO o Waiter usa a técnica no Foocci.",
  "Se o trecho não tiver técnica útil, retorne lista vazia.",
].join(" ");

export const realChunkExtractor: ChunkExtractor = async (input) => {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY não configurada — extração profunda indisponível.");
  }
  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.3,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      {
        role: "user",
        content:
          `Agente: ${input.agentSlug}\nFonte: ${input.sourceTitle}\n` +
          `Categoria: ${input.category ?? "(sem categoria)"}\n` +
          `Parte ${input.chunkIndex + 1} de ${input.totalChunks}\n\nTRECHO:\n${input.text}`,
      },
    ],
  });
  const raw = completion.choices[0]?.message?.content ?? "";
  return parseExtractedTechniques(raw);
};
