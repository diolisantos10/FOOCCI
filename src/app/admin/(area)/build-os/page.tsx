/**
 * Admin → Build OS (Priority 1.2, READ-ONLY).
 *
 * Server loader: fetches commands + the project registry via the buildos
 * services (DB-backed, defensive — never throw) and hands them to the client
 * tab dashboard (Comandos · Projetos · Configuração). No public API, no editing,
 * no sending, no Claude/GitHub/LLM.
 */

import { getBuildCommandsForAdmin } from "@/services/buildos/BuildCommandService";
import { getAllBuildProjects } from "@/services/buildos/BuildProjectService";
import type { AdminBuildCommandView } from "@/services/buildos/types";
import type { BuildProjectView } from "@/services/buildos/BuildProjectService";
import { BuildOsDashboard } from "./BuildOsDashboard";

export const dynamic = "force-dynamic";

export default async function AdminBuildOsPage() {
  let commands: AdminBuildCommandView[] = [];
  let projects: BuildProjectView[] = [];
  let loadError = false;

  try {
    [commands, projects] = await Promise.all([
      getBuildCommandsForAdmin(),
      getAllBuildProjects(),
    ]);
  } catch {
    loadError = true;
  }

  return (
    <BuildOsDashboard commands={commands} projects={projects} loadError={loadError} />
  );
}
