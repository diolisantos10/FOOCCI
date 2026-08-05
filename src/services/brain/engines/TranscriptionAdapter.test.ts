/**
 * A causa da falha de transcrição não pode morrer aqui dentro.
 * Até 05/08/2026 toda falha virava string vazia: chave errada e lojista falando
 * baixo eram indistinguíveis para quem chamava — e o log não dizia nada.
 */

import { describe, it, expect } from "vitest";
import { classifyTranscriptionError, transcribeAudioResult } from "./TranscriptionAdapter";

function apiError(status: number, message: string) {
  return Object.assign(new Error(message), { status });
}

describe("classifyTranscriptionError", () => {
  it("separa o que é nosso do que é do lojista", () => {
    expect(classifyTranscriptionError(apiError(401, "Incorrect API key provided")).code).toBe(
      "KEY_REJECTED",
    );
    expect(
      classifyTranscriptionError(apiError(400, "Invalid file format. Supported formats: ...")).code,
    ).toBe("UNSUPPORTED_FORMAT");
    expect(classifyTranscriptionError(apiError(429, "Rate limit reached")).code).toBe(
      "RATE_LIMITED",
    );
    expect(classifyTranscriptionError(apiError(503, "service unavailable")).code).toBe(
      "PROVIDER_DOWN",
    );
    expect(classifyTranscriptionError(new Error("fetch failed")).code).toBe("PROVIDER_DOWN");
    expect(classifyTranscriptionError(apiError(413, "Maximum content size limit exceeded")).code).toBe(
      "TOO_LARGE",
    );
    expect(classifyTranscriptionError(new Error("algo novo")).code).toBe("UNKNOWN");
  });

  it("guarda o recado cru do provedor — é a evidência do log", () => {
    const r = classifyTranscriptionError(apiError(400, "Invalid file format"));
    expect(r.providerMessage).toBe("Invalid file format");
  });
});

describe("transcribeAudioResult", () => {
  const original = process.env.OPENAI_API_KEY;
  const file = (bytes: number) => new File([new Uint8Array(bytes)], "a.webm", { type: "audio/webm" });

  it("chave ausente é NOSSA falha, e ela é dita com esse nome", async () => {
    delete process.env.OPENAI_API_KEY;
    const r = await transcribeAudioResult(file(10));
    expect(r).toMatchObject({ ok: false, code: "NOT_CONFIGURED" });
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  });

  it("não gasta chamada paga com arquivo vazio nem com arquivo grande demais", async () => {
    process.env.OPENAI_API_KEY = "sk-test";
    expect(await transcribeAudioResult(file(0))).toMatchObject({ code: "EMPTY_AUDIO" });
    expect(await transcribeAudioResult(file(26 * 1024 * 1024))).toMatchObject({ code: "TOO_LARGE" });
    if (original === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = original;
  });
});
