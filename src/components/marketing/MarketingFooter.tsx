/**
 * Marketing footer. Server component.
 * All links point to real routes or on-page anchors (no "#" placeholders).
 */

import Link from "next/link";
import Image from "next/image";

const PRODUTO = [
  { href: "/site/como-funciona", label: "Como funciona" },
  { href: "/site#solucoes", label: "Soluções" },
  { href: "/site#crm", label: "CRM" },
  { href: "/site/precos", label: "Planos" },
  { href: "/site/demonstracao", label: "Demonstração" },
];

const EMPRESA = [
  { href: "/site/sobre", label: "Sobre" },
  { href: "/site/demonstracao", label: "Contato" },
];

const LEGAL = [
  { href: "/site/politica-de-privacidade", label: "Política de privacidade" },
  { href: "/site/termos-de-uso", label: "Termos de uso" },
];

const FOCUS = "focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2";

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            <Link href={l.href} className={`rounded-md text-sm text-gray-600 hover:text-brand-600 ${FOCUS}`}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MarketingFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto max-w-6xl px-5 py-14 lg:px-8">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-1">
            <Link href="/site" className={`inline-flex items-center gap-2.5 rounded-md ${FOCUS}`} aria-label="Foocci">
              <Image
                src="/brand/foocci/foocci-wordmark.png"
                alt="Foocci"
                width={200}
                height={50}
                className="h-6 w-auto"
              />
            </Link>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-gray-600">
              Foocci — sistema inteligente de vendas, relacionamento e fidelização
              para restaurantes.
            </p>
            <p className="mt-3 text-xs font-medium text-gray-400">
              Cardápio, pedido, pagamento e relacionamento no mesmo sistema.
            </p>
          </div>

          <Column title="Produto" links={PRODUTO} />
          <Column title="Empresa" links={EMPRESA} />
          <Column title="Legal" links={LEGAL} />
        </div>

        <div className="mt-12 border-t border-gray-200 pt-6">
          <p className="text-xs text-gray-500">© {year} Foocci. Todos os direitos reservados.</p>
        </div>
      </div>
    </footer>
  );
}
