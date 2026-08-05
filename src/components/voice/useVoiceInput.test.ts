/**
 * O microfone só funciona se o arquivo chegar com o NOME certo: o Whisper
 * decide o formato pela extensão. O código antigo carimbava `.webm` em toda
 * gravação — e o Safari do iPhone grava MPEG-4. Todo ditado feito de iPhone
 * saía rotulado errado e voltava recusado pelo provedor.
 */

import { describe, it, expect } from "vitest";
import {
  appendTranscript,
  extensionForMime,
  fileNameForMime,
  pickRecordingMime,
  transcribeErrorMessage,
} from "./useVoiceInput";

describe("formato da gravação", () => {
  it("o iPhone grava MPEG-4 e o nome tem que acompanhar", () => {
    // Safari só aceita audio/mp4 — é o único candidato que ele suporta.
    const safari = (m: string) => m.startsWith("audio/mp4");
    expect(pickRecordingMime(safari)).toBe("audio/mp4;codecs=mp4a.40.2");
    expect(fileNameForMime("pergunta.webm", "audio/mp4")).toBe("pergunta.m4a");
  });

  it("no Chrome/Android segue webm/opus", () => {
    const chrome = (m: string) => m.startsWith("audio/webm") || m.startsWith("audio/ogg");
    expect(pickRecordingMime(chrome)).toBe("audio/webm;codecs=opus");
    expect(fileNameForMime("relato.webm", "audio/webm;codecs=opus")).toBe("relato.webm");
  });

  it("navegador que não grava nada dos formatos conhecidos devolve null", () => {
    expect(pickRecordingMime(() => false)).toBeNull();
  });

  it("todo mimeType conhecido vira extensão que o provedor aceita", () => {
    expect(extensionForMime("audio/ogg;codecs=opus")).toBe("ogg");
    expect(extensionForMime("audio/mpeg")).toBe("mp3");
    expect(extensionForMime("audio/x-m4a")).toBe("m4a");
    expect(extensionForMime("audio/wav")).toBe("wav");
    // Desconhecido cai em webm de propósito: é o que todo navegador não-Safari
    // grava, e o Safari sempre se identifica.
    expect(extensionForMime("")).toBe("webm");
  });
});

describe("a frase que o lojista lê", () => {
  it("o recado do servidor tem prioridade — ele conhece a causa", () => {
    expect(transcribeErrorMessage(503, "O ditado está fora do ar do nosso lado.")).toBe(
      "O ditado está fora do ar do nosso lado.",
    );
  });

  it("sem recado, ainda assim diz que a gravação está guardada", () => {
    const msg = transcribeErrorMessage(502);
    expect(msg).toMatch(/guardada/i);
    expect(msg).toMatch(/tentar de novo/i);
  });

  it("sessão expirada não é culpa do áudio", () => {
    expect(transcribeErrorMessage(401)).toMatch(/sessão expirou/i);
  });
});

describe("appendTranscript", () => {
  it("acrescenta em vez de substituir", () => {
    expect(appendTranscript("já escrevi", " e falei ")).toBe("já escrevi e falei");
    expect(appendTranscript("", "só a fala")).toBe("só a fala");
    expect(appendTranscript("intacto", "   ")).toBe("intacto");
  });
});
