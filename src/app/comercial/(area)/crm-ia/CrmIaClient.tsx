"use client";

/**
 * A PEÇA 11 DO CEO — CRM IA / DEPARTAMENTO DE CRM.
 *
 * ── A LEITURA LITERAL DO DESENHO ────────────────────────────────────────────
 *
 * Seis indicadores no topo. À esquerda, Segmentos / Listas de CRM. Ao centro, o
 * Plano do dia com quatro filtros e uma linha por contato. À direita, a coluna
 * da IA: diagnóstico, campanha recomendada, próximos disparos com horário e as
 * ações automáticas em interruptores. No rodapé, Oportunidades por segmento em
 * colunas verticais e a Automação em destaque desenhada em blocos.
 *
 * ── ⚠️ QUAL CRM ─────────────────────────────────────────────────────────────
 *
 * O NOSSO: os leads da Sala de Vendas, donos de restaurante que estamos
 * vendendo. O CRM do restaurante (o dono falando com os clientes DELE) é outro
 * produto, em `src/services/crm/**`, e não encosta nesta tela.
 *
 * ── ⛔ NADA AQUI DISPARA ────────────────────────────────────────────────────
 *
 * Não há botão "Usar esta campanha" e os interruptores não clicam. O envio está
 * pausado por ordem do CEO, e cada um desses controles seria disparo em massa a
 * um toque de distância. O desenho manda na FORMA; o que não pode existir como
 * ato não vira botão, e a ausência fica escrita na tela em vez de virar um
 * controle que engana.
 *
 * ── E O QUE NÃO SE MEDE NÃO VIRA ZERO ───────────────────────────────────────
 *
 * "vs. ontem" não existe (não há fotografia de ontem). O status "Aprovado" do
 * desenho não existe (não há aprovação no banco). A "janela ideal" é a da CASA,
 * não uma predição por contato. Os três estão escritos na tela, não escondidos.
 */

import { useEffect, useMemo, useState } from "react";
import type {
  PanoramaDaCrmIa,
  ChaveDeSegmento,
  StatusDaLinha,
} from "@/services/salaDeVendas/telas/crmIa";
import {
  Aviso,
  BlocoDaJornada,
  Caixa,
  Carregando,
  CartaoDeIA,
  Celula,
  Colunas,
  Corpo,
  Erro,
  FilaDeIndicadores,
  Icone,
  Indicador,
  Interruptor,
  Jornada,
  Linha,
  NaoMedido,
  Pilula,
  SemAcesso,
  Secao,
  Seletor,
  SetaDaJornada,
  Tabela,
  TituloDaPagina,
  Vazio,
  cx,
  emReais,
  type Fase,
  type NomeDeIcone,
  type Tom,
  type TipoDoBloco,
} from "../_pecas/Pecas";

/** O tom e o ícone de cada indicador — as cores do desenho, pelos tokens. */
const CARA_DO_INDICADOR: Record<string, { tom: Tom; icone: NomeDeIcone }> = {
  contatosAnalisados: { tom: "azul", icone: "pessoas" },
  followUpsDoDia: { tom: "verde", icone: "relogio" },
  propostasSemRetorno: { tom: "ambar", icone: "funil" },
  clientesEmRisco: { tom: "vermelho", icone: "alerta" },
  reativacoes: { tom: "roxo", icone: "faisca" },
  receitaPotencial: { tom: "verde", icone: "dinheiro" },
};

const CARA_DO_SEGMENTO: Record<ChaveDeSegmento, { tom: Tom; icone: NomeDeIcone }> = {
  leadsSemResposta: { tom: "azul", icone: "pessoas" },
  propostasParadas: { tom: "ambar", icone: "funil" },
  reunioesPosDemo: { tom: "roxo", icone: "agenda" },
  clientesParaRecompra: { tom: "verde", icone: "dinheiro" },
  upsell: { tom: "azul", icone: "grafico" },
  reativacao: { tom: "roxo", icone: "faisca" },
  riscoDeChurn: { tom: "vermelho", icone: "alerta" },
};

const ROTULO_DO_STATUS: Record<StatusDaLinha, { texto: string; tom: Tom }> = {
  PENDENTE: { texto: "Pendente", tom: "ambar" },
  EM_EXECUCAO: { texto: "Em execução", tom: "azul" },
};

function hora(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function CrmIaClient() {
  const [fase, setFase] = useState<Fase<PanoramaDaCrmIa>>({ fase: "carregando" });

  const [fSegmento, setFSegmento] = useState("");
  const [fCanal, setFCanal] = useState("");
  const [fStatus, setFStatus] = useState("");
  const [fCadencia, setFCadencia] = useState("");

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/crm-ia", { cache: "no-store" });
        const j = (await r.json()) as { ok: boolean; data?: PanoramaDaCrmIa; error?: string };
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

  const p = fase.fase === "pronto" ? fase.dados : null;

  const linhas = useMemo(() => {
    if (!p) return [];
    return p.plano.filter(
      (l) =>
        (!fSegmento || l.segmento === fSegmento) &&
        (!fCanal || l.canal === fCanal) &&
        (!fStatus || l.status === fStatus) &&
        (!fCadencia || l.cadenciaSlug === fCadencia),
    );
  }, [p, fSegmento, fCanal, fStatus, fCadencia]);

  if (fase.fase === "carregando") return <Carregando texto="Varrendo a base e montando o plano do dia…" />;
  if (fase.fase === "semAcesso") return <SemAcesso />;
  if (fase.fase === "erro") return <Erro detalhe={fase.detalhe} />;
  if (!p) return <Erro detalhe="a leitura voltou vazia" />;

  const cadenciasNoPlano = [...new Set(p.plano.map((l) => l.cadenciaSlug).filter(Boolean))] as string[];

  return (
    <div className="flex flex-col gap-5">
      <TituloDaPagina
        titulo="CRM IA / Departamento de CRM"
        subtitulo="Gerencie relacionamento, follow-ups, reativações e oportunidades com inteligência."
        periodo={hora(p.emitidoEm)}
        atualidade="Lido agora"
      />

      {/* ── ⛔ A trava, escrita antes de qualquer número ─────────────────── */}
      <Aviso>
        <strong>Esta tela não envia nada.</strong> Não há botão de campanha nem
        interruptor clicável: o envio está pausado por ordem do CEO e cada um
        desses controles seria disparo em massa a um toque. Os interruptores
        abaixo mostram o estado <em>medido</em> das chaves e dizem onde cada uma
        se muda de verdade.
      </Aviso>

      {/* ── Os seis indicadores ───────────────────────────────────────────── */}
      <FilaDeIndicadores colunas={5}>
        {p.indicadores.map((i) => {
          const cara = CARA_DO_INDICADOR[i.chave] ?? { tom: "azul" as Tom, icone: "grafico" as NomeDeIcone };
          return (
            <Indicador
              key={i.chave}
              rotulo={i.rotulo}
              tom={cara.tom}
              icone={cara.icone}
              valor={i.valor === null ? null : i.emCents ? emReais(i.valor) : i.valor}
              motivo={i.porqueNaoMedido ?? undefined}
              variacao={i.porqueSemVariacao}
              rodape={
                i.semEstimativa !== null && i.semEstimativa > 0 ? (
                  <span>
                    {i.semEstimativa} item(ns) entraram sem valor estimado — este número é um{" "}
                    <strong>piso</strong>, não um total.
                  </span>
                ) : null
              }
            />
          );
        })}
      </FilaDeIndicadores>

      <Corpo
        lateral={
          <>
            {/* ── Diagnóstico do dia ─────────────────────────────────────── */}
            <CartaoDeIA titulo="Diagnóstico do dia">
              <ul className="flex list-disc flex-col gap-1 pl-4">
                {p.diagnostico.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </CartaoDeIA>

            {/* ── Campanha recomendada — sem botão de usar ────────────────── */}
            <CartaoDeIA titulo="Campanha recomendada" tom="azul">
              {p.campanha ? (
                <div className="flex flex-col gap-1.5">
                  <p>
                    <strong>{p.campanha.tamanho}</strong> contato(s) no público ·{" "}
                    objetivo: {p.campanha.objetivo} · prazo {p.campanha.prazo} dias
                  </p>
                  <ul className="list-disc pl-4">
                    {p.campanha.caracteristicas.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                  <p>
                    <strong>Ação recomendada:</strong> {p.campanha.acaoRecomendada}
                  </p>
                  <p>
                    <strong>Objeção principal:</strong>{" "}
                    {p.campanha.objecaoPrincipal ?? (
                      <NaoMedido motivo="objeção por lead não é registrada em lugar nenhum do banco — não há modelo para ela." />
                    )}
                  </p>
                  <p>
                    <strong>Receita potencial do público:</strong>{" "}
                    {emReais(p.campanha.receitaPotencial.cents)}{" "}
                    {p.campanha.receitaPotencial.semEstimativa > 0 ? (
                      <span className="text-muted">
                        (piso — {p.campanha.receitaPotencial.semEstimativa} sem estimativa)
                      </span>
                    ) : null}
                  </p>
                  {/* ⛔ Onde o desenho tem "Usar esta campanha →", fica a ausência escrita. */}
                  <p className="mt-1 rounded-xl bg-chip px-2.5 py-2 text-[11.5px] leading-snug text-ink2">
                    <strong>Sem botão de usar.</strong> {p.campanha.porqueNaoDispara}
                  </p>
                </div>
              ) : (
                <Vazio motivo={p.porqueSemCampanha ?? "sem motivo declarado — e isso também é um defeito"} />
              )}
            </CartaoDeIA>

            {/* ── Próximos disparos, com horário ──────────────────────────── */}
            <Caixa>
              <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                <Icone nome="relogio" className="h-4 w-4 text-muted" />
                Próximos disparos
              </h3>
              <div className="mt-2">
                {p.disparos.length ? (
                  <ul className="flex flex-col gap-1.5">
                    {p.disparos.map((d) => (
                      <li key={`${d.leadId}-${String(d.quando)}`} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-[12px]">
                        <span className="font-semibold tabular-nums text-ink">{hora(d.quando)}</span>
                        <span className="text-ink2">{d.nome}</span>
                        <span className="text-muted">
                          {d.cadencia}
                          {d.passo ? ` · ${d.passo}` : ""}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Vazio motivo={p.porqueSemDisparos ?? "sem motivo declarado"} />
                )}
                {p.disparos.length && !p.interruptores.find((i) => i.chave === "followUpAutomatico")?.ligado ? (
                  <p className="mt-2 text-[11.5px] leading-snug text-muted">
                    Estes passos estão <strong>agendados</strong>. Com o envio desligado eles
                    vencem e a mensagem fica pendente — nenhum deles sai.
                  </p>
                ) : null}
              </div>
            </Caixa>

            {/* ── Ações automáticas — interruptores de LEITURA ────────────── */}
            <Caixa>
              <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink">
                <Icone nome="chave" className="h-4 w-4 text-muted" />
                Ações automáticas
              </h3>
              <div className="mt-1">
                {p.interruptores.map((i) => (
                  <Interruptor
                    key={i.chave}
                    rotulo={i.rotulo}
                    descricao={i.descricao}
                    ligado={i.ligado}
                    motivo={i.porqueNaoMedido ?? undefined}
                    ondeSeMuda={i.ondeSeMuda}
                  />
                ))}
              </div>
            </Caixa>
          </>
        }
      >
        {/* ── Segmentos / Listas de CRM ──────────────────────────────────── */}
        <Secao
          titulo="Segmentos / Listas de CRM"
          descricao="Cada lista é uma régua escrita em código, não um filtro salvo por alguém. Clique para filtrar o plano do dia."
        >
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
            {p.segmentos.map((s) => {
              const cara = CARA_DO_SEGMENTO[s.chave];
              const sel = fSegmento === s.chave;
              return (
                <li key={s.chave}>
                  <button
                    type="button"
                    aria-pressed={sel}
                    onClick={() => setFSegmento(sel ? "" : s.chave)}
                    className={cx(
                      "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors",
                      sel ? "border-brand-200 bg-brand-50" : "border-line bg-paper hover:bg-chip",
                    )}
                  >
                    <Icone nome={cara.icone} className="h-4 w-4 shrink-0 text-muted" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-semibold text-ink">{s.rotulo}</span>
                      <span className="block text-[11px] leading-snug text-muted">{s.regra}</span>
                    </span>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ink">{s.total}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Secao>

        {/* ── Plano do dia da CRM IA ─────────────────────────────────────── */}
        <Secao
          titulo="Plano do dia da CRM IA"
          descricao="Uma linha por contato: o segmento que o alcançou, a próxima ação que a régua faria, o canal, a janela e o potencial. Sugestão — nada é executado ao abrir esta tela."
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-paper px-3 py-2">
            <Seletor
              rotulo="Segmento"
              valor={fSegmento}
              aoMudar={setFSegmento}
              opcoes={p.filtros.segmentos.map((s) => ({ valor: s.chave, rotulo: s.rotulo }))}
            />
            <Seletor
              rotulo="Canal"
              valor={fCanal}
              aoMudar={setFCanal}
              opcoes={p.filtros.canais.map((c) => ({ valor: c, rotulo: c }))}
            />
            <Seletor
              rotulo="Status"
              valor={fStatus}
              aoMudar={setFStatus}
              opcoes={p.filtros.status.map((s) => ({ valor: s, rotulo: ROTULO_DO_STATUS[s].texto }))}
            />
            {/*
              ⚠️ O quarto filtro do desenho é "Responsável". Ele NÃO existe aqui:
              o plano do dia não atribui dono a uma sugestão — a atribuição de
              lead vive no funil e não é o que esta tela lista. No lugar dele
              fica a cadência, que é o recorte real que a linha carrega.
            */}
            <Seletor
              rotulo="Automação"
              valor={fCadencia}
              aoMudar={setFCadencia}
              opcoes={cadenciasNoPlano.map((c) => ({ valor: c, rotulo: c }))}
            />
            <span className="ml-auto text-[11.5px] text-muted">
              {linhas.length} de {p.plano.length} linha(s)
            </span>
          </div>

          <p className="text-[11.5px] leading-snug text-muted">
            O filtro <strong>Responsável</strong> do desenho não está aqui: o plano
            do dia não atribui dono a uma sugestão, e um seletor que não filtra
            nada ensinaria a operação a contar com um recorte que a tela não faz.
          </p>

          {p.plano.length === 0 ? (
            <Vazio motivo="nenhum contato caiu num estado que peça ação nesta varredura. É ausência de pendência medida agora — não é 'tudo em dia'." />
          ) : linhas.length === 0 ? (
            <Vazio motivo="nenhuma linha passa nos filtros escolhidos. O plano tem linhas; este recorte é que não tem." />
          ) : (
            <Tabela
              colunas={[
                "Contato",
                "Segmento",
                "Próxima ação",
                "Canal",
                "Janela ideal",
                "Potencial",
                "Status",
              ]}
            >
              {linhas.map((l) => (
                <Linha key={l.leadId} alerta={l.segmento === "riscoDeChurn"}>
                  <Celula forte>
                    {l.nome}
                    <span className="mt-0.5 block text-[11px] font-normal leading-snug text-muted">
                      {l.porque}
                    </span>
                  </Celula>
                  <Celula>
                    <Pilula tom={CARA_DO_SEGMENTO[l.segmento].tom}>{l.segmentoRotulo}</Pilula>
                  </Celula>
                  <Celula>{l.proximaAcao}</Celula>
                  <Celula>{l.canal}</Celula>
                  <Celula>{l.janelaIdeal}</Celula>
                  <Celula numero forte>
                    {l.potencialCents === null ? (
                      <NaoMedido motivo="ninguém estimou o valor desta oportunidade — e nunca zero por omissão." />
                    ) : (
                      emReais(l.potencialCents)
                    )}
                  </Celula>
                  <Celula>
                    <Pilula tom={ROTULO_DO_STATUS[l.status].tom}>{ROTULO_DO_STATUS[l.status].texto}</Pilula>
                  </Celula>
                </Linha>
              ))}
            </Tabela>
          )}
        </Secao>

        {/* ── Rodapé: oportunidades por segmento + automação em destaque ─── */}
        <Secao
          titulo="Oportunidades por segmento"
          descricao="A contagem real de cada lista, lado a lado. Coluna ausente é coluna com zero medido — e o zero fica escrito."
        >
          {p.oportunidadesPorSegmento.some((o) => o.valor > 0) ? (
            <Colunas
              itens={p.oportunidadesPorSegmento}
              tons={["ambar", "roxo", "verde", "azul", "roxo", "vermelho"]}
            />
          ) : (
            <Vazio motivo="todos os segmentos vieram com zero nesta varredura. Isso foi medido: as réguas rodaram e ninguém casou com elas." />
          )}
        </Secao>

        <Secao
          titulo="Automação em destaque"
          descricao="A jornada real, como ela está no banco e no código. Não é um exemplo ilustrativo."
        >
          {p.automacaoEmDestaque ? (
            <Caixa>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[13px] font-semibold text-ink">{p.automacaoEmDestaque.nome}</h3>
                <Pilula tom={p.automacaoEmDestaque.ativa ? "verde" : "cinza"}>
                  {p.automacaoEmDestaque.ativa ? "Ativa" : "Inativa"}
                </Pilula>
                <span className="text-[11.5px] text-muted">
                  {p.automacaoEmDestaque.inscritosAtivos} inscrito(s) ativo(s)
                </span>
              </div>
              <div className="mt-3">
                <Jornada>
                  {p.automacaoEmDestaque.blocos.map((b, n) => (
                    <div key={`${b.titulo}-${n}`} className="flex w-full flex-col items-center">
                      {n > 0 ? <SetaDaJornada rotulo={b.ramo} /> : null}
                      <BlocoDaJornada tipo={b.tipo as TipoDoBloco} titulo={b.titulo} detalhe={b.detalhe} />
                    </div>
                  ))}
                </Jornada>
              </div>
            </Caixa>
          ) : (
            <Vazio motivo={p.porqueSemAutomacao ?? "sem motivo declarado"} />
          )}
        </Secao>

        {/* ── O não medido, reunido e visível ────────────────────────────── */}
        <Secao
          titulo="O que esta tela NÃO mediu"
          descricao="Fica aqui, inteiro e por escrito. Buraco declarado é buraco que alguém pode tapar; buraco preenchido com zero some da vista."
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
