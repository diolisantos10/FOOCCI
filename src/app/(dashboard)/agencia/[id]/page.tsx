import { Suspense } from "react";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getTenantId } from "@/lib/tenant";
import { TopBar } from "@/components/layout/TopBar";
import { ProjectDetailClient } from "./ProjectDetailClient";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export default async function ProjectDetailPage({ params }: Params) {
  const { id } = await params;

  let restaurantId: string | null = null;
  try { restaurantId = getTenantId(); } catch { /* unauthenticated */ }
  if (!restaurantId) notFound();

  const project = await prisma.agencyProject.findFirst({
    where:   { id, restaurantId },
    include: { strategySession: true },
  });
  if (!project) notFound();

  const serialized = {
    ...project,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString(),
    services: project.services as string[],
    strategySession: project.strategySession
      ? {
          ...project.strategySession,
          createdAt:   project.strategySession.createdAt.toISOString(),
          updatedAt:   project.strategySession.updatedAt.toISOString(),
          generatedAt: project.strategySession.generatedAt.toISOString(),
        }
      : null,
  };

  return (
    <>
      <TopBar title={project.name} />
      <Suspense fallback={
        <div className="flex items-center justify-center py-24 text-sm text-gray-400">
          Carregando…
        </div>
      }>
        <ProjectDetailClient project={serialized} />
      </Suspense>
    </>
  );
}
