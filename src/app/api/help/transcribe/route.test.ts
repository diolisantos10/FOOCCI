/**
 * O P0 de 05/08/2026: o lojista tentou pedir ajuda por voz e recebeu
 * **"Não consegui ler o áudio."** — sete palavras que não diziam o que fazer,
 * não deixavam rastro no log e vinham acompanhadas do sumiço da gravação.
 *
 * Estes testes prendem no lugar as três coisas que consertaram aquilo:
 *   • toda falha sai com um `code` e uma frase com o próximo passo;
 *   • tamanho e formato são barrados AQUI, no servidor (guardrail 4);
 *   • áudio cru que chega fora do multipart é resgatado em vez de recusado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import type { TranscriptionResult } from "@/services/brain/engines/TranscriptionAdapter";

const transcribeMock = vi.fn<[File], Promise<TranscriptionResult>>();

vi.mock("@/services/brain/engines/TranscriptionAdapter", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/services/brain/engines/TranscriptionAdapter")
  >();
  return { ...actual, transcribeAudioResult: (f: File) => transcribeMock(f) };
});

import { POST } from "./route";
import { isAcceptedAudioName, extensionOf } from "@/services/help/transcribeContract";

const SESSION = {
  "x-restaurant-id": "rest_1",
  "x-user-id": "user_1",
  "x-user-role": "OWNER",
};

function req(body: BodyInit, headers: Record<string, string> = SESSION) {
  return new NextRequest("https://foocci.com.br/api/help/transcribe", {
    method: "POST",
    body,
    headers,
  });
}

function audioForm(bytes: number, fileName = "pergunta.webm", type = "audio/webm") {
  const form = new FormData();
  form.append("audio", new Blob([new Uint8Array(bytes)], { type }), fileName);
  return form;
}

async function body(res: Response) {
  return (await res.json()) as { text?: string; error?: string; code?: string; retriable?: boolean };
}

describe("POST /api/help/transcribe", () => {
  beforeEach(() => {
    transcribeMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("transcreve o caminho normal", async () => {
    transcribeMock.mockResolvedValue({ ok: true, text: "como pauso os pedidos" });
    const res = await POST(req(audioForm(64)));
    expect(res.status).toBe(200);
    expect((await body(res)).text).toBe("como pauso os pedidos");
  });

  it("sem sessão avisa que expirou, e não culpa o áudio", async () => {
    const res = await POST(req(audioForm(64), {}));
    expect(res.status).toBe(401);
    const j = await body(res);
    expect(j.code).toBe("UNAUTHORIZED");
    expect(j.error).toMatch(/sessão expirou/i);
  });

  // ── O defeito do print ─────────────────────────────────────────────────────
  it("multipart que não abre: diz o próximo passo E pede para tentar de novo", async () => {
    const res = await POST(
      req("--corpo-cortado-no-meio", {
        ...SESSION,
        "content-type": "multipart/form-data; boundary=----quebrado",
      }),
    );
    expect(res.status).toBe(400);
    const j = await body(res);
    expect(j.code).toBe("BODY_UNREADABLE");
    expect(j.retriable).toBe(true);
    // A frase antiga não volta nunca mais: ela não ensinava nada.
    expect(j.error).not.toBe("Não consegui ler o áudio.");
    expect(j.error).toMatch(/tentar de novo/i);
    expect(j.error).toMatch(/não foi perdido/i);
  });

  it("áudio cru fora do multipart é resgatado, não recusado", async () => {
    transcribeMock.mockResolvedValue({ ok: true, text: "oi" });
    const res = await POST(
      req(new Uint8Array(128), { ...SESSION, "content-type": "audio/mp4" }),
    );
    expect(res.status).toBe(200);
    // E o nome derivado tem que ser um que o Whisper entenda.
    expect(transcribeMock.mock.calls[0]![0].name).toBe("ditado.m4a");
  });

  it("corpo que não é áudio nem multipart não vira erro de áudio", async () => {
    const res = await POST(req("oi", { ...SESSION, "content-type": "text/plain" }));
    expect((await body(res)).code).toBe("NO_AUDIO");
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  // ── As travas do servidor (guardrail 4) ────────────────────────────────────
  it("recusa arquivo grande demais sem gastar a chamada paga", async () => {
    const res = await POST(req(audioForm(26 * 1024 * 1024)));
    expect(res.status).toBe(413);
    expect((await body(res)).code).toBe("TOO_LARGE");
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("recusa extensão que o provedor não abre, antes de chamar o provedor", async () => {
    const res = await POST(req(audioForm(64, "gravacao.txt", "text/plain")));
    expect(res.status).toBe(415);
    expect((await body(res)).code).toBe("UNSUPPORTED_FORMAT");
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  it("gravação de 0 byte não vira chamada ao provedor", async () => {
    const res = await POST(req(audioForm(0)));
    expect((await body(res)).code).toBe("EMPTY_AUDIO");
    expect(transcribeMock).not.toHaveBeenCalled();
  });

  // ── Cada causa tem a SUA frase ─────────────────────────────────────────────
  it("falha nossa (chave) assume a culpa em vez de mandar o lojista falar mais alto", async () => {
    transcribeMock.mockResolvedValue({
      ok: false,
      code: "NOT_CONFIGURED",
      providerMessage: "OPENAI_API_KEY ausente no ambiente",
    });
    const res = await POST(req(audioForm(64)));
    expect(res.status).toBe(503);
    const j = await body(res);
    expect(j.code).toBe("NOT_CONFIGURED");
    expect(j.error).toMatch(/do nosso lado/i);
    expect(j.error).toMatch(/não é o seu aparelho/i);
    expect(j.retriable).toBe(false);
  });

  it("provedor instável é repetível; falta de fala não é a mesma coisa", async () => {
    transcribeMock.mockResolvedValue({ ok: false, code: "PROVIDER_DOWN", providerMessage: "502" });
    expect((await body(await POST(req(audioForm(64))))).retriable).toBe(true);

    transcribeMock.mockResolvedValue({ ok: false, code: "NO_SPEECH", providerMessage: "vazio" });
    const j = await body(await POST(req(audioForm(64))));
    expect(j.code).toBe("NO_SPEECH");
    expect(j.error).toMatch(/mais perto do microfone/i);
  });

  it("o log carrega a evidência da causa — e nunca o que a pessoa falou", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    transcribeMock.mockResolvedValue({
      ok: false,
      code: "UNSUPPORTED_FORMAT",
      providerMessage: "Invalid file format",
    });
    await POST(req(audioForm(999, "pergunta.webm")));
    const line = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(line).toContain("UNSUPPORTED_FORMAT");
    expect(line).toContain("rest_1");
    expect(line).toContain("999");
    expect(line).toContain("Invalid file format");
  });

  it("o sucesso registra o tamanho da resposta, não o texto dela", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    transcribeMock.mockResolvedValue({ ok: true, text: "meu segredo comercial" });
    await POST(req(audioForm(64)));
    const line = spy.mock.calls.map((c) => String(c[0])).join("\n");
    expect(line).toContain("chars");
    expect(line).not.toContain("segredo");
  });
});

describe("trava de formato", () => {
  it("aceita o que o Whisper abre e recusa o resto", () => {
    for (const n of ["a.webm", "a.m4a", "a.mp4", "a.ogg", "a.wav", "A.MP3"]) {
      expect(isAcceptedAudioName(n)).toBe(true);
    }
    for (const n of ["a.txt", "a.exe", "a", "a.pdf"]) {
      expect(isAcceptedAudioName(n)).toBe(false);
    }
    expect(extensionOf("gravacao.WEBM")).toBe("webm");
  });
});
