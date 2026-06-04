/**
 * Marketing footer. Server component.
 *
 * Legal pages (Política de privacidade / Termos de uso) do not exist as routes
 * yet, so they point to "#" — documented as missing in the build report.
 */

import Link from "next/link";
import { LOGIN_URL } from "./config";

const PRODUCT_LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#solucoes", label: "Soluções" },
  { href: "#crm", label: "CRM" },
  { href: "#precos", label: "Preços" },
  { href: "#demonstracao", label: "Demonstração" },
];

// Routes that do not exist yet — kept as "#" placeholders (no fake pages).
const LEGAL_LINKS = [
  { href: "#", label: "Política de privacidade" },
  { href: "#", label: "Termos de uso" },
];

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <span className="text-xl font-bold tracking-tight text-[#0B0B0B]">Foocci</span>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-gray-600">
              Foocci — sistema inteligente de vendas, relacionamento e fidelização
              para restaurantes.
            </p>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Produto</h3>
            <ul className="mt-4 space-y-3">
              {PRODUCT_LINKS.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-gray-600 hover:text-brand-600">
                    {l.label}
                  </a>
                </li>
              ))}
              <li>
                <Link href={LOGIN_URL} className="text-sm text-gray-600 hover:text-brand-600">
                  Login
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Legal</h3>
            <ul className="mt-4 space-y-3">
              {LEGAL_LINKS.map((l) => (
                <li key={l.label}>
                  <a href={l.href} className="text-sm text-gray-600 hover:text-brand-600">
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-12 border-t border-gray-200 pt-6">
          <p className="text-xs text-gray-500">© {year} Foocci. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
