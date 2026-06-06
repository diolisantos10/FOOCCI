/**
 * Admin → Agentes → Agent Library (Workbench v1).
 *
 * Server component: resolves the selected agent + source from the query string,
 * loads sources/stats/detail via AgentLibraryService and hands plain DTOs to the
 * client workbench. Reads only — all mutations go through the admin API routes.
 *
 * Fully decoupled from runtime. If the Library tables are not migrated yet, the
 * page degrades gracefully instead of crashing.
 */

import { AgentLibraryService } from "@/services/agentLibrary/AgentLibraryService";
import { LIBRARY_AGENTS, isValidLibraryAgent } from "@/services/agentLibrary/agentLibraryHelpers";
import { LibraryWorkbench, type SourceDTO, type SourceDetailDTO, type StatsDTO } from "./LibraryWorkbench";

export const dynamic = "force-dynamic";

export default async function AgentLibraryPage({
  searchParams,
}: {
  searchParams: { agent?: string; source?: string };
}) {
  const agentSlug = isValidLibraryAgent(searchParams.agent) ? searchParams.agent! : "waiter";
  const selectedId = typeof searchParams.source === "string" ? searchParams.source : null;

  let stats: StatsDTO = { sources: 0, techniques: 0, activeInRuntime: 0, pendingExtraction: 0 };
  let sources: SourceDTO[] = [];
  let selected: SourceDetailDTO | null = null;
  let dbError = false;

  try {
    const [s, list] = await Promise.all([
      AgentLibraryService.getStats(agentSlug),
      AgentLibraryService.listSources(agentSlug),
    ]);
    stats = s;
    sources = list.map((r) => ({
      id: r.id,
      title: r.title,
      author: r.author,
      sourceType: r.sourceType,
      category: r.category,
      status: r.status,
      extractionStatus: r.extractionStatus,
      techniqueCount: r._count.techniques,
      createdAt: r.createdAt.toISOString(),
    }));

    if (selectedId) {
      const detail = await AgentLibraryService.getSourceWithTechniques(selectedId);
      if (detail && detail.agentSlug === agentSlug) {
        selected = {
          id: detail.id,
          title: detail.title,
          author: detail.author,
          sourceType: detail.sourceType,
          category: detail.category,
          description: detail.description,
          rawTextPreview: detail.rawText ? detail.rawText.slice(0, 600) : null,
          rawTextTruncated: !!detail.rawText && detail.rawText.length > 600,
          status: detail.status,
          extractionStatus: detail.extractionStatus,
          createdAt: detail.createdAt.toISOString(),
          techniques: detail.techniques.map((t) => ({
            id: t.id,
            techniqueName: t.techniqueName,
            category: t.category,
            purpose: t.purpose,
            principle: t.principle,
            application: t.application,
            usageRule: t.usageRule,
            qualityTest: t.qualityTest,
            goodExample: t.goodExample,
            badExample: t.badExample,
            confidence: t.confidence,
            status: t.status,
          })),
        };
      }
    }
  } catch {
    dbError = true;
  }

  return (
    <LibraryWorkbench
      agents={[...LIBRARY_AGENTS]}
      agentSlug={agentSlug}
      stats={stats}
      sources={sources}
      selected={selected}
      dbError={dbError}
    />
  );
}
