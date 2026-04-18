import { redirect } from "next/navigation";

/**
 * /conversations — redirected to /atendimento
 *
 * Atendimento centralizes all customer communication.
 * This route is kept to avoid dead links but forwards immediately.
 */
export default function ConversationsRedirectPage() {
  redirect("/atendimento");
}
