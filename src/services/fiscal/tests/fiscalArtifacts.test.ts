import { describe, it, expect } from "vitest";
import { Prisma } from "@prisma/client";
import { renderDanfceBody } from "../fiscalArtifacts";
import type { FiscalDocument } from "@prisma/client";

const doc = () =>
  ({
    numero: 42,
    serie: 1,
    chave: "3".repeat(44),
    protocolo: "135240001",
    urlConsulta: "http://consulta/x",
    qrCodeData: null,
    valorTotal: new Prisma.Decimal(25),
    emitidaAt: new Date("2026-07-25T12:00:00Z"),
    createdAt: new Date("2026-07-25T12:00:00Z"),
  }) as unknown as FiscalDocument;

describe("renderDanfceBody", () => {
  it("renders the fiscal receipt with número, valor, chave, protocolo and a cut", () => {
    const body = renderDanfceBody(doc());
    expect(body).toContain("DOCUMENTO AUXILIAR DA NFC-e");
    expect(body).toContain("Numero: 42");
    expect(body).toContain("Valor total: R$ 25.00");
    expect(body).toContain("135240001");
    expect(body).toContain("http://consulta/x");
    // chave agrupada de 4 em 4
    expect(body).toContain("3333 3333");
    // termina com o corte ESC/POS
    expect(body.endsWith("\x1d\x56\x41\x00")).toBe(true);
  });
});
