/**
 * ⭐ A PROVA DE PONTA A PONTA DO WEBHOOK DE LEADS DA META.
 *
 * ── A PERGUNTA OBRIGATÓRIA: o teste alcança o código que responde ao cliente?
 *
 * Alcança. Aqui rodam de verdade: o `POST` da rota, a validação da assinatura
 * `X-Hub-Signature-256` (o mesmo `validateMetaSignature` do WhatsApp), a
 * leitura do envelope, a montagem do payload a partir da resposta da Graph e a
 * porta única `importarMetaLead`. Os duplos param exatamente onde o teste
 * viraria escrita em base real: o banco e o `SiteLeadService`. A Graph é
 * dublada porque é rede de terceiro — o que ela devolve é o payload REAL de um
 * `field_data`.
 *
 * ── O QUE ELE SEGURA ────────────────────────────────────────────────────────
 *  1. Assinatura inválida (e ausência de segredo) → 401, e NADA é importado.
 *  2. Evento `leadgen` válido → o lead nasce PELA PORTA ÚNICA.
 *  3. Reentrega do mesmo `leadgen_id` → nenhum segundo lead, nenhuma segunda
 *     ida à Graph. É o defeito que duplicaria a abordagem na pessoa.
 *  4. Graph falhando → o `leadgen_id` fica gravado como PENDENTE, nunca some.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "crypto";
import { NextRequest } from "next/server";

const SEGREDO = "app-secret-de-teste";

const creds = vi.hoisted(() => ({ appSecret: "app-secret-de-teste" as string | undefined, webhookVerifyToken: "token-de-verificacao" }));
vi.mock("@/services/meta/MetaAppCredentialsService", () => ({
  MetaAppCredentialsService: { getResolved: async () => creds },
}));

/** Banco de mentira, com só o que estas quatro provas encostam. */
const db = vi.hoisted(() => {
  const pendentes = new Map<string, Record<string, unknown>>();
  const leads: Array<Record<string, unknown>> = [];
  return {
    pendentes,
    leads,
    metaLeadPendente: {
      findUnique: vi.fn(async ({ where }: { where: { leadgenId: string } }) => pendentes.get(where.leadgenId) ?? null),
      upsert: vi.fn(async ({ where, create, update }: { where: { leadgenId: string }; create: Record<string, unknown>; update: Record<string, unknown> }) => {
        const atual = pendentes.get(where.leadgenId);
        const incrementos = update.tentativas ? { tentativas: Number(atual?.tentativas ?? 0) + 1 } : {};
        const novo = atual
          ? { ...atual, ...update, ...incrementos }
          : { resolvidoEm: null, leadId: null, ...create };
        pendentes.set(where.leadgenId, novo);
        return novo;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { leadgenId: string }; data: Record<string, unknown> }) => {
        const atual = pendentes.get(where.leadgenId);
        if (atual) pendentes.set(where.leadgenId, { ...atual, ...data });
        return { count: atual ? 1 : 0 };
      }),
      findMany: vi.fn(async () => []),
    },
    siteLead: {
      findFirst: vi.fn(async ({ where }: { where: { clickId?: string } }) =>
        leads.find((l) => l.clickId === where.clickId) ?? null),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => leads.find((l) => l.id === where.id) ?? null),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async () => ({ count: 0 })),
    },
    siteLeadInteraction: { findFirst: vi.fn(async () => null), create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
});
vi.mock("@/lib/prisma", () => ({ prisma: db }));

const capture = vi.hoisted(() => vi.fn());
vi.mock("@/services/site/SiteLeadService", () => ({ SiteLeadService: { capture } }));
vi.mock("@/services/salaDeVendas/jornadaComercial", () => ({
  AUTORIA_SISTEMA: { autor: "SISTEMA", label: "sistema" },
  promoverFrioParaLead: vi.fn(async () => ({ promoveu: false })),
}));

import { POST, GET } from "./route";

const LEADGEN_ID = "1780749103267171";

/** O que a Graph devolve para `/{leadgen_id}` — formato real. */
const RESPOSTA_DA_GRAPH = {
  id: LEADGEN_ID,
  created_time: "2026-09-19T06:09:13-05:00",
  ad_id: "120246577609590088",
  ad_name: "A02 | Estático |",
  campaign_name: "Leads | Restaurantes",
  form_id: "998877",
  platform: "fb",
  field_data: [
    { name: "full_name", values: ["José Felix"] },
    { name: "phone_number", values: ["+5511913410821"] },
    { name: "email", values: ["jose@exemplo.com.br"] },
  ],
};

function envelope(leadgenId = LEADGEN_ID): string {
  return JSON.stringify({
    object: "page",
    entry: [{
      id: "PAGINA",
      time: 1758000000,
      changes: [{ field: "leadgen", value: { leadgen_id: leadgenId, page_id: "PAGINA", form_id: "998877", created_time: 1758000000 } }],
    }],
  });
}

function requisicao(corpo: string, assinatura?: string): NextRequest {
  return new NextRequest("https://foocci.com.br/api/webhooks/meta/leads", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(assinatura ? { "x-hub-signature-256": assinatura } : {}),
    },
    body: corpo,
  });
}

function assinar(corpo: string, segredo = SEGREDO): string {
  return `sha256=${createHmac("sha256", segredo).update(corpo, "utf8").digest("hex")}`;
}

let chamadasNaGraph = 0;

beforeEach(() => {
  vi.clearAllMocks();
  db.pendentes.clear();
  db.leads.length = 0;
  creds.appSecret = SEGREDO;
  chamadasNaGraph = 0;
  process.env.META_LEADS_PAGE_ACCESS_TOKEN = "token-de-pagina-de-teste";

  capture.mockImplementation(async (entrada: { clickId: string }) => {
    const existente = db.leads.find((l) => l.clickId === entrada.clickId);
    if (existente) return { id: existente.id, codigo: existente.codigo, duplicado: true };
    const lead = { id: `lead-${db.leads.length + 1}`, codigo: `C-${db.leads.length + 1}`, clickId: entrada.clickId, stage: "NOVO", fonte: "CAMPANHA_PAGA", email: null };
    db.leads.push(lead);
    return { id: lead.id, codigo: lead.codigo, duplicado: false };
  });

  vi.stubGlobal("fetch", vi.fn(async () => {
    chamadasNaGraph += 1;
    return new Response(JSON.stringify(RESPOSTA_DA_GRAPH), { status: 200 });
  }));
});

describe("webhook de leads da Meta", () => {
  it("GET devolve o hub.challenge quando o verify token bate", async () => {
    const url = new URL("https://foocci.com.br/api/webhooks/meta/leads");
    url.searchParams.set("hub.mode", "subscribe");
    url.searchParams.set("hub.verify_token", "token-de-verificacao");
    url.searchParams.set("hub.challenge", "DESAFIO_1");
    const res = await GET(new NextRequest(url));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("DESAFIO_1");
  });

  it("1 — assinatura inválida é recusada com 401 e nenhum lead nasce", async () => {
    const corpo = envelope();
    const res = await POST(requisicao(corpo, assinar(corpo, "segredo-errado")));
    expect(res.status).toBe(401);
    expect(capture).not.toHaveBeenCalled();
    expect(chamadasNaGraph).toBe(0);
  });

  it("1 — sem assinatura nenhuma, também 401 (fail-closed)", async () => {
    const corpo = envelope();
    const res = await POST(requisicao(corpo));
    expect(res.status).toBe(401);
    expect(capture).not.toHaveBeenCalled();
  });

  it("1 — sem META_APP_SECRET configurado a rota recusa, nunca passa livre", async () => {
    creds.appSecret = undefined;
    const corpo = envelope();
    const res = await POST(requisicao(corpo, assinar(corpo)));
    expect(res.status).toBe(401);
    expect(capture).not.toHaveBeenCalled();
  });

  it("2 — evento válido cria o lead pela porta única", async () => {
    const corpo = envelope();
    const res = await POST(requisicao(corpo, assinar(corpo)));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, leads: 1, criados: 1, pendentes: 0 });

    // Nasceu pela porta única: quem escreveu foi `importarMetaLead`, com o
    // marcador de idempotência e a fonte que a recepção enxerga.
    expect(capture).toHaveBeenCalledTimes(1);
    const entrada = capture.mock.calls[0][0] as { nome: string; whatsapp: string; clickId: string };
    expect(entrada.nome).toBe("José Felix");
    expect(entrada.whatsapp).toContain("913410821");
    expect(entrada.clickId).toBe(`meta-lead:${LEADGEN_ID}`);
    expect(db.leads).toHaveLength(1);
  });

  it("3 — a reentrega do mesmo leadgen_id não cria um segundo lead nem consulta a Graph de novo", async () => {
    const corpo = envelope();
    await POST(requisicao(corpo, assinar(corpo)));
    expect(chamadasNaGraph).toBe(1);

    const segunda = await POST(requisicao(corpo, assinar(corpo)));
    expect(segunda.status).toBe(200);
    expect(await segunda.json()).toMatchObject({ criados: 0, pendentes: 0 });
    expect(db.leads).toHaveLength(1);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(chamadasNaGraph).toBe(1); // o pendente resolvido barrou a segunda ida
  });

  it("4 — Graph fora do ar: o leadgen_id fica gravado como pendente, o lead não some", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{\"error\":{\"message\":\"oops\"}}", { status: 500 })));
    const corpo = envelope();
    const res = await POST(requisicao(corpo, assinar(corpo)));

    expect(res.status).toBe(200); // a Meta não pode ser feita esperar
    expect(await res.json()).toMatchObject({ pendentes: 1, criados: 0 });
    const pendente = db.pendentes.get(LEADGEN_ID) as { resolvidoEm: unknown; ultimoErro: string };
    expect(pendente).toBeTruthy();
    expect(pendente.resolvidoEm).toBeNull();
    expect(pendente.ultimoErro).toContain("500");
    expect(db.leads).toHaveLength(0);
  });

  it("4 — sem token de Página o lead também vira pendente, com o nome da variável no motivo", async () => {
    delete process.env.META_LEADS_PAGE_ACCESS_TOKEN;
    const corpo = envelope();
    await POST(requisicao(corpo, assinar(corpo)));
    const pendente = db.pendentes.get(LEADGEN_ID) as { ultimoErro: string };
    expect(pendente.ultimoErro).toContain("META_LEADS_PAGE_ACCESS_TOKEN");
    expect(db.leads).toHaveLength(0);
  });
});
