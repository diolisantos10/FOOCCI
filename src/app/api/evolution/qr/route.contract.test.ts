/**
 * The contract of GET /api/evolution/qr, written down so a screen can never again
 * guess it wrong.
 *
 * History: the panel in `integracoes/IntegrationsCenterClient.tsx` handled only
 * `base64` and treated EVERYTHING else as "connected". A pairing code — no image,
 * no error — printed "WhatsApp já está conectado!" to an owner who had connected
 * nothing. So did "still generating".
 *
 * These tests pin the shapes and, more importantly, pin the CLASSIFICATION: which
 * shapes mean connected (exactly one), which mean keep waiting, and which mean a
 * human still has to act. A screen that follows this table cannot lie.
 */

import { describe, it, expect } from "vitest";

/** Every shape the route can return, straight from its own header comment. */
const SHAPES = {
  qrImage:      { base64: "data:image/png;base64,AAA", code: "x" },
  pairingCode:  { pairingCode: "ABCD-EFGH", code: "x" },
  connected:    { base64: null, code: null, connected: true },
  generating:   { base64: null, code: null, generating: true },
  restarting:   { base64: null, code: null, restarting: true },
  notConfigured:{ base64: null, code: null, error: "not_configured" },
  notFound:     { base64: null, code: null, error: "instance_not_found" },
  shapeUnknown: { base64: null, code: null, error: "qr_shape_unknown", availableKeys: [] },
  evolutionErr: { base64: null, code: null, error: "evolution_error", status: 500 },
} as const;

type Shape = Record<string, unknown>;

/**
 * The classifier a panel must use. Mirrors WhatsAppQRPanel.fetchQR.
 * Note the absence of an `else → connected`: that was the bug.
 */
function classify(qr: Shape): "shown" | "pairing" | "connected" | "waiting" | "error" | "unknown" {
  if (qr.base64) return "shown";
  if (qr.pairingCode) return "pairing";
  if (qr.connected) return "connected";
  if (qr.generating || qr.restarting) return "waiting";
  if (qr.error) return qr.error === "not_configured" ? "error" : "unknown";
  return "unknown";
}

describe("contrato do GET /api/evolution/qr", () => {
  it("SOMENTE a flag explícita `connected` significa conectado", () => {
    const connected = Object.entries(SHAPES).filter(([, s]) => classify(s) === "connected");
    expect(connected.map(([k]) => k)).toEqual(["connected"]);
  });

  it("código de pareamento NUNCA é lido como conectado", () => {
    expect(classify(SHAPES.pairingCode)).toBe("pairing");
  });

  it("'ainda gerando' pede espera, não sucesso nem falha", () => {
    expect(classify(SHAPES.generating)).toBe("waiting");
    expect(classify(SHAPES.restarting)).toBe("waiting");
  });

  it("nenhum formato de erro vira conectado", () => {
    for (const key of ["notConfigured", "notFound", "shapeUnknown", "evolutionErr"] as const) {
      expect(classify(SHAPES[key])).not.toBe("connected");
    }
  });

  it("resposta vazia ou desconhecida cai em `unknown` — jamais em conectado", () => {
    expect(classify({})).toBe("unknown");
    expect(classify({ algoNovo: true })).toBe("unknown");
    expect(classify({ base64: null, code: null })).toBe("unknown");
  });

  it("um campo novo no futuro não pode ser interpretado como sucesso", () => {
    // Guardrail 1: ausência de informação não é informação.
    expect(classify({ campoQueAindaNaoExiste: "seja lá o que for" })).toBe("unknown");
  });
});
