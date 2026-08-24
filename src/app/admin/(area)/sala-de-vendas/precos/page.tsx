/**
 * Admin → Sala de Vendas → Preços.
 *
 * ── POR QUE ESTA TELA EXISTE ────────────────────────────────────────────────
 *
 * "Quanto custa?" é a primeira pergunta de todo lead de restaurante. Até esta
 * tela, a Sala não tinha resposta: o site publica os três valores desde 04/08 e
 * todas as fichas comerciais carregam a trava "não pode dar preço".
 *
 * A trava está certa e continua de pé — ela proíbe **negociar**. Repetir o que
 * está estampado na página pública é outra coisa, e negá-lo ao lead não protege
 * nada: só faz a empresa parecer que esconde preço.
 *
 * ── POR QUE É SERVIDOR, SEM ROTA E SEM `fetch` ──────────────────────────────
 *
 * As outras telas da Sala buscam dado de lead, que é escopado por pessoa e
 * protegido por RLS. Esta não busca nada: a tabela é derivada da fonte única de
 * preço, é a mesma coisa para todo mundo, e já é pública no site.
 *
 * Criar uma rota `/api/admin/sala-de-vendas/precos` para servir dado público a
 * uma tela que pode calculá-lo no próprio render seria uma porta a mais para
 * guardar, sem nada atrás dela.
 *
 * ── O QUE ELA MOSTRA DE PROPÓSITO ───────────────────────────────────────────
 *
 * A metade de baixo — "o que você NÃO pode responder" — é tão importante quanto
 * a de cima. Um vendedor que sabe o preço e não sabe o limite do desconto
 * inventa o limite. Deixar as quatro lacunas escritas, com o nome de quem
 * decide, é o que transforma "não sei" numa resposta profissional em vez de uma
 * hesitação.
 */

import {
  tabelaPublicada,
  descontoPublicado,
  oQueAindaNaoSeSabe,
  type AssuntoEmAberto,
} from "@/services/salaDeVendas/precos";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preços · Sala de Vendas" };

/** O nome da pergunta, do jeito que o lead faz. Não o nome da chave. */
const COMO_O_LEAD_PERGUNTA: Record<AssuntoEmAberto, string> = {
  descontoAlemDaTabela: "“Consegue fazer um preço melhor?”",
  prazoDeImplantacao: "“Em quanto tempo fica pronto?”",
  formaDePagamento: "“Dá para pagar como?”",
  quemPodeFechar: "“Quem me dá essa condição por escrito?”",
};

export default function PrecosDaSalaPage() {
  const planos = tabelaPublicada();
  const desconto = descontoPublicado();
  const abertos = oQueAindaNaoSeSabe();

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">Preços</h1>
          <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            Isto é exatamente o que está publicado no site e o que o cartão cobra —
            a mesma fonte, não uma cópia. <strong className="text-ink2">Você pode
            informar estes valores.</strong> Negociar em cima deles é outra coisa,
            e está na metade de baixo desta tela.
          </p>
        </header>

        {/* ── A TABELA ─────────────────────────────────────────────────────── */}
        <section aria-labelledby="tabela-titulo" className="mb-6">
          <h2 id="tabela-titulo" className="sr-only">
            Tabela de preços publicada
          </h2>

          <div className="space-y-3">
            {planos.map((plano) => (
              <article
                key={plano.id}
                className="overflow-hidden rounded-xl border border-line bg-paper"
              >
                <div className="border-b border-line px-4 py-2.5">
                  <h3 className="text-[15px] font-semibold text-ink">{plano.nome}</h3>
                </div>

                {/* ── CELULAR: EMPILHADO, NÃO TABELA ─────────────────────────
                    A primeira versão desta tela era só a tabela, rolando de lado
                    dentro do cartão. No celular isso escondia a coluna "1ª
                    cobrança" — que é exatamente o número que o lead pede ("quanto
                    eu pago hoje?"). Rolagem lateral dentro de um cartão não se
                    anuncia: o vendedor não descobriria que existe mais coluna.

                    Quatro colunas não cabem em 390px, e insistir na tabela seria
                    escolher a forma em vez do uso. */}
                <dl className="divide-y divide-line sm:hidden">
                  {plano.ciclos.map((c) => (
                    <div key={c.ciclo} className="px-4 py-3">
                      <dt className="text-[11.5px] font-semibold uppercase tracking-wide text-muted">
                        {c.nome}
                      </dt>
                      <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                        <span className="tabular-nums text-[15px] font-semibold text-ink">
                          {c.doCiclo}
                        </span>
                        <span className="text-[12px] text-muted">
                          por cobrança · equivale a {c.equivalenteAoMes}/mês
                        </span>
                      </dd>
                      <dd className="mt-1 text-[12.5px] text-ink2">
                        1ª cobrança{" "}
                        <span className="tabular-nums font-semibold text-ink">
                          {c.primeiraCobranca}
                        </span>
                        <span className="ml-1 text-emerald-700">
                          −{c.abatimentoNaPrimeira}
                        </span>
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Da largura de tablet para cima, a tabela cabe e compara melhor. */}
                <div className="hidden overflow-x-auto sm:block">
                  <table className="w-full min-w-[34rem] text-left text-[13px]">
                    <thead className="text-[11.5px] uppercase tracking-wide text-muted">
                      <tr className="border-b border-line">
                        <th scope="col" className="px-4 py-2 font-semibold">Ciclo</th>
                        <th scope="col" className="px-4 py-2 font-semibold">Cobrança</th>
                        <th scope="col" className="px-4 py-2 font-semibold">Equivale a</th>
                        <th scope="col" className="px-4 py-2 font-semibold">
                          1ª cobrança
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {plano.ciclos.map((c) => (
                        <tr key={c.ciclo} className="border-b border-line last:border-0">
                          <td className="px-4 py-2.5 font-medium text-ink">{c.nome}</td>
                          <td className="px-4 py-2.5 tabular-nums text-ink">{c.doCiclo}</td>
                          <td className="px-4 py-2.5 tabular-nums text-muted">
                            {c.equivalenteAoMes}
                            <span className="ml-1 text-[11.5px]">/mês</span>
                          </td>
                          <td className="px-4 py-2.5">
                            <span className="tabular-nums font-semibold text-ink">
                              {c.primeiraCobranca}
                            </span>
                            <span className="ml-1.5 text-[11.5px] text-emerald-700">
                              −{c.abatimentoNaPrimeira}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            ))}
          </div>

          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            <strong className="text-ink2">“Equivale a”</strong> é só para comparar —
            ninguém é cobrado nesse valor. O que sai do cartão é a coluna
            “Cobrança”, de uma vez, a cada renovação do ciclo.
          </p>
        </section>

        {/* ── O DESCONTO QUE EXISTE ────────────────────────────────────────── */}
        {desconto.sabe && (
          <section
            aria-labelledby="desconto-titulo"
            className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4"
          >
            <h2
              id="desconto-titulo"
              className="text-[13px] font-semibold uppercase tracking-wide text-emerald-800"
            >
              O único desconto que existe
            </h2>
            <p className="mt-1.5 max-w-[68ch] text-[13.5px] leading-relaxed text-emerald-900">
              {desconto.valor.regra}
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-emerald-800">
              Ele <strong>já está</strong> na coluna “1ª cobrança” acima — você
              informa, não concede. Não há nada a somar por cima.
            </p>
          </section>
        )}

        {/* ── O QUE A EMPRESA AINDA NÃO DECIDIU ────────────────────────────── */}
        <section aria-labelledby="abertos-titulo">
          <h2
            id="abertos-titulo"
            className="text-[13px] font-semibold uppercase tracking-wide text-ink2"
          >
            O que você NÃO pode responder — e não é falha sua
          </h2>
          <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            Estas quatro perguntas aparecem em quase toda negociação e{" "}
            <strong className="text-ink2">a empresa ainda não decidiu</strong>. Não
            existe resposta certa guardada em algum lugar que você não achou.
            Responder “vou confirmar e te trago hoje” é a saída profissional;
            improvisar um número é o que vira problema na assinatura.
          </p>

          <ul className="mt-3 space-y-2">
            {abertos.map((a) => (
              <li
                key={a.assunto}
                className="rounded-xl border border-amber-200 bg-amber-50 p-3.5"
              >
                <p className="text-[13.5px] font-semibold text-amber-900">
                  {COMO_O_LEAD_PERGUNTA[a.assunto]}
                </p>
                <p className="mt-1 max-w-[68ch] text-[12.5px] leading-relaxed text-amber-900/85">
                  {a.motivo}
                </p>
                <p className="mt-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-amber-800">
                  Decide: {a.decideQuem}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
