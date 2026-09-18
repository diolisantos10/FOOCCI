"use client";

/**
 * QUALIFICAÇÃO / LEAD SCORE — o termômetro e a conta.
 *
 * ── O QUE ESTA TELA SE RECUSA A DESENHAR ────────────────────────────────────
 *
 * O desenho do CEO mostra quatro degraus: FRIO, MORNO, QUENTE e PRONTO PARA
 * COMPRAR. O banco tem seis valores de temperatura, e um sétimo estado que não
 * é temperatura nenhuma: o lead que ninguém pontuou.
 *
 * Desenhar só os quatro faria a soma da tela ficar menor que a base, sem
 * explicação. Jogar o não pontuado em FRIO seria pior: zero diria "avaliado e
 * não presta", e o lead que ninguém olhou sumiria dentro do monte dos que
 * alguém olhou e descartou. Então os quatro degraus vêm com o nome do desenho
 * ao lado do nome do banco, os extras vêm depois, e o não classificado tem
 * quadro próprio — porque ele não é um resultado, é uma fila de trabalho.
 *
 * ── E A RÉGUA NÃO É DIGITADA AQUI ───────────────────────────────────────────
 *
 * As faixas ("QUENTE é de 60 a 79") chegam prontas do serviço, que as lê de
 * `temperaturaDe` varrendo a régua. Nenhum número desta tela é constante.
 */

import { useCallback, useEffect, useState } from "react";
import type { PanoramaDaQualificacao } from "@/services/salaDeVendas/telas/qualificacao";
import {
  buscarPainel,
  Carregando,
  Cartao,
  Erro,
  NaoMedido,
  SemAcesso,
  Vazio,
  type Estado,
} from "../_frenteComercial/Moldura";
import {
  Barra,
  CartaoDeIA,
  Celula,
  Corpo,
  FilaDeIndicadores,
  Indicador,
  Linha,
  Pilula,
  Tabela,
  TituloDaPagina,
  type NomeDeIcone,
  type Tom,
} from "../_pecas/Pecas";

/**
 * O ÍCONE E A COR DE CADA DEGRAU — pelo nome do BANCO, não pelo do desenho.
 *
 * O desenho tem quatro degraus (chama, chama, termômetro, floco). O banco tem
 * seis valores de temperatura, e a régua de hoje só produz quatro deles. Os
 * extras não ganham cor emprestada de vizinho: saem em cinza, porque cor é
 * afirmação, e a tela não afirma que DESQUALIFICADO é "quase frio".
 */
export const TINTA_DA_TEMPERATURA: Record<string, { icone: NomeDeIcone; tom: Tom }> = {
  PRIORIDADE_MAXIMA: { icone: "chama", tom: "vermelho" },
  QUENTE: { icone: "chama", tom: "ambar" },
  MORNO: { icone: "termometro", tom: "azul" },
  FRIO: { icone: "floco", tom: "cinza" },
};

export function tintaDe(temperatura: string): { icone: NomeDeIcone; tom: Tom } {
  return TINTA_DA_TEMPERATURA[temperatura] ?? { icone: "alvo", tom: "cinza" };
}

export function QualificacaoClient() {
  const [estado, setEstado] = useState<Estado<PanoramaDaQualificacao>>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    let vivo = true;
    void buscarPainel<PanoramaDaQualificacao>("/api/admin/sala-de-vendas/qualificacao").then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  if (estado.fase === "carregando") return <Carregando oQue="Lendo o termômetro da base…" />;
  if (estado.fase === "semAcesso") return <SemAcesso porque={estado.porque} />;
  if (estado.fase === "erro") return <Erro detalhe={estado.detalhe} tentarDeNovo={recarregar} />;

  const p = estado.dados;

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <TituloDaPagina
          contexto="Leads › Qualificação e Lead Score"
          titulo="Qualificação e Lead Score"
          subtitulo="Analise, priorize e direcione os melhores leads para o time de vendas."
          atualidade="Tempo real"
        />

        <p className="mt-2 max-w-[80ch] text-[12.5px] leading-relaxed text-muted">
          O score não é uma nota opaca: ele é uma <strong className="text-ink2">conta</strong>,
          e esta tela mostra a conta. As faixas abaixo são lidas da régua v
          {p.versaoDaRegua} que está no código — não há tabela digitada aqui.
        </p>

        <NaoMedido frases={p.naoMedido} />

        {/* ── OS CARTÕES DE TEMPERATURA ──────────────────────────────────
            O desenho tem quatro. Nós desenhamos TODOS os degraus que o banco
            tem, mais a fila de quem ninguém pontuou: mostrar só os quatro
            faria a soma da tela ficar menor que a base, sem explicação. */}
        <div className="mb-5 mt-4">
          <FilaDeIndicadores>
            {p.termometro.map((d) => {
              const t = tintaDe(d.temperatura);
              return (
                <Indicador
                  key={d.temperatura}
                  rotulo={d.nomeNoDesenho ?? d.temperatura.replace(/_/g, " ")}
                  valor={d.total}
                  icone={t.icone}
                  tom={t.tom}
                  rodape={
                    d.faixa
                      ? `${d.faixa.de} a ${d.faixa.ate} pontos · no banco: ${d.temperatura}`
                      : `fora da régua v${p.versaoDaRegua} · no banco: ${d.temperatura}`
                  }
                />
              );
            })}
            <Indicador
              rotulo="Ninguém pontuou"
              valor={p.naoClassificados}
              icone="alerta"
              tom="cinza"
              rodape="não é FRIO — é a fila de quem falta qualificar"
            />
          </FilaDeIndicadores>
          <p className="mt-2 max-w-[80ch] text-[11.5px] leading-snug text-muted">
            <strong className="text-ink2">{p.emAberto}</strong> leads em aberto no escopo
            (fora GANHO, PERDIDO e NUTRIÇÃO), medidos na régua v{p.versaoDaRegua}.
          </p>
        </div>

        <Corpo lateral={<SugestoesDePriorizacao p={p} />}>
        {/* ── O TERMÔMETRO ──────────────────────────────────────────────── */}
        <Cartao
          titulo="O termômetro"
          aviso="O nome do desenho aparece ao lado do nome que existe no banco. Os degraus sem faixa não são produzidos pela régua de hoje — foram gravados por outro caminho, e some-los seria fazer a tela não bater com a base."
        >
          {p.emAberto === 0 ? (
            <Vazio motivo="Não há lead em aberto no seu escopo. Vazio aqui é ausência de lead, não temperatura zero." />
          ) : (
            <Tabela colunas={["Temperatura", "No banco", "Faixa na régua", "Leads", "Fatia do aberto"]}>
              {p.termometro.map((d) => {
                const fatia = p.emAberto ? Math.round((d.total / p.emAberto) * 100) : 0;
                const t = tintaDe(d.temperatura);
                return (
                  <Linha key={d.temperatura}>
                    <Celula forte>
                      <Pilula tom={t.tom}>
                        {d.nomeNoDesenho ?? d.temperatura.replace(/_/g, " ")}
                      </Pilula>
                    </Celula>
                    <Celula>{d.temperatura}</Celula>
                    <Celula numero>
                      {d.faixa ? (
                        `${d.faixa.de} a ${d.faixa.ate} pontos`
                      ) : (
                        <span className="block max-w-[32ch] text-[11.5px] italic leading-snug text-muted">
                          a régua de hoje não produz esta leitura — ela vem de outro caminho
                          (desqualificação ou nutrição)
                        </span>
                      )}
                    </Celula>
                    <Celula numero forte>
                      {d.total}
                    </Celula>
                    <Celula numero>
                      {fatia}%
                      <span className="mt-1 block h-1.5 w-20 overflow-hidden rounded-full bg-canvas">
                        <span
                          className="block h-full rounded-full bg-ink2"
                          style={{ width: `${fatia}%` }}
                        />
                      </span>
                    </Celula>
                  </Linha>
                );
              })}
            </Tabela>
          )}

          <p className="mt-3 max-w-[72ch] text-[12px] leading-relaxed text-muted">
            <strong className="text-ink2">{p.naoClassificados}</strong> lead(s) em aberto estão fora
            deste termômetro porque não têm score. Eles não valem FRIO: ninguém perguntou nada a eles
            ainda, e essa é a diferença entre uma fila de descarte e uma fila de trabalho.
          </p>
        </Cartao>

        {/* ── O QUE MOVE O SCORE ────────────────────────────────────────── */}
        <Cartao
          titulo="O que move o score, medido"
          aviso={`Cada linha é a soma real gravada em LeadScoreFator na régua v${p.versaoDaRegua}. Não é o peso teórico da régua: é quanto cada fator de fato somou nos leads deste escopo.`}
        >
          {p.fatores.length === 0 ? (
            <Vazio motivo="Nenhum fator de score gravado nesta régua. Isso significa que ninguém foi pontuado ainda — ou que os pontos que existem vêm de uma régua anterior e foram deixados de lado de propósito, para a conta não misturar duas gerações." />
          ) : (
            <ul className="space-y-2">
              {p.fatores.map((f) => (
                <li key={f.fator} className="rounded-xl border border-line bg-canvas p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-[13.5px] font-semibold text-ink">{f.fator}</p>
                    <p className="tabular-nums text-[13px] text-ink2">
                      {f.pontos} pontos em {f.leads} lead(s)
                      <span className="ml-1.5 text-[11.5px] text-muted">
                        ~{f.mediaPorLead}/lead
                      </span>
                    </p>
                  </div>
                  {f.exemplo && (
                    <p className="mt-1 text-[12px] leading-relaxed text-muted">
                      observado, por exemplo: “{f.exemplo}”
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        {/* ── O QUE FALTA PERGUNTAR ─────────────────────────────────────── */}
        <Cartao
          titulo="O que falta perguntar"
          aviso="A mesma lista de lacunas que o cálculo do score devolve, contada na base. É daqui que sai a próxima pergunta da conversa."
        >
          {p.lacunas.every((l) => l.leads === 0) ? (
            <Vazio motivo="Todos os leads em aberto do seu escopo têm ficha de qualificação completa nos campos que pontuam. É raro; vale conferir se a base não está vazia." />
          ) : (
            <ul className="space-y-1.5">
              {p.lacunas.map((l) => (
                <li
                  key={l.lacuna}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl border border-line bg-canvas px-3 py-2"
                >
                  <span className="text-[13px] text-ink">{l.pergunta}</span>
                  <span className="tabular-nums text-[13px] font-semibold text-ink2">
                    {l.leads} lead(s) sem resposta
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 max-w-[72ch] text-[12px] leading-relaxed text-muted">
            A faixa de orçamento não aparece nesta lista de propósito: perguntar preço cedo demais
            queima a conversa, e por isso o cálculo do score não a cobra — ela conta quando o lead
            informa por conta própria.
          </p>
        </Cartao>
        </Corpo>
      </div>
    </div>
  );
}

/**
 * AS "SUGESTÕES DE PRIORIZAÇÃO" DO DESENHO, COM SELO DE IA E SEM PALPITE.
 *
 * Cada linha sai de um número que já está na tela: a fila de quem ninguém
 * pontuou e a lacuna que mais leads têm em aberto. Nenhuma frase aqui aparece
 * sem o número que a sustenta — sugestão sem número é opinião com cara de
 * sistema, e é exatamente o que faz um painel perder a confiança de quem o lê.
 */
export function SugestoesDePriorizacao({ p }: { p: PanoramaDaQualificacao }) {
  const prontos = p.termometro.find((d) => d.temperatura === "PRIORIDADE_MAXIMA")?.total ?? 0;
  const maiorLacuna = [...p.lacunas].sort((a, b) => b.leads - a.leads)[0];

  return (
    <>
      <CartaoDeIA titulo="Sugestões de priorização">
        <ol className="flex flex-col gap-2">
          {prontos > 0 && (
            <li>
              <strong className="text-ink">{prontos}</strong> lead(s) estão em
              PRIORIDADE_MÁXIMA — o &quot;Pronto para Comprar&quot; do desenho. É a fila que
              paga o dia; qualquer outra ordem de trabalho custa dinheiro hoje.
            </li>
          )}
          {p.naoClassificados > 0 && (
            <li>
              <strong className="text-ink">{p.naoClassificados}</strong> lead(s) em aberto
              não têm score. Eles não valem FRIO: ninguém perguntou nada a eles ainda, e
              essa é a diferença entre uma fila de descarte e uma fila de trabalho.
            </li>
          )}
          {maiorLacuna && maiorLacuna.leads > 0 && (
            <li>
              A pergunta que mais falta é “{maiorLacuna.pergunta}” —{" "}
              <strong className="text-ink">{maiorLacuna.leads}</strong> lead(s) sem
              resposta. É a próxima pergunta da conversa, e a que mais move o score.
            </li>
          )}
          {prontos === 0 && p.naoClassificados === 0 && (!maiorLacuna || maiorLacuna.leads === 0) && (
            <li>
              Nenhuma sugestão com número que a sustente. Esta coluna não recomenda por
              palpite — sugestão sem número é opinião com cara de sistema.
            </li>
          )}
        </ol>
      </CartaoDeIA>

      <CartaoDeIA titulo="O que esta tela não mede" tom="cinza">
        <p>
          O desenho tem Valor Potencial, Probabilidade de Compra e Objeções por lead.
          Nenhum dos três existe na nossa base hoje, e por isso não aparecem inventados
          em coluna nenhuma: a régua v{p.versaoDaRegua} pontua o que foi perguntado, e o
          que ninguém perguntou vira fila de trabalho, não estimativa.
        </p>
      </CartaoDeIA>
    </>
  );
}
