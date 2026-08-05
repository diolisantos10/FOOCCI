/**
 * A trava do anexo mora no SERVIDOR (guardrail 4). `<input accept="image/*">` e
 * o `file.type` que o navegador manda são conveniência — quem sobe um arquivo
 * por `curl` passa por cima dos dois. Quem decide aqui é o conteúdo.
 */

import { describe, it, expect } from "vitest";
import {
  sniffKind,
  sanitizeFileName,
  kindOfMime,
  attachmentDTO,
  tooLargeMessage,
  ATTACHMENT_MAX_BYTES,
} from "./HelpAttachmentService";

/** Monta um cabeçalho de arquivo a partir de bytes e/ou texto ASCII. */
function head(...parts: (number[] | string)[]): Uint8Array {
  const out: number[] = [];
  for (const p of parts) {
    if (typeof p === "string") out.push(...Array.from(p).map((c) => c.charCodeAt(0)));
    else out.push(...p);
  }
  while (out.length < 32) out.push(0);
  return new Uint8Array(out);
}

describe("sniffKind — o tipo é o dos BYTES, não o que o navegador declarou", () => {
  it("reconhece os prints e fotos que o lojista realmente manda", () => {
    expect(sniffKind(head([0xff, 0xd8, 0xff, 0xe0]))?.mimeType).toBe("image/jpeg");
    expect(sniffKind(head([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))?.mimeType).toBe(
      "image/png",
    );
    expect(sniffKind(head("RIFF", [0, 0, 0, 0], "WEBP"))?.mimeType).toBe("image/webp");
    expect(sniffKind(head("GIF89a"))?.kind).toBe("IMAGE");
  });

  it("a foto de iPhone (HEIC) é aceita — é o print mais comum que existe", () => {
    const heic = sniffKind(head([0, 0, 0, 0x18], "ftyp", "heic"));
    expect(heic).toMatchObject({ kind: "IMAGE", ext: "heic" });
  });

  it("distingue o MPEG-4 de ÁUDIO do HEIC, que compartilham o mesmo `ftyp`", () => {
    expect(sniffKind(head([0, 0, 0, 0x18], "ftyp", "M4A "))).toMatchObject({
      kind: "AUDIO",
      ext: "m4a",
    });
  });

  it("aceita PDF — 'a nota saiu errada' é um PDF", () => {
    expect(sniffKind(head("%PDF-1.7"))).toMatchObject({ kind: "PDF", ext: "pdf" });
  });

  it("aceita o áudio que não virou texto, para um humano ouvir", () => {
    expect(sniffKind(head([0x1a, 0x45, 0xdf, 0xa3]))?.kind).toBe("AUDIO");
    expect(sniffKind(head("OggS"))?.kind).toBe("AUDIO");
    expect(sniffKind(head("RIFF", [0, 0, 0, 0], "WAVE"))?.kind).toBe("AUDIO");
  });

  it("RECUSA o executável disfarçado de imagem — a razão de a trava existir", () => {
    // ELF (Linux) e MZ (Windows) com nome/`Content-Type` de PNG passariam por
    // qualquer validação que confiasse no navegador.
    expect(sniffKind(head([0x7f], "ELF"))).toBeNull();
    expect(sniffKind(head("MZ", [0x90, 0x00]))).toBeNull();
    // Script e HTML também não entram.
    expect(sniffKind(head("<!DOCTYPE html>"))).toBeNull();
    expect(sniffKind(head("#!/bin/sh"))).toBeNull();
    // Zip/Office: não é print nem PDF.
    expect(sniffKind(head([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });

  it("arquivo curto demais para ter assinatura não é adivinhado", () => {
    expect(sniffKind(new Uint8Array([0xff]))).toBeNull();
  });
});

describe("sanitizeFileName — o nome vem de fora", () => {
  it("descarta caminho e travessia de diretório", () => {
    expect(sanitizeFileName("../../etc/passwd", "png")).toBe("passwd.png");
    expect(sanitizeFileName("C:\\Users\\dono\\print.png", "png")).toBe("print.png");
  });

  it("mantém a extensão que os BYTES provaram, não a que veio no nome", () => {
    expect(sanitizeFileName("virus.exe", "png")).toBe("virus.png");
  });

  it("aceita acento e espaço (é nome de gente), corta o resto", () => {
    expect(sanitizeFileName("Captura de tela — ação.png", "png")).toBe(
      "Captura de tela  ação.png",
    );
    expect(sanitizeFileName('as"pas<>|?.png', "png")).toBe("aspas.png");
  });

  it("nome vazio ainda vira um nome", () => {
    expect(sanitizeFileName("", "pdf")).toBe("anexo.pdf");
    expect(sanitizeFileName("...", "pdf")).toBe("anexo.pdf");
  });

  it("nome quilométrico é cortado", () => {
    expect(sanitizeFileName("a".repeat(500), "png").length).toBeLessThanOrEqual(64);
  });
});

describe("o que o lojista lê e para onde o arquivo aponta", () => {
  it("o limite é dito em MB, com a saída junto", () => {
    expect(tooLargeMessage("IMAGE")).toContain(
      `${Math.round(ATTACHMENT_MAX_BYTES.IMAGE / 1048576)} MB`,
    );
    expect(tooLargeMessage("PDF")).toMatch(/PDF/);
  });

  it("a URL do anexo é a rota autenticada — nunca um caminho público", () => {
    const dto = attachmentDTO({
      id: "att_1",
      fileName: "print.png",
      mimeType: "image/png",
      bytes: 1024,
      createdAt: new Date("2026-08-05T19:47:00Z"),
    });
    expect(dto.url).toBe("/api/help/attachments/att_1");
    // O acervo público de fotos de cardápio mora em /api/media — e ele não pede
    // sessão nenhuma. Anexo de suporte não pode encostar ali.
    expect(dto.url).not.toContain("/api/media");
    expect(dto.kind).toBe("IMAGE");
  });

  it("classifica o tipo para a tela decidir como mostrar", () => {
    expect(kindOfMime("image/heic")).toBe("IMAGE");
    expect(kindOfMime("audio/webm")).toBe("AUDIO");
    expect(kindOfMime("application/pdf")).toBe("PDF");
  });
});
