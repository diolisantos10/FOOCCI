import { redirect } from "next/navigation";

/**
 * /admin/agentes has no index content — redirect straight to the
 * Training Center, which lives at /admin/agentes/training.
 */
export default function AgentesIndexPage() {
  redirect("/admin/agentes/training");
}
