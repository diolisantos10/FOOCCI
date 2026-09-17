"use client";

/**
 * FOLLOW-UP AUTOMÁTICO E PÓS-VENDA.
 *
 * ── DUAS ABAS, UMA PERGUNTA ─────────────────────────────────────────────────
 *
 * Antes do GANHO chama-se follow-up e o relógio é o silêncio. Depois chama-se
 * pós-venda e o relógio é a ativação. É a mesma pergunta — “o que está parado, e
 * quando alguém toca de novo?” — dos dois lados da venda.
 *
 * ── ⚠️ O NÃO MEDIDO FICA FORA DA SOMA ───────────────────────────────────────
 *
 * `NÃO MEDIDO` é um dos catorze estados e ele NÃO entra no total que pede ação.
 * Somar “não sei” dentro de um número é como um painel passa a mentir sem ter
 * uma única linha errada: o total fica maior, parece trabalho, e ninguém
 * consegue apontar onde está o erro.
 *
 * ── E NADA É DISPARADO DAQUI ────────────────────────────────────────────────
 *
 * Sem botão de inscrever em cadência, sem botão de enviar. A classificação é
 * calculada na leitura e não é gravada — gravar a cada F5 encheria a linha do
 * tempo de cada lead com uma nota por visita.
 */

import { useCallback, useEffect, useState } from "react";
import type { PanoramaDoRelacionamento } from "@/services/salaDeVendas/telas/relacionamento";
import {
  Abas,
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

type Aba = "followup" | "posvenda";

const ABAS = [
  { chave: "followup" as const, rotulo: "Follow-up automático" },
  { chave: "posvenda" as const, rotulo: "Pós-venda e relacionamento" },
];

function emPalavras(chave: string): string {
  return chave.replace(/_/g, " ").toLowerCase();
}

export function RelacionamentoClient() {
  const [estado, setEstado] = useState<Estado<PanoramaDoRelacionamento>>({ fase: "carregando" });
  const [aba, setAba] = useState<Aba>("followup");
  const [tentativa, setTentativa] = useState(0);
  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    let vivo = true;
    void buscarPainel<PanoramaDoRelacionamento>("/api/admin/sala-de-vendas/relacionamento").then(
      (e) => {
        if (vivo) setEstado(e);
      },
    );
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  if (estado.fase === "carregando") return <Carregando oQue="Classificando a base e lendo as contas…" />;
  if (estado.fase === "semAcesso") return <SemAcesso porque={estado.porque} />;
  if (estado.fase === "erro") return <Erro detalhe={estado.detalhe} tentarDeNovo={recarregar} />;

  const p = estado.dados;

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Cabecalho
          titulo="Follow-up e pós-venda"
          explicacao={
            <>
              Os catorze estados em que um contato pode estar, e a jornada que começa depois do
              GANHO. A classificação é recalculada a cada abertura desta tela e{" "}
              <strong className="text-ink2">não é gravada</strong>.
            </>
          }
        />

        <Abas abas={ABAS} atual={aba} aoTrocar={setAba} />
        <NaoMedido frases={p.naoMedido} />

        {aba === "followup" ? (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Numero rotulo="Contatos analisados" valor={p.contatosAnalisados} detalhe="o que foi lido, não a base inteira" />
              <Numero rotulo="Pedindo ação" valor={p.pedindoAcao} detalhe="sem contar o não medido" />
              <Numero rotulo="Esfriando" valor={p.esfriando} detalhe="pensando, e já na metade da janela" />
              <Numero rotulo="Pediram silêncio" valor={p.emSilencio} detalhe="fora da análise, e intocáveis" />
            </div>

            <Cartao
              titulo="Os catorze estados"
              aviso="Na ordem normativa das regras: é de cima para baixo que elas valem, e o primeiro que casar decide. A ordem desta lista é lida do código, não digitada aqui."
            >
              {p.contatosAnalisados === 0 ? (
                <Vazio motivo="Nenhum contato para classificar no seu escopo. As contagens ficam vazias, e vazio aqui é ausência de contato — não é 'tudo em dia'." />
              ) : (
                <ol className="space-y-2">
                  {p.estados.map((e) => (
                    <li
                      key={e.estado}
                      className={
                        e.medido
                          ? "rounded-xl border border-line bg-canvas p-3"
                          : "rounded-xl border border-amber-200 bg-amber-50 p-3"
                      }
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-[13.5px] font-semibold text-ink">
                          {emPalavras(e.estado)}
                          {e.pedeAcao && (
                            <span className="ml-2 text-[11px] font-semibold uppercase tracking-[.04em] text-emerald-700">
                              pede ação
                            </span>
                          )}
                          {!e.medido && (
                            <span className="ml-2 text-[11px] font-semibold uppercase tracking-[.04em] text-amber-800">
                              fora da soma
                            </span>
                          )}
                        </p>
                        <p className="tabular-nums text-[13.5px] font-semibold text-ink">{e.total}</p>
                      </div>
                      {e.exemplo && (
                        <p className="mt-1 max-w-[72ch] text-[12px] leading-relaxed text-muted">
                          por exemplo: {e.exemplo}
                        </p>
                      )}
                      <p className="mt-1 text-[11.5px] text-muted">
                        {e.cadencia
                          ? `aciona a cadência “${e.cadencia}”`
                          : "não aciona cadência nenhuma — este estado classifica e para aí"}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Cartao>

            <Cartao
              titulo="A régua do tempo"
              aviso="Os prazos que separam um estado do seguinte. Mudá-los é mudar a doutrina de follow-up da casa, não um ajuste de tela."
            >
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(p.regua).map(([chave, valor]) => (
                  <div
                    key={chave}
                    className="flex items-baseline justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2"
                  >
                    <dt className="text-[12.5px] text-ink2">{emPalavras(chave)}</dt>
                    <dd className="tabular-nums text-[13px] font-semibold text-ink">{String(valor)}</dd>
                  </div>
                ))}
              </dl>
            </Cartao>

            <Cartao
              titulo="As cadências e as condições de cada passo"
              aviso="Um passo com condição só dispara se o contato AINDA estiver no estado que o justifica. É o que impede a cobrança de carrinho chegar a quem já fechou."
            >
              {p.cadencias.length === 0 ? (
                <Vazio motivo="Nenhuma cadência cadastrada no banco. Os estados acima continuam classificando e nada é acionado — o motor de follow-up está desligado, não vazio." />
              ) : (
                <ul className="space-y-2">
                  {p.cadencias.map((c) => (
                    <li key={c.slug} className="rounded-xl border border-line bg-canvas p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-[13.5px] font-semibold text-ink">{c.nome}</p>
                        <p
                          className={
                            c.ativa
                              ? "text-[12px] font-semibold text-emerald-700"
                              : "text-[12px] font-semibold text-amber-800"
                          }
                        >
                          {c.ativa ? "ativa" : "desligada"}
                        </p>
                      </div>
                      <p className="mt-1 text-[12px] text-muted">
                        {c.passos} passo(s) · {c.inscritosAtivos} contato(s) em curso
                        {c.acionadaPor.length > 0 &&
                          ` · acionada por: ${c.acionadaPor.map(emPalavras).join(", ")}`}
                      </p>
                      {c.condicoes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {c.condicoes.map((cond) => (
                            <li key={cond.passo} className="text-[11.5px] leading-relaxed text-ink2">
                              <span className="font-mono text-muted">{cond.passo}</span> —{" "}
                              {cond.descricao}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>

            <Cartao
              titulo="O que faz a cadência parar"
              aviso="A parada vale antes de qualquer passo. Sem ela, quem respondeu continuaria recebendo a cobrança de quem não respondeu."
            >
              <ul className="space-y-1.5">
                {p.paradas.map((parada) => (
                  <li key={parada.motivo} className="rounded-xl border border-line bg-canvas px-3 py-2">
                    <p className="text-[13px] font-semibold text-ink">{parada.motivo}</p>
                    <p className="mt-0.5 max-w-[72ch] text-[12px] leading-relaxed text-ink2">
                      {parada.explicacao}
                    </p>
                  </li>
                ))}
              </ul>
            </Cartao>
          </>
        ) : (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Numero rotulo="Contas de cliente" valor={p.clientes} detalhe="abertas no GANHO" />
              <Numero rotulo="Marcos pendentes" valor={p.marcos.reduce((t, m) => t + m.contas, 0)} detalhe="uma conta pode ter mais de um" />
              <Numero rotulo="Risco não medido" valor={p.riscoNaoMedido} detalhe="sem sinal a observar — não é risco zero" />
            </div>

            <Cartao titulo="A jornada depois do GANHO">
              {p.clientes === 0 ? (
                <Vazio motivo="Nenhum cliente registrado ainda. A jornada de pós-venda só começa no primeiro GANHO — e nenhum número aqui pode ser preenchido antes disso." />
              ) : (
                <>
                  <ul className="mb-4 flex flex-wrap gap-1.5">
                    {p.porSituacao.map((s) => (
                      <li
                        key={s.situacao}
                        className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-[12.5px] text-ink2"
                      >
                        {emPalavras(s.situacao)}{" "}
                        <strong className="tabular-nums text-ink">{s.total}</strong>
                      </li>
                    ))}
                  </ul>

                  {p.marcos.length === 0 ? (
                    <Vazio motivo="Nenhum marco pendente nas contas lidas — nenhuma está sem ativar, sem acompanhamento, sem NPS nem na janela de recompra." />
                  ) : (
                    <ul className="space-y-2">
                      {p.marcos.map((m) => (
                        <li key={m.marco} className="rounded-xl border border-line bg-canvas p-3">
                          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                            <p className="text-[13.5px] font-semibold text-ink">{emPalavras(m.marco)}</p>
                            <p className="tabular-nums text-[13.5px] font-semibold text-ink">
                              {m.contas} conta(s)
                            </p>
                          </div>
                          {m.exemplo && (
                            <p className="mt-1 max-w-[72ch] text-[12px] leading-relaxed text-muted">
                              por exemplo: {m.exemplo}
                            </p>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </Cartao>

            <Cartao
              titulo="Risco de churn"
              aviso="A soma de sinais nomeados, nunca intuição. Um sinal que depende de dado não medido não dispara: saúde vazia não é saúde ruim."
            >
              {p.risco.length === 0 && p.riscoNaoMedido === 0 ? (
                <Vazio motivo="Nenhuma conta para avaliar. Sem cliente não há risco a medir — e isso é diferente de risco zero." />
              ) : (
                <>
                  <ul className="mb-3 flex flex-wrap gap-1.5">
                    {p.risco.map((f) => (
                      <li
                        key={f.rotulo}
                        className="rounded-xl border border-line bg-canvas px-3 py-1.5 text-[12.5px] text-ink2"
                      >
                        {f.rotulo} <strong className="tabular-nums text-ink">{f.contas}</strong>
                      </li>
                    ))}
                    {p.riscoNaoMedido > 0 && (
                      <li className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-[12.5px] text-amber-900">
                        não medido{" "}
                        <strong className="tabular-nums">{p.riscoNaoMedido}</strong>
                      </li>
                    )}
                  </ul>
                  <ul className="space-y-1">
                    {p.sinaisDeChurn.map((s) => (
                      <li
                        key={s.codigo}
                        className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl border border-line px-3 py-2"
                      >
                        <span className="text-[12.5px] text-ink2">{s.descricao}</span>
                        <span className="tabular-nums text-[12.5px] font-semibold text-ink">
                          peso {s.peso}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 max-w-[72ch] text-[12px] leading-relaxed text-muted">
                    A conta vai para EM RISCO a partir de {p.reguaDeChurn.limiarDeRisco} pontos. Note
                    que “comprou e não ligou o produto” sozinho já atinge o limiar: o documento diz
                    que é ali que o churn nasce, e um alarme que precisasse de um segundo sinal
                    tocaria tarde.
                  </p>
                </>
              )}
            </Cartao>

            <Cartao titulo="A régua do pós-venda">
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(p.reguaDoPosVenda).map(([chave, valor]) => (
                  <div
                    key={chave}
                    className="flex items-baseline justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2"
                  >
                    <dt className="text-[12.5px] text-ink2">{emPalavras(chave)}</dt>
                    <dd className="tabular-nums text-[13px] font-semibold text-ink">{String(valor)}</dd>
                  </div>
                ))}
              </dl>
            </Cartao>
          </>
        )}
      </div>
    </div>
  );
}
