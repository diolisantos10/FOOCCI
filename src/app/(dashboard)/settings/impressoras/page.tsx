"use client";

import { PageCard, SectionHeading } from "../_shared";

export default function ImpressorasPage() {
  return (
    <div className="space-y-5">
      {/* Status atual */}
      <PageCard>
        <SectionHeading
          title="Impressão ativa"
          subtitle="Imprima a comanda pelo botão 🖨️ na tela de cada pedido."
        />
        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
          <p className="font-semibold">✅ Funcionando</p>
          <p className="mt-1 text-green-700">
            Abra um pedido na tela <strong>Pedidos</strong> e clique em{" "}
            <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
              🖨️ Imprimir comanda
            </span>
            .
          </p>
        </div>
      </PageCard>

      {/* Impressão automática ao aceitar */}
      <PageCard>
        <SectionHeading
          title="Impressão automática ao aceitar pedido"
          subtitle="A comanda dispara sozinha quando você aceita um novo pedido."
        />
        <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-800">
          <p className="font-semibold">✅ Ativo por padrão</p>
          <p className="mt-1 text-green-700">
            Na tela de <strong>Pedidos</strong>, o botão{" "}
            <span className="inline-flex items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-600">
              🖨️ Impr. automática
            </span>{" "}
            no topo liga e desliga a impressão automática ao confirmar o pedido.
          </p>
        </div>
      </PageCard>

      {/* Como usar hoje */}
      <PageCard>
        <SectionHeading title="Como usar hoje" subtitle="Fluxo recomendado para o dia a dia." />
        <ol className="space-y-3">
          {[
            <>
              Abra um pedido na tela <span className="font-semibold text-gray-900">Pedidos</span>.
            </>,
            <>
              Clique em{" "}
              <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
                🖨️ Imprimir comanda
              </span>{" "}
              — ou ative a impressão automática para que ela dispare ao aceitar.
            </>,
            <>A comanda é enviada para a impressora. Pronto.</>,
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-orange-100 text-xs font-bold text-orange-700">
                {i + 1}
              </span>
              <span className="text-sm text-gray-700 pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
      </PageCard>

      {/* Foocci Carteiro — em construção (substitui a antiga "Fase 2") */}
      <PageCard>
        <SectionHeading
          title="Foocci Carteiro — impressão automática de verdade"
          subtitle="O agente local que imprime direto na cozinha, sem janela e sem configuração técnica."
        />
        <div className="mb-4 rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-800">
          <p className="font-semibold">🚧 Em construção</p>
          <p className="mt-1 text-indigo-700">
            Um programinha instalado uma única vez no PC do restaurante que imprime cada pedido na
            impressora certa, automaticamente — sem janela do navegador, sem atalhos e sem ajuste de margem.
          </p>
        </div>
        <ul className="space-y-2">
          {[
            "Imprime direto na térmica, sem abrir nenhuma janela",
            "Impressora de caixa e de cada cozinha de forma independente",
            "Distribui cada item para a estação certa (Caixa, Cozinha 1–5, Copa, Cupom)",
            "Reimpressão pelo botão na tela do pedido",
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-300" />
              {text}
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 text-xs text-gray-500">
          A configuração de qual impressora atende cada estação já está em{" "}
          <strong className="text-gray-700">Integrações → Impressão (Cozinhas)</strong>.
        </div>
      </PageCard>

      <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-400">
        Dica: use <strong className="text-gray-600">Salvar como PDF</strong> na janela de impressão
        para guardar uma cópia digital de cada comanda.
      </div>
    </div>
  );
}
