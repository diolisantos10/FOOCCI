import { PageCard, SectionHeading } from "../_shared";

export const metadata = { title: "Impressoras — Configurações" };

export default function ImpressorasPage() {
  return (
    <div className="space-y-5">
      <PageCard>
        <SectionHeading
          title="Impressão no navegador ativa"
          subtitle="Por enquanto, use o botão 🖨️ Imprimir comanda na tela do pedido."
        />

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-4 text-sm text-blue-800">
          Impressão automática via impressora térmica de rede estará disponível em breve.
        </div>
      </PageCard>

      <PageCard>
        <SectionHeading title="Como usar hoje" />
        <ol className="space-y-3 text-sm text-gray-700">
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
              1
            </span>
            <span>
              Abra um pedido em{" "}
              <span className="font-semibold text-gray-900">Pedidos</span> e clique no
              título para ver os detalhes.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
              2
            </span>
            <span>
              Clique no botão{" "}
              <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
                🖨️ Imprimir comanda
              </span>{" "}
              no canto superior direito da tela do pedido.
            </span>
          </li>
          <li className="flex items-start gap-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
              3
            </span>
            <span>
              Confirme a impressão na janela do navegador. A comanda será enviada para
              a impressora padrão do seu computador.
            </span>
          </li>
        </ol>
      </PageCard>

      <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-400">
        Para melhores resultados, configure a impressora no navegador como{" "}
        <strong className="text-gray-600">sem margens</strong> e selecione{" "}
        <strong className="text-gray-600">Salvar como PDF</strong> para ter uma cópia digital.
      </div>
    </div>
  );
}
