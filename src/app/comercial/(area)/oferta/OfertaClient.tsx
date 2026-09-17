"use client";

/**
 * CATÁLOGO, OFERTA E CHECKOUT.
 *
 * ── DUAS ABAS, PORQUE SÃO DUAS PERGUNTAS ────────────────────────────────────
 *
 * “O que eu vendo e por quanto” é a pergunta do vendedor diante do lead, e ela
 * se responde sem tocar no banco. “Onde estão as minhas propostas” é a pergunta
 * do fim do dia, e ela é uma leitura da base. Numa tela só, a segunda enterra a
 * primeira — que é a que o vendedor abre dez vezes por dia.
 *
 * ── ⛔ ESTA TELA NÃO ENVIA NADA ─────────────────────────────────────────────
 *
 * Não há botão de gerar link, criar proposta ou mandar no WhatsApp. O caminho
 * de envio existe e tem travas (janela, opt-out, freio de ritmo); um segundo
 * caminho a partir daqui seria um atalho por fora delas. Trava que se contorna
 * por outra porta não é trava.
 */

import { useCallback, useEffect, useState } from "react";
import type { PanoramaDaOferta } from "@/services/salaDeVendas/telas/oferta";
import {
  Abas,
  buscarPainel,
  Cabecalho,
  Carregando,
  Cartao,
  emReais,
  Erro,
  NaoMedido,
  Numero,
  SemAcesso,
  Vazio,
  type Estado,
} from "../_frenteComercial/Moldura";

type Aba = "catalogo" | "propostas";

const ABAS = [
  { chave: "catalogo" as const, rotulo: "Catálogo e oferta" },
  { chave: "propostas" as const, rotulo: "Propostas e checkout" },
];

export function OfertaClient() {
  const [estado, setEstado] = useState<Estado<PanoramaDaOferta>>({ fase: "carregando" });
  const [aba, setAba] = useState<Aba>("catalogo");
  const [tentativa, setTentativa] = useState(0);
  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    let vivo = true;
    void buscarPainel<PanoramaDaOferta>("/api/admin/sala-de-vendas/oferta").then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  if (estado.fase === "carregando") return <Carregando oQue="Montando o catálogo e lendo as propostas…" />;
  if (estado.fase === "semAcesso") return <SemAcesso porque={estado.porque} />;
  if (estado.fase === "erro") return <Erro detalhe={estado.detalhe} tentarDeNovo={recarregar} />;

  const p = estado.dados;
  const semValor = p.colunas.reduce((t, c) => t + c.soma.semValor, 0);

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Cabecalho
          titulo="Catálogo, oferta e checkout"
          explicacao={
            <>
              O que se vende, por quanto, e onde está cada proposta.{" "}
              <strong className="text-ink2">Esta tela só lê</strong> — quem fecha é o cliente,
              sozinho, no checkout do site.
            </>
          }
        />

        <Abas abas={ABAS} atual={aba} aoTrocar={setAba} />
        <NaoMedido frases={p.naoMedido} />

        {aba === "catalogo" ? (
          <>
            <Cartao
              titulo="Os planos"
              aviso="Derivado da fonte única de preço — os mesmos números do site e da cobrança do cartão. Nenhum valor é digitado nesta tela."
            >
              <div className="space-y-3">
                {["STARTER", "GROWTH", "PRO"].map((plano) => {
                  const itens = p.catalogo.filter((i) => i.plano === plano);
                  if (!itens.length) return null;
                  return (
                    <article key={plano} className="overflow-hidden rounded-xl border border-line">
                      <div className="border-b border-line bg-canvas px-3 py-2">
                        <h3 className="text-[14px] font-semibold text-ink">{itens[0]!.nome}</h3>
                      </div>
                      <dl className="divide-y divide-line">
                        {itens.map((i) => (
                          <div key={i.ciclo} className="px-3 py-2.5">
                            <dt className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                              {i.nomeDoCiclo}
                            </dt>
                            <dd className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="tabular-nums text-[15px] font-semibold text-ink">
                                {i.emReais.doCiclo}
                              </span>
                              <span className="text-[12px] text-muted">
                                por cobrança · equivale a {i.emReais.equivalenteAoMes}/mês
                              </span>
                            </dd>
                            <dd className="mt-1 text-[12.5px] text-ink2">
                              1ª cobrança{" "}
                              <span className="tabular-nums font-semibold text-ink">
                                {i.emReais.primeiraCobranca}
                              </span>
                              {i.descontoDaPrimeiraPct > 0 && (
                                <span className="ml-1 text-emerald-700">
                                  −{i.descontoDaPrimeiraPct}%
                                </span>
                              )}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </article>
                  );
                })}
              </div>
            </Cartao>

            <Cartao titulo="A alçada da oferta">
              <dl className="space-y-3">
                <div>
                  <dt className="text-[13px] font-semibold text-ink">
                    Desconto que o vendedor pode conceder: {p.limiteDeDescontoPct}%
                  </dt>
                  <dd className="mt-1 max-w-[72ch] text-[12.5px] leading-relaxed text-ink2">
                    Não é rigor — é o que a máquina faz. O checkout cobra o valor da tabela e não há
                    campo por onde outro número entre. Um teto diferente de zero aqui daria uma
                    proposta dizendo um valor e um cartão cobrando outro.
                  </dd>
                </div>
                <div>
                  <dt className="text-[13px] font-semibold text-ink">
                    Validade padrão da proposta: {p.validadePadraoEmDias} dias
                  </dt>
                  <dd className="mt-1 max-w-[72ch] text-[12.5px] leading-relaxed text-ink2">
                    Proposta expirada não volta a valer: faz-se outra. É o que mantém “enviada” como
                    uma fila viva em vez de um arquivo morto.
                  </dd>
                </div>
              </dl>
            </Cartao>
          </>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Numero rotulo="Propostas" valor={p.totalDePropostas} detalhe="no seu escopo" />
              <Numero
                rotulo="Sem valor gravado"
                valor={semValor}
                detalhe="ficam FORA de toda soma desta tela"
              />
              <Numero rotulo="Com prazo correndo" valor={p.vencendo.length} detalhe="não terminais, com validade" />
            </div>

            <Cartao
              titulo="Onde está cada proposta"
              aviso="As setas são a máquina de estados real: uma proposta em RASCUNHO não vira ACEITA sem passar por ENVIADA. As somas só incluem propostas com valor gravado."
            >
              {p.totalDePropostas === 0 ? (
                <Vazio motivo="Nenhuma proposta registrada no seu escopo. Vazio aqui é ausência de proposta — não é pipeline de R$ 0,00." />
              ) : (
                <ul className="space-y-2">
                  {p.colunas.map((c) => (
                    <li key={c.situacao} className="rounded-xl border border-line bg-canvas p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-[13.5px] font-semibold text-ink">
                          {c.situacao.replace(/_/g, " ")}
                          {c.terminal && (
                            <span className="ml-2 text-[11px] font-normal uppercase tracking-[.04em] text-muted">
                              terminal
                            </span>
                          )}
                        </p>
                        <p className="tabular-nums text-[13.5px] font-semibold text-ink">{c.total}</p>
                      </div>
                      <p className="mt-1 text-[12px] leading-relaxed text-muted">
                        {c.soma.comValor > 0
                          ? `${emReais(c.soma.cents)}/mês somados em ${c.soma.comValor} proposta(s)`
                          : "nenhuma proposta com valor gravado nesta situação"}
                        {c.soma.semValor > 0 && ` · ${c.soma.semValor} sem valor, fora da soma`}
                      </p>
                      <p className="mt-1 text-[11.5px] text-muted">
                        {c.vaiPara.length
                          ? `vai para: ${c.vaiPara.join(", ").replace(/_/g, " ")}`
                          : "não vai para lugar nenhum — acabou aqui"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>

            <Cartao
              titulo="O relógio das propostas de pé"
              aviso="Só as que não terminaram e têm validade gravada. Dias negativos já venceram e esperam a varredura de expiração."
            >
              {p.vencendo.length === 0 ? (
                <Vazio motivo="Nenhuma proposta de pé com prazo gravado no seu escopo. Isso pode ser porque não há proposta aberta, ou porque as abertas foram criadas sem validade — e sem validade não há relógio a mostrar." />
              ) : (
                <ul className="space-y-1.5">
                  {p.vencendo.map((v) => (
                    <li
                      key={v.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-xl border border-line bg-canvas px-3 py-2"
                    >
                      <span className="min-w-0 text-[13px] text-ink">
                        {v.lead}
                        {v.plano && <span className="ml-1.5 text-[11.5px] text-muted">{v.plano}</span>}
                      </span>
                      <span
                        className={
                          v.diasParaVencer < 0
                            ? "text-[12.5px] font-semibold text-amber-800"
                            : "text-[12.5px] text-ink2"
                        }
                      >
                        {v.diasParaVencer < 0
                          ? `venceu há ${Math.abs(v.diasParaVencer)} dia(s)`
                          : `vence em ${v.diasParaVencer} dia(s)`}
                        {v.valorMensalCent === null ? (
                          <span className="ml-1.5 text-[11.5px] text-muted">valor não gravado</span>
                        ) : (
                          <span className="ml-1.5 tabular-nums text-[11.5px] text-muted">
                            {emReais(v.valorMensalCent)}/mês
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>

            <Cartao titulo="Como o checkout fecha">
              <p className="max-w-[72ch] text-[12.5px] leading-relaxed text-ink2">
                O vendedor manda o link; o cliente contrata sozinho. Não há desconto a conceder, forma
                de pagamento a combinar nem condição a assinar — a máquina não tem essas alavancas.
                Gerar o link e mandar no WhatsApp continuam sendo ações da ficha do lead, com as
                travas de janela, opt-out e ritmo. <strong className="text-ink">Esta tela não envia
                nada</strong>, e isso é deliberado: um segundo caminho de envio seria um atalho por
                fora dessas travas.
              </p>
            </Cartao>
          </>
        )}
      </div>
    </div>
  );
}
