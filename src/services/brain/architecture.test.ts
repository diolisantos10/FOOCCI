/**
 * Teste arquitetural — o dente #2 da Regra de Ouro do Brain (docs/brain-golden-rule.md).
 *
 * Lei 1: todo agente raciocina ATRAVÉS do Brain. Ninguém fala com a IA-piloto
 * por fora do motor (src/services/brain/engines). Os arquivos abaixo nasceram
 * ANTES da lei e estão CONGELADOS como exceção: a lista só pode diminuir
 * (migração via AIEngineRouter — Fase 4 do roadmap), nunca crescer.
 *
 * Se este teste quebrou no seu PR: não importe `openai`/`@/lib/openai` —
 * use selectEngine() + callStructuredJson() do Brain.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const SRC_ROOT = join(__dirname, "..", ".."); // src/

/** Onde falar com o piloto é PERMITIDO (o próprio motor). */
const ALLOWED = new Set<string>([
  "lib/openai.ts",
  "services/brain/engines/OpenAIEngineAdapter.ts",
  // Transcrição (voz→texto, Whisper) é um adapter de engine legítimo: não é chat,
  // não passa pelo dispatcher callStructuredJson (que só faz system+user texto).
  "services/brain/engines/TranscriptionAdapter.ts",
]);

/** Dívida pré-lei, CONGELADA. Remover itens = progresso; adicionar = proibido.
 *  Já migrados para o AIEngineRouter (Fase 4): WaiterReasoningLLMService,
 *  MessageVariationService, AnalyticsAgentService, FaqMiner, AgentLibraryService,
 *  realChunkExtractor, AgentTrainingEvaluatorService, AgentTrainingImprovementService. */
const FROZEN_EXCEPTIONS = new Set<string>([
  "services/ai/AIOrderService.ts",
  "services/ai/AISimulatorService.ts",
  "services/ai/AITools.ts",
  "services/ai/ChatSimService.ts",
  "services/ai/PromptBuilderService.ts",
  "services/ai/WhatsAppReceptionistService.ts",
  // Exceção consciente (não é dívida de raciocínio): embeddings não passam pelo chat dispatcher
  "services/brain/knowledge/KnowledgeEmbeddingService.ts",
  // REMOVIDO em 04/08/2026: services/help/helpAssistant.ts. A aba "Ajuda" chamava
  // a OpenAI direto; agora passa por reasonAsAgent({agentId:"suporte-tecnico"}).
  // O histórico multi-turn — a justificativa antiga da exceção — vai pelo campo
  // sanitizedHistory do BrainReasoningRequest, que já existia.
  "services/imageEnhancement/providers/openai.ts",
]);

const OPENAI_IMPORT_RE =
  /(?:from\s+|import\(\s*|require\(\s*)["'](?:@\/lib\/openai|openai)(?:\/[^"']*)?["']/;

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules") continue;
      listSourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe("Regra de Ouro — portão único de raciocínio", () => {
  it("nenhum arquivo NOVO fala com a IA-piloto por fora do motor do Brain", () => {
    const offenders: string[] = [];
    for (const file of listSourceFiles(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).split(sep).join("/");
      if (ALLOWED.has(rel) || FROZEN_EXCEPTIONS.has(rel)) continue;
      const content = readFileSync(file, "utf8");
      if (OPENAI_IMPORT_RE.test(content)) offenders.push(rel);
    }
    expect(
      offenders,
      `Cérebro paralelo detectado — estes arquivos importam a IA direto em vez de usar o AIEngineRouter do Brain:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("o Brain PROPÕE, nunca EXECUTA: nenhum tool-calling dentro de src/services/brain", () => {
    // A Lei 2 em forma de teste. O raciocínio devolve, no máximo, uma CHAVE de
    // allowlist — quem age é um executor separado, fora do Brain. Se alguém
    // plugar function-calling aqui, o build cai.
    const TOOL_CALLING_RE =
      /\b(?:tool_choice|tool_calls|function_call|parallel_tool_calls)\b|\btools\s*:\s*\[/;
    const offenders: string[] = [];
    for (const file of listSourceFiles(join(SRC_ROOT, "services", "brain"))) {
      const content = readFileSync(file, "utf8");
      if (TOOL_CALLING_RE.test(content)) {
        offenders.push(relative(SRC_ROOT, file).split(sep).join("/"));
      }
    }
    expect(
      offenders,
      `Tool-calling dentro do Brain — o raciocínio voltaria a executar:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("o Brain não importa executor: a seta aponta só de fora para dentro", () => {
    // O executor (services/support/actions) pode importar o Brain; o Brain NÃO
    // pode importar o executor. É o que impede o raciocínio de ganhar braços.
    const EXECUTOR_IMPORT_RE = /["']@?[./\w/]*(?:services\/)?support\/actions\/[\w]+["']/;
    const offenders: string[] = [];
    for (const file of listSourceFiles(join(SRC_ROOT, "services", "brain"))) {
      const content = readFileSync(file, "utf8");
      if (EXECUTOR_IMPORT_RE.test(content)) {
        offenders.push(relative(SRC_ROOT, file).split(sep).join("/"));
      }
    }
    expect(
      offenders,
      `O Brain importou o executor de ações — inversão de dependência proibida:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("runtimeTouched é literal false no contrato — não é boolean configurável", () => {
    const types = readFileSync(join(SRC_ROOT, "services/brain/core/BrainTypes.ts"), "utf8");
    expect(types).toMatch(/runtimeTouched:\s*false;/);
    expect(types).not.toMatch(/runtimeTouched\s*:\s*boolean/);
  });

  it("a lista congelada só diminui — exceções que já migraram devem ser removidas", () => {
    // Informativo/estrutural: garante que a lista congelada não referencia
    // arquivos que deixaram de existir (renomear ≠ escapar da lei).
    const existing = new Set(
      listSourceFiles(SRC_ROOT).map((f) => relative(SRC_ROOT, f).split(sep).join("/")),
    );
    const ghosts = [...FROZEN_EXCEPTIONS].filter((f) => !existing.has(f));
    expect(
      ghosts,
      `Entradas da lista congelada não existem mais — remova-as do teste:\n${ghosts.join("\n")}`,
    ).toEqual([]);
  });
});
