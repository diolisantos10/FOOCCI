/**
 * DeepExtractionService — background, chunked deep extraction (server-only).
 *
 * Schedules a job + chunks for a source, processes chunks incrementally (one
 * batch per call, so no request blocks for minutes), then consolidates the
 * candidates into final techniques. The per-chunk LLM call is INJECTED
 * (ChunkExtractor) so the orchestration is deterministic and testable; the
 * production extractor reuses OpenAI.
 *
 * Library stays OFF the runtime — techniques are archived knowledge only.
 */

import { prisma } from "@/lib/prisma";
import { chunkText, progressPercent, wasTruncated } from "./chunking";
import { consolidateToTechniques, type CandidateLike } from "./consolidation";
import { newTechniqueActivationDefaults } from "../agentLibraryHelpers";

/** Max retries per chunk before it is marked FAILED. */
export const MAX_CHUNK_RETRIES = 2;

export interface ChunkExtractorInput {
  agentSlug: string;
  sourceTitle: string;
  category: string | null;
  chunkIndex: number;
  totalChunks: number;
  text: string;
}

/** Extracts candidate techniques from a single chunk (real impl uses OpenAI). */
export type ChunkExtractor = (input: ChunkExtractorInput) => Promise<CandidateLike[]>;

export const DeepExtractionService = {
  /**
   * Creates a deep-extraction job + chunks for a source and moves it to
   * PROCESSING_CHUNKS. Returns the job id + chunk count. Fast (no LLM).
   */
  async scheduleJob(sourceId: string, fullText?: string): Promise<{ jobId: string; totalChunks: number; truncated: boolean }> {
    const source = await prisma.agentLibrarySource.findUnique({ where: { id: sourceId } });
    if (!source) throw new Error("Fonte não encontrada.");
    // Chunk the FULL extracted text when provided (the stored rawText is capped
    // at MAX_STORED_TEXT_CHARS, so re-schedules without fullText see only a sample).
    const text = (fullText && fullText.trim().length > 0 ? fullText : source.rawText) ?? "";
    const chunks = chunkText(text);
    const truncated = wasTruncated(text);

    // Replace any previous job (re-schedule / retry).
    await prisma.agentLibraryExtractionJob.deleteMany({ where: { sourceId } });

    const job = await prisma.agentLibraryExtractionJob.create({
      data: {
        sourceId,
        agentSlug: source.agentSlug,
        stage: chunks.length > 0 ? "PROCESSING_CHUNKS" : "FAILED",
        processingMode: "CHUNKED",
        extractionDepth: "DEEP",
        totalChunks: chunks.length,
        startedAt: new Date(),
        lastError: chunks.length === 0 ? "Sem texto para processar." : null,
        chunks: {
          create: chunks.map((c) => ({
            sourceId,
            chunkIndex: c.index,
            totalChunks: chunks.length,
            charCount: c.charCount,
            text: c.text,
            status: "PENDING",
          })),
        },
      },
      select: { id: true },
    });

    await prisma.agentLibrarySource.update({
      where: { id: sourceId },
      data: { extractionStatus: chunks.length > 0 ? "PROCESSING_CHUNKS" : "FAILED" },
    });

    return { jobId: job.id, totalChunks: chunks.length, truncated };
  },

  /**
   * Processes the next PENDING chunk (oldest job first). Saves the chunk's
   * candidate techniques, advances counters, and flips the job to CONSOLIDATING
   * once every chunk is processed/failed. Returns whether work was done.
   */
  async processNextPendingChunk(extractor: ChunkExtractor): Promise<{ processed: boolean; jobId?: string }> {
    const chunk = await prisma.agentLibrarySourceChunk.findFirst({
      where: { status: "PENDING" },
      orderBy: { createdAt: "asc" },
      include: { job: { include: { source: true } } },
    });
    if (!chunk) return { processed: false };

    await prisma.agentLibrarySourceChunk.update({ where: { id: chunk.id }, data: { status: "PROCESSING" } });

    try {
      const candidates = await extractor({
        agentSlug: chunk.job.agentSlug,
        sourceTitle: chunk.job.source.title,
        category: chunk.job.source.category,
        chunkIndex: chunk.chunkIndex,
        totalChunks: chunk.totalChunks,
        text: chunk.text,
      });

      if (candidates.length > 0) {
        await prisma.agentLibraryChunkTechniqueCandidate.createMany({
          data: candidates.map((c) => ({
            jobId: chunk.jobId,
            sourceId: chunk.sourceId,
            agentSlug: chunk.job.agentSlug,
            chunkIndex: chunk.chunkIndex,
            techniqueName: c.techniqueName,
            category: c.category ?? null,
            purpose: c.purpose ?? null,
            principle: c.principle ?? null,
            application: c.application ?? null,
            usageRule: c.usageRule ?? null,
            qualityTest: c.qualityTest ?? null,
            goodExample: c.goodExample ?? null,
            badExample: c.badExample ?? null,
            confidence: typeof c.confidence === "number" ? c.confidence : null,
            evidenceSnippet: truncateSnippet(c.application ?? c.principle ?? ""),
          })),
        });
      }

      await prisma.agentLibrarySourceChunk.update({
        where: { id: chunk.id },
        data: { status: "DONE", techniquesExtracted: candidates.length },
      });
      await prisma.agentLibraryExtractionJob.update({
        where: { id: chunk.jobId },
        data: { processedChunks: { increment: 1 }, techniquesFound: { increment: candidates.length } },
      });
    } catch (err) {
      const retries = chunk.retries + 1;
      const giveUp = retries > MAX_CHUNK_RETRIES;
      await prisma.agentLibrarySourceChunk.update({
        where: { id: chunk.id },
        data: {
          status: giveUp ? "FAILED" : "PENDING",
          retries,
          error: err instanceof Error ? err.message.slice(0, 300) : "erro",
        },
      });
      if (giveUp) {
        await prisma.agentLibraryExtractionJob.update({
          where: { id: chunk.jobId },
          data: { processedChunks: { increment: 1 }, failedChunks: { increment: 1 }, lastError: "Falha em um chunk." },
        });
      }
    }

    await maybeFlipToConsolidating(chunk.jobId);
    return { processed: true, jobId: chunk.jobId };
  },

  /**
   * Consolidates a job that finished processing: dedupes candidates into final
   * AgentLibraryTechnique rows, then marks the source EXTRACTED (or PARTIAL when
   * some chunks failed). Cleans up chunk text + candidates afterwards.
   */
  async consolidateJob(jobId: string): Promise<{ techniquesCreated: number }> {
    const job = await prisma.agentLibraryExtractionJob.findUnique({ where: { id: jobId } });
    if (!job) return { techniquesCreated: 0 };

    const candidates = (await prisma.agentLibraryChunkTechniqueCandidate.findMany({ where: { jobId } })) as CandidateLike[];
    const finals = consolidateToTechniques(candidates);

    if (finals.length > 0) {
      await prisma.agentLibraryTechnique.createMany({
        data: finals.map((t) => ({
          agentSlug: job.agentSlug,
          sourceId: job.sourceId,
          category: t.category ?? null,
          techniqueName: t.techniqueName,
          purpose: t.purpose ?? null,
          principle: t.principle ?? null,
          application: t.application ?? null,
          usageRule: t.usageRule ?? null,
          qualityTest: t.qualityTest ?? null,
          goodExample: t.goodExample ?? null,
          badExample: t.badExample ?? null,
          confidence: typeof t.confidence === "number" ? t.confidence : null,
          // Born ready: the operator approved the source, so techniques are ACTIVE
          // + runtimeEnabled. Real use still requires an ACTIVE LIBRARY_ASSISTED
          // version (default CURRENT stays safe).
          ...newTechniqueActivationDefaults(),
        })),
      });
    }

    // Honesty rule: 0 final techniques is NEVER a silent EXTRACTED.
    //  - finals > 0           → EXTRACTED (or PARTIAL if some chunks failed)
    //  - candidates but 0 finals → PARTIAL with a clear lastError
    //  - no candidates at all → FAILED with a clear lastError
    const partial = job.failedChunks > 0;
    let sourceStatus: "EXTRACTED" | "PARTIAL" | "FAILED";
    let lastError: string | null = null;
    if (finals.length > 0) {
      sourceStatus = partial ? "PARTIAL" : "EXTRACTED";
    } else if (candidates.length > 0) {
      sourceStatus = "PARTIAL";
      lastError = `Candidatas extraídas (${candidates.length}), mas nenhuma técnica final após consolidação/filtro.`;
    } else {
      sourceStatus = "FAILED";
      lastError = "Nenhuma candidata foi extraída dos chunks.";
    }

    await prisma.agentLibraryExtractionJob.update({
      where: { id: jobId },
      data: { stage: sourceStatus, techniquesFound: finals.length, lastError, finishedAt: new Date() },
    });
    await prisma.agentLibrarySource.update({
      where: { id: job.sourceId },
      data: { extractionStatus: sourceStatus },
    });
    // Free chunk text + candidates (keep only the final techniques + job summary).
    await prisma.agentLibraryChunkTechniqueCandidate.deleteMany({ where: { jobId } });
    await prisma.agentLibrarySourceChunk.updateMany({ where: { jobId }, data: { text: "" } });

    return { techniquesCreated: finals.length };
  },

  /** Reads the job for a source with derived progress (for the UI). */
  async getJobForSource(sourceId: string) {
    const job = await prisma.agentLibraryExtractionJob.findUnique({ where: { sourceId } });
    if (!job) return null;
    return { ...job, progressPercent: progressPercent({ totalChunks: job.totalChunks, processedChunks: job.processedChunks }) };
  },
};

function truncateSnippet(s: string): string {
  const t = (s ?? "").trim();
  return t.length > 240 ? `${t.slice(0, 240)}…` : t;
}

/** Flips a job to CONSOLIDATING once all chunks are processed (done+failed). */
async function maybeFlipToConsolidating(jobId: string): Promise<void> {
  const job = await prisma.agentLibraryExtractionJob.findUnique({ where: { id: jobId } });
  if (!job || job.stage !== "PROCESSING_CHUNKS") return;
  if (job.processedChunks >= job.totalChunks && job.totalChunks > 0) {
    await prisma.agentLibraryExtractionJob.update({ where: { id: jobId }, data: { stage: "CONSOLIDATING" } });
    await prisma.agentLibrarySource.update({ where: { id: job.sourceId }, data: { extractionStatus: "CONSOLIDATING" } });
  }
}
