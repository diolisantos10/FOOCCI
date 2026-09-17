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
  Cabecalho,
  Carregando,
  Cartao,
  Erro,
  NaoMedido,
  Numero,
  SemAcesso,
  Vazio,
  type Estado,
} from "../_frenteComercial/Moldura";

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
      <div className="mx-auto max-w-5xl">
        <Cabecalho
          titulo="Qualificação e Lead Score"
          explicacao={
            <>
              O score não é uma nota opaca: ele é uma <strong className="text-ink2">conta</strong>,
              e esta tela mostra a conta. As faixas abaixo são lidas da régua v
              {p.versaoDaRegua} que está no código — não há tabela digitada aqui.
            </>
          }
        />

        <NaoMedido frases={p.naoMedido} />

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Numero rotulo="Leads em aberto" valor={p.emAberto} detalhe="fora GANHO, PERDIDO e NUTRIÇÃO" />
          <Numero
            rotulo="Ninguém pontuou"
            valor={p.naoClassificados}
            detalhe="não é FRIO — é a fila de quem falta qualificar"
          />
          <Numero rotulo="Versão da régua" valor={p.versaoDaRegua} detalhe="sobe a cada mudança de peso" />
        </div>

        {/* ── O TERMÔMETRO ──────────────────────────────────────────────── */}
        <Cartao
          titulo="O termômetro"
          aviso="O nome do desenho aparece ao lado do nome que existe no banco. Os degraus sem faixa não são produzidos pela régua de hoje — foram gravados por outro caminho, e some-los seria fazer a tela não bater com a base."
        >
          {p.emAberto === 0 ? (
            <Vazio motivo="Não há lead em aberto no seu escopo. Vazio aqui é ausência de lead, não temperatura zero." />
          ) : (
            <ol className="space-y-2">
              {p.termometro.map((d) => {
                const fatia = p.emAberto ? Math.round((d.total / p.emAberto) * 100) : 0;
                return (
                  <li key={d.temperatura} className="rounded-xl border border-line bg-canvas p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-[14px] font-semibold text-ink">
                        {d.nomeNoDesenho ?? d.temperatura.replace(/_/g, " ")}
                        {d.nomeNoDesenho && d.nomeNoDesenho !== d.temperatura && (
                          <span className="ml-2 text-[11.5px] font-normal text-muted">
                            no banco: {d.temperatura}
                          </span>
                        )}
                      </p>
                      <p className="tabular-nums text-[14px] font-semibold text-ink">
                        {d.total}
                        <span className="ml-1 text-[11.5px] font-normal text-muted">
                          ({fatia}% do aberto)
                        </span>
                      </p>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted">
                      {d.faixa
                        ? `${d.faixa.de} a ${d.faixa.ate} pontos na régua v${p.versaoDaRegua}.`
                        : "A régua de hoje não produz esta leitura — ela vem de outro caminho (desqualificação ou nutrição)."}
                    </p>
                    <div
                      className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
                      role="presentation"
                    >
                      <div className="h-full rounded-full bg-ink2" style={{ width: `${fatia}%` }} />
                    </div>
                  </li>
                );
              })}
            </ol>
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
      </div>
    </div>
  );
}
