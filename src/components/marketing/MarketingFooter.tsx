/**
 * Marketing footer. Server component.
 *
 * Links point only to real routes or on-page anchors. Pages that do not exist
 * yet (Sobre, Política de privacidade, Termos de uso) use "#" — documented as
 * missing in the build report. "Contato" points to the on-page demo section.
 */

const PRODUTO = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#solucoes", label: "Soluções" },
  { href: "#crm", label: "CRM" },
  { href: "#precos", label: "Preços" },
  { href: "#demonstracao", label: "Demonstração" },
];

// "Sobre" page does not exist yet → "#". "Contato" → on-page demo section.
const EMPRESA = [
  { href: "#", label: "Sobre" },
  { href: "#demonstracao", label: "Contato" },
];

// Legal pages do not exist yet → "#".
const LEGAL = [
  { href: "#", label: "Política de privacidade" },
  { href: "#", label: "Termos de uso" },
];

function Column({ title, links }: { title: string; links: { href: string; label: string }[] }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-widest text-gray-400">{title}</h3>
      <ul className="mt-4 space-y-3">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} className="text-sm text-gray-600 hover:text-brand-600">
              {l.label}
            </a>
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
            <span className="text-xl font-bold tracking-tight text-[#0B0B0B]">Foocci</span>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-gray-600">
              Foocci — sistema inteligente de vendas, relacionamento e fidelização
              para restaurantes.
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
