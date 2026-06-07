/**
 * GET /api/admin/agents/library/sources/[id] — source detail + techniques.
 * Used by the embedded per-agent Library panel (Waiter Room → aba Library).
 *
 * Auth: x-admin-secret header OR foocci-admin-token cookie.
 * Read-only vs. runtime. Copyright-safe: rawText returned only as a short preview.
 */

import { NextRequest, NextResponse } from "next/server";
import { checkAdminRequest } from "@/lib/admin-auth";
import { AgentLibraryService } from "@/services/agentLibrary/AgentLibraryService";
import { isMissingTableError } from "@/services/agentLibrary/agentLibraryHelpers";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!process.env.ADMIN_SECRET) {
    return NextResponse.json({ ok: false, error: "Endpoint disabled — ADMIN_SECRET not configured." }, { status: 403 });
  }
  if (!checkAdminRequest(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const id = params.id?.trim();
  if (!id) return NextResponse.json({ ok: false, error: "id é obrigatório." }, { status: 400 });

  try {
    const detail = await AgentLibraryService.getSourceWithTechniques(id);
    if (!detail) return NextResponse.json({ ok: false, error: "Fonte não encontrada." }, { status: 404 });

    return NextResponse.json({
      ok: true,
      source: {
        id: detail.id,
        agentSlug: detail.agentSlug,
        title: detail.title,
        author: detail.author,
        sourceType: detail.sourceType,
        category: detail.category,
        description: detail.description,
        fileName: detail.fileName,
        hasFile: !!detail.storageKey,
        hasText: !!(detail.rawText && detail.rawText.trim().length > 0),
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
      },
    });
  } catch (err) {
    if (isMissingTableError(err)) {
      return NextResponse.json(
        { ok: false, dbError: true, error: "Migration da Agent Library ainda não aplicada. Rode prisma migrate deploy." },
        { status: 503 },
      );
    }
    return NextResponse.json({ ok: false, error: "Falha ao carregar a fonte." }, { status: 500 });
  }
}
