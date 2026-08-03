/**
 * /api/admin/demo-videos — vídeos exibidos em /site/demonstracao.
 *
 * GET    → todos (publicados e rascunhos), na ordem do site
 * POST   → cria { title, youtubeUrl, description?, sortOrder?, published? }
 * PATCH  → atualiza { id, ...campos }
 * DELETE → remove (?id=...)
 *
 * A URL do YouTube é validada aqui (watch / youtu.be / shorts / embed): URL que
 * não rende embed viraria um quadro quebrado na página pública.
 */

import { NextRequest } from "next/server";
import { z } from "zod";
import { checkAdminRequest } from "@/lib/admin-auth";
import { ok, unauthorized, badRequest, notFound, serverError } from "@/lib/api-response";
import { prisma } from "@/lib/prisma";
import { youtubeVideoId } from "@/lib/site/youtube";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  try {
    const videos = await prisma.demoVideo.findMany({
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return ok({ videos });
  } catch (e) {
    console.error("[admin/demo-videos] GET", e);
    return serverError("Falha ao carregar os vídeos.");
  }
}

const createSchema = z.object({
  title:       z.string().trim().min(2, "Informe um título.").max(160),
  youtubeUrl:  z.string().trim().url("Informe uma URL válida."),
  description: z.string().trim().max(500).optional().nullable(),
  sortOrder:   z.number().int().min(0).max(9999).optional(),
  published:   z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  const raw = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  if (!youtubeVideoId(parsed.data.youtubeUrl)) {
    return badRequest("Essa URL não parece ser de um vídeo do YouTube.");
  }
  try {
    const video = await prisma.demoVideo.create({
      data: {
        title:       parsed.data.title,
        youtubeUrl:  parsed.data.youtubeUrl,
        description: parsed.data.description || null,
        sortOrder:   parsed.data.sortOrder ?? 0,
        published:   parsed.data.published ?? true,
      },
    });
    return ok({ video });
  } catch (e) {
    console.error("[admin/demo-videos] POST", e);
    return serverError("Falha ao salvar o vídeo.");
  }
}

const patchSchema = createSchema.partial().extend({ id: z.string().min(1) });

export async function PATCH(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  const raw = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) return badRequest(parsed.error.issues[0]?.message ?? "Dados inválidos.");
  if (parsed.data.youtubeUrl && !youtubeVideoId(parsed.data.youtubeUrl)) {
    return badRequest("Essa URL não parece ser de um vídeo do YouTube.");
  }
  const { id, ...fields } = parsed.data;
  try {
    const video = await prisma.demoVideo.update({
      where: { id },
      data: {
        ...(fields.title !== undefined ? { title: fields.title } : {}),
        ...(fields.youtubeUrl !== undefined ? { youtubeUrl: fields.youtubeUrl } : {}),
        ...(fields.description !== undefined ? { description: fields.description || null } : {}),
        ...(fields.sortOrder !== undefined ? { sortOrder: fields.sortOrder } : {}),
        ...(fields.published !== undefined ? { published: fields.published } : {}),
      },
    });
    return ok({ video });
  } catch (e) {
    console.error("[admin/demo-videos] PATCH", e);
    return notFound("Vídeo não encontrado.");
  }
}

export async function DELETE(req: NextRequest) {
  if (!checkAdminRequest(req)) return unauthorized();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return badRequest("Informe o id do vídeo.");
  try {
    await prisma.demoVideo.delete({ where: { id } });
    return ok({ deleted: true });
  } catch (e) {
    console.error("[admin/demo-videos] DELETE", e);
    return notFound("Vídeo não encontrado.");
  }
}
