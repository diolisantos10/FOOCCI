"use client";

import { useState } from "react";
import { PageCard, SectionHeading } from "../_shared";

export default function ImpressorasPage() {
  const [showKioskGuide, setShowKioskGuide] = useState(false);

  return (
    <div className="space-y-5">
      {/* Status atual */}
      <PageCard>
        <SectionHeading
          title="Impressão no navegador ativa"
          subtitle="Use o botão 🖨️ Imprimir na tela de cada pedido para imprimir a comanda."
        />
        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <p className="font-semibold">Por que a janela de impressão aparece?</p>
          <p className="mt-1 text-amber-700">
            Navegadores comuns (Chrome, Firefox, Edge) exibem o seletor de impressora por segurança.
            Isso é comportamento padrão do navegador — <strong>não é um bug do Foocci</strong>.
            Para imprimir sem janela, use o atalho de impressão silenciosa abaixo.
          </p>
        </div>
      </PageCard>

      {/* Como usar hoje */}
      <PageCard>
        <SectionHeading title="Como usar hoje" subtitle="Fluxo recomendado para o dia a dia." />
        <ol className="space-y-3">
          {[
            <>Abra um pedido na tela <span className="font-semibold text-gray-900">Pedidos</span>.</>,
            <>
              Clique em{" "}
              <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
                🖨️ Imprimir comanda
              </span>{" "}
              para imprimir diretamente.
            </>,
            <>Confirme a impressão na janela do navegador. A comanda é enviada para a impressora padrão.</>,
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                {i + 1}
              </span>
              <span className="text-sm text-gray-700 pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
      </PageCard>

      {/* Impressão silenciosa — kiosk */}
      <PageCard>
        <SectionHeading
          title="Impressão automática sem janela"
          subtitle="Para imprimir direto na impressora padrão, sem o seletor do navegador."
        />

        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800 mb-4">
          <p className="font-semibold">Como funciona</p>
          <p className="mt-1 text-blue-700">
            Impressão silenciosa depende do modo kiosk/app do navegador ou de um agente local.
            Com o atalho abaixo, o Chrome imprime direto na impressora padrão do Windows sem abrir nenhuma janela.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowKioskGuide((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span>🖨️</span>
          {showKioskGuide ? "Ocultar instruções" : "Como ativar impressão silenciosa"}
          <span className="ml-auto text-gray-400">{showKioskGuide ? "▲" : "▼"}</span>
        </button>

        {showKioskGuide && (
          <div className="mt-4 space-y-4">
            {/* Pré-requisito */}
            <div className="rounded-xl border border-gray-100 bg-gray-50 px-4 py-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Pré-requisito</p>
              <p className="text-sm text-gray-700">
                Defina a impressora térmica como <strong>impressora padrão</strong> no Windows
                (Painel de Controle → Dispositivos e Impressoras → clique direito → &quot;Definir como padrão&quot;).
              </p>
            </div>

            {/* Passo a passo */}
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">Passo a passo</p>
              <ol className="space-y-3">
                {[
                  "Clique com o botão direito na área de trabalho e selecione \"Novo → Atalho\".",
                  "No campo de destino, cole o caminho abaixo (ajuste o endereço do Foocci se necessário):",
                  "Dê um nome ao atalho (ex: \"Foocci Pedidos\") e clique em Concluir.",
                  "Use este atalho para abrir o Foocci. O Chrome abrirá em modo kiosk sem barra de endereço.",
                  "Para sair do modo kiosk, pressione Alt + F4.",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                      {i + 1}
                    </span>
                    <span className="text-sm text-gray-700 pt-0.5">{text}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Target Chrome */}
            <div className="rounded-xl border border-gray-200 bg-gray-900 px-4 py-3">
              <p className="text-xs font-semibold text-gray-400 mb-1.5">Destino do atalho (Windows)</p>
              <code className="block text-xs text-green-400 break-all leading-relaxed">
                {`"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing --app=https://app.foocci.com.br/pedidos`}
              </code>
              <p className="mt-2 text-[11px] text-gray-500">
                Se <code className="text-gray-400">--app=</code> causar problemas, substitua por:{" "}
                <code className="text-gray-400">--kiosk --kiosk-printing https://app.foocci.com.br/pedidos</code>
              </p>
            </div>

            {/* Aviso */}
            <div className="rounded-xl border border-yellow-100 bg-yellow-50 px-3 py-2.5 text-xs text-yellow-800">
              <strong>Atenção:</strong> Mantenha este computador dedicado à tela operacional de pedidos.
              No modo kiosk, o Chrome ocupa a tela inteira. Use Alt + F4 para sair.
            </div>
          </div>
        )}
      </PageCard>

      {/* Impressora térmica — config */}
      <PageCard>
        <SectionHeading
          title="Teste com impressora térmica"
          subtitle="Siga este fluxo ao conectar a impressora pela primeira vez."
        />
        <ol className="space-y-3">
          {[
            "Conecte a impressora ao computador e verifique se ela aparece como impressora padrão.",
            <>
              Abra qualquer pedido e clique em{" "}
              <span className="inline-flex items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-0.5 text-xs font-medium text-gray-700">
                🖨️ Imprimir comanda
              </span>{" "}
              para confirmar que todos os dados aparecem corretamente.
            </>,
            "Na janela de impressão, selecione a impressora térmica.",
            <>
              Configure:
              <ul className="mt-2 space-y-1 pl-2">
                <li className="text-xs text-gray-500">• Tamanho do papel: <strong className="text-gray-700">80mm × auto</strong> (ou &quot;Rolo&quot;)</li>
                <li className="text-xs text-gray-500">• Margens: <strong className="text-gray-700">Nenhuma / Sem margens</strong></li>
                <li className="text-xs text-gray-500">• Escala: <strong className="text-gray-700">100%</strong> (não ajustar à página)</li>
              </ul>
            </>,
            "Verifique se o texto cabe dentro dos 72mm da bobina. Se a fonte ficar pequena, aumente para 110–120%.",
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
                {i + 1}
              </span>
              <span className="text-sm text-gray-700 pt-0.5">{text}</span>
            </li>
          ))}
        </ol>
      </PageCard>

      {/* Fase 2 */}
      <PageCard>
        <SectionHeading title="Fase 2 — Foocci Print Agent" subtitle="Impressão automática sem configurar o navegador." />
        <ul className="space-y-2">
          {[
            "Aplicativo local instalado no computador da operação",
            "Imprime direto na térmica sem abrir nenhuma janela",
            "Impressora de caixa e impressora de cozinha independentes",
            "Conexão direta via IP/porta (ESC/POS sobre rede TCP)",
            "Reimpressão via botão na tela do pedido",
          ].map((text, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
              <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-gray-300" />
              {text}
            </li>
          ))}
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
