"use client";

/**
 * A PEÇA 09 DO CEO — FOLLOW-UP AUTOMÁTICO.
 *
 * ── A LEITURA LITERAL DO DESENHO ────────────────────────────────────────────
 *
 * Três abas (Modelos prontos · Minhas automações · Logs de execução), o
 * Construtor da Jornada em blocos ligados, a coluna da direita com os
 * Resultados e a paleta de componentes, e no rodapé a tabela de Automações
 * Ativas.
 *
 * ── ⛔ O CONSTRUTOR MOSTRA; ELE NÃO GRAVA — E POR QUÊ ───────────────────────
 *
 * Medido no schema: `CadenciaPasso` **não tem coluna de condição e não tem
 * modelo de ramo**; a condição de cada passo vive num catálogo tipado em código
 * (`CATALOGO_DE_CONDICOES`), cujo próprio arquivo declara que mudá-la exige
 * deploy; a condição de parada é código, não dado; e não existe rota de escrita
 * de cadência. **Uma jornada montada nesta tela não teria onde ser gravada.**
 *
 * Um construtor com blocos arrastáveis e um botão "Salvar" que devolve um verde
 * e não grava nada é a tela mentindo — e mentindo do jeito mais caro, porque o
 * operador vai embora achando que a jornada existe. Então, no lugar dele, esta
 * tela **desenha em blocos as jornadas que de fato existem**, passo a passo,
 * com as condições reais e a parada real. Mesmo desenho; o que está nele é
 * verdade. O que falta para ele ser editável está escrito na própria tela.
 *
 * ── ⛔ E NADA AQUI ENVIA ────────────────────────────────────────────────────
 *
 * Sem "Nova Automação", sem "Ativar automação", sem "Salvar". O envio está
 * pausado por ordem do CEO, e botão que não pode existir como ato não vira
 * botão: a ausência fica escrita.
 *
 * ── ⚠️ QUAL FOLLOW-UP ───────────────────────────────────────────────────────
 *
 * O NOSSO, sobre os leads da Sala de Vendas. O follow-up que o restaurante faz
 * com os clientes dele é `src/services/crm/**` e não encosta aqui.
 */

import { useEffect, useState } from "react";
import type {
  PanoramaDoFollowUpAutomatico,
  JornadaEmBlocos,
} from "@/services/salaDeVendas/telas/followUpAutomatico";
import {
  Abas,
  Aviso,
  BlocoDaJornada,
  Caixa,
  Carregando,
  Celula,
  Corpo,
  Erro,
  Icone,
  Jornada,
  Linha,
  NaoMedido,
  Numero,
  Pilula,
  SemAcesso,
  Secao,
  SetaDaJornada,
  Tabela,
  TituloDaPagina,
  Vazio,
  cx,
  type Fase,
  type TipoDoBloco,
} from "../_pecas/Pecas";

type Aba = "modelos" | "minhas" | "logs";

/** A paleta de componentes do desenho — os blocos que a nossa jornada tem. */
const PALETA: Array<{ tipo: TipoDoBloco; titulo: string; oQueFaz: string }> = [
  { tipo: "GATILHO", titulo: "Gatilho", oQueFaz: "define quem entra — é o estado que a régua de follow-up apurou" },
  { tipo: "ESPERA", titulo: "Espera", oQueFaz: "pausa a jornada por N horas (coluna `esperaHoras` do passo)" },
  { tipo: "TEMPLATE", titulo: "Template WhatsApp", oQueFaz: "o passo que sairia por `abordarLead()` — hoje pendente, com o envio desligado" },
  { tipo: "TAREFA", titulo: "Tarefa humana", oQueFaz: "o passo cujo executor é HUMANO: vira tarefa, não mensagem" },
  { tipo: "CONDICAO", titulo: "Condição", oQueFaz: "o `se` do passo, vindo do catálogo tipado em código" },
  { tipo: "PARADA", titulo: "Condição de parada", oQueFaz: "encerra a jornada: respondeu, comprou, pediu remoção, perdido ou sem perfil" },
];

function hora(d: string | Date): string {
  const x = typeof d === "string" ? new Date(d) : d;
  return x.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Uma jornada desenhada em blocos ligados, como o canvas do desenho. */
function CanvasDaJornada({ j }: { j: JornadaEmBlocos }) {
  return (
    <Caixa>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[13px] font-semibold text-ink">{j.nome}</h3>
        <Pilula tom={j.ativa ? "verde" : "cinza"}>{j.ativa ? "Ativa" : "Inativa"}</Pilula>
        <span className="text-[11.5px] text-muted">
          {j.inscritosAtivos} ativo(s) · {j.inscritosPausados} pausado(s) · {j.inscritosConcluidos} concluído(s)
        </span>
      </div>

      {j.acionadaPor.length ? (
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          Entra quem a régua classificar em{" "}
          <strong>{j.acionadaPor.map((g) => g.rotulo).join(" ou ")}</strong>.
        </p>
      ) : (
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          Nenhum estado de follow-up aciona esta jornada — ela existe no banco e
          ninguém é inscrito nela automaticamente.
        </p>
      )}

      <div className="mt-3">
        <Jornada>
          {j.blocos.map((b, n) => (
            <div key={b.id} className="flex w-full flex-col items-center">
              {n > 0 ? <SetaDaJornada /> : null}
              <BlocoDaJornada
                tipo={b.tipo as TipoDoBloco}
                titulo={b.titulo}
                detalhe={b.detalhe}
                condicao={b.condicao}
                rodape={
                  b.estados.length ? (
                    <span>só para: {b.estados.map((e) => e.rotulo).join(" · ")}</span>
                  ) : null
                }
              />
            </div>
          ))}
        </Jornada>
      </div>
    </Caixa>
  );
}

export function FollowUpAutomaticoClient() {
  const [fase, setFase] = useState<Fase<PanoramaDoFollowUpAutomatico>>({ fase: "carregando" });
  const [aba, setAba] = useState<Aba>("minhas");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/follow-up-automatico", { cache: "no-store" });
        const j = (await r.json()) as {
          ok: boolean;
          data?: PanoramaDoFollowUpAutomatico;
          error?: string;
        };
        if (!vivo) return;
        if (r.status === 401 || r.status === 403) {
          setFase({ fase: "semAcesso" });
          return;
        }
        if (!r.ok || !j.ok || !j.data) {
          setFase({ fase: "erro", detalhe: j.error ?? `HTTP ${r.status}` });
          return;
        }
        setFase({ fase: "pronto", dados: j.data });
      } catch (e) {
        if (vivo) setFase({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (fase.fase === "carregando") return <Carregando texto="Lendo as jornadas, as inscrições e o rastro de execução…" />;
  if (fase.fase === "semAcesso") return <SemAcesso />;
  if (fase.fase === "erro") return <Erro detalhe={fase.detalhe} />;

  const p = fase.dados;

  return (
    <div className="flex flex-col gap-5">
      <TituloDaPagina
        contexto="Automações"
        titulo="Follow-up Automático"
        subtitulo="As jornadas que a casa roda sozinha sobre os nossos leads — o que existe, o que aciona cada uma e o que já foi executado."
        periodo={hora(p.emitidoEm)}
        atualidade="Lido agora"
      />

      {/* ── ⛔ As duas travas, antes de qualquer bloco ─────────────────────── */}
      <Aviso>
        <strong>Esta tela não cria, não salva e não envia.</strong> O desenho tem
        “Nova Automação”, “Salvar” e “Ativar automação”; nenhum deles existe
        aqui. O envio está pausado por ordem do CEO, e uma jornada desenhada na
        tela <em>não teria onde ser gravada</em> — o construtor abaixo mostra as
        jornadas que de fato existem, e o que falta para ele ser editável está
        escrito no fim da página.
      </Aviso>

      {!p.envioAtivo ? (
        <Aviso>
          <strong>O envio está desligado.</strong> As jornadas abaixo avançam e o
          passo de mensagem fica <em>pendente</em>: nada sai para ninguém
          enquanto <code>FOOCCI_SDR_SEND_ENABLED</code> não estiver em “true”.
          Isso é estado medido agora, não suposição.
        </Aviso>
      ) : null}

      <Abas
        ativa={aba}
        aoTrocar={setAba}
        abas={[
          { chave: "modelos", rotulo: "Modelos prontos", icone: "chave" },
          { chave: "minhas", rotulo: "Minhas automações", icone: "faisca" },
          { chave: "logs", rotulo: "Logs de execução", icone: "relogio" },
        ]}
      />

      <Corpo
        lateral={
          <>
            {/* ── Resultados ─────────────────────────────────────────────── */}
            <Caixa>
              <h3 className="text-[12px] font-semibold text-ink">Resultados destas automações</h3>

              <div className="mt-2 grid grid-cols-2 gap-2">
                <Numero rotulo="Mensagens enviadas" valor={null} motivo={p.resultados.porqueNaoMedido} />
                <Numero rotulo="Respostas" valor={null} motivo={p.resultados.porqueNaoMedido} />
                <Numero rotulo="Recuperações" valor={null} motivo={p.resultados.porqueNaoMedido} />
                <Numero rotulo="Vendas recuperadas" valor={null} motivo={p.resultados.porqueNaoMedido} />
              </div>

              <p className="mt-3 text-[11.5px] font-semibold text-ink">O que É medido no lugar</p>
              <div className="mt-1.5 grid grid-cols-2 gap-2">
                <Numero rotulo="Inscritos ativos" valor={p.resultados.inscritosAtivos} />
                <Numero rotulo="Pausados" valor={p.resultados.inscritosPausados} />
                <Numero rotulo="Concluídos" valor={p.resultados.inscritosConcluidos} />
                <Numero rotulo="Cancelados" valor={p.resultados.inscritosCancelados} />
              </div>
              <p className="mt-2 text-[11px] leading-snug text-muted">
                Inscrição é contagem real do banco. Ela não é mensagem enviada, e
                chamá-la assim seria trocar um número medido por um que ninguém apurou.
              </p>
            </Caixa>

            {/* ── Paleta de componentes — descritiva, não arrastável ─────── */}
            <Caixa>
              <h3 className="text-[12px] font-semibold text-ink">Componentes da jornada</h3>
              <p className="mt-0.5 text-[11.5px] leading-snug text-muted">
                No desenho eles se arrastam para montar a automação. Aqui eles
                explicam o que cada bloco significa — arrastar sem ter onde
                gravar seria um gesto sem consequência.
              </p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {PALETA.map((c) => (
                  <li key={c.titulo}>
                    <BlocoDaJornada tipo={c.tipo} titulo={c.titulo} detalhe={c.oQueFaz} />
                  </li>
                ))}
              </ul>
            </Caixa>

            {/* ── Condições de parada ────────────────────────────────────── */}
            <Caixa>
              <h3 className="text-[12px] font-semibold text-ink">Condições de parada</h3>
              <ul className="mt-1.5 flex flex-col gap-1.5">
                {p.paradas.map((x) => (
                  <li key={x.motivo} className="text-[11.5px] leading-snug text-ink2">
                    <strong>{x.motivo}</strong> — {x.explicacao}
                  </li>
                ))}
              </ul>
            </Caixa>
          </>
        }
      >
        {aba === "minhas" ? (
          <Secao
            titulo="Construtor da Jornada"
            descricao="As jornadas reais, em blocos ligados, com a condição declarada de cada passo. É leitura: nada aqui é criado, salvo ou ativado."
          >
            {p.jornadas.length ? (
              <div className="flex flex-col gap-3">
                {p.jornadas.map((j) => (
                  <CanvasDaJornada key={j.slug} j={j} />
                ))}
              </div>
            ) : (
              <Vazio motivo={p.porqueSemJornadas ?? "sem motivo declarado"} />
            )}
          </Secao>
        ) : null}

        {aba === "modelos" ? (
          <Secao
            titulo="Modelos prontos"
            descricao="Os modelos desta casa não são um catálogo de marketing: são os estados que o código sabe acionar, e a cadência que cada um chama. Modelo cuja cadência não está no banco fica marcado — quem cair naquele estado não é enfileirado em lugar nenhum."
          >
            {p.modelosProntos.length ? (
              <Tabela colunas={["Estado que aciona", "Cadência chamada", "Existe no banco?"]}>
                {p.modelosProntos.map((m) => (
                  <Linha key={m.estado} alerta={!m.existeNoBanco}>
                    <Celula forte>{m.rotulo}</Celula>
                    <Celula>{m.slug}</Celula>
                    <Celula>
                      <Pilula tom={m.existeNoBanco ? "verde" : "vermelho"}>
                        {m.existeNoBanco ? "Sim" : "Não — ninguém é enfileirado"}
                      </Pilula>
                    </Celula>
                  </Linha>
                ))}
              </Tabela>
            ) : (
              <Vazio motivo="nenhum estado tem cadência declarada em código — o mapa `CADENCIA_POR_ESTADO` está vazio." />
            )}
          </Secao>
        ) : null}

        {aba === "logs" ? (
          <Secao
            titulo="Logs de execução"
            descricao="O rastro real de que uma jornada mexeu em alguém: a tarefa que um passo de cadência criou. Não é log de envio — envio não é registrado por cadência, e essa é uma lacuna, não um zero."
          >
            {p.logs.length ? (
              <Tabela colunas={["Vence em", "Lead", "Automação", "Passo", "Quem criou", "Situação", "Concluída em"]}>
                {p.logs.map((l) => (
                  <Linha key={l.tarefaId}>
                    <Celula numero>{hora(l.venceEm)}</Celula>
                    <Celula forte>{l.lead}</Celula>
                    <Celula>
                      {l.cadencia ?? (
                        <NaoMedido motivo="a tarefa aponta para uma inscrição cuja cadência não pôde ser lida." />
                      )}
                    </Celula>
                    <Celula>{l.titulo}</Celula>
                    <Celula>{l.criadaPor}</Celula>
                    <Celula>
                      <Pilula tom={l.situacao === "ABERTA" ? "ambar" : "verde"}>{l.situacao}</Pilula>
                    </Celula>
                    <Celula numero>
                      {l.concluidaEm ? (
                        hora(l.concluidaEm)
                      ) : (
                        <span className="text-muted">ainda aberta</span>
                      )}
                    </Celula>
                  </Linha>
                ))}
              </Tabela>
            ) : (
              <Vazio motivo={p.porqueSemLogs ?? "sem motivo declarado"} />
            )}
          </Secao>
        ) : null}

        {/* ── Automações ativas — o rodapé do desenho ────────────────────── */}
        <Secao
          titulo={`Automações ativas (${p.tabela.filter((t) => t.ativa).length} de ${p.tabela.length})`}
          descricao="As colunas de mensagens, respostas, recuperações e vendas do desenho não estão medidas — e ficam escritas como não medidas, nunca como zero."
        >
          {p.tabela.length ? (
            <Tabela
              colunas={["#", "Nome da automação", "Gatilho", "Passos", "Leads no fluxo", "Mensagens", "Respostas", "Recuperações", "Vendas (R$)", "Status"]}
            >
              {p.tabela.map((t) => (
                <Linha key={t.slug}>
                  <Celula numero>{t.ordem}</Celula>
                  <Celula forte>{t.nome}</Celula>
                  <Celula>{t.gatilho}</Celula>
                  <Celula numero>{t.passos}</Celula>
                  <Celula numero forte>{t.leadsNoFluxo}</Celula>
                  <Celula>
                    <NaoMedido motivo={t.porqueSemNumeros} />
                  </Celula>
                  <Celula>
                    <span className="italic text-muted">não medido</span>
                  </Celula>
                  <Celula>
                    <span className="italic text-muted">não medido</span>
                  </Celula>
                  <Celula>
                    <span className="italic text-muted">não medido</span>
                  </Celula>
                  <Celula>
                    <Pilula tom={t.ativa ? "verde" : "cinza"}>{t.ativa ? "Ativa" : "Pausada"}</Pilula>
                  </Celula>
                </Linha>
              ))}
            </Tabela>
          ) : (
            <Vazio motivo="nenhuma cadência cadastrada no banco — não há automação a listar, e listar uma de exemplo ensinaria a operação a contar com o que não existe." />
          )}
        </Secao>

        {/* ── O que falta para o construtor gravar ───────────────────────── */}
        <Secao
          titulo="O que falta para o construtor ser editável"
          descricao="A lacuna sobe escrita, e não morre num commit. É isto que separa a tela de leitura de um construtor de verdade."
        >
          <ul className="flex flex-col gap-1.5">
            {p.oQueFaltaParaEditar.map((x) => (
              <li
                key={x}
                className={cx(
                  "flex items-start gap-2 rounded-xl border border-line bg-paper px-3 py-2",
                  "text-[12px] leading-snug text-ink2",
                )}
              >
                <Icone nome="alerta" className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
                <span>{x}</span>
              </li>
            ))}
          </ul>
        </Secao>

        {/* ── O não medido ──────────────────────────────────────────────── */}
        <Secao
          titulo="O que esta tela NÃO mediu"
          descricao="Inteiro e por escrito. Buraco declarado é buraco que alguém pode tapar."
        >
          <ul className="flex flex-col gap-1.5">
            {p.naoMedido.map((m) => (
              <li key={m} className="rounded-xl border border-line bg-paper px-3 py-2">
                <NaoMedido motivo={m} />
              </li>
            ))}
          </ul>
        </Secao>
      </Corpo>
    </div>
  );
}
