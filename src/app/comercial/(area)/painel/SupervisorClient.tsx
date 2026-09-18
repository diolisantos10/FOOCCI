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
  Tabela,
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

export interface Visao {
  funil: { degraus: Degrau[]; pontaAPonta: Taxa | null };
  eficiencia: { etapas: EtapaMedida[]; gargalos: EtapaMedida[]; cegas: string[] };
  saude:
    | { medido: true; indice: number; parcelas: Parcela[]; pesoMedido: number; pesoTotal: number }
    | { medido: false; motivo: string; pesoTotal: number };
  diagnostico: Diagnostico;
  acoes: Array<{ origem: string; texto: string; porque: string }>;
  cegas: string[];
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
    return (
      <Secao titulo="Revenue Supervisor">
        <p className="max-w-[70ch] rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
          <strong>Nenhuma etapa do funil tem fonte ligada.</strong> Isso não é uma
          operação parada — é uma operação que ninguém está medindo. Enquanto
          Hunter, SDR e as oportunidades não gravarem, esta seção fica em branco
          de propósito, em vez de estampar sete zeros que pareceriam notícia.
        </p>
      </Secao>
    );
  }

  const topo = Math.max(
    1,
    ...v.funil.degraus.map((d) => (d.volume.medido ? d.volume.total : 0)),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ── A FILA DE INDICADORES ─────────────────────────────────────────
          Os oito cartões do desenho saem DOS DEGRAUS DO FUNIL, e não de uma
          lista digitada: o que o serviço mede é o que aparece. Degrau sem
          fonte ligada vira "não medido" com o motivo — nunca um zero, que
          diria "medimos e não houve nenhum". */}
      <FilaDeIndicadores>
        {v.funil.degraus.slice(0, 8).map((d, i) => {
          const t = TINTA_DO_DEGRAU[i] ?? { icone: "grafico" as NomeDeIcone, tom: "azul" as Tom };
          return (
            <Indicador
              key={d.etapa}
              rotulo={d.rotulo}
              valor={d.volume.medido ? d.volume.total : null}
              motivo={d.volume.medido ? undefined : "nenhuma fonte grava esta etapa hoje"}
              icone={t.icone}
              tom={t.tom}
              variacao={d.ehRetrato ? "retrato de agora" : textoDaTendencia(d.tendencia)}
            />
          );
        })}
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
        {/* ── SAÚDE ───────────────────────────────────────────────────── */}
        <Secao titulo="Saúde da operação">
          <CartaoDeSaude s={v.saude} />
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
      </Corpo>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

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
