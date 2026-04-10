import { redirect } from "next/navigation";

// The standalone Marketing hub has been replaced by the Marketing section in
// the sidebar (Promoções, CRM, Marca). Redirect old bookmarks to CRM.
export default function MarketingPage() {
  redirect("/crm");
}
