"use client";

/**
 * MOTOR DE DECISÃO / ROTEAMENTO.
 *
 * ── A TELA TEM DUAS LISTAS, E A SEGUNDA É O PRODUTO ─────────────────────────
 *
 * O desenho do CEO lista onze critérios. Seis não existem no código. Uma tela
 * que desenhasse os onze com cara de regra ativa ensinaria o gerente a confiar
 * num roteamento por idioma que nunca rodou — e o defeito só apareceria num
 * cliente perdido, meses depois, sem rastro.
 *
 * Então: “o que decide hoje” aponta a função que executa cada regra, e
 * “previsto, não construído” diz o que falta para cada uma existir. A segunda
 * lista não é um pedido de desculpas: é o mapa do que ainda dá trabalho.
 *
 * ── E O SLA NÃO MOSTRA ZERO ─────────────────────────────────────────────────
 *
 * Se nenhum lead tem prazo gravado, a tela escreve que o relógio está
 * desligado. “0 SLAs estourados” seria exatamente a tela que uma operação
 * saudável mostraria — e as duas situações são opostas.
 */

import { useCallback, useEffect, useState } from "react";
import type { PanoramaDoRoteamento } from "@/services/salaDeVendas/telas/roteamento";
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

const MOTIVO_EM_PALAVRAS: Record<string, string> = {
  offline: "está offline",
  pausado: "está em pausa",
  noLimite: "está no limite de conversas abertas",
  semEspecialidade: "não tem a especialidade exigida",
  semRegiao: "não atende a região exigida",
};

export function RoteamentoClient() {
  const [estado, setEstado] = useState<Estado<PanoramaDoRoteamento>>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    let vivo = true;
    void buscarPainel<PanoramaDoRoteamento>("/api/admin/sala-de-vendas/roteamento").then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  if (estado.fase === "carregando") return <Carregando oQue="Lendo o estado do motor…" />;
  if (estado.fase === "semAcesso") return <SemAcesso porque={estado.porque} />;
  if (estado.fase === "erro") return <Erro detalhe={estado.detalhe} tentarDeNovo={recarregar} />;

  const p = estado.dados;

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Cabecalho
          titulo="Motor de decisão e roteamento"
          explicacao={
            <>
              Quem pega o próximo lead, e por quê. Primeiro quem{" "}
              <strong className="text-ink2">pode</strong>, depois de quem é a{" "}
              <strong className="text-ink2">vez</strong> — nessa ordem, sempre.
            </>
          }
        />

        <NaoMedido frases={p.naoMedido} />

        <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-line bg-paper p-3.5">
            <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
              Modo agora
            </p>
            <p className="mt-0.5 text-[17px] font-semibold leading-tight text-ink">{p.modo}</p>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
              {p.modoEhPadrao ? "padrão: não há configuração gravada" : "gravado na configuração do TA"}
            </p>
          </div>
          <Numero rotulo="Aptos agora" valor={p.aptos} detalhe={`de ${p.atendentes.length} com disponibilidade`} />
          <Numero rotulo="Sem responsável" valor={p.semResponsavel} detalhe="leads em aberto esperando dono" />
          <Numero
            rotulo="SLA estourado"
            valor={p.sla.estourados}
            porqueNulo="o relógio nunca foi ligado"
            detalhe={`${p.sla.comPrazo} lead(s) com prazo gravado`}
          />
        </div>

        {/* ── QUEM PODE RECEBER ─────────────────────────────────────────── */}
        <Cartao
          titulo="Quem pode receber agora"
          aviso="A aptidão é medida com a mesma função que a distribuição automática usa. Quando ninguém está apto, o motivo aparece — uma fila parada sem explicação é o jeito silencioso de esquecer um lead."
        >
          {p.atendentes.length === 0 ? (
            <Vazio motivo="Nenhum atendente tem disponibilidade cadastrada. Sem isso o motor não tem para quem distribuir, em modo nenhum — e não é que o time esteja ocupado: é que ele não existe para o motor." />
          ) : (
            <>
              {p.porQueNinguemEstaApto && (
                <p className="mb-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-[12.5px] leading-relaxed text-amber-900">
                  Ninguém apto agora — {p.porQueNinguemEstaApto}.
                </p>
              )}
              <ul className="space-y-2">
                {p.atendentes.map((a) => (
                  <li key={a.userId} className="rounded-xl border border-line bg-canvas p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-[13.5px] font-semibold text-ink">{a.nome}</p>
                      <p
                        className={
                          a.apto
                            ? "text-[12px] font-semibold text-emerald-700"
                            : "text-[12px] font-semibold text-amber-800"
                        }
                      >
                        {a.apto
                          ? "apto"
                          : `fora da roda: ${a.motivo ? (MOTIVO_EM_PALAVRAS[a.motivo] ?? a.motivo) : "sem motivo registrado"}`}
                      </p>
                    </div>
                    <p className="mt-1 text-[12px] leading-relaxed text-muted">
                      {a.estado} · carga {a.carga} de {a.capacidade}
                      {a.especialidades.length > 0 && ` · especialidades: ${a.especialidades.join(", ")}`}
                      {a.regioes.length > 0 && ` · regiões: ${a.regioes.join(", ")}`}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-muted">
                      {a.ultimoRecebimentoEm
                        ? `último lead recebido em ${new Date(a.ultimoRecebimentoEm).toLocaleString("pt-BR")}`
                        : "ainda não recebeu nenhum lead — no rodízio, vem antes de todo mundo"}
                    </p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Cartao>

        {/* ── O SLA ─────────────────────────────────────────────────────── */}
        <Cartao titulo="SLA de primeira resposta">
          {p.sla.naoMedido ? (
            <Vazio motivo={p.sla.naoMedido} />
          ) : (
            <p className="text-[13px] leading-relaxed text-ink2">
              <strong className="text-ink">{p.sla.estourados}</strong> lead(s) passaram do prazo sem
              ninguém responder, de <strong className="text-ink">{p.sla.comPrazo}</strong> com prazo
              gravado. O prazo cumprido depois de respondido não conta como estouro: o SLA fez o
              trabalho dele.
            </p>
          )}
        </Cartao>

        {/* ── AS REGRAS QUE EXISTEM ─────────────────────────────────────── */}
        <Cartao
          titulo="O que o motor decide hoje"
          aviso="Cada linha aponta a função que a executa. É o endereço para conferir — regra de tela que ninguém consegue localizar no código é promessa, não mecanismo."
        >
          <ul className="space-y-2">
            {p.regrasQueExistem.map((r) => (
              <li key={r.criterio} className="rounded-xl border border-line bg-canvas p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-[13.5px] font-semibold text-ink">{r.criterio}</p>
                  <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                    {r.modo ? `só no modo ${r.modo}` : "vale em todos os modos"}
                  </p>
                </div>
                <p className="mt-1 max-w-[72ch] text-[12.5px] leading-relaxed text-ink2">{r.oQueFaz}</p>
                <p className="mt-1 font-mono text-[11px] text-muted">{r.ondeMora}</p>
              </li>
            ))}
          </ul>
        </Cartao>

        {/* ── O QUE NÃO EXISTE ──────────────────────────────────────────── */}
        <Cartao
          titulo="Previsto, não construído"
          aviso="O desenho pede estes critérios e o código não os tem. Nenhuma linha abaixo está rodando. Dizer isso na tela é o que impede alguém de contar com um roteamento que não existe."
        >
          <ul className="space-y-2">
            {p.previstasNaoConstruidas.map((r) => (
              <li key={r.criterio} className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[13.5px] font-semibold text-amber-900">{r.criterio}</p>
                <p className="mt-1 max-w-[72ch] text-[12.5px] leading-relaxed text-amber-900/90">
                  O desenho pede: {r.oDesenhoPede}.
                </p>
                <p className="mt-1 max-w-[72ch] text-[12px] leading-relaxed text-amber-800">
                  O que falta: {r.oQueFalta}
                </p>
              </li>
            ))}
          </ul>
        </Cartao>
      </div>
    </div>
  );
}
