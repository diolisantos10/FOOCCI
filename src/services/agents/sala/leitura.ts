/**
 * leitura — a metade da Sala que fala com o banco e com o ambiente.
 *
 * Aqui não se DECIDE nada sobre medida: só se busca, e toda busca devolve
 * `Amostra` — veio, ou não veio com motivo. Quem julga é `montagem.ts`, puro.
 */

import { prisma } from "@/lib/prisma";
import { getAdminAgentProfiles } from "../AgentProfileService";
import type { AdminAgentProfileView } from "../types";
import type { UsageRow } from "../../ai/pricing/costAggregation";
import type { ModelProvider } from "../../ai/pricing/modelPricing";
import { configuredProviders, selectEngine } from "../../brain/engines/AIEngineRouter";
import type { AIEngineProvider } from "../../brain/engines/AIEngineTypes";
import { naoVeio, veio, type Amostra } from "./amostra";
import { lerAgentesDeDesenvolvimento, raizDoProjeto } from "./leituraDeArquivos";
import { JANELA_DIAS, type InsumosDaSala, type MotorDeProduto } from "./montagem";

/** Nome do provedor no roteador → nome do provedor na tabela de preços. */
const PROVEDOR_EQUIVALENTE: Readonly<Record<AIEngineProvider, ModelProvider>> = {
  OPENAI: "OPENAI",
  CLAUDE: "ANTHROPIC",
  GEMINI: "GOOGLE",
  LOCAL: "INTERNAL",
  MOCK: "INTERNAL",
};

const NOME_DO_PROVEDOR: Readonly<Record<AIEngineProvider, string>> = {
  OPENAI: "OpenAI",
  CLAUDE: "Anthropic (Claude)",
  GEMINI: "Google (Gemini)",
  LOCAL: "Motor interno",
  MOCK: "Motor interno",
};

export async function lerPerfisDeProduto(): Promise<Amostra<readonly AdminAgentProfileView[]>> {
  try {
    const perfis = await getAdminAgentProfiles();
    if (perfis.length === 0) {
      return naoVeio("o registro de perfis de agente devolveu lista vazia");
    }
    return veio(perfis);
  } catch (erro) {
    return naoVeio(`o registro de perfis de agente falhou: ${(erro as Error).message}`);
  }
}

/**
 * Chamadas de IA da janela.
 *
 * Lê `AIInteractionLog` cru (modelo + tokens + agente) e NÃO usa a coluna
 * `estimatedCostUsd`: ela foi gravada por um fallback silencioso que cobrava
 * qualquer modelo desconhecido ao preço do gpt-4o. O custo é recalculado dos
 * tokens, que são fato medido.
 */
export async function lerUsoDeIA(
  agora: Date,
  janelaDias: number,
): Promise<Amostra<readonly UsageRow[]>> {
  const desde = new Date(agora.getTime() - janelaDias * 86_400_000);
  try {
    const linhas = await prisma.aIInteractionLog.findMany({
      where: { createdAt: { gte: desde } },
      select: { model: true, agentSlug: true, promptTokens: true, completionTokens: true },
    });
    return veio(linhas);
  } catch (erro) {
    return naoVeio(
      `o registro de chamadas de IA não pôde ser lido (${(erro as Error).message}) — ` +
        `sem ele nenhum custo desta tela é apurável`,
    );
  }
}

/** Provedores com chave configurada NESTE runtime. Não é teste de credencial viva. */
export function lerProvedoresLigados(env: NodeJS.ProcessEnv = process.env): ModelProvider[] {
  const ligados = configuredProviders(env).map((p) => PROVEDOR_EQUIVALENTE[p]);
  return [...new Set(ligados)];
}

/** Motor que o roteador do Brain resolve hoje para cada agente de produto. */
export function lerMotoresPorSlug(
  slugs: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
): Record<string, MotorDeProduto> {
  const mapa: Record<string, MotorDeProduto> = {};
  for (const slug of slugs) {
    const escolha = selectEngine(slug, { env });
    mapa[slug] = {
      provedor: NOME_DO_PROVEDOR[escolha.provider] ?? escolha.provider,
      modelo: escolha.model,
    };
  }
  return mapa;
}

export interface OpcoesDaSala {
  readonly agora?: Date;
  readonly janelaDias?: number;
  readonly raiz?: string;
  readonly env?: NodeJS.ProcessEnv;
}

export async function lerInsumosDaSala(opts: OpcoesDaSala = {}): Promise<InsumosDaSala> {
  const agora = opts.agora ?? new Date();
  const janelaDias = opts.janelaDias ?? JANELA_DIAS;
  const env = opts.env ?? process.env;
  const raiz = opts.raiz ?? raizDoProjeto(env);

  const [perfisDeProduto, usoDeIA] = await Promise.all([
    lerPerfisDeProduto(),
    lerUsoDeIA(agora, janelaDias),
  ]);

  const slugs = perfisDeProduto.ok ? perfisDeProduto.dados.map((p) => p.slug) : [];

  return {
    agora,
    janelaDias,
    perfisDeProduto,
    motoresPorSlug: lerMotoresPorSlug(slugs, env),
    arquivosDeDesenvolvimento: lerAgentesDeDesenvolvimento(raiz),
    usoDeIA,
    provedoresLigados: lerProvedoresLigados(env),
  };
}
