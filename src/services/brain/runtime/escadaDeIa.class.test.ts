/**
 * TESTE DE CLASSE da escada de liberação de IA — não é o teste do Garçom.
 *
 * A pergunta que este arquivo responde não é "o Garçom está travado?", e sim:
 * "É POSSÍVEL alguém pôr um agente no degrau alto sem portão verde?"
 *
 * Dois dentes:
 *
 *  1. VARREDURA DO SCHEMA — toda tabela que guarda um degrau de escada (um campo
 *     `mode`/`scope` cujo bloco fala em SHADOW_ONLY / RESTAURANT_WIDE /
 *     LIBRARY_ASSISTED / TEST_ACCOUNT_ONLY) TEM que estar declarada aqui. Criar a
 *     escada do próximo agente sem passar por este arquivo quebra o build.
 *
 *  2. MATRIZ DE COMPORTAMENTO — para cada escada declarada, o ponto REAL de
 *     leitura do degrau é chamado com o degrau ALTO gravado no banco e o portão
 *     em cada estado de falha (vermelho, vencido, ausente, ilegível, fora do ar).
 *     Em nenhum deles o degrau alto pode sobreviver.
 *
 *  3. PROPRIEDADE DO AGENTE NOVO — um agente que ninguém auditou ainda não tem
 *     veredito. Sem veredito, degrau seguro. É por isso que o próximo agente
 *     nasce travado mesmo que ninguém se lembre desta trava.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ── banco de mentira, compartilhado por todas as escadas ─────────────────────
const db = vi.hoisted(() => ({
  waiterRuntimeVersion: { findFirst: vi.fn() },
  waiterRuntimeVersionTechnique: { findMany: vi.fn() },
  brainFreeFormConfig: { findUnique: vi.fn() },
  crmAgentPilotConfig: { findUnique: vi.fn() },
  whatsAppTextOrderingConfig: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: db }));

// O veredito de qualidade é a ÚNICA coisa que muda entre os casos.
const store = vi.hoisted(() => ({ getLatestAgentVerdictRow: vi.fn() }));
vi.mock("@/services/quality/persistence/QualityAuditStore", () => ({
  getLatestAgentVerdictRow: store.getLatestAgentVerdictRow,
}));

import { __clearVerdictCache, VERDICT_MAX_AGE_HOURS } from "./LiveStageGuard";
import { getWaiterRuntimeKnowledge } from "@/services/waiterRuntime/WaiterLibraryRuntimeBridge";
import { resolveFreeFormAccess } from "./BrainFreeFormConfigService";
import { resolveLiveCrmPilotMode, type CrmPilotConfig } from "@/services/crm/CrmAgentPilotService";
import { resolveWaConfig } from "@/services/whatsapp/ordering/WhatsAppTextOrderingConfigService";

const TEL = "5511999998888";
const REST = "rest_1";
const hAtras = (h: number) => new Date(Date.now() - h * 3_600_000);
const achado = (severity = "P2", status = "PASS") => ({ severity, status });

/** Estados do portão em que o degrau alto NÃO pode sobreviver. */
const PORTAO_FECHADO: [string, () => unknown][] = [
  ["sem veredito nenhum", () => null],
  ["run sem achado do agente (não estourou ≠ verde)", () => ({ runId: "r", finishedAt: hAtras(1), findings: [] })],
  ["portão VERMELHO (P0 aberto)", () => ({ runId: "r", finishedAt: hAtras(1), findings: [achado("P0", "FAIL")] })],
  ["veredito VENCIDO", () => ({ runId: "r", finishedAt: hAtras(VERDICT_MAX_AGE_HOURS + 1), findings: [achado()] })],
  ["veredito ilegível (data inválida)", () => ({ runId: "r", finishedAt: new Date("x"), findings: [achado()] })],
  ["serviço de qualidade fora do ar", () => { throw new Error("db down"); }],
];

const VERDE = () => ({ runId: "run_ok", finishedAt: hAtras(1), findings: [achado()] });

function darVeredito(fn: () => unknown) {
  store.getLatestAgentVerdictRow.mockImplementation(async () => fn());
}

// ─────────────────────────────────────────────────────────────────────────────
//  As escadas DECLARADAS. Toda escada do schema tem que aparecer aqui.
// ─────────────────────────────────────────────────────────────────────────────

interface EscadaDeclarada {
  /** Model do prisma/schema.prisma que guarda o degrau. */
  model: string;
  /** Nome humano. */
  nome: string;
  /** Grava o degrau ALTO no banco de mentira. */
  subirAoDegrauAlto: () => void;
  /** Chama o ponto REAL de leitura. true = o degrau alto sobreviveu. */
  degrauAltoValeAgora: () => Promise<boolean>;
}

const crmConfigAlto: CrmPilotConfig = {
  restaurantId: REST, mode: "RESTAURANT_WIDE", paused: false, minConfidence: 0.6,
  abTestPercent: 100, allowlistedPhones: [], notes: null,
};

const ESCADAS: EscadaDeclarada[] = [
  {
    model: "WaiterRuntimeVersion",
    nome: "Garçom — runtime assistido pela Biblioteca (o degrau do Sushi Cazza)",
    subirAoDegrauAlto: () => {
      db.waiterRuntimeVersion.findFirst.mockResolvedValue({
        id: "v1", agentSlug: "waiter", restaurantId: null, isActive: true, status: "ACTIVE",
        mode: "LIBRARY_ASSISTED", libraryEnabled: true, maxTechniques: 6, activatedAt: new Date(),
      });
      db.waiterRuntimeVersionTechnique.findMany.mockResolvedValue([
        {
          priority: 1,
          technique: {
            id: "t1", techniqueName: "Sugestão ancorada", category: "Vendas",
            application: "Depois do prato principal, sugira uma bebida que combine e diga o porquê.",
            usageRule: "No máximo uma sugestão por conversa.", qualityTest: "A bebida combina?",
            status: "ACTIVE", runtimeEnabled: true, runtimePriority: 1,
          },
        },
      ]);
    },
    degrauAltoValeAgora: async () => (await getWaiterRuntimeKnowledge({ restaurantId: REST, agentSlug: "waiter" })).enabled,
  },
  {
    model: "BrainFreeFormConfig",
    nome: "Recepcionista — raciocínio livre do Brain",
    subirAoDegrauAlto: () => {
      db.brainFreeFormConfig.findUnique.mockResolvedValue({
        restaurantId: REST, mode: "RESTAURANT_WIDE", allowlistedPhones: [], paused: false, minConfidence: 0.6, notes: null,
      });
    },
    degrauAltoValeAgora: async () => (await resolveFreeFormAccess(REST, TEL)).allowed,
  },
  {
    model: "CrmAgentPilotConfig",
    nome: "Agente de CRM — piloto de mensagem composta por IA",
    subirAoDegrauAlto: () => {
      db.crmAgentPilotConfig.findUnique.mockResolvedValue({ ...crmConfigAlto, allowlistedPhones: [] });
    },
    degrauAltoValeAgora: async () => (await resolveLiveCrmPilotMode(crmConfigAlto)).mode !== "SHADOW_ONLY",
  },
  {
    model: "WhatsAppTextOrderingConfig",
    nome: "Pedido por Texto — escopo aberto ao restaurante inteiro",
    subirAoDegrauAlto: () => {
      db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue({
        restaurantId: REST, enabled: true, mode: "ALLOWLIST_FULL_TEST", scope: "RESTAURANT_WIDE",
        allowlistedPhones: [], paused: false, notes: null, updatedAt: new Date(),
      });
    },
    degrauAltoValeAgora: async () => (await resolveWaConfig(REST)).scope === "RESTAURANT_WIDE",
  },
];

/**
 * Escada declarada MAS ainda sem IA no degrau alto — exceção estreita, com
 * armadilha. O Instagram tem `scope=RESTAURANT_WIDE`, mas nada de IA responde por
 * lá: o modo FULL está reservado e marcado como NÃO usado. No dia em que alguém
 * ligar IA nesse canal vai ter que mexer nessa marca — e o teste abaixo cai,
 * forçando a escada a entrar na trava antes de falar com cliente.
 */
const SEM_IA_NO_DEGRAU_ALTO: Record<string, string> = {
  InstagramChannelConfig: "NOT used in v1",
};

// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA = readFileSync(join(process.cwd(), "prisma/schema.prisma"), "utf8");

/** Modelos que guardam um degrau de escada: campo mode/scope + vocabulário de degrau. */
function escadasNoSchema(): string[] {
  const out: string[] = [];
  const modelo = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  for (const m of SCHEMA.matchAll(modelo)) {
    const [, nome, corpo] = m;
    const falaDeDegrau = /SHADOW_ONLY|RESTAURANT_WIDE|LIBRARY_ASSISTED|TEST_ACCOUNT_ONLY|WaiterRuntimeMode/.test(corpo);
    const temCampoDeDegrau = /^\s{2}(mode|scope)\s+\S+/m.test(corpo);
    if (falaDeDegrau && temCampoDeDegrau) out.push(nome);
  }
  return out;
}

beforeEach(() => {
  vi.clearAllMocks();
  __clearVerdictCache();
  db.waiterRuntimeVersion.findFirst.mockResolvedValue(null);
  db.waiterRuntimeVersionTechnique.findMany.mockResolvedValue([]);
  db.brainFreeFormConfig.findUnique.mockResolvedValue(null);
  db.crmAgentPilotConfig.findUnique.mockResolvedValue(null);
  db.whatsAppTextOrderingConfig.findUnique.mockResolvedValue(null);
});

describe("dente 1 — nenhuma escada escapa da declaração", () => {
  it("toda escada do schema está declarada (guardada ou exceção justificada)", () => {
    const declaradas = new Set([...ESCADAS.map((e) => e.model), ...Object.keys(SEM_IA_NO_DEGRAU_ALTO)]);
    const orfas = escadasNoSchema().filter((m) => !declaradas.has(m));
    expect(
      orfas,
      `Escada de liberação NOVA sem trava: ${orfas.join(", ")}.\n` +
        "Toda tabela que guarda degrau precisa entrar em ESCADAS (com a leitura real do degrau)\n" +
        "ou, se não houver IA no degrau alto, em SEM_IA_NO_DEGRAU_ALTO com a marca que prova isso.",
    ).toEqual([]);
  });

  it("as exceções ainda são exceções (a marca que as justifica continua no schema)", () => {
    for (const [modelo, marca] of Object.entries(SEM_IA_NO_DEGRAU_ALTO)) {
      const bloco = SCHEMA.match(new RegExp(`model\\s+${modelo}\\s*\\{[\\s\\S]*?^\\}`, "m"))?.[0] ?? "";
      const contexto = SCHEMA.slice(Math.max(0, SCHEMA.indexOf(`model ${modelo}`) - 1200), SCHEMA.indexOf(`model ${modelo}`)) + bloco;
      expect(contexto, `${modelo} perdeu a marca "${marca}" — se ganhou IA no degrau alto, ele precisa entrar na trava.`).toContain(marca);
    }
  });
});

describe("dente 2 — com o portão fechado, nenhum degrau alto sobrevive", () => {
  for (const escada of ESCADAS) {
    describe(escada.nome, () => {
      it("portão VERDE: o degrau alto vale (senão o teste seria um carimbo)", async () => {
        darVeredito(VERDE);
        escada.subirAoDegrauAlto();
        expect(await escada.degrauAltoValeAgora()).toBe(true);
      });

      it.each(PORTAO_FECHADO)("%s ⇒ cai para o degrau seguro", async (_nome, veredito) => {
        darVeredito(veredito);
        escada.subirAoDegrauAlto();
        expect(await escada.degrauAltoValeAgora()).toBe(false);
      });
    });
  }
});

describe("dente 3 — o agente que ainda não existe já nasce travado", () => {
  it("agente novo no degrau alto, sem auditoria nenhuma, NÃO fala solto", async () => {
    // O banco de veredito é real aqui: para um agentSlug que ninguém auditou,
    // não existe linha — e é assim que o próximo agente nasce seguro.
    store.getLatestAgentVerdictRow.mockImplementation(async (agentId: string) =>
      agentId === "waiter" ? VERDE() : null,
    );
    db.waiterRuntimeVersion.findFirst.mockResolvedValue({
      id: "v9", agentSlug: "sommelier", restaurantId: null, isActive: true, status: "ACTIVE",
      mode: "LIBRARY_ASSISTED", libraryEnabled: true, maxTechniques: 6, activatedAt: new Date(),
    });
    db.waiterRuntimeVersionTechnique.findMany.mockResolvedValue([
      {
        priority: 1,
        technique: {
          id: "t1", techniqueName: "Harmonização", category: "Vendas",
          application: "Sugira o vinho que combina com o prato escolhido, dizendo o porquê.",
          usageRule: "No máximo uma sugestão.", status: "ACTIVE", runtimeEnabled: true, runtimePriority: 1,
        },
      },
    ]);

    const novo = await getWaiterRuntimeKnowledge({ restaurantId: REST, agentSlug: "sommelier" });
    expect(novo.enabled).toBe(false);
    expect(novo.mode).toBe("CURRENT");
  });
});

describe("dente 4 — cair de degrau NÃO é calar o agente", () => {
  it("Garçom derrubado continua com runtime CURRENT (atende, só sem a Biblioteca)", async () => {
    darVeredito(() => ({ runId: "r", finishedAt: hAtras(1), findings: [achado("P0", "FAIL")] }));
    ESCADAS[0].subirAoDegrauAlto();
    const k = await getWaiterRuntimeKnowledge({ restaurantId: REST, agentSlug: "waiter" });
    expect(k.mode).toBe("CURRENT"); // o runtime que já atende hoje
    expect(k.warnings.join(" ")).toContain("QUEDA AUTOMÁTICA");
  });

  it("Pedido por Texto derrubado volta para PHONE_ALLOWLIST — não desliga", async () => {
    darVeredito(() => null);
    ESCADAS[3].subirAoDegrauAlto();
    const cfg = await resolveWaConfig(REST);
    expect(cfg.scope).toBe("PHONE_ALLOWLIST");
    expect(cfg.enabled).toBe(true); // continua ligado; só a régua apertou
  });

  it("recepcionista derrubado volta a SHADOW — o determinístico segue respondendo", async () => {
    darVeredito(() => null);
    ESCADAS[1].subirAoDegrauAlto();
    const acesso = await resolveFreeFormAccess(REST, TEL);
    expect(acesso.allowed).toBe(false);
    expect(acesso.mode).toBe("SHADOW_ONLY");
  });
});
