"use client";

/**
 * O REVENUE SUPERVISOR, NA TELA.
 *
 * ── POR QUE ESTA SEÇÃO MORA DENTRO DO PAINEL, E NÃO NUMA TELA NOVA ──────────
 *
 * O painel do gerente já responde "o que exige ação agora". O supervisor
 * responde "por que o mês está assim". Separar as duas em telas diferentes
 * obrigaria o gerente a abrir duas para tomar uma decisão — e a segunda, que é a
 * que explica, seria a que ninguém abre. Fica em cima da mesma página, depois do
 * agora e antes do histórico.
 *
 * ── A ORDEM ─────────────────────────────────────────────────────────────────
 *
 * Diagnóstico primeiro. O documento é explícito: *"seu papel NÃO é apenas exibir
 * dashboards"*. Abrir com o funil ensinaria a olhar o gráfico e sair; abrir com
 * a causa provável entrega a conclusão e deixa o funil como prova embaixo.
 *
 * ── E A REGRA DE SEMPRE ─────────────────────────────────────────────────────
 *
 * Onde não há medição, a tela escreve **"não medido"** com o motivo — nunca
 * zero, nunca traço mudo. Uma etapa cega aparece em cinza declarado, e não
 * desaparece: etapa que some do radar é etapa que ninguém conserta.
 */

import { useEffect, useState } from "react";
import {
  Barra,
  CartaoDeIA,
  Celula,
  Corpo,
  FilaDeIndicadores,
  Indicador,
  Linha,
  Pilula,
  Rosca,
  SerieNoTempo,
  TituloDaPagina,
  Tabela,
  emReais,
  type NomeDeIcone,
  type Tom,
} from "../_pecas/Pecas";

/**
 * ⚠️ A COLUNA SLA DO DESENHO, E POR QUE ELA NÃO TRAZ TEMPO INVENTADO.
 *
 * `slaVenceEm` só passou a ser gravado em 18/09/2026. Etapa cuja duração o
 * serviço devolve como `semDados` aparece com o motivo escrito, nunca com um
 * tempo estimado nem com "0 atrasados": ausência de prazo não é ausência de
 * atraso, e as duas pedem trabalho oposto — uma é cobrar o time, a outra é
 * gravar o prazo.
 */
export const MOTIVO_DO_PRAZO_AUSENTE =
  "prazo não gravado nesta etapa (o campo passou a ser escrito em 18/09/2026) — ausência de prazo não é ausência de atraso";

/** O ícone e a cor de cada degrau do funil, na ordem do desenho. */
const TINTA_DO_DEGRAU: Array<{ icone: NomeDeIcone; tom: Tom }> = [
  { icone: "funil", tom: "azul" },
  { icone: "alvo", tom: "azul" },
  { icone: "porta", tom: "ambar" },
  { icone: "chave", tom: "roxo" },
  { icone: "agenda", tom: "azul" },
  { icone: "dinheiro", tom: "verde" },
  { icone: "coracao", tom: "verde" },
  { icone: "grafico", tom: "azul" },
];

type Taxa =
  | { medido: true; valor: number; base: number }
  | { medido: false; motivo: "amostraPequena"; base: number }
  | { medido: false; motivo: "semDados" };

type Duracao =
  | { medido: true; minutos: number; base: number }
  | { medido: false; motivo: "semDados" };

type Volume = { medido: true; total: number } | { medido: false; motivo: "semFonte" };

type Tendencia =
  | { medido: true; variacao: number; de: number; para: number }
  | { medido: false; motivo: "semComparacao" }
  | { medido: false; motivo: "baseZero"; para: number };

interface Degrau {
  etapa: string;
  rotulo: string;
  comoSeMede: string;
  ehRetrato: boolean;
  volume: Volume;
  conversao: Taxa | null;
  tendencia: Tendencia;
}

interface Parcela {
  fator: string;
  peso: number;
  nota: number;
  evidencia: string;
}

interface EtapaMedida {
  etapa: string;
  rotulo: string;
  oQuePrazoMede: string;
  slaMinutos: number;
  duracao: Duracao;
  dentroDoSla: Taxa;
  conversao: Taxa | null;
  volume: Volume;
  tendencia: Tendencia;
  gravidade:
    | { medido: true; valor: number; parcelas: Parcela[]; pesoMedido: number }
    | { medido: false; motivo: "semMedicao" };
}

interface Evidencia {
  afirmacao: string;
  numero: number;
  unidade: "contagem" | "fracao" | "minutos";
  base?: number;
}

type Diagnostico =
  | {
      medido: true;
      focoRotulo: string;
      queda: number;
      quedaDe: number;
      quedaPara: number;
      causaProvavel: string;
      problema: string | null;
      evidencias: Evidencia[];
      acaoRecomendada: string | null;
    }
  | { medido: false; motivo: string; detalhe: string };

type Medida<T> = { medido: true; valor: T } | { medido: false; motivo: string };

type Receita =
  | { medido: true; centavos: number; propostas: number }
  | { medido: false; motivo: "semValores"; propostas: number }
  | { medido: false; motivo: "semPropostas" };

/** Os quatro blocos da peça 13 medidos em `telas/inteligenciaDeReceita.ts`. */
export interface ExtrasDaReceita {
  reunioes: { marcadas: number; realizadas: number; naoCompareceram: number; semDesfecho: number };
  reativacao: { reativados: Medida<number>; aReativar: number };
  risco: { emRisco: number; limiar: number; semAvaliacao: number; total: number };
  receitaNoTempo: {
    pontos: Array<{ dia: string; acumuladoCents: number; propostas: number }>;
    aceitasSemValor: number;
    meta: Medida<number>;
    previsao: Medida<number>;
  };
}

export interface Visao {
  funil: { degraus: Degrau[]; pontaAPonta: Taxa | null };
  eficiencia: { etapas: EtapaMedida[]; gargalos: EtapaMedida[]; cegas: string[] };
  saude:
    | { medido: true; indice: number; parcelas: Parcela[]; pesoMedido: number; pesoTotal: number }
    | { medido: false; motivo: string; pesoTotal: number };
  diagnostico: Diagnostico;
  acoes: Array<{ origem: string; texto: string; porque: string }>;
  cegas: string[];
  /** Já vinham no corpo da resposta; a tela só não os declarava. */
  receita: Receita;
  extras: ExtrasDaReceita;
  /**
   * ⭐ "Meta do mês" e "% da meta atingida" — os dois campos do desenho do CEO
   * que só puderam ser acesos em 19/09/2026, quando a meta ganhou lugar no
   * banco (`meta_de_receita_mensal`) e o CEO decidiu R$ 100.000/mês.
   *
   * ⛔ O terceiro campo do desenho, **"Previsão R$ 560.000"**, continua não
   * existindo — e não é esquecimento. Meta é número que o CEO digita; previsão
   * seria conta nossa sobre o futuro, e ela sairia daqui parecendo medição e
   * viraria decisão de dinheiro. Não há campo para ela nesta interface.
   */
  metaDoMes: MetaDoMes;
}

export interface MetaDoMes {
  competencia: string;
  meta:
    | { definida: true; competencia: string; centavos: number; definidoPorNome: string }
    | { definida: false; competencia: string; motivo: "semMeta" };
  receita: { medido: true; centavos: number; propostas: number } | { medido: false; motivo: string };
  progresso:
    | { medido: true; fracao: number; metaCentavos: number; receitaCentavos: number }
    | { medido: false; motivo: "semMeta" | "receitaNaoMedida"; detalhe: string };
}

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; v: Visao }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

export function SupervisorClient() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/supervisor", { cache: "no-store" });
        if (!vivo) return;

        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }

        const j = (await r.json()) as { ok: boolean; data?: Visao; error?: string };
        if (!vivo) return;

        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? null });
          return;
        }
        setEstado({ fase: "pronto", v: j.data });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();

    return () => {
      vivo = false;
    };
  }, []);

  if (estado.fase === "carregando") {
    return (
      <Secao titulo="Revenue Supervisor">
        <p className="rounded-2xl border border-line bg-paper p-4 text-[13px] text-muted">
          Medindo o funil de ponta a ponta…
        </p>
      </Secao>
    );
  }

  if (estado.fase === "semAcesso") {
    return (
      <Secao titulo="Revenue Supervisor">
        <p className="max-w-[70ch] rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
          O diagnóstico da operação é do Diretor, do CEO, do gerente e da
          auditoria. A recusa vem do servidor, não desta tela.
        </p>
      </Secao>
    );
  }

  if (estado.fase === "erro") {
    return (
      <Secao titulo="Revenue Supervisor">
        <p className="rounded-2xl border border-line bg-paper p-4 text-[13.5px] text-ink2">
          Não deu para medir agora. {estado.detalhe ?? ""}
        </p>
      </Secao>
    );
  }

  return <PainelDoSupervisor v={estado.v} />;
}

/**
 * O CORPO DO SUPERVISOR, SEPARADO DA BUSCA DE PROPÓSITO.
 *
 * Assim o teste renderiza EXATAMENTE o que o gerente vê, com a visão que o
 * serviço devolveria — e não um pedaço parecido escrito só para o teste passar.
 */
export function PainelDoSupervisor({ v }: { v: Visao }) {
  const tudoCego = v.funil.degraus.every((d) => !d.volume.medido);

  if (tudoCego) {
    // A meta sai mesmo com o funil cego: ela não vem do funil, vem do que o CEO
    // digitou. Esconder o alvo porque as fontes do funil não gravam seria
    // apagar o único número desta tela que não depende de medição nenhuma.
    return (
      <div className="flex flex-col gap-6">
        <CartaoDaMeta m={v.metaDoMes} />
      <Secao titulo="Revenue Supervisor">
        <p className="max-w-[70ch] rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
          <strong>Nenhuma etapa do funil tem fonte ligada.</strong> Isso não é uma
          operação parada — é uma operação que ninguém está medindo. Enquanto
          Hunter, SDR e as oportunidades não gravarem, esta seção fica em branco
          de propósito, em vez de estampar sete zeros que pareceriam notícia.
        </p>
      </Secao>
      </div>
    );
  }

  const topo = Math.max(
    1,
    ...v.funil.degraus.map((d) => (d.volume.medido ? d.volume.total : 0)),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* O título da peça 13. Ele existe mesmo a seção morando dentro do
          Painel: o desenho dá nome e propósito próprios a esta metade da
          página, e sem o nome ela vira "mais gráficos embaixo do painel". */}
      <TituloDaPagina
        titulo="Revenue Supervisor / Inteligência de Receita"
        subtitulo="Diagnostique gargalos e oportunidades em toda a operação: Hunter, SDR, Vendas e CRM."
      />

      {/* ── OS OITO INDICADORES DA PEÇA 13 ───────────────────────────────
          O desenho não pede os degraus do funil aqui: pede oito números de
          NEGÓCIO. Quatro saem do funil, e os outros quatro de fontes que o
          supervisor não lia — reuniões, receita, reativações e risco. Dois
          deles **não têm fonte** e dizem isso no lugar do número. */}
      <FilaDeIndicadores>
        <IndicadorDeDegrau v={v} etapa="PRONTAS_PARA_SDR" rotulo="Prospects qualificados" icone="alvo" tom="azul" />
        <IndicadorDeDegrau v={v} etapa="DECISORES_ENCONTRADOS" rotulo="Decisores encontrados" icone="chave" tom="roxo" />
        <Indicador
          rotulo="Reuniões"
          valor={v.extras.reunioes.marcadas}
          icone="agenda"
          tom="azul"
          rodape={
            `${v.extras.reunioes.realizadas} realizadas · ${v.extras.reunioes.naoCompareceram} não compareceram` +
            (v.extras.reunioes.semDesfecho > 0
              ? ` · ${v.extras.reunioes.semDesfecho} sem desfecho marcado`
              : "")
          }
        />
        <IndicadorDeDegrau v={v} etapa="OPORTUNIDADES" rotulo="Oportunidades abertas" icone="porta" tom="ambar" />
      </FilaDeIndicadores>

      <FilaDeIndicadores>
        <Indicador
          rotulo="Conversão em vendas"
          valor={v.funil.pontaAPonta?.medido ? `${(v.funil.pontaAPonta.valor * 100).toFixed(1).replace(".", ",")}%` : null}
          motivo={
            v.funil.pontaAPonta
              ? textoDaTaxa(v.funil.pontaAPonta)
              : "o topo do funil não tem fonte ligada — sem denominador não há conversão"
          }
          icone="grafico"
          tom="verde"
          rodape={v.funil.pontaAPonta?.medido ? `da primeira etapa medida até Vendas, sobre ${v.funil.pontaAPonta.base}` : undefined}
        />
        <IndicadorDeReceita r={v.receita} />
        <Indicador
          rotulo="Reativações"
          valor={v.extras.reativacao.reativados.medido ? v.extras.reativacao.reativados.valor : null}
          motivo={v.extras.reativacao.reativados.medido ? undefined : v.extras.reativacao.reativados.motivo}
          icone="coracao"
          tom="verde"
          rodape={`o número vizinho que existe: ${v.extras.reativacao.aReativar} contas paradas sem cancelamento — candidatas, não reativações`}
        />
        <Indicador
          rotulo="Clientes em risco"
          valor={v.extras.risco.emRisco}
          icone="alerta"
          tom={v.extras.risco.emRisco > 0 ? "vermelho" : "verde"}
          rodape={
            `risco ≥ ${v.extras.risco.limiar}, a mesma régua que move a conta para EM_RISCO` +
            (v.extras.risco.semAvaliacao > 0
              ? ` · ${v.extras.risco.semAvaliacao} de ${v.extras.risco.total} contas nunca foram avaliadas — é “quantos achamos”, não “quantos existem”`
              : "")
          }
        />
      </FilaDeIndicadores>

      <Corpo
        lateral={
          <>
            {/* ── A COLUNA DA IA ───────────────────────────────────────── */}
            <CartaoDeIA titulo="Diagnóstico da IA">
              <CartaoDeDiagnostico d={v.diagnostico} />
            </CartaoDeIA>

            <CartaoDeIA titulo="Principais gargalos">
              {v.eficiencia.gargalos.length === 0 ? (
                <p>
                  Nenhum gargalo com gravidade medida.
                  {v.cegas.length > 0 && (
                    <>
                      {" "}
                      <strong>Ressalva:</strong> {v.cegas.join(", ")} não foram medidas
                      — a ausência de gargalo aí é ausência de medição, não de problema.
                    </>
                  )}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {v.eficiencia.gargalos.map((g) => {
                    const grau = g.gravidade.medido ? g.gravidade.valor : null;
                    return (
                      <li key={g.etapa}>
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="text-[12.5px] text-ink2">{g.rotulo}</span>
                          <span className="shrink-0 text-[12.5px] font-semibold tabular-nums text-ink">
                            {grau === null ? "—" : Math.round(grau * 100)}
                          </span>
                        </div>
                        {grau !== null && (
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-canvas">
                            <div
                              className="h-full rounded-full bg-red-500"
                              style={{ width: `${Math.round(grau * 100)}%` }}
                            />
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </CartaoDeIA>

            <CartaoDeIA titulo="Ações recomendadas">
              {v.acoes.length === 0 ? (
                <p>
                  Nenhuma ação recomendada com número que a sustente. O supervisor não
                  recomenda por palpite.
                </p>
              ) : (
                <ol className="flex flex-col gap-2">
                  {v.acoes.map((a, i) => (
                    <li key={a.texto} className="flex gap-2">
                      <span className="shrink-0 tabular-nums text-muted">{i + 1}.</span>
                      <span>
                        {a.texto}
                        <span className="mt-0.5 block text-[11.5px] leading-snug text-muted">
                          porque {a.porque}
                        </span>
                      </span>
                    </li>
                  ))}
                </ol>
              )}
            </CartaoDeIA>
          </>
        }
      >
        {/* ── SAÚDE, NA ROSCA DO DESENHO ──────────────────────────────── */}
        <Secao titulo="Saúde da operação">
          <RoscaDaSaude s={v.saude} />
          <div className="mt-3">
            <CartaoDeSaude s={v.saude} />
          </div>
        </Secao>

        {/* ── RECEITA AO LONGO DO MÊS ─────────────────────────────────── */}
        <Secao titulo="Receita ao longo do mês">
          <ReceitaNoTempo e={v.extras.receitaNoTempo} />
        </Secao>

        {/* ── FUNIL DE RECEITA, EM BARRAS DECRESCENTES ────────────────── */}
        <Secao titulo="Funil de receita">
          <ul className="flex flex-col gap-2">
            {v.funil.degraus.map((d, i) => (
              <Barra
                key={d.etapa}
                rotulo={d.rotulo}
                valor={d.volume.medido ? d.volume.total : null}
                motivo={d.volume.medido ? undefined : "nenhuma fonte grava esta etapa hoje"}
                fracao={d.volume.medido ? d.volume.total / topo : null}
                tom={(TINTA_DO_DEGRAU[i] ?? { tom: "azul" as Tom }).tom}
                nota={
                  <>
                    {d.conversao ? `conversão ${textoDaTaxa(d.conversao)}` : "topo do funil"}
                    {" · "}
                    {d.ehRetrato ? "retrato de agora" : textoDaTendencia(d.tendencia)}
                    <span className="mt-0.5 block">{d.comoSeMede}</span>
                  </>
                }
              />
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-muted">
            Ponta a ponta:{" "}
            <strong className="text-ink2">
              {v.funil.pontaAPonta ? textoDaTaxa(v.funil.pontaAPonta) : "não medido"}
            </strong>
          </p>
        </Secao>

        {/* ── EFICIÊNCIA POR ETAPA, NA TABELA DO DESENHO ──────────────── */}
        <Secao titulo="Eficiência por etapa">
          <Tabela colunas={["Etapa", "Prazo (SLA)", "Dentro do prazo", "Conversão", "Volume", "Gargalo", "Tendência"]}>
            {v.eficiencia.etapas.map((e) => {
              const ehGargalo = v.eficiencia.gargalos[0]?.etapa === e.etapa;
              return (
                <Linha key={e.etapa} alerta={ehGargalo}>
                  <Celula forte>
                    {e.rotulo}
                    <span className="mt-0.5 block max-w-[34ch] text-[11px] font-normal leading-snug text-muted">
                      {e.oQuePrazoMede}
                    </span>
                  </Celula>
                  <Celula numero>
                    {e.duracao.medido ? (
                      `${emTempo(e.duracao.minutos)} / prazo ${emTempo(e.slaMinutos)}`
                    ) : (
                      <span className="block max-w-[34ch]">
                        <span className="italic text-muted">não medido</span>
                        <span className="mt-0.5 block text-[11px] font-normal leading-snug text-muted">
                          {MOTIVO_DO_PRAZO_AUSENTE}
                        </span>
                      </span>
                    )}
                  </Celula>
                  <Celula numero>{textoDaTaxa(e.dentroDoSla)}</Celula>
                  <Celula numero>{e.conversao ? textoDaTaxa(e.conversao) : "não medida"}</Celula>
                  <Celula numero>
                    {e.volume.medido ? e.volume.total : <span className="italic text-muted">não medido</span>}
                  </Celula>
                  <Celula>
                    {ehGargalo ? (
                      <Pilula tom="vermelho">gargalo</Pilula>
                    ) : e.gravidade.medido ? (
                      <Pilula tom="verde">ok</Pilula>
                    ) : (
                      <Pilula tom="cinza">etapa cega</Pilula>
                    )}
                  </Celula>
                  <Celula>{textoDaTendencia(e.tendencia)}</Celula>
                </Linha>
              );
            })}
          </Tabela>
          <p className="mt-2 max-w-[80ch] text-[11.5px] leading-snug text-muted">
            Etapa cega não é etapa saudável: é etapa sem régua. Ela continua na tabela,
            carimbada, porque etapa que some do radar é etapa que ninguém conserta.
          </p>
        </Secao>

        {/* ── PREVISÃO E META ─────────────────────────────────────────── */}
        {/* O lugar do desenho: a meta de verdade acende aqui, e a receita
            realizada fica ao lado dela. A previsão não tem cartão — ver o
            comentário de `ReceitaRealizada`. */}
        <CartaoDaMeta m={v.metaDoMes} />
        <Secao titulo="Receita realizada">
          <ReceitaRealizada r={v.receita} />
        </Secao>
      </Corpo>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um indicador cujo número sai de um DEGRAU do funil, pelo nome do desenho.
 *
 * O desenho chama "Prospects qualificados" ao que o funil chama "Prontas para
 * SDR" — é o mesmo número, e o desenho estampa os dois iguais (3.411). O rótulo
 * do desenho vai na frente e o nome do funil vai no rodapé, para ninguém
 * procurar uma segunda medição que não existe.
 */
function IndicadorDeDegrau({
  v,
  etapa,
  rotulo,
  icone,
  tom,
}: {
  v: Visao;
  etapa: string;
  rotulo: string;
  icone: NomeDeIcone;
  tom: Tom;
}) {
  const d = v.funil.degraus.find((x) => x.etapa === etapa);

  if (!d) {
    return (
      <Indicador
        rotulo={rotulo}
        valor={null}
        motivo={`o funil de receita não devolveu a etapa ${etapa} — e isso também é um defeito`}
        icone={icone}
        tom={tom}
      />
    );
  }

  return (
    <Indicador
      rotulo={rotulo}
      valor={d.volume.medido ? d.volume.total : null}
      motivo={d.volume.medido ? undefined : "nenhuma fonte grava esta etapa hoje"}
      icone={icone}
      tom={tom}
      variacao={d.ehRetrato ? "retrato de agora" : textoDaTendencia(d.tendencia)}
      rodape={`no funil, este degrau se chama “${d.rotulo}” · ${d.comoSeMede}`}
    />
  );
}

/** Receita do mês — e a recusa honesta quando fechou sem preço no sistema. */
function IndicadorDeReceita({ r }: { r: Receita }) {
  if (r.medido) {
    return (
      <Indicador
        rotulo="Receita do mês"
        valor={emReais(r.centavos)}
        icone="dinheiro"
        tom="verde"
        rodape={`soma das ${r.propostas} propostas aceitas com valor gravado`}
      />
    );
  }

  return (
    <Indicador
      rotulo="Receita do mês"
      valor={null}
      motivo={
        r.motivo === "semValores"
          ? `${r.propostas} propostas foram aceitas e nenhuma tem valor gravado — o preço foi combinado fora do sistema. R$ 0,00 ao lado de ${r.propostas} fechamentos seria defeito com cara de notícia`
          : "nenhuma proposta aceita no período — não há receita a somar"
      }
      icone="dinheiro"
      tom="verde"
    />
  );
}

/** O índice 0–100 do desenho, no anel. A conta aberta continua logo abaixo. */
function RoscaDaSaude({ s }: { s: Visao["saude"] }) {
  if (!s.medido) {
    return (
      <p className="max-w-[70ch] rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
        <strong>Índice não medido.</strong> {s.motivo}. Um anel em 0 aqui diria
        &quot;operação morta&quot;, que é uma afirmação — e ninguém a apurou.
      </p>
    );
  }

  const naoMedido = Math.max(0, s.pesoTotal - s.pesoMedido);

  return (
    <Rosca
      emCartao
      centro={s.indice}
      sobCentro="de 100"
      /* ⚠️ As fatias são o PESO da conta, não o índice: o anel mostra quanto da
         régua pôde ser apurado. Desenhar 78/100 como "78% verde" esconderia
         que os 78 saíram de 45 pontos de peso, e não de 100. */
      fatias={[
        { rotulo: `Peso apurado (${s.indice} pontos de índice)`, valor: s.pesoMedido, tom: "verde" },
        ...(naoMedido > 0
          ? [{ rotulo: "Peso sem medição — fora da conta", valor: naoMedido, tom: "cinza" as Tom }]
          : []),
      ]}
      alerta={
        naoMedido > 0 ? (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] leading-snug text-amber-950">
            O índice saiu de <strong>{s.pesoMedido} de {s.pesoTotal}</strong> pontos de peso.
            Parcela não medida não entra como zero: ela sai da conta e o peso total cai junto
            — {s.indice} sobre {s.pesoMedido} pontos não é a mesma afirmação que {s.indice} sobre {s.pesoTotal}.
          </p>
        ) : null
      }
    />
  );
}

/**
 * A CURVA DE RECEITA — cheia, e sem a tracejada que o desenho tem.
 *
 * ⛔ O desenho traz "Meta projetada" como segunda linha. **Ela não existe neste
 * sistema**, e por isso não é desenhada: uma tracejada tirada do ritmo do mês
 * pareceria alvo, e alvo é decisão do CEO. O lugar dela fica escrito, vazio.
 */
function ReceitaNoTempo({ e }: { e: ExtrasDaReceita["receitaNoTempo"] }) {
  const temReceita = e.pontos.some((p) => p.acumuladoCents > 0);

  if (!temReceita) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-4">
        <p className="max-w-[80ch] text-[13px] leading-relaxed text-ink2">
          <strong>Nenhuma receita acumulada no período.</strong> Nenhuma proposta
          aceita com valor gravado — a curva ficaria colada no chão, e uma linha
          no zero diria &quot;vendemos e não entrou nada&quot;.
          {e.aceitasSemValor > 0 && (
            <>
              {" "}
              <strong>{e.aceitasSemValor}</strong> propostas foram aceitas SEM valor: fecharam,
              e o preço está fora do sistema.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <SerieNoTempo
      rotulos={e.pontos.map((p) =>
        new Date(p.dia).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      )}
      series={[
        {
          rotulo: "Receita realizada (acumulada)",
          tom: "azul",
          valores: e.pontos.map((p) => p.acumuladoCents),
        },
      ]}
      formatar={(c) => emReais(c)}
      nota={
        <>
          <p>
            <strong className="text-ink2">A linha tracejada do desenho — &quot;meta projetada&quot; — não
            está aqui.</strong> {e.meta.medido ? "" : e.meta.motivo}.
          </p>
          {e.aceitasSemValor > 0 && (
            <p className="mt-1">
              <strong className="text-ink2">{e.aceitasSemValor}</strong> propostas aceitas no período
              não têm valor gravado e ficam fora da curva — somá-las como zero achataria a linha.
            </p>
          )}
        </>
      }
    />
  );
}

/**
 * RECEITA E META — o bloco de dinheiro da tela 13.
 *
 * ── HISTÓRICO, PARA NINGUÉM REFAZER O CAMINHO ───────────────────────────────
 *
 * O desenho mostra Meta R$ 600.000, Realizada R$ 482.300, Previsão R$ 560.000
 * e a barra "80% da meta atingida". Quando a tela 13 foi construída, SÓ a
 * realizada tinha fonte, e por isso meta, barra e previsão saíam vazias.
 *
 * Em 19/09/2026 a meta ganhou lugar no banco: o alvo passou a ser número que o
 * CEO digita, e quem acende meta, porcentagem e barra é o `CartaoDaMeta`, logo
 * acima deste bloco. O antigo indicador "Meta do mês" daqui saiu — ele diria
 * "não existe cadastro de meta", o que virou mentira.
 *
 * ⛔ A PREVISÃO NÃO TEM CARTÃO, E NÃO É ESQUECIMENTO. Meta é número que o CEO
 * digita; previsão seria conta nossa sobre o futuro — sairia daqui parecendo
 * medição e viraria decisão de dinheiro. Não se calcula, não se deriva da meta,
 * não se estima pelo ritmo do mês. `extras.receitaNoTempo.previsao` continua
 * vindo do serviço e continua sem ser desenhada, de propósito; há teste que
 * recusa a palavra nesta tela.
 */
function ReceitaRealizada({ r }: { r: Receita }) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <IndicadorDeReceita r={r} />
    </div>
  );
}

/* `emReais` NÃO é redefinido aqui: a moldura já exporta o dele em
   `../_pecas/Pecas`, e duas formatações de dinheiro na mesma tela é o
   começo de duas cifras diferentes para o mesmo centavo. */
function mesPorExtenso(competencia: string): string {
  const [ano, mes] = competencia.split("-");
  const nomes = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
  ];
  return `${nomes[Number(mes) - 1] ?? mes} de ${ano}`;
}

/**
 * ⭐ O BLOCO DA META — e a barra de progresso que só aparece com alvo.
 *
 * ── POR QUE A BARRA ESTAVA PROIBIDA ATÉ HOJE ────────────────────────────────
 *
 * Barra sem alvo é a forma mais convincente de inventar um alvo. Enquanto a
 * meta não existia no banco, qualquer barra aqui teria um denominador
 * escolhido pelo código — e um percentual saído disso pareceria medição e
 * viraria decisão de dinheiro. A barra acendeu porque o alvo passou a ser um
 * número que o CEO digitou, guardado por competência, com quem digitou.
 *
 * ── E ELA CONTINUA APAGADA ONDE NÃO HÁ META ─────────────────────────────────
 *
 * Mês sem meta escreve **"sem meta cadastrada"** e o caminho para cadastrá-la.
 * Nunca 0%: zero diria "há uma meta e ela não foi atingida", que é uma notícia
 * diferente — e falsa.
 */
function CartaoDaMeta({ m }: { m: MetaDoMes }) {
  const mes = mesPorExtenso(m.competencia);

  if (!m.meta.definida) {
    return (
      <Secao titulo="Meta do mês">
        <p className="max-w-[70ch] rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
          <strong>Sem meta cadastrada para {mes}.</strong> Sem alvo não há
          porcentagem nem barra: um percentual precisaria de um denominador
          escolhido por nós, e ele sairia daqui parecendo medição. Cadastre em{" "}
          <span className="font-medium text-ink">Painel → Meta de receita</span>.
        </p>
      </Secao>
    );
  }

  const meta = m.meta;
  const pct = m.progresso.medido ? Math.round(m.progresso.fracao * 100) : null;

  return (
    <Secao titulo="Meta do mês">
      <div className="rounded-2xl border border-line bg-paper p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
              Meta de {mes}
            </p>
            <p className="text-[22px] font-semibold tabular-nums text-ink">
              {emReais(meta.centavos)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
              % da meta atingida
            </p>
            {pct === null ? (
              <p className="max-w-[40ch] text-[12.5px] italic leading-snug text-muted">
                não medido — {m.progresso.medido ? "" : m.progresso.detalhe}
              </p>
            ) : (
              <p className="text-[22px] font-semibold tabular-nums text-ink">{pct}%</p>
            )}
          </div>
        </div>

        {m.progresso.medido ? (
          <>
            <div
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-canvas"
              role="progressbar"
              aria-valuenow={pct ?? 0}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Meta de ${mes} atingida`}
            >
              <div
                className="h-full rounded-full bg-emerald-500"
                style={{ width: `${Math.max(0, Math.min(1, m.progresso.fracao)) * 100}%` }}
              />
            </div>
            <p className="mt-1.5 text-[12px] text-muted">
              {emReais(m.progresso.receitaCentavos)} de {emReais(m.progresso.metaCentavos)} —
              propostas aceitas dentro de {mes}.
            </p>
          </>
        ) : null}

        <p className="mt-2 text-[11.5px] text-muted">
          Meta definida por <strong>{meta.definidoPorNome}</strong>. Troca em Painel →
          Meta de receita.
        </p>
      </div>
    </Secao>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function CartaoDeDiagnostico({ d }: { d: Diagnostico }) {
  if (!d.medido) {
    return (
      <p className="max-w-[70ch] rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
        {d.motivo === "semQueda"
          ? "Nenhuma etapa caiu o suficiente para valer um diagnóstico. "
          : "Sem base para diagnosticar. "}
        <span className="text-muted">{d.detalhe}</span>
      </p>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
      <p className="text-[15px] font-semibold text-amber-900">
        ↓ {Math.round(Math.abs(d.queda) * 100)}% {d.focoRotulo.toLowerCase()}
      </p>
      <p className="mt-0.5 text-[11.5px] tabular-nums text-amber-800">
        {d.quedaDe} → {d.quedaPara} contra a janela anterior
      </p>

      <Bloco rotulo="Principal causa">{d.causaProvavel}</Bloco>
      {d.problema && <Bloco rotulo="Problema">{d.problema}</Bloco>}
      {d.acaoRecomendada && <Bloco rotulo="Ação recomendada">{d.acaoRecomendada}</Bloco>}

      {d.evidencias.length > 0 && (
        <>
          <p className="mt-3 text-[10.5px] font-semibold uppercase tracking-[.04em] text-amber-700">
            Os números
          </p>
          <ul className="mt-1 flex flex-col gap-0.5 text-[11.5px] leading-snug text-amber-900">
            {d.evidencias.map((e, i) => (
              <li key={`${e.afirmacao}-${i}`}>{textoDaEvidencia(e)}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function Bloco({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.04em] text-amber-700">
        {rotulo}
      </p>
      <p className="mt-0.5 max-w-[70ch] text-[13.5px] leading-relaxed text-amber-950">{children}</p>
    </div>
  );
}

function CartaoDeSaude({ s }: { s: Visao["saude"] }) {
  if (!s.medido) {
    return (
      <p className="max-w-[70ch] rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
        <strong>Índice não medido.</strong> Nenhuma das {s.pesoTotal} parcelas de
        peso pôde ser apurada. Um índice zero aqui diria &quot;operação morta&quot;, que é
        uma afirmação — e ninguém a apurou.
      </p>
    );
  }

  const confiavel = s.pesoMedido / s.pesoTotal;

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-3xl font-semibold tabular-nums text-ink">{s.indice}</span>
        <span className="text-[13px] text-muted">de 100</span>
        <span className="ml-auto text-[11.5px] tabular-nums text-muted">
          sobre {s.pesoMedido} de {s.pesoTotal} pontos de peso medidos (
          {Math.round(confiavel * 100)}%)
        </span>
      </div>

      <p className="mt-2 max-w-[70ch] text-[11.5px] leading-snug text-muted">
        A conta está aberta abaixo. Parcela não medida não entra como zero: ela sai
        da conta e o peso total cai junto — 72 sobre 45 pontos não é a mesma
        afirmação que 72 sobre 100.
      </p>

      <ul className="mt-3 flex flex-col gap-1 border-t border-line pt-3">
        {s.parcelas.map((p) => (
          <li key={p.fator} className="text-[12px]">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-ink2">{p.fator}</span>
              <span className="shrink-0 tabular-nums text-muted">
                {Math.round(p.nota * 100)} × peso {p.peso}
              </span>
            </div>
            <p className="text-[11.5px] leading-snug text-muted">{p.evidencia}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function NaoMedido({ texto }: { texto: string }) {
  return <span className="text-[13px] font-normal italic text-muted">{texto}</span>;
}

function textoDaTaxa(t: Taxa): string {
  if (t.medido) return `${Math.round(t.valor * 100)}% (de ${t.base})`;
  if (t.motivo === "amostraPequena") return `${t.base} — amostra pequena`;
  return "não medido";
}

function textoDaTendencia(t: Tendencia): string {
  if (t.medido) {
    const p = Math.round(t.variacao * 100);
    return `${p > 0 ? "+" : ""}${p}% vs. janela anterior (${t.de} → ${t.para})`;
  }
  if (t.motivo === "baseZero") return `sem base anterior para comparar (agora: ${t.para})`;
  return "sem comparação";
}

function textoDaEvidencia(e: Evidencia): string {
  const n =
    e.unidade === "fracao"
      ? `${Math.round(e.numero * 100)}%`
      : e.unidade === "minutos"
        ? emTempo(e.numero)
        : String(e.numero);
  return `${n} ${e.afirmacao}${e.base !== undefined ? ` (sobre ${e.base})` : ""}`;
}

/** Minutos em algo que um gerente lê sem fazer conta. */
function emTempo(minutos: number): string {
  if (minutos < 60) return `${minutos} min`;
  if (minutos < 48 * 60) return `${Math.round(minutos / 60)} h`;
  return `${Math.round(minutos / 1440)} d`;
}

function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}
