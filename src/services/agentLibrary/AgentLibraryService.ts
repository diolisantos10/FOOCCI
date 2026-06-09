/**
 * AgentLibraryService — data access + optional AI extraction for the Agent
 * Library Workbench.
 *
 * The Library is the agents' professional FORMATION (sources → techniques). It
 * is fully decoupled from runtime: nothing here is read by WaiterBrain,
 * WaiterBrainV2, PromptBuilderService, AIOrderService, CRM or WhatsApp. The
 * "ativas no runtime" counter is therefore always 0 in this phase.
 *
 * Copyright-safe: AI extraction sends only a CLAMPED slice of the pasted text
 * and is instructed to produce short operational syntheses — never to reproduce
 * the source. Original files (future upload phase) stay private.
 */

import { prisma } from "@/lib/prisma";
import { openai } from "@/lib/openai";
import {
  clampText,
  parseExtractedTechniques,
  type SourceInput,
  type TechniqueInput,
} from "./agentLibraryHelpers";
import { extractTextFromUpload } from "./extractText";
import { resolveTextForExtraction } from "./extractionText";

export interface LibraryStats {
  sources: number;
  techniques: number;
  activeInRuntime: number; // always 0 this phase
  pendingExtraction: number;
}

export class AgentLibraryService {
  /** Dashboard counters for one agent. */
  static async getStats(agentSlug: string): Promise<LibraryStats> {
    const [sources, techniques, pendingExtraction] = await Promise.all([
      prisma.agentLibrarySource.count({ where: { agentSlug } }),
      prisma.agentLibraryTechnique.count({ where: { agentSlug } }),
      prisma.agentLibrarySource.count({
        where: { agentSlug, extractionStatus: { in: ["PENDING", "EXTRACTING"] } },
      }),
    ]);
    return { sources, techniques, activeInRuntime: 0, pendingExtraction };
  }

  /** All sources for an agent, newest first, with a technique count. */
  static async listSources(agentSlug: string) {
    const rows = await prisma.agentLibrarySource.findMany({
      where: { agentSlug },
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { techniques: true } },
        extractionJob: {
          select: { stage: true, totalChunks: true, processedChunks: true, failedChunks: true, techniquesFound: true },
        },
      },
    });
    return rows;
  }

  /** One source + its techniques. */
  static async getSourceWithTechniques(id: string) {
    return prisma.agentLibrarySource.findUnique({
      where: { id },
      include: { techniques: { orderBy: { createdAt: "desc" } } },
    });
  }

  /** Create a new source (DRAFT, extraction PENDING). */
  static async createSource(input: SourceInput) {
    return prisma.agentLibrarySource.create({
      data: {
        agentSlug: input.agentSlug,
        title: input.title,
        author: input.author ?? null,
        sourceType: input.sourceType,
        category: input.category ?? null,
        description: input.description ?? null,
        rawText: input.rawText ?? null,
        extractionStatus: "PENDING",
        status: "DRAFT",
      },
    });
  }

  /**
   * Create a source from an upload: persists metadata + the (already capped)
   * extracted text. The original binary is NOT stored (kept private). When
   * extracted text is present, extractionStatus is left PENDING (ready to
   * extract techniques); otherwise PENDING with no text.
   */
  static async createSourceFromUpload(params: {
    input: SourceInput;
    extractedText?: string | null;
    fileName?: string | null;
    mimeType?: string | null;
    fileSize?: number | null;
  }) {
    const { input } = params;
    return prisma.agentLibrarySource.create({
      data: {
        agentSlug: input.agentSlug,
        title: input.title,
        author: input.author ?? null,
        sourceType: input.sourceType,
        category: input.category ?? null,
        description: input.description ?? null,
        // Prefer extracted text; fall back to any manually pasted text.
        rawText: params.extractedText ?? input.rawText ?? null,
        fileName: params.fileName ?? null,
        mimeType: params.mimeType ?? null,
        fileSize: params.fileSize ?? null,
        // storageKey/fileUrl intentionally left null — binary not persisted in this phase.
        extractionStatus: "PENDING",
        status: "DRAFT",
      },
    });
  }

  /** Replace a source's extracted/raw text (after parsing the uploaded file). */
  static async setRawText(id: string, rawText: string) {
    return prisma.agentLibrarySource.update({ where: { id }, data: { rawText } });
  }

  /**
   * Store the original uploaded file PRIVATELY (DB bytes, never a public route)
   * and link it to the source via storageKey + metadata. Upserted 1:1 so a
   * re-upload replaces the previous bytes.
   */
  static async saveOriginalFile(
    sourceId: string,
    file: { fileName: string; mimeType: string; buffer: Buffer },
  ): Promise<{ storageKey: string }> {
    const rec = await prisma.agentLibraryFile.upsert({
      where: { sourceId },
      create: {
        sourceId,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.buffer.length,
        data: file.buffer,
      },
      update: {
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.buffer.length,
        data: file.buffer,
      },
      select: { id: true },
    });
    const storageKey = `db:${rec.id}`;
    await prisma.agentLibrarySource.update({
      where: { id: sourceId },
      data: { storageKey, fileName: file.fileName, mimeType: file.mimeType, fileSize: file.buffer.length },
    });
    return { storageKey };
  }

  /** Load the stored original file (server-side only). Null if none. */
  static async loadOriginalFile(
    sourceId: string,
  ): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
    const rec = await prisma.agentLibraryFile.findUnique({ where: { sourceId } });
    if (!rec) return null;
    return { buffer: Buffer.from(rec.data), fileName: rec.fileName, mimeType: rec.mimeType };
  }

  /**
   * Delete a source and everything attached to it. The linked techniques and the
   * private original file are removed automatically by the DB cascade
   * (onDelete: Cascade on both relations). Returns false if the source does not
   * exist (so the route can answer 404).
   */
  static async deleteSource(id: string): Promise<boolean> {
    const existing = await prisma.agentLibrarySource.findUnique({ where: { id }, select: { id: true } });
    if (!existing) return false;
    await prisma.agentLibrarySource.delete({ where: { id } });
    return true;
  }

  /** Update only the extraction status (PENDING/EXTRACTING/EXTRACTED/FAILED). */
  static async setExtractionStatus(
    id: string,
    status: "PENDING" | "EXTRACTING" | "EXTRACTED" | "FAILED",
  ) {
    return prisma.agentLibrarySource.update({ where: { id }, data: { extractionStatus: status } });
  }

  /** Add one technique to a source (manual or extracted). */
  static async createTechnique(sourceId: string, input: TechniqueInput) {
    const source = await prisma.agentLibrarySource.findUnique({
      where: { id: sourceId },
      select: { id: true, agentSlug: true, category: true },
    });
    if (!source) throw new Error("Fonte não encontrada.");

    return prisma.agentLibraryTechnique.create({
      data: {
        agentSlug: source.agentSlug,
        sourceId: source.id,
        category: input.category ?? source.category ?? null,
        techniqueName: input.techniqueName,
        purpose: input.purpose ?? null,
        principle: input.principle ?? null,
        application: input.application ?? null,
        usageRule: input.usageRule ?? null,
        qualityTest: input.qualityTest ?? null,
        goodExample: input.goodExample ?? null,
        badExample: input.badExample ?? null,
        confidence: input.confidence ?? null,
        status: "EXTRACTED",
      },
    });
  }

  /**
   * Optional AI extraction. Reads the source's pasted text, asks the LLM for a
   * few operational techniques (syntheses only), and stores them. Safe-by-design:
   *   • No-op with a clear error if there is no rawText or no OPENAI_API_KEY.
   *   • Sends only a clamped slice of the text (copyright + cost guard).
   *   • Never reproduces the source; never touches any runtime.
   * Returns the number of techniques created.
   */
  static async extractTechniques(sourceId: string): Promise<{ created: number }> {
    const source = await prisma.agentLibrarySource.findUnique({ where: { id: sourceId } });
    if (!source) throw new Error("Fonte não encontrada.");

    // Resolve text: prefer pasted/extracted rawText; otherwise re-parse the
    // stored original file (so "extract again" works without a paste). Throws a
    // clear error when there is neither text nor a stored file.
    const resolved = await resolveTextForExtraction({
      rawText: source.rawText,
      loadFile: () => AgentLibraryService.loadOriginalFile(sourceId),
      parse: (buffer, fileName, mimeType) => extractTextFromUpload(buffer, fileName, mimeType),
    });
    const text = resolved.text;
    if (resolved.fromFile) {
      await AgentLibraryService.setRawText(sourceId, text);
    }

    if (!process.env.OPENAI_API_KEY) {
      throw new Error("Extração por IA indisponível (OPENAI_API_KEY não configurada). Adicione técnicas manualmente.");
    }

    await prisma.agentLibrarySource.update({
      where: { id: sourceId },
      data: { extractionStatus: "EXTRACTING" },
    });

    try {
      const clamped = clampText(text);
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.3,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "Você é um curador de formação técnica para agentes de IA de restaurantes (Foocci). " +
              "A partir das NOTAS fornecidas, extraia de 3 a 6 técnicas APLICÁVEIS, em português. " +
              "Produza SOMENTE sínteses operacionais — NUNCA reproduza trechos longos da obra. " +
              "Responda em JSON: { \"techniques\": [ { \"techniqueName\", \"category\", \"purpose\", " +
              "\"principle\", \"application\", \"usageRule\", \"qualityTest\", \"goodExample\", " +
              "\"badExample\", \"confidence\" } ] }. " +
              "confidence é um número de 0 a 1. application deve descrever como o agente usa a técnica dentro do Foocci.",
          },
          {
            role: "user",
            content:
              `Agente: ${source.agentSlug}\nFonte: ${source.title}\n` +
              `Categoria: ${source.category ?? "(sem categoria)"}\n\nNOTAS:\n${clamped}`,
          },
        ],
      });

      const raw = completion.choices[0]?.message?.content ?? "";
      const techniques = parseExtractedTechniques(raw);

      if (techniques.length === 0) {
        await prisma.agentLibrarySource.update({
          where: { id: sourceId },
          data: { extractionStatus: "FAILED" },
        });
        return { created: 0 };
      }

      await prisma.$transaction(
        techniques.map((t) =>
          prisma.agentLibraryTechnique.create({
            data: {
              agentSlug: source.agentSlug,
              sourceId: source.id,
              category: t.category ?? source.category ?? null,
              techniqueName: t.techniqueName,
              purpose: t.purpose ?? null,
              principle: t.principle ?? null,
              application: t.application ?? null,
              usageRule: t.usageRule ?? null,
              qualityTest: t.qualityTest ?? null,
              goodExample: t.goodExample ?? null,
              badExample: t.badExample ?? null,
              confidence: t.confidence ?? null,
              status: "EXTRACTED",
            },
          }),
        ),
      );

      await prisma.agentLibrarySource.update({
        where: { id: sourceId },
        data: { extractionStatus: "EXTRACTED" },
      });

      return { created: techniques.length };
    } catch (err) {
      await prisma.agentLibrarySource.update({
        where: { id: sourceId },
        data: { extractionStatus: "FAILED" },
      }).catch(() => { /* non-fatal */ });
      throw err instanceof Error ? err : new Error("Falha na extração.");
    }
  }
}
