/**
 * Seeds (idempotently) the lojista how-to guides as published + agent-visible
 * manual chapters, so the in-app help assistant can answer with them right away.
 * Re-running updates the content in place (keyed by slug).
 */

import { prisma } from "@/lib/prisma";
import { HOW_TO_GUIDES } from "./howToGuidesContent";

export async function seedHowToGuides(): Promise<{ upserted: number }> {
  let upserted = 0;

  for (const g of HOW_TO_GUIDES) {
    await prisma.operationalManualChapter.upsert({
      where: { slug: g.slug },
      create: {
        slug: g.slug,
        title: g.title,
        area: g.area,
        description: g.description,
        content: g.content,
        status: "IMPLEMENTED",
        version: "1.0",
        isPublished: true,
        publishedAt: new Date(),
        agentVisibility: true,
        createdBy: "howto-seed",
        updatedBy: "howto-seed",
      },
      update: {
        title: g.title,
        area: g.area,
        description: g.description,
        content: g.content,
        status: "IMPLEMENTED",
        isPublished: true,
        publishedAt: new Date(),
        agentVisibility: true,
        updatedBy: "howto-seed",
      },
    });
    upserted++;
  }

  return { upserted };
}
