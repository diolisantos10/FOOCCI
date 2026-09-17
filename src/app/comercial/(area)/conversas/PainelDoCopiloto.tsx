"use client";

/**
 * ⭐ O COPILOTO — a coluna direita da tela de atendimento.
 *
 * ── ⛔ A REGRA QUE VALE MAIS QUE TODO O RESTO DESTE ARQUIVO ────────────────
 *
 * **"Usar sugestão" NÃO ENVIA.** Ela escreve o texto no campo de digitação e
 * para ali. Quem envia é a pessoa, depois de ler, no botão do rodapé da
 * conversa — que é outro componente, outra rota, outra decisão.
 *
 * Isto é verificável e está verificado: este arquivo não importa `escrever`
 * nem qualquer coisa que fale com `/conversa`, e há teste de contrato lendo o
 * fonte para garantir que continue assim. Um copiloto que enviasse sozinho
 * seria a IA falando com o cliente sem revisor — e é exatamente por não haver
 * revisor que a Supervisora existe do outro lado.
 *
 * ── O QUE A TELA MOSTRA, E POR QUE NESTA ORDEM ─────────────────────────────
 *
 *   1. O contexto (os 14 itens)  — vem do banco, custa nada, carrega sozinho.
 *   2. A leitura da IA           — custa uma chamada, só sai a pedido.
 *
 * O contexto vem primeiro porque é o que o documento chama de "não receber
 * conversa zerada": ele vale mesmo quando o motor de IA está fora do ar.
 *
 * ── E O QUE FALTA APARECE COMO FALTA ───────────────────────────────────────
 *
 * `painel.ausentes` vira uma linha explícita ("ninguém apurou: decisor,
 * campanha"). Um campo vazio sem aviso o vendedor lê como "não tem"; a lista
 * transforma isso na pergunta que ele precisa fazer.
 */

import { useState } from "react";
import type { PainelDoVendedor, ItemDoPainel } from "@/services/salaDeVendas/painelDoVendedor";
import { ROTULO_DO_ITEM } from "@/services/salaDeVendas/painelDoVendedor";
import type { LeituraDoCopiloto } from "@/services/salaDeVendas/copiloto";
import {
  useCopiloto,
  registrarNoCrm,
  devolverParaIA,
  type EstadoDoCopiloto,
} from "./_copiloto";
import { dataHoraCurta, desde } from "./_dados";

function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}

export function PainelDoCopiloto({
  estado,
  pedirLeitura,
  recarregar,
  aoUsarSugestao,
  aoAvisar,
  aoMudar,
}: {
  estado: EstadoDoCopiloto;
  pedirLeitura: () => void;
  recarregar: () => void;
  /**
   * ⚠️ O ÚNICO caminho de uma sugestão para fora deste componente: ela vira
   * texto no campo de digitação. Não existe segundo caminho.
   */
  aoUsarSugestao: (texto: string) => void;
  aoAvisar: (s: string | null) => void;
  aoMudar: () => void;
}) {
  if (estado.fase === "vazio") {
    return (
      <p className="p-4 text-[13px] leading-relaxed text-muted">
        Abra uma conversa e o copiloto prepara o contexto.
      </p>
    );
  }

  if (estado.fase === "carregando") {
    return <p className="p-4 text-[13px] text-muted">Reunindo o contexto…</p>;
  }

  if (estado.fase === "semAcesso") {
    return <p className="p-4 text-[13px] text-muted">Sem acesso ao copiloto desta conversa.</p>;
  }

  if (estado.fase === "erro") {
    return (
      <div className="p-4">
        <p className="text-[13.5px] leading-relaxed text-ink2">
          {estado.detalhe ?? "Não foi possível montar o copiloto."}
        </p>
        <button
          onClick={recarregar}
          className="mt-2 rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 hover:bg-canvas"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { painel, leitura, falha } = estado.dados;

  return (
    <div className="p-3">
      <Contexto painel={painel} />

      <BlocoDaIA
        leitura={leitura}
        falha={falha}
        lendo={estado.lendo}
        pedirLeitura={pedirLeitura}
        aoUsarSugestao={aoUsarSugestao}
      />

      <Atalhos
        painel={painel}
        leitura={leitura}
        aoAvisar={aoAvisar}
        aoMudar={aoMudar}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. O CONTEXTO — os catorze itens
// ═══════════════════════════════════════════════════════════════════════════

function Contexto({ painel }: { painel: PainelDoVendedor }) {
  const h = painel.oQueOHunterAchou;
  const s = painel.oQueOSdrDescobriu;

  return (
    <>
      <Secao titulo="Resumo da IA">
        {painel.resumoDaIA ? (
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">
            {painel.resumoDaIA}
          </p>
        ) : (
          <Ausente>
            A IA ainda não passou esta conversa para ninguém, então não há resumo de
            passagem. Peça a leitura abaixo para ter um resumo de agora.
          </Ausente>
        )}
      </Secao>

      <Secao titulo="De onde veio">
        <Linha rotulo="Origem" valor={painel.origem} />
        <Linha rotulo="Campanha" valor={painel.campanha} />
        <Linha rotulo="Produto" valor={painel.produto} />
        <Linha rotulo="Etapa" valor={painel.estagio} />
        <Linha
          rotulo="Lead score"
          valor={
            painel.leadScore
              ? `${painel.leadScore.valor}${painel.leadScore.temperatura ? ` · ${painel.leadScore.temperatura.toLowerCase().replace("_", " ")}` : ""}`
              : null
          }
        />
      </Secao>

      <Secao titulo="Necessidade e objeções">
        {painel.necessidade ? (
          <p className="text-[12.5px] leading-relaxed text-ink">{painel.necessidade}</p>
        ) : (
          <Ausente>Ninguém registrou a dor deste lead ainda.</Ausente>
        )}

        {painel.objecoes.length > 0 ? (
          <ul className="mt-2 flex flex-col gap-1">
            {painel.objecoes.map((o) => (
              <li
                key={o}
                className="rounded-lg bg-amber-50 px-2 py-1 text-[12px] leading-relaxed text-amber-900"
              >
                {o}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[11.5px] leading-relaxed text-muted">
            Nenhuma objeção registrada — o que não quer dizer que não exista.
          </p>
        )}
      </Secao>

      <Secao titulo="Quem decide">
        {painel.decisor ? (
          <>
            <p className="text-[13px] font-semibold text-ink">{painel.decisor.nome}</p>
            <Linha rotulo="Cargo" valor={painel.decisor.cargo} />
            <Linha rotulo="Canal" valor={painel.decisor.canal} />
            <Linha rotulo="Como se chegou" valor={painel.decisor.comoFoiDescoberto} />
            <Linha rotulo="Confiança" valor={painel.decisor.confianca} />
          </>
        ) : (
          <Ausente>
            Não há decisor confirmado. Falar de contrato com quem não assina queima a
            conta, não só a ligação.
          </Ausente>
        )}
      </Secao>

      <Secao titulo="O que o Hunter achou">
        {h ? (
          <>
            <p className="text-[13px] font-semibold text-ink">{h.empresa}</p>
            <Linha rotulo="Categoria" valor={h.categoria} />
            <Linha
              rotulo="Onde"
              valor={[h.cidade, h.estado].filter(Boolean).join("/") || null}
            />
            <Linha rotulo="Unidades" valor={h.unidades?.toString() ?? null} />
            <Linha
              rotulo="Marketplaces"
              valor={h.marketplaces.length ? h.marketplaces.join(", ") : null}
            />
            {/* `null` = ninguém apurou; `false` = apurado e não tem. A tela
                precisa dizer qual dos dois — ver o schema de `Empresa`. */}
            <Linha rotulo="Delivery próprio" valor={simNaoOuNada(h.deliveryProprio)} />
            <Linha rotulo="Cardápio próprio" valor={simNaoOuNada(h.cardapioProprio)} />
            <Linha rotulo="Sistema hoje" valor={h.sistemaIdentificado} />
            <Linha rotulo="ICP" valor={h.scoreIcp?.toString() ?? null} />
            <Linha rotulo="Veio de" valor={h.fonteDaDescoberta} />
          </>
        ) : (
          <Ausente>
            Este lead não tem empresa descoberta — ele chegou por formulário ou anúncio,
            não pela prospecção.
          </Ausente>
        )}
      </Secao>

      <Secao titulo="O que o SDR descobriu">
        {s ? (
          <>
            <Linha rotulo="Segmento" valor={s.segmento} />
            <Linha rotulo="Unidades" valor={s.unidades?.toString() ?? null} />
            <Linha rotulo="Pedidos/mês" valor={s.volumeMensal?.toString() ?? null} />
            <Linha
              rotulo="Canais hoje"
              valor={s.canaisAtuais.length ? s.canaisAtuais.join(", ") : null}
            />
            <Linha rotulo="Sistema atual" valor={s.sistemaAtual} />
            <Linha rotulo="Para quando" valor={s.urgencia} />
            <Linha rotulo="Quem decide" valor={s.poderDeDecisao} />
            <Linha rotulo="Orçamento" valor={s.faixaDeOrcamento} />
          </>
        ) : (
          <Ausente>Ninguém qualificou este lead ainda.</Ausente>
        )}
      </Secao>

      {painel.oportunidade && (
        <Secao titulo="Oportunidade">
          <Linha rotulo="Estágio" valor={painel.oportunidade.estagio} />
          <Linha rotulo="Produto" valor={painel.oportunidade.produtoDeInteresse} />
          <Linha
            rotulo="Valor potencial"
            valor={emReais(painel.oportunidade.valorPotencialCents)}
          />
          <Linha
            rotulo="Probabilidade"
            valor={
              painel.oportunidade.probabilidade === null
                ? null
                : `${painel.oportunidade.probabilidade}%`
            }
          />
        </Secao>
      )}

      <Secao titulo="Histórico">
        {painel.interacoesAnteriores ? (
          <p className="mb-1.5 text-[12px] text-ink2">
            {painel.interacoesAnteriores.total} interação(ões)
            {painel.interacoesAnteriores.ultimaEm
              ? ` · última ${desde(painel.interacoesAnteriores.ultimaEm)}`
              : ""}
          </p>
        ) : (
          <Ausente>Nenhuma interação anterior registrada.</Ausente>
        )}

        {painel.historico.length > 0 && (
          <ol className="flex flex-col">
            {painel.historico.map((e, i) => (
              <li key={`${e.quando}-${i}`} className="border-l-2 border-line2 py-1 pl-2.5">
                <p className="text-[12px] leading-snug text-ink">{e.titulo}</p>
                <p className="text-[11px] text-muted">
                  {dataHoraCurta(e.quando)} · {e.autor}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Secao>

      <Secao titulo="Próxima ação">
        {painel.proximaAcao ? (
          <p className="text-[12.5px] leading-relaxed text-ink">
            {painel.proximaAcao.nota ?? "—"}
            {painel.proximaAcao.quando && (
              <span className="text-muted"> ({desde(painel.proximaAcao.quando)})</span>
            )}
          </p>
        ) : (
          <Ausente>Nenhuma próxima ação combinada.</Ausente>
        )}
      </Secao>

      <OQueNinguemApurou ausentes={painel.ausentes} />
    </>
  );
}

/**
 * A lista do que falta.
 *
 * Existe porque campo vazio, sozinho, o vendedor lê como "não tem". Dito assim,
 * vira a pergunta que ele precisa fazer na próxima mensagem.
 */
function OQueNinguemApurou({ ausentes }: { ausentes: ItemDoPainel[] }) {
  if (ausentes.length === 0) return null;

  return (
    <section className="mb-4 rounded-2xl border border-dashed border-line2 bg-canvas p-3">
      <h3 className="mb-1 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        Ninguém apurou ainda
      </h3>
      <p className="text-[12px] leading-relaxed text-ink2">
        {ausentes.map((a) => ROTULO_DO_ITEM[a]).join(" · ")}
      </p>
      <p className="mt-1 text-[11px] leading-relaxed text-muted">
        Vazio aqui quer dizer <strong>ninguém mediu</strong> — não quer dizer que não
        exista.
      </p>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. A LEITURA DA IA
// ═══════════════════════════════════════════════════════════════════════════

function BlocoDaIA({
  leitura,
  falha,
  lendo,
  pedirLeitura,
  aoUsarSugestao,
}: {
  leitura: LeituraDoCopiloto | null;
  falha: { causa: string; explicacao: string } | null;
  lendo: boolean;
  pedirLeitura: () => void;
  aoUsarSugestao: (texto: string) => void;
}) {
  return (
    <section className="mb-4 rounded-2xl border border-brand-200 bg-brand-50/40 p-3">
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h3 className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
          Leitura do copiloto
        </h3>
        <button
          onClick={pedirLeitura}
          disabled={lendo}
          className="shrink-0 rounded-xl bg-brand-500 px-2.5 py-1 text-[12px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {lendo ? "Lendo…" : leitura ? "Ler de novo" : "Ler a conversa"}
        </button>
      </div>

      {falha && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
          <p className="text-[12px] leading-relaxed text-amber-900">{falha.explicacao}</p>
          <button
            onClick={pedirLeitura}
            disabled={lendo}
            className="mt-1.5 text-[12px] font-semibold text-amber-900 underline underline-offset-2 disabled:opacity-50"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {!leitura && !falha && !lendo && (
        <p className="text-[12px] leading-relaxed text-muted">
          A leitura custa uma chamada de IA, então ela só sai quando você pede. O
          contexto acima veio do banco e já está completo.
        </p>
      )}

      {leitura && (
        <>
          <p className="whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">
            {leitura.resumo}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="rounded-full border border-line2 bg-paper px-2 py-0.5 text-[11.5px] font-semibold text-ink2">
              {leitura.rotuloDaIntencao}
            </span>
            {/* A confiança é do MODELO sobre a própria leitura — não é
                probabilidade de venda. O título deixa isso escrito porque a
                confusão entre as duas faz vendedor priorizar pelo número errado. */}
            <span
              title="O quanto o modelo confia nesta leitura — não é chance de fechar"
              className="rounded-full bg-ink px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-paper"
            >
              {leitura.confianca}%
            </span>
          </div>

          {leitura.objecoes.length > 0 && (
            <ul className="mt-2 flex flex-col gap-1">
              {leitura.objecoes.map((o, i) => (
                <li
                  key={`${o.codigo}-${i}`}
                  className="rounded-lg bg-amber-50 px-2 py-1 text-[12px] leading-relaxed text-amber-900"
                >
                  <span className="font-semibold">{o.rotulo}</span>
                  {o.detalhe && <span className="block italic">“{o.detalhe}”</span>}
                </li>
              ))}
            </ul>
          )}

          {leitura.proximaAcao && (
            <p className="mt-2 rounded-lg bg-paper px-2 py-1.5 text-[12.5px] leading-relaxed text-ink">
              <span className="font-semibold">Melhor próxima ação:</span>{" "}
              {leitura.proximaAcao}
            </p>
          )}

          {leitura.sugestoes.length > 0 && (
            <div className="mt-3 flex flex-col gap-2">
              {leitura.sugestoes.map((s, i) => (
                <div key={i} className="rounded-xl border border-line bg-paper p-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[.04em] text-muted">
                    {s.angulo}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed text-ink">
                    {s.texto}
                  </p>
                  {/* ⛔ Este botão NÃO envia. Ele escreve no campo de digitação e
                      para. Quem envia é a pessoa, no rodapé da conversa. */}
                  <button
                    onClick={() => aoUsarSugestao(s.texto)}
                    className="mt-1.5 w-full rounded-lg border border-brand-300 px-2 py-1 text-[12px] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
                  >
                    Usar sugestão
                  </button>
                </div>
              ))}
              <p className="text-[11px] leading-relaxed text-muted">
                “Usar sugestão” só escreve o texto no campo de envio. Nada sai daqui sem
                você ler e apertar enviar.
              </p>
            </div>
          )}

          <p className="mt-2 text-[10.5px] text-muted">
            Lido sobre {leitura.turnosLidos} mensagem(ns) · {leitura.motor}
          </p>
        </>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. OS ATALHOS
// ═══════════════════════════════════════════════════════════════════════════

function Atalhos({
  painel,
  leitura,
  aoAvisar,
  aoMudar,
}: {
  painel: PainelDoVendedor;
  leitura: LeituraDoCopiloto | null;
  aoAvisar: (s: string | null) => void;
  aoMudar: () => void;
}) {
  const [ocupado, setOcupado] = useState(false);
  const [objetivo, setObjetivo] = useState("");
  const [devolvendo, setDevolvendo] = useState(false);

  const temOQueGravar = Boolean(
    leitura && (leitura.objecoes.length || leitura.proximaAcao || painel.necessidade),
  );

  async function gravar() {
    if (!leitura || ocupado) return;
    setOcupado(true);
    const r = await registrarNoCrm({
      leadId: painel.leadId,
      // As objeções sobem pelo RÓTULO em português, não pelo código do enum: é
      // isso que um humano vai ler na ficha daqui a três semanas.
      objecoes: leitura.objecoes.map((o) => (o.detalhe ? `${o.rotulo}: ${o.detalhe}` : o.rotulo)),
      necessidade: painel.necessidade,
      proximaAcao: leitura.proximaAcao,
    });
    setOcupado(false);

    if (!r.ok) {
      aoAvisar(r.mensagem);
      return;
    }
    aoAvisar(
      r.gravados?.length
        ? `Registrado: ${r.gravados.join(", ")}.`
        : "Nada novo para registrar — já estava tudo lá.",
    );
    aoMudar();
  }

  async function devolver() {
    const alvo = objetivo.trim();
    if (!alvo || ocupado) return;
    setOcupado(true);
    const r = await devolverParaIA({
      leadId: painel.leadId,
      objetivo: alvo,
      resumo: leitura?.resumo ?? painel.resumoDaIA,
      proximaAcao: leitura?.proximaAcao ?? null,
    });
    setOcupado(false);

    if (!r.ok) {
      aoAvisar(r.mensagem);
      return;
    }
    setObjetivo("");
    setDevolvendo(false);
    aoAvisar("Conversa devolvida para a IA. Quem devolveu e para quê ficou na trilha.");
    aoMudar();
  }

  return (
    <section className="mb-4 rounded-2xl border border-line bg-paper p-3">
      <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        Atalhos
      </h3>

      <button
        onClick={gravar}
        disabled={!temOQueGravar || ocupado}
        className="mb-2 w-full rounded-xl border border-line2 px-3 py-2 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas disabled:opacity-40"
      >
        Registrar no CRM
      </button>
      {!temOQueGravar && (
        <p className="mb-2 text-[11px] leading-relaxed text-muted">
          Peça a leitura acima primeiro — não há nada aprendido para gravar.
        </p>
      )}

      {!devolvendo ? (
        <button
          onClick={() => setDevolvendo(true)}
          className="w-full rounded-xl border border-line2 px-3 py-2 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
        >
          Devolver para IA
        </button>
      ) : (
        <div className="rounded-xl border border-line2 bg-canvas p-2">
          {/* O objetivo é obrigatório no serviço. Pedi-lo AQUI evita o vendedor
              apertar, receber recusa e não saber o que corrigir. */}
          <label className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
            Para quê está devolvendo
          </label>
          <textarea
            value={objetivo}
            onChange={(e) => setObjetivo(e.target.value)}
            rows={2}
            placeholder="Ex.: confirmar o horário da demonstração de quinta"
            className="mt-1 w-full resize-none rounded-xl border border-line2 bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand-400"
          />
          <div className="mt-1.5 flex gap-1.5">
            <button
              onClick={devolver}
              disabled={!objetivo.trim() || ocupado}
              className="flex-1 rounded-xl bg-brand-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
            >
              {ocupado ? "…" : "Devolver"}
            </button>
            <button
              onClick={() => {
                setDevolvendo(false);
                setObjetivo("");
              }}
              className="rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 hover:bg-paper"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Peças pequenas
// ═══════════════════════════════════════════════════════════════════════════

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl border border-line bg-paper p-3">
      <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

/** O vazio com nome. Nunca um traço solto. */
function Ausente({ children }: { children: React.ReactNode }) {
  return <p className="text-[12px] leading-relaxed text-muted">{children}</p>;
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <p className="flex items-baseline justify-between gap-2 py-0.5 text-[12.5px]">
      <span className="shrink-0 text-muted">{rotulo}</span>
      <span className={cx("truncate text-right", valor ? "text-ink2" : "text-muted")}>
        {valor || "não apurado"}
      </span>
    </p>
  );
}

/** `null` = ninguém apurou. `false` = apurado e não tem. São coisas diferentes. */
function simNaoOuNada(v: boolean | null): string | null {
  if (v === null) return null;
  return v ? "sim" : "não (apurado)";
}

function emReais(cents: number | null): string | null {
  if (cents === null) return null;
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
