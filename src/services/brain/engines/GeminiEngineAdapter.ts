/**
 * GeminiEngineAdapter — o piloto GEMINI do Brain.
 *
 * Implementado via REST (generativelanguage.googleapis.com) para não adicionar
 * SDK; só ativa quando GEMINI_API_KEY/GOOGLE_API_KEY existe. JSON nativo via
 * responseMimeType.
 */

import type { StructuredCallInput } from "./EngineAdapter";

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export async function callGemini(input: StructuredCallInput): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY ausente");

  const wantsJson = (input.responseFormat ?? "json") === "json";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(input.selection.model)}:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: input.userContent }] }],
      generationConfig: {
        temperature: input.temperature ?? 0.2,
        maxOutputTokens: input.maxTokens ?? 1024,
        ...(wantsJson ? { responseMimeType: "application/json" } : {}),
      },
    }),
  });
  if (!res.ok) throw new Error(`Engine GEMINI HTTP ${res.status}`);

  const data = (await res.json()) as GeminiResponse;
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error("Engine GEMINI sem conteúdo");
  return text;
}
