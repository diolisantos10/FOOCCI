import { redirect } from "next/navigation";

// Brand settings consolidated under /settings/marca
export default function MarcaRedirectPage() {
  redirect("/settings/marca");
}
