/**
 * deepExtractionDiagnostic — automated end-to-end proof that DEEP chunked
 * extraction turns substantial content into useful, archived techniques.
 *
 * Runs the REAL pipeline (create source → scheduleJob → processNextPendingChunk
 * → consolidateJob) over a self-authored, dense training fixture, asserts
 * techniquesCreated > 0 with minimal fields, then DELETES the temp source (job +
 * chunks + candidates + techniques cascade). Controlled FAIL — never throws,
 * always attempts cleanup. Never touches any agent runtime.
 *
 * The per-chunk extractor is injectable (default = realChunkExtractor) so the
 * orchestration is deterministically testable.
 */

import { prisma } from "@/lib/prisma";
import { AgentLibraryService } from "../AgentLibraryService";
import { DeepExtractionService, type ChunkExtractor } from "./DeepExtractionService";
import { realChunkExtractor } from "./realChunkExtractor";

/** Self-authored, dense training content (no copyrighted material). */
export const DEEP_DIAGNOSTIC_TEXT = `Treinamento avançado de venda consultiva para restaurantes e atendimento digital.

1. Diagnóstico de intenção:
Quando o cliente pede "me sugere algo", o atendente não deve despejar o cardápio inteiro. Primeiro deve identificar o tipo de ocasião: almoço rápido, jantar especial, pedido individual, pedido em grupo, economia ou experiência premium.

2. Redução de escolha:
Clientes compram melhor quando recebem poucas opções relevantes. Em vez de listar 20 pratos, o atendente deve selecionar de 3 a 5 opções coerentes com a intenção, explicando brevemente por que combinam com o pedido.

3. Venda de acompanhamento:
Depois do prato principal, o atendente deve sugerir bebida compatível. A sugestão precisa ser contextual, não genérica. Pratos quentes combinam com refrigerante ou chá; combos para grupo combinam com bebida grande.

4. Respeito a restrições:
Quando o cliente diz que é vegano, alérgico ou evita algum ingrediente, o atendente não deve prometer que algo é seguro sem metadata. Deve sugerir opções prováveis e orientar a confirmação de ingredientes.

5. Fechamento com próximo passo:
Toda interação deve terminar com uma ação simples: "quer que eu adicione?", "prefere essa opção ou quer algo mais leve?", "posso montar seu pedido com isso?". O cliente nunca deve ficar sem próximo passo.

6. Evitar fricção:
A venda deve pedir poucos dados e priorizar o clique. O atendente digital orienta, mas a interface vende com cards, botões e imagens.

7. Upsell ético:
Upsell deve aumentar valor sem incomodar. Se o cliente recusar bebida, não insistir. Se aceitar o prato principal, sugerir sobremesa depois. Se recusar, seguir para o fechamento.

8. Pedido em grupo:
Quando o cliente diz "somos 4", o atendente deve priorizar combos, porções e itens compartilháveis, evitando opções individuais demais.

9. Cliente indeciso:
Cliente indeciso precisa de condução. O atendente deve assumir a liderança e oferecer uma recomendação segura, explicando o porquê.

10. Qualidade da recomendação:
Uma recomendação boa tem três partes: item sugerido, motivo claro e próximo passo.`;

export interface DeepDiagnosticResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  agentSlug: string;
  stage?: string;
  sourceCreated: boolean;
  totalChunks: number;
  chunksProcessed: number;
  candidatesCreated: number;
  techniquesCreated: number;
  sourceCleanedUp: boolean;
  runtimeTouched: false;
  message: string;
}

export async function runDeepExtractionDiagnostic(
  extractor: ChunkExtractor = realChunkExtractor,
): Promise<DeepDiagnosticResult> {
  const agentSlug = "waiter";
  let sourceId: string | undefined;
  let sourceCreated = false;
  let totalChunks = 0;
  let chunksProcessed = 0;
  let candidatesCreated = 0;
  let techniquesCreated = 0;

  async function cleanup(): Promise<boolean> {
    if (!sourceId) return true;
    try {
      await AgentLibraryService.deleteSource(sourceId);
      return true;
    } catch {
      return false;
    }
  }
  function fail(stage: string, message: string, cleaned: boolean): DeepDiagnosticResult {
    return { ok: false, status: "FAIL", agentSlug, stage, sourceCreated, totalChunks, chunksProcessed, candidatesCreated, techniquesCreated, sourceCleanedUp: cleaned, runtimeTouched: false, message };
  }

  try {
    const source = await AgentLibraryService.createSource({
      agentSlug,
      title: "[DEEP DIAG] venda consultiva",
      sourceType: "INTERNAL_NOTE",
      category: "Diagnóstico",
      rawText: DEEP_DIAGNOSTIC_TEXT,
    });
    sourceId = source.id;
    sourceCreated = true;

    const sched = await DeepExtractionService.scheduleJob(sourceId, DEEP_DIAGNOSTIC_TEXT);
    totalChunks = sched.totalChunks;
    if (totalChunks === 0) return fail("chunking", "Nenhum chunk foi gerado do conteúdo.", await cleanup());

    for (let i = 0; i < totalChunks + 5; i++) {
      const r = await DeepExtractionService.processNextPendingChunk(extractor);
      if (!r.processed) break;
      chunksProcessed += 1;
    }

    const job = await prisma.agentLibraryExtractionJob.findUnique({ where: { sourceId } });
    if (!job) return fail("job", "Job de extração não encontrado.", await cleanup());

    // Count candidates BEFORE consolidation (which deletes them).
    candidatesCreated = await prisma.agentLibraryChunkTechniqueCandidate.count({ where: { jobId: job.id } });
    const cons = await DeepExtractionService.consolidateJob(job.id);
    techniquesCreated = cons.techniquesCreated;

    if (techniquesCreated === 0) {
      const cleaned = await cleanup();
      return fail(
        "consolidate",
        candidatesCreated > 0
          ? `Candidatas (${candidatesCreated}) extraídas, mas 0 técnicas finais após consolidação.`
          : "0 candidatas extraídas — o extractor não produziu técnicas (verifique OPENAI_API_KEY / prompt).",
        cleaned,
      );
    }

    const detail = await AgentLibraryService.getSourceWithTechniques(sourceId);
    const techniques = detail?.techniques ?? [];
    const hasUsefulFields = techniques.some((t) => !!t.techniqueName && (!!t.application || !!t.usageRule || !!t.qualityTest));
    if (!hasUsefulFields) return fail("validate", "Técnicas criadas, mas sem campos úteis (application/usageRule/qualityTest).", await cleanup());

    const cleaned = await cleanup();
    return {
      ok: true,
      status: "PASS",
      agentSlug,
      sourceCreated,
      totalChunks,
      chunksProcessed,
      candidatesCreated,
      techniquesCreated,
      sourceCleanedUp: cleaned,
      runtimeTouched: false,
      message: `Deep extraction validada: ${techniquesCreated} técnica(s) finais de ${candidatesCreated} candidata(s), ${chunksProcessed}/${totalChunks} partes.`,
    };
  } catch (err) {
    const cleaned = await cleanup();
    return fail("exception", err instanceof Error ? err.message : "Falha inesperada no diagnóstico deep.", cleaned);
  }
}
