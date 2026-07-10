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
]);

/** Dívida pré-lei, CONGELADA. Remover itens = progresso; adicionar = proibido. */
const FROZEN_EXCEPTIONS = new Set<string>([
  "services/agent-training/AgentTrainingEvaluatorService.ts",
  "services/agent-training/AgentTrainingImprovementService.ts",
  "services/agentLibrary/AgentLibraryService.ts",
  "services/agentLibrary/deepExtraction/realChunkExtractor.ts",
  "services/agents/reasoning/WaiterReasoningLLMService.ts",
  "services/ai/AIOrderService.ts",
  "services/ai/AISimulatorService.ts",
  "services/ai/AITools.ts",
  "services/ai/ChatSimService.ts",
  "services/ai/PromptBuilderService.ts",
  "services/ai/WhatsAppReceptionistService.ts",
  "services/analytics/AnalyticsAgentService.ts",
  "services/crm/MessageVariationService.ts",
  "services/help/FaqMiner.ts",
  "services/help/helpAssistant.ts",
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
