/**
 * autoExtractionDiagnostic — automated operational proof that the Waiter Agent
 * Library extracts techniques AUTOMATICALLY on upload, with no manual button.
 *
 * It runs the REAL pipeline (runUploadFlow → AgentLibraryService.extractTechniques
 * → OpenAI), using synthetic, self-authored content, then validates the result
 * and DELETES the temporary source + techniques (cascade) so nothing is left in
 * the library. Controlled FAIL on missing OPENAI_API_KEY / AI / DB errors —
 * never throws, always attempts cleanup.
 *
 * Side effects are limited to the AgentLibrary* tables (create + delete a temp
 * source). It NEVER touches WaiterBrain / PromptBuilder / /pedido / checkout /
 * payment / Pix / WhatsApp / Evolution, and never injects techniques into any
 * runtime prompt.
 */

import { runUploadFlow } from "./uploadFlow";
import { AgentLibraryService } from "./AgentLibraryService";

/** Self-authored synthetic content (no copyrighted material). */
export const DIAGNOSTIC_TEXT =
  "Treinamento de venda consultiva para restaurantes: diagnosticar intenção do cliente, " +
  "reduzir escolhas, sugerir acompanhamento compatível, respeitar restrições alimentares, " +
  "confirmar o próximo passo e conduzir ao fechamento com baixa fricção.";

export interface AutoExtractionResult {
  ok: boolean;
  status: "PASS" | "FAIL";
  agentSlug: string;
  stage?: string;
  sourceCreated: boolean;
  techniquesCreated: number;
  sourceCleanedUp: boolean;
  /** Always false — the diagnostic never touches any agent runtime. */
  runtimeTouched: false;
  message: string;
}

/** Runs the automated auto-extraction diagnostic for the Waiter library. */
export async function runAutoExtractionDiagnostic(): Promise<AutoExtractionResult> {
  const agentSlug = "waiter";
  let sourceId: string | undefined;
  let sourceCreated = false;
  let techniquesCreated = 0;

  async function cleanup(): Promise<boolean> {
    if (!sourceId) return true;
    try {
      await AgentLibraryService.deleteSource(sourceId);
      return true;
    } catch {
      return false; // surfaced as sourceCleanedUp=false
    }
  }

  function fail(stage: string, message: string, cleaned: boolean): AutoExtractionResult {
    return { ok: false, status: "FAIL", agentSlug, stage, sourceCreated, techniquesCreated, sourceCleanedUp: cleaned, runtimeTouched: false, message };
  }

  try {
    // ── 1–3. Real automatic flow: pasted synthetic text, NO `extract` field ──
    // Omitting `extract` exercises the AUTOMATIC default (no manual button).
    const form = new FormData();
    form.append("agentSlug", agentSlug);
    form.append("title", "[DIAG] Auto-extraction self-test");
    form.append("sourceType", "INTERNAL_NOTE");
    form.append("category", "Diagnóstico");
    form.append("rawText", DIAGNOSTIC_TEXT);

    const res = await runUploadFlow(form);
    sourceId = res.body.sourceId ?? undefined;
    sourceCreated = !!sourceId;

    if (!sourceId) {
      return fail(res.body.stage ?? "upload", `Fonte não foi criada: ${res.body.message}`, true);
    }

    // Automatic extraction must have completed (stage "done"). Anything else is a
    // controlled FAIL (AI down / missing key / no techniques).
    if (res.body.stage !== "done") {
      const cleaned = await cleanup();
      const noKey = /OPENAI|indispon[ií]vel/i.test(res.body.message) || res.body.stage === "aiExtraction";
      return fail(
        res.body.stage ?? "aiExtraction",
        noKey ? "OPENAI_API_KEY ausente ou extração IA indisponível" : `Extração automática não concluiu: ${res.body.message}`,
        cleaned,
      );
    }

    // ── 4–7. Validate techniques, useful fields, sourceId link, status ──
    const detail = await AgentLibraryService.getSourceWithTechniques(sourceId);
    const techniques = detail?.techniques ?? [];
    techniquesCreated = techniques.length;

    if (techniquesCreated === 0) {
      return fail("validate", "Nenhuma técnica foi criada automaticamente.", await cleanup());
    }

    const hasUsefulFields = techniques.some(
      (t) => !!t.techniqueName && (!!t.application || !!t.usageRule || !!t.qualityTest),
    );
    const allLinked = techniques.every((t) => t.sourceId === sourceId);
    const statusOk = detail?.extractionStatus === "EXTRACTED";

    if (!hasUsefulFields || !allLinked || !statusOk) {
      return fail(
        "validate",
        `Validação falhou (campos úteis=${hasUsefulFields}, sourceId vinculado=${allLinked}, status=${detail?.extractionStatus ?? "?"}).`,
        await cleanup(),
      );
    }

    // ── 10. Cleanup the temporary source (cascade removes techniques) ──
    const cleaned = await cleanup();
    return {
      ok: true,
      status: "PASS",
      agentSlug,
      sourceCreated,
      techniquesCreated,
      sourceCleanedUp: cleaned,
      runtimeTouched: false,
      message: "Auto extraction validated successfully.",
    };
  } catch (err) {
    // Any DB/unexpected failure → controlled FAIL, still attempt cleanup.
    const cleaned = await cleanup();
    return fail("exception", err instanceof Error ? err.message : "Falha inesperada no diagnóstico.", cleaned);
  }
}
