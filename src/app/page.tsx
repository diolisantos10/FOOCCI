/**
 * Landing / root page.
 *
 * In Phase 1 this is a minimal placeholder that redirects
 * authenticated users to the dashboard and unauthenticated
 * users to /login.
 *
 * Replace with a proper marketing/landing page in a later phase.
 */

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export default async function RootPage() {
  const session = await getServerSession(authOptions);

  if (session) {
    redirect("/dashboard");
  } else {
    redirect("/login");
  }
}
