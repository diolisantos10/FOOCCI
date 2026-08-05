/**
 * "O CRM na prática" — /site/como-funciona.
 *
 * Reconstrução em código dos prints reais que o CEO tirou do painel (03/08/2026):
 * visão geral da base, campanhas ativas, conversões comprovadas, migração de base
 * e programa de relacionamento. Os NÚMEROS são reais, de um restaurante operando
 * no Foocci em julho/2026. Nomes de clientes e do restaurante foram trocados para
 * proteger a privacidade — a nota no fim da seção declara isso ao visitante.
 *
 * Telas em código (não imagem) de propósito: nítidas em qualquer tamanho e fáceis
 * de atualizar quando o CEO mandar prints novos.
 */

import { Eyebrow, PremiumCard } from "./premium";

/* ── Dados dos prints (03/08/2026) — nomes anonimizados, valores reais ── */

const FAIXAS = [
  { valor: "5.081", rotulo: "Clientes na base", cor: "text-blue-600" },
  { valor: "107", rotulo: "Quentes · compraram nos últimos 30 dias", cor: "text-red-600" },
  { valor: "92", rotulo: "Mornos · 31–60 dias sem comprar", cor: "text-amber-600" },
  { valor: "151", rotulo: "Frios · 61–120 dias sem comprar", cor: "text-sky-600" },
  { valor: "2.993", rotulo: "Perdidos · mais de 120 dias", cor: "text-gray-500" },
  { valor: "1.736", rotulo: "Cadastraram e nunca pediram", cor: "text-orange-600" },
];

// Alturas relativas do gráfico "receita por dia" do print (forma, não escala exata)
const BARRAS = [8, 10, 0, 0, 7, 6, 22, 0, 0, 9, 11, 8, 0, 14, 10, 30, 34, 9, 13, 13, 0, 12];

const CAMPANHAS = [
  { nome: "Bem-vindo / 2ª compra", publico: "acabou de pedir a 1ª vez", receita: "R$ 745,40", conversao: "6%" },
  { nome: "Aniversário", publico: "aniversariantes do dia", receita: "R$ 212,38", conversao: "7%" },
  { nome: "Cliente perdido", publico: "some há mais de 120 dias", receita: "R$ 168,70", conversao: null },
  { nome: "Cliente quente esfriando", publico: "prestes a esfriar", receita: "R$ 165,12", conversao: "3%" },
  { nome: "Indique um amigo", publico: "clientes satisfeitos", receita: "R$ 131,90", conversao: null },
  { nome: "Carrinho abandonado", publico: "quem parou no meio", receita: "automática", conversao: null },
];

const CONVERSOES = [
  {
    nome: "Gustavo P.",
    campanha: "Cliente quente esfriando",
    mensagem: "“Gustavo, que tal um agrado hoje? 🥳 O restaurante tá pronto pra te atender — e tem presente: você ganhou 10% de desconto! É só usar no pedido pelo cardápio. ❤️”",
    caminho: "Enviada 29/07, 18:29 · Pedido 30/07, 18:05",
    tempo: "converteu em 24 h",
    valor: "+ R$ 58,32",
  },
  {
    nome: "Larissa M.",
    campanha: "Aniversário",
    mensagem: "“Larissa, hoje é seu dia! 🎉 Você ganhou 10% de desconto de presente — use até 23/08, só em pedidos online.”",
    caminho: "Enviada 24/07, 19:13 · Pedido 28/07, 19:43",
    tempo: "converteu em 4 dias",
    valor: "+ R$ 144,50",
  },
  {
    nome: "Marina C.",
    campanha: "Bem-vindo / 2ª compra",
    mensagem: "“Oi, Marina! A gente adorou te atender 🤝 Quando bater a fome, é só chamar.”",
    caminho: "Enviada 26/07, 18:56 · Pedido 27/07, 11:48",
    tempo: "converteu em 17 h",
    valor: "+ R$ 55,90",
  },
];

const MIGRACAO = [
  { faixa: "Quentes", inicio: "120", agora: "113", entraram: "+80", sairam: "−87" },
  { faixa: "Mornos", inicio: "73", agora: "87", entraram: "+87", sairam: "−73" },
  { faixa: "Frios", inicio: "177", agora: "150", entraram: "+57", sairam: "−84" },
  { faixa: "Perdidos", inicio: "2.950", agora: "2.993", entraram: "+67", sairam: "−24" },
];

const NIVEIS = [
  { nome: "Bronze", emoji: "🥉", clientes: "5.076 clientes", regra: "todos os novos clientes", borda: "border-orange-200 bg-orange-50/50" },
  { nome: "Prata", emoji: "🥈", clientes: "4 clientes", regra: "a partir de R$ 800", borda: "border-gray-200 bg-gray-50" },
  { nome: "Ouro", emoji: "🥇", clientes: "1 cliente", regra: "a partir de R$ 1.300", borda: "border-amber-200 bg-amber-50/60" },
  { nome: "Diamante", emoji: "💎", clientes: "VIPs", regra: "a partir de R$ 2.000", borda: "border-sky-200 bg-sky-50/60" },
];

/* ── Blocos ── */

function BlocoTexto({ eyebrow, titulo, children }: { eyebrow: string; titulo: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h3 className="mt-3 text-2xl font-semibold tracking-tight text-[#0B0B0B] sm:text-3xl">{titulo}</h3>
      <div className="mt-3 text-base leading-relaxed text-gray-600 sm:text-lg">{children}</div>
    </div>
  );
}

export function CrmRealShowcase() {
  return (
    <section id="crm-na-pratica" aria-labelledby="crm-pratica-title" className="scroll-mt-20 bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-6xl px-5 lg:px-8">
        {/* Cabeçalho da seção */}
        <div className="mx-auto max-w-3xl text-center">
          <Eyebrow>O CRM na prática</Eyebrow>
          <h2 id="crm-pratica-title" className="mt-3 text-3xl font-semibold tracking-tight text-[#0B0B0B] sm:text-4xl">
            Isto não é promessa. São telas reais, com números reais.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-gray-600">
            Um restaurante operando no Foocci, julho de 2026. O CRM classificou a
            base, mandou as mensagens certas e provou, pedido a pedido, quanto
            trouxe de volta.
          </p>
        </div>

        {/* 1 · Radar da base + receita */}
        <div className="mt-16">
          <BlocoTexto eyebrow="1 · O radar da base" titulo="O Foocci sabe quem está esquentando — e quem está indo embora.">
            Cada cliente entra sozinho numa faixa: quente, morno, frio, perdido.
            Sem planilha, sem esforço do restaurante.
          </BlocoTexto>
          <PremiumCard className="mx-auto mt-8 max-w-4xl p-6 sm:p-8">
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {FAIXAS.map((f) => (
                <div key={f.rotulo} className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
                  <p className={`text-xl font-semibold ${f.cor}`}>{f.valor}</p>
                  <p className="mt-1 text-[11px] leading-snug text-gray-500">{f.rotulo}</p>
                </div>
              ))}
            </div>
            <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Receita gerada pelo CRM · um mês</p>
                <p className="text-lg font-semibold text-green-600">R$ 2.272,90</p>
              </div>
              <div className="mt-3 flex h-16 items-end gap-1" aria-hidden>
                {BARRAS.map((h, i) => (
                  <span key={i} className="flex-1 rounded-t bg-green-500/80" style={{ height: `${Math.max(h, 1.5) * 2.6}%` }} />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                <span><strong className="text-gray-800">4.281</strong> mensagens enviadas</span>
                <span><strong className="text-gray-800">20</strong> campanhas</span>
                <span><strong className="text-gray-800">24</strong> conversões comprovadas no mês</span>
              </div>
            </div>
          </PremiumCard>
        </div>

        {/* 2 · Campanhas que rodam sozinhas */}
        <div className="mt-20">
          <BlocoTexto eyebrow="2 · Campanhas no automático" titulo="12 campanhas rodando sozinhas, todos os dias.">
            Boas-vindas, aniversário, cliente sumido, carrinho abandonado — cada uma
            com o próprio público, horário e limite diário. O restaurante não aperta botão.
          </BlocoTexto>
          <PremiumCard className="mx-auto mt-8 max-w-4xl overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-5 py-3 font-semibold">Campanha</th>
                    <th className="px-5 py-3 font-semibold">Quem recebe</th>
                    <th className="px-5 py-3 text-right font-semibold">Receita no mês</th>
                    <th className="px-5 py-3 text-right font-semibold">Conversão</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {CAMPANHAS.map((c) => (
                    <tr key={c.nome}>
                      <td className="px-5 py-3">
                        <span className="font-semibold text-gray-900">{c.nome}</span>{" "}
                        <span className="ml-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-700">ativa</span>
                      </td>
                      <td className="px-5 py-3 text-gray-600">{c.publico}</td>
                      <td className="px-5 py-3 text-right font-semibold text-green-600">{c.receita}</td>
                      <td className="px-5 py-3 text-right text-gray-600">{c.conversao ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 text-sm">
                  <tr>
                    <td className="px-5 py-3 font-semibold text-gray-700">12 campanhas no total</td>
                    <td className="px-5 py-3 text-gray-500">22.031 de audiência somada</td>
                    <td className="px-5 py-3 text-right font-semibold text-green-700">R$ 1.653,20</td>
                    <td className="px-5 py-3 text-right text-gray-500">no período</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </PremiumCard>
        </div>

        {/* 3 · Prova pedido a pedido */}
        <div className="mt-20">
          <BlocoTexto eyebrow="3 · A prova, pedido a pedido" titulo="A mensagem enviada — e o pedido que ela trouxe.">
            O Foocci não estima: ele mostra a mensagem, o dia do envio, o pedido que
            veio depois e quanto valeu. No mês do print: <strong className="text-gray-900">34 conversões
            comprovadas, R$ 3.547,06</strong>.
          </BlocoTexto>
          <div className="mx-auto mt-8 grid max-w-5xl gap-5 lg:grid-cols-3">
            {CONVERSOES.map((c) => (
              <PremiumCard key={c.nome} className="flex flex-col p-6">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="font-semibold text-gray-900">{c.nome}</p>
                  <p className="text-lg font-semibold text-green-600">{c.valor}</p>
                </div>
                <p className="mt-0.5 text-xs text-gray-500">Campanha: {c.campanha}</p>
                <p className="mt-4 flex-1 rounded-xl bg-gray-50 p-4 text-sm italic leading-relaxed text-gray-700">
                  {c.mensagem}
                </p>
                <p className="mt-4 text-xs text-gray-500">{c.caminho}</p>
                <p className="mt-1 text-xs font-semibold text-brand-600">{c.tempo}</p>
              </PremiumCard>
            ))}
          </div>
        </div>

        {/* 4 · Migração de base */}
        <div className="mt-20">
          <BlocoTexto eyebrow="4 · A escada em movimento" titulo="80 clientes voltaram a pedir em 30 dias.">
            Todo mês a base se move: quem esquentou, quem esfriou, quem foi
            reconquistado. O Foocci mostra o movimento — e as campanhas agem sobre ele.
          </BlocoTexto>
          <PremiumCard className="mx-auto mt-8 max-w-4xl p-6 sm:p-8">
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-xl border border-green-100 bg-green-50/60 p-4 text-center">
                <p className="text-2xl font-semibold text-green-700">80</p>
                <p className="text-xs text-gray-600">reativações · voltaram a pedir</p>
              </div>
              <div className="rounded-xl border border-orange-100 bg-orange-50/60 p-4 text-center">
                <p className="text-2xl font-semibold text-orange-600">23</p>
                <p className="text-xs text-gray-600">novos ativos · 1º pedido no período</p>
              </div>
              <div className="rounded-xl border border-sky-100 bg-sky-50/60 p-4 text-center">
                <p className="text-2xl font-semibold text-sky-600">211</p>
                <p className="text-xs text-gray-600">esfriaram — e viraram alvo de campanha</p>
              </div>
            </div>
            <div className="mt-6 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="py-2 pr-4 font-semibold">Faixa</th>
                    <th className="py-2 pr-4 text-right font-semibold">Início</th>
                    <th className="py-2 pr-4 text-right font-semibold">Agora</th>
                    <th className="py-2 pr-4 text-right font-semibold">Entraram</th>
                    <th className="py-2 text-right font-semibold">Saíram</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {MIGRACAO.map((m) => (
                    <tr key={m.faixa}>
                      <td className="py-2.5 pr-4 font-semibold text-gray-900">{m.faixa}</td>
                      <td className="py-2.5 pr-4 text-right text-gray-600">{m.inicio}</td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-gray-900">{m.agora}</td>
                      <td className="py-2.5 pr-4 text-right text-green-600">{m.entraram}</td>
                      <td className="py-2.5 text-right text-red-500">{m.sairam}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-gray-500">
              Entre as reconquistas do mês: <strong className="text-gray-700">24 clientes dados como perdidos</strong>{" "}
              e 23 que nunca tinham pedido fizeram o primeiro pedido.
            </p>
          </PremiumCard>
        </div>

        {/* 5 · Programa de relacionamento */}
        <div className="mt-20">
          <BlocoTexto eyebrow="5 · Níveis de relacionamento" titulo="Bronze, Prata, Ouro e Diamante — recalculados todo dia.">
            O restaurante define as regras uma vez; o Foocci reclassifica os
            clientes diariamente e trata cada nível do jeito que ele merece.
          </BlocoTexto>
          <div className="mx-auto mt-8 grid max-w-4xl grid-cols-2 gap-4 lg:grid-cols-4">
            {NIVEIS.map((n) => (
              <div key={n.nome} className={`rounded-2xl border p-5 text-center ${n.borda}`}>
                <p className="text-2xl" aria-hidden>{n.emoji}</p>
                <p className="mt-1 font-semibold text-gray-900">{n.nome}</p>
                <p className="mt-0.5 text-xs text-gray-600">{n.clientes}</p>
                <p className="mt-2 text-[11px] text-gray-500">{n.regra}</p>
              </div>
            ))}
          </div>
        </div>

        {/*
          SEM BOTÃO AQUI (05/08), pelo mesmo motivo do `WaiterRealShowcase`: ele
          ficava a uma tela da faixa de fechamento e convidava antes da nota que
          sustenta os números. O convite da página é a `CtaBand`, no fim.
        */}
        <div className="mt-16 text-center">
          <p className="mx-auto max-w-2xl text-xs leading-relaxed text-gray-400">
            Números reais de um restaurante operando no Foocci em julho/2026,
            reproduzidos das telas do painel. Nomes de clientes e do restaurante
            foram alterados para proteger a privacidade. Resultados variam por
            operação — nenhum número aqui é promessa.
          </p>
        </div>
      </div>
    </section>
  );
}
