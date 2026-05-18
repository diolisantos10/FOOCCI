import { PageCard, SectionHeading } from "../_shared";

export const metadata = { title: "Impressoras — Configurações" };

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
        {n}
      </span>
      <span className="text-sm text-gray-700 pt-0.5">{children}</span>
    </li>
  );
}

function PhaseItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-sm text-gray-600">
      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
      {children}
    </li>
  );
}

export default function ImpressorasPage() {
  return (
    <div className="space-y-5">
      {/* Status */}
      <PageCard>
        <SectionHeading
          title="Impressão no navegador ativa"
          subtitle="Use o botão 🖨️ Imprimir comanda ou 🔍 Pré-visualizar comanda na tela de cada pedido."
        />
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Impressão automática via impressora térmica de rede estará disponível em breve.
        </div>
      </PageCard>

      {/* Como usar hoje */}
      <PageCard>
        <SectionHeading title="Como usar hoje" subtitle="Fluxo recomendado para o dia a dia." />
        <ol className="space-y-3">
          <Step n={1}>
            Abra um pedido na tela <span className="font-semibold text-gray-900">Pedidos</span>.
          </Step>
          <Step n={2}>
            Clique em{" "}
            <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
              🖨️ Imprimir comanda
            </span>{" "}
            para imprimir diretamente, ou em{" "}
            <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
              🔍 Pré-visualizar comanda
            </span>{" "}
            para conferir antes de imprimir.
          </Step>
          <Step n={3}>
            Confirme a impressão na janela do navegador. A comanda é enviada para a
            impressora padrão do seu computador.
          </Step>
        </ol>
      </PageCard>

      {/* Teste à tarde */}
      <PageCard>
        <SectionHeading
          title="Teste com impressora térmica"
          subtitle="Siga este fluxo ao conectar a impressora pela primeira vez."
        />
        <ol className="space-y-3">
          <Step n={1}>
            Conecte a impressora ao computador e verifique se ela aparece como impressora
            padrão no sistema operacional.
          </Step>
          <Step n={2}>
            Abra qualquer pedido e clique em{" "}
            <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
              🔍 Pré-visualizar comanda
            </span>{" "}
            para confirmar que todos os dados aparecem corretamente na tela.
          </Step>
          <Step n={3}>
            Na pré-visualização, clique em{" "}
            <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
              🖨️ Imprimir agora
            </span>
            .
          </Step>
          <Step n={4}>
            Na janela de impressão do navegador, selecione a impressora térmica e configure:
            <ul className="mt-2 space-y-1 pl-2">
              <li className="text-xs text-gray-500">• Tamanho do papel: <strong className="text-gray-700">80mm × auto</strong> (ou &quot;Rolo&quot;)</li>
              <li className="text-xs text-gray-500">• Margens: <strong className="text-gray-700">Nenhuma / Sem margens</strong></li>
              <li className="text-xs text-gray-500">• Escala: <strong className="text-gray-700">100%</strong> (não ajustar à página)</li>
            </ul>
          </Step>
          <Step n={5}>
            Verifique se o texto cabe dentro dos 72mm da bobina sem cortar. Se a
            fonte ficar pequena demais, aumente a escala para 110–120%.
          </Step>
        </ol>
      </PageCard>

      {/* Fase 2 */}
      <PageCard>
        <SectionHeading title="Fase 2 — Planejado" subtitle="Impressão automática e configuração por impressora." />
        <ul className="space-y-2">
          <PhaseItem>Impressão automática ao confirmar ou preparar o pedido</PhaseItem>
          <PhaseItem>Impressora de caixa e impressora de cozinha independentes</PhaseItem>
          <PhaseItem>Conexão direta via IP/porta (ESC/POS sobre rede TCP)</PhaseItem>
          <PhaseItem>Configuração por restaurante: modelo, IP, porta, categorias de item</PhaseItem>
          <PhaseItem>Reimpressão via botão na tela do pedido após envio automático</PhaseItem>
        </ul>
      </PageCard>

      <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-400">
        Dica: use{" "}
        <strong className="text-gray-600">Salvar como PDF</strong> na janela de
        impressão para gerar uma cópia digital de cada comanda.
      </div>
    </div>
  );
}
