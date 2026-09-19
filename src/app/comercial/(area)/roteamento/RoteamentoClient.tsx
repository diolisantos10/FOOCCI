"use client";

/**
 * MOTOR DE DECISÃO / ROTEAMENTO — desenho nº 07 do CEO.
 *
 * ── O QUE ESTA TELA É, E O QUE ELA SE RECUSA A SER ──────────────────────────
 *
 * O desenho tem duas metades: à esquerda, oito regras numeradas com seletores e
 * interruptores; à direita, o **Preview em Tempo Real**, que mostra para onde
 * cada lead iria **e por qual regra**.
 *
 * A metade da direita foi construída com dado real e é o coração daqui: os
 * cartões saem da FILA de verdade, e a decisão de cada um é calculada pela
 * MESMA função que a distribuição executa (`escolherResponsavel`), rodada em
 * cascata. Não há lead de exemplo, não há nome inventado, não há valor
 * plausível. Quando a fila está vazia, o cartão diz que está vazia.
 *
 * A metade da esquerda foi construída **sem os seletores e sem os
 * interruptores do desenho**, e isso é decisão declarada, não esquecimento:
 * não existe tabela onde guardar regra configurável, e um seletor que não
 * grava — ou um interruptor que não desliga nada — é a tela mentindo em
 * formato de botão. As regras aparecem numeradas, na ordem em que são
 * avaliadas, com o estado REAL de cada uma no modo corrente.
 *
 * ── O SLA NÃO MOSTRA ZERO ───────────────────────────────────────────────────
 *
 * Se nenhum lead tem prazo gravado, a tela escreve que o relógio está
 * desligado. "0 SLAs estourados" seria exatamente a tela que uma operação
 * saudável mostraria — e as duas situações são opostas.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type {
  CandidatoADistribuicao,
  DecisaoDoMotor,
  LeadNoPreview,
  PanoramaDoRoteamento,
} from "@/services/salaDeVendas/telas/roteamento";
import {
  escolherResponsavel,
  podeReceber,
  simularCascata,
} from "@/services/salaDeVendas/telas/roteamento";
import {
  buscarPainel,
  Carregando,
  Erro,
  NaoMedido,
  SemAcesso,
  Vazio,
  emReais,
  type Estado,
} from "../_frenteComercial/Moldura";

const MOTIVO_EM_PALAVRAS: Record<string, string> = {
  offline: "está offline",
  pausado: "está em pausa",
  noLimite: "está no limite de conversas abertas",
  semEspecialidade: "não tem a especialidade exigida",
  semRegiao: "não atende a região exigida",
};

type AbaPrincipal = "regras" | "sla" | "propriedade" | "testes";
type AbaPreview = "exemplos" | "simular" | "logs";

/** Os modos em que cada regra do catálogo vale, em palavras de operação. */
const MODO_EM_PALAVRAS: Record<string, string> = {
  MANUAL: "modo Manual",
  RODIZIO: "modo Rodízio",
  DISPONIBILIDADE: "modo Disponibilidade",
  ESPECIALIDADE: "modo Especialidade",
};

export function RoteamentoClient() {
  const [estado, setEstado] = useState<Estado<PanoramaDoRoteamento>>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [aba, setAba] = useState<AbaPrincipal>("regras");
  const [abaPreview, setAbaPreview] = useState<AbaPreview>("exemplos");
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
      <div className="mx-auto max-w-[1180px]">
        {/* ── CABEÇALHO: migalha, título, e o cartão do estado do motor ──── */}
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <p className="text-[12px] text-muted">
              <Link href="/comercial/agente" className="hover:text-ink2">
                Automações
              </Link>{" "}
              <span aria-hidden="true">›</span> <span className="text-ink2">Motor de Decisão</span>
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-[-.02em] text-ink">
              Motor de Decisão / Roteamento
            </h1>
            <p className="mt-1 max-w-[72ch] text-[13.5px] leading-relaxed text-muted">
              As regras que decidem se a IA continua, se o lead vai para um vendedor e para quem.
              Esta tela <strong className="text-ink2">lê</strong> o motor — ela não o configura.
            </p>
          </div>
          <EstadoDoMotor modo={p.modo} ehPadrao={p.modoEhPadrao} />
        </div>

        <NaoMedido frases={p.naoMedido} />

        {/* ── O CORPO: regras à esquerda, preview à direita ──────────────── */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
          <div className="min-w-0">
            <AbasDaTela
              abas={[
                { chave: "regras", rotulo: "Regras de Roteamento" },
                { chave: "sla", rotulo: "SLA e Escalação" },
                { chave: "propriedade", rotulo: "Lógica de Propriedade" },
                { chave: "testes", rotulo: "Testes e Simulação" },
              ]}
              atual={aba}
              aoTrocar={setAba}
            />

            {aba === "regras" && <AbaRegras p={p} />}
            {aba === "sla" && <AbaSla p={p} />}
            {aba === "propriedade" && <AbaPropriedade p={p} />}
            {aba === "testes" && <AbaTestes p={p} />}
          </div>

          <aside className="min-w-0 lg:sticky lg:top-4">
            <PainelDePreview p={p} aba={abaPreview} aoTrocar={setAbaPreview} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   O CARTÃO DO ESTADO DO MOTOR

   O desenho traz aqui um interruptor verde "Motor ativo". Ele NÃO foi
   desenhado: ligar e desligar a distribuição é um ATO, e o ato mora na rota
   na rota de escrita da distribuição, com as travas dela. Um interruptor
   nesta tela de leitura ou não faria nada, ou abriria a mesma ação por uma
   porta com outra guarda. O que fica é o estado REAL, com o nome do modo.
   ═══════════════════════════════════════════════════════════════════════════ */
function EstadoDoMotor({ modo, ehPadrao }: { modo: string; ehPadrao: boolean }) {
  const automatico = modo !== "MANUAL";

  return (
    <div className="shrink-0 rounded-2xl border border-line bg-paper p-3.5 lg:w-[340px]">
      <div className="flex items-start gap-2.5">
        <span
          className={
            automatico
              ? "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700"
              : "mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-amber-100 text-amber-800"
          }
          aria-hidden="true"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor"
            strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
            {automatico ? <path d="M5 12.5l4.5 4.5L19 7" /> : <path d="M12 8v5m0 3.5v.01" />}
          </svg>
        </span>
        <div className="min-w-0">
          <p className="text-[13.5px] font-semibold leading-tight text-ink">
            {automatico ? `Motor ativo · ${MODO_EM_PALAVRAS[modo] ?? modo}` : "Motor em modo manual"}
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-muted">
            {automatico
              ? "Distribuindo leads pela regra do modo corrente."
              : "Nada é atribuído sozinho: a fila fica aberta para quem puxar."}
          </p>
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            {ehPadrao
              ? "padrão da casa — não há configuração gravada"
              : "gravado na configuração do TA"}
          </p>
        </div>
      </div>
      <p className="mt-2.5 border-t border-line pt-2 text-[11.5px] leading-relaxed text-muted">
        Trocar o modo é um ato e não se faz daqui — ele mora na rota de distribuição, com as travas
        dela.
      </p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   AS ABAS — no formato sublinhado do desenho, não em pílula
   ═══════════════════════════════════════════════════════════════════════════ */
function AbasDaTela<T extends string>({
  abas,
  atual,
  aoTrocar,
}: {
  abas: readonly { chave: T; rotulo: string }[];
  atual: T;
  aoTrocar: (c: T) => void;
}) {
  return (
    <div className="mb-4 overflow-x-auto rounded-2xl border border-line bg-paper">
      <div role="tablist" aria-label="Seções do motor de decisão" className="flex min-w-max gap-1 px-2">
        {abas.map((a) => (
          <button
            key={a.chave}
            type="button"
            role="tab"
            aria-selected={a.chave === atual}
            onClick={() => aoTrocar(a.chave)}
            className={
              a.chave === atual
                ? "border-b-2 border-brand-500 px-3 py-3 text-[13px] font-semibold text-brand-600"
                : "border-b-2 border-transparent px-3 py-3 text-[13px] font-semibold text-muted transition-colors hover:text-ink2"
            }
          >
            {a.rotulo}
          </button>
        ))}
      </div>
    </div>
  );
}

function Painel({
  titulo,
  explicacao,
  children,
}: {
  titulo: string;
  explicacao?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="border-b border-line px-4 py-3">
        <h2 className="text-[15px] font-semibold text-ink">{titulo}</h2>
        {explicacao && (
          <p className="mt-0.5 max-w-[78ch] text-[12.5px] leading-relaxed text-muted">{explicacao}</p>
        )}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ABA 1 — AS REGRAS, NUMERADAS E NA ORDEM EM QUE SÃO AVALIADAS
   ═══════════════════════════════════════════════════════════════════════════ */

/** Um ícone por regra, no lugar em que o desenho põe o quadradinho colorido. */
function IconeDaRegra({ n }: { n: number }) {
  const cores = [
    "bg-sky-100 text-sky-700",
    "bg-emerald-100 text-emerald-700",
    "bg-amber-100 text-amber-800",
    "bg-rose-100 text-rose-700",
    "bg-teal-100 text-teal-700",
    "bg-brand-100 text-brand-600",
  ];
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${cores[(n - 1) % cores.length]}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor"
        strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 6h10M4 12h16M4 18h7" />
      </svg>
    </span>
  );
}

function AbaRegras({ p }: { p: PanoramaDoRoteamento }) {
  return (
    <>
      <Painel
        titulo="Regras de Roteamento"
        explicacao={
          <>
            As regras são avaliadas na ordem abaixo. A primeira que corresponder é aplicada. Cada
            linha aponta <strong className="text-ink2">a função que a executa</strong> — regra de
            tela que ninguém acha no código é promessa, não mecanismo.
          </>
        }
      >
        <p className="mb-3 rounded-xl border border-line bg-canvas p-3 text-[12px] leading-relaxed text-ink2">
          O desenho põe aqui um seletor e um interruptor por regra. Eles não existem nesta tela:{" "}
          <strong>não há onde gravar regra configurável</strong> — o que manda é o modo de
          distribuição, um só, gravado na configuração do TA. Seletor que não grava é botão que
          mente. O que troca de regra, hoje, é trocar o modo.
        </p>

        <ol className="space-y-2.5">
          {p.regrasQueExistem.map((r, i) => {
            const ativa = r.modo === null || r.modo === p.modo;
            return (
              <li key={r.criterio} className="rounded-2xl border border-line bg-canvas p-3 sm:p-3.5">
                <div className="flex gap-3">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-paper text-[12px] font-semibold tabular-nums text-ink2 ring-1 ring-line">
                    {i + 1}
                  </span>
                  <IconeDaRegra n={i + 1} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                      <p className="text-[13.5px] font-semibold text-ink">{r.criterio}</p>
                      <span
                        className={
                          ativa
                            ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
                            : "rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold text-muted ring-1 ring-line2"
                        }
                      >
                        {ativa ? "valendo agora" : "dorme neste modo"}
                      </span>
                    </div>
                    <p className="mt-1 max-w-[72ch] text-[12.5px] leading-relaxed text-ink2">
                      {r.oQueFaz}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11.5px]">
                      <span className="rounded-lg bg-paper px-2 py-1 text-muted ring-1 ring-line">
                        {r.modo ? (MODO_EM_PALAVRAS[r.modo] ?? r.modo) : "vale em todos os modos"}
                      </span>
                      <span aria-hidden="true" className="text-muted">
                        →
                      </span>
                      <span className="rounded-lg bg-paper px-2 py-1 font-mono text-[11px] text-muted ring-1 ring-line">
                        {r.ondeMora}
                      </span>
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      </Painel>

      <Painel
        titulo="Previsto, não construído"
        explicacao="O desenho pede estes critérios e o código não os tem. Nenhuma linha abaixo está rodando — dizer isso aqui é o que impede alguém de contar com um roteamento que não existe."
      >
        <ul className="space-y-2">
          {p.previstasNaoConstruidas.map((r) => (
            <li key={r.criterio} className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
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
      </Painel>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ABA 2 — SLA E ESCALAÇÃO
   ═══════════════════════════════════════════════════════════════════════════ */
function AbaSla({ p }: { p: PanoramaDoRoteamento }) {
  return (
    <>
      <Painel
        titulo="SLA de primeira resposta"
        explicacao="O prazo para alguém responder o lead pela primeira vez, e quantos passaram dele sem resposta."
      >
        {p.sla.naoMedido ? (
          <Vazio motivo={p.sla.naoMedido} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-line bg-canvas p-3.5">
                <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                  Com prazo gravado
                </p>
                <p className="mt-0.5 tabular-nums text-[22px] font-semibold leading-tight text-ink">
                  {p.sla.comPrazo}
                </p>
              </div>
              <div className="rounded-xl border border-line bg-canvas p-3.5">
                <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                  Estourados
                </p>
                <p className="mt-0.5 tabular-nums text-[22px] font-semibold leading-tight text-ink">
                  {p.sla.estourados}
                </p>
              </div>
            </div>
            <p className="mt-3 max-w-[74ch] text-[12.5px] leading-relaxed text-ink2">
              O prazo cumprido depois de respondido não conta como estouro: o SLA fez o trabalho
              dele.
            </p>
          </>
        )}
      </Painel>

      <Painel
        titulo="SLA por regra, e escalação"
        explicacao="O que o desenho pede aqui, e por que ainda não existe."
      >
        <ul className="space-y-2">
          <li className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[13.5px] font-semibold text-amber-900">Um prazo por regra</p>
            <p className="mt-1 max-w-[72ch] text-[12.5px] leading-relaxed text-amber-900/90">
              O desenho dá SLA próprio a cinco das oito regras (2 min para valor alto, 1 min para
              VIP, 10 min no fallback). Aqui há <strong>um</strong> prazo por lead (
              <span className="font-mono text-[11.5px]">slaVenceEm</span>) e nenhuma regra tem prazo
              próprio.
            </p>
          </li>
          <li className="rounded-2xl border border-amber-200 bg-amber-50 p-3">
            <p className="text-[13.5px] font-semibold text-amber-900">Escalação ao estourar</p>
            <p className="mt-1 max-w-[72ch] text-[12.5px] leading-relaxed text-amber-900/90">
              Quando o prazo vence, nada acontece sozinho: o lead aparece na fila de SLA estourado e
              espera gente. Não há reatribuição automática — e isso é de propósito, porque
              redistribuir por SLA tiraria lead de quem já está com ele.
            </p>
          </li>
        </ul>
      </Painel>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ABA 3 — LÓGICA DE PROPRIEDADE
   ═══════════════════════════════════════════════════════════════════════════ */
function AbaPropriedade({ p }: { p: PanoramaDoRoteamento }) {
  return (
    <>
      <Painel
        titulo="De quem é o lead"
        explicacao="A regra que não se negocia: nenhuma distribuição tira lead de gente."
      >
        <ul className="space-y-2 text-[12.5px] leading-relaxed text-ink2">
          <li className="rounded-2xl border border-line bg-canvas p-3">
            <strong className="text-ink">Lead com dono não volta para o rodízio.</strong> A escrita
            da distribuição é condicional em o lead estar sem dono — sem isso, o motor rodando junto
            com alguém clicando em “assumir” produziria dois donos.
          </li>
          <li className="rounded-2xl border border-line bg-canvas p-3">
            <strong className="text-ink">Transferir exige ser o dono atual.</strong> Um vendedor não
            move o lead de outro.
          </li>
          <li className="rounded-2xl border border-line bg-canvas p-3">
            <strong className="text-ink">Só o gerente tira lead de alguém</strong>, com motivo
            escrito, e fica gravado com o nome de quem fez.
          </li>
        </ul>
      </Painel>

      <Painel
        titulo="Quem pode receber agora"
        explicacao="A aptidão é medida com a mesma função que a distribuição usa. Fila parada sem explicação é o jeito silencioso de esquecer um lead."
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
                <li key={a.userId} className="rounded-2xl border border-line bg-canvas p-3">
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
                    {a.especialidades.length > 0 &&
                      ` · especialidades: ${a.especialidades.join(", ")}`}
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
      </Painel>
    </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   ABA 4 — TESTES E SIMULAÇÃO

   O simulador roda a FUNÇÃO REAL (`escolherResponsavel`), pura, no navegador,
   sobre o time real que a leitura trouxe. Não é uma imitação da regra: é a
   regra. Uma reimplementação "de tela" mostraria o que deveria acontecer, e a
   divergência só apareceria num lead perdido.
   ═══════════════════════════════════════════════════════════════════════════ */

/** Reconstrói o candidato exato que a distribuição avaliaria. */
function candidatosDoPanorama(p: PanoramaDoRoteamento): CandidatoADistribuicao[] {
  return p.atendentes.map((a) => ({
    userId: a.userId,
    nome: a.nome,
    estado: a.estado,
    capacidade: a.capacidade,
    carga: a.carga,
    especialidades: a.especialidades,
    regioes: a.regioes,
    pausadoAte: a.pausadoAte ? new Date(a.pausadoAte) : null,
    ultimoRecebimentoEm: a.ultimoRecebimentoEm ? new Date(a.ultimoRecebimentoEm) : null,
  }));
}

function AbaTestes({ p }: { p: PanoramaDoRoteamento }) {
  const candidatos = useMemo(() => candidatosDoPanorama(p), [p]);

  const especialidades = useMemo(
    () => [...new Set(p.atendentes.flatMap((a) => a.especialidades))].sort(),
    [p.atendentes],
  );
  const regioes = useMemo(
    () => [...new Set(p.atendentes.flatMap((a) => a.regioes))].sort(),
    [p.atendentes],
  );

  const [especialidade, setEspecialidade] = useState("");
  const [regiao, setRegiao] = useState("");

  const resultado = useMemo(() => {
    const agora = new Date();
    const escolha = escolherResponsavel(p.modo, candidatos, agora, {
      especialidade: especialidade || null,
      regiao: regiao || null,
    });
    const linhas = candidatos.map((c) => ({
      nome: c.nome,
      aptidao: podeReceber(
        c,
        agora,
        p.modo === "ESPECIALIDADE"
          ? { especialidade: especialidade || null, regiao: regiao || null }
          : undefined,
      ),
    }));
    return { escolha, linhas };
  }, [candidatos, p.modo, especialidade, regiao]);

  const escolha = resultado.escolha;
  const escolhido = escolha.escolhido
    ? (candidatos.find((c) => c.userId === escolha.userId)?.nome ?? escolha.userId)
    : null;

  return (
    <Painel
      titulo="Simular lead"
      explicacao={
        <>
          Este simulador chama a <strong className="text-ink2">mesma função</strong> que a
          distribuição real chama, sobre o time real de agora. Nada é gravado e nenhum lead muda de
          dono.
        </>
      }
    >
      {p.atendentes.length === 0 ? (
        <Vazio motivo="Não há atendente com disponibilidade cadastrada — não há o que simular. O simulador não inventa um time de mentira para ter o que mostrar." />
      ) : (
        <>
          <p className="mb-3 rounded-xl border border-line bg-canvas p-3 text-[12px] leading-relaxed text-ink2">
            As duas exigências abaixo só pesam no <strong>modo Especialidade</strong>, e hoje{" "}
            <strong>nada as preenche automaticamente</strong>: a distribuição real é chamada sem
            elas. Aqui elas existem para você conferir o que aconteceria se alguém as informasse.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                Especialidade exigida
              </span>
              <select
                value={especialidade}
                onChange={(e) => setEspecialidade(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-[13px] text-ink"
              >
                <option value="">nenhuma</option>
                {especialidades.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
              {especialidades.length === 0 && (
                <span className="mt-1 block text-[11.5px] text-muted">
                  ninguém tem especialidade cadastrada
                </span>
              )}
            </label>

            <label className="block">
              <span className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                Região exigida
              </span>
              <select
                value={regiao}
                onChange={(e) => setRegiao(e.target.value)}
                className="mt-1 w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-[13px] text-ink"
              >
                <option value="">nenhuma</option>
                {regioes.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              {regioes.length === 0 && (
                <span className="mt-1 block text-[11.5px] text-muted">
                  ninguém tem região cadastrada
                </span>
              )}
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-line bg-canvas p-3.5">
            <p className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
              O motor decidiria
            </p>
            {escolha.escolhido ? (
              <>
                <p className="mt-1 text-[15px] font-semibold text-ink">{escolhido}</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-ink2">
                  Motivo: {escolha.porque}.
                </p>
              </>
            ) : (
              <p className="mt-1 max-w-[70ch] text-[13px] leading-relaxed text-amber-800">
                Ninguém receberia.{" "}
                {escolha.motivo === "modoManual"
                  ? "A distribuição está em modo manual — a fila fica aberta para quem puxar."
                  : "Nenhum atendente está apto agora."}
              </p>
            )}
          </div>

          <ul className="mt-3 space-y-1.5">
            {resultado.linhas.map((l) => (
              <li
                key={l.nome}
                className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl border border-line bg-paper px-3 py-2"
              >
                <span className="text-[12.5px] font-semibold text-ink">{l.nome}</span>
                <span
                  className={
                    l.aptidao.apto
                      ? "text-[12px] font-semibold text-emerald-700"
                      : "text-[12px] font-semibold text-amber-800"
                  }
                >
                  {l.aptidao.apto
                    ? "entraria na roda"
                    : `fora: ${l.aptidao.motivo ? (MOTIVO_EM_PALAVRAS[l.aptidao.motivo] ?? l.aptidao.motivo) : "sem motivo"}`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Painel>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   O PREVIEW EM TEMPO REAL — o coração do desenho

   Os cartões são leads REAIS que estão esperando dono agora. A decisão de cada
   um vem da simulação em cascata feita no servidor com a função real. Onde não
   há fonte (produto, valor, região), o campo diz "não informado" — nunca um
   número plausível.
   ═══════════════════════════════════════════════════════════════════════════ */
function PainelDePreview({
  p,
  aba,
  aoTrocar,
}: {
  p: PanoramaDoRoteamento;
  aba: AbaPreview;
  aoTrocar: (a: AbaPreview) => void;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-paper">
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink">Preview em Tempo Real</h2>
          <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
            lendo a fila real
          </span>
        </div>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">
          Para onde o motor mandaria cada lead que está esperando agora — e por qual regra.
        </p>
      </div>

      <div role="tablist" aria-label="Seções do preview" className="flex gap-1 border-b border-line px-2">
        {(
          [
            { chave: "exemplos", rotulo: "Fila de agora" },
            { chave: "simular", rotulo: "Cascata" },
            { chave: "logs", rotulo: "Logs de Decisão" },
          ] as const
        ).map((a) => (
          <button
            key={a.chave}
            type="button"
            role="tab"
            aria-selected={a.chave === aba}
            onClick={() => aoTrocar(a.chave)}
            className={
              a.chave === aba
                ? "border-b-2 border-brand-500 px-2.5 py-2.5 text-[12.5px] font-semibold text-brand-600"
                : "border-b-2 border-transparent px-2.5 py-2.5 text-[12.5px] font-semibold text-muted transition-colors hover:text-ink2"
            }
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div className="max-h-[70vh] overflow-y-auto p-3">
        {aba === "exemplos" &&
          (p.previewVazio ? (
            <Vazio motivo={p.previewVazio} />
          ) : (
            <ul className="space-y-2.5">
              {p.preview.map((l) => (
                <CartaoDoPreview key={l.leadId} lead={l} />
              ))}
            </ul>
          ))}

        {aba === "simular" && <ExplicacaoDaCascata p={p} />}

        {aba === "logs" &&
          (p.logsVazio ? (
            <Vazio motivo={p.logsVazio} />
          ) : (
            <ul className="space-y-2">
              {p.logs.map((l, i) => (
                <li key={`${l.leadId}-${i}`} className="rounded-xl border border-line bg-canvas p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <p className="text-[12.5px] font-semibold text-ink">{l.leadNome}</p>
                    <p className="text-[11.5px] text-muted">
                      {new Date(l.quando).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <p className="mt-1 text-[12px] leading-relaxed text-ink2">{l.nota}</p>
                </li>
              ))}
            </ul>
          ))}
      </div>
    </section>
  );
}

function ExplicacaoDaCascata({ p }: { p: PanoramaDoRoteamento }) {
  const cascata = useMemo(() => {
    if (p.atendentes.length === 0) return [];
    return simularCascata(p.modo, candidatosDoPanorama(p), 5, new Date());
  }, [p]);

  if (p.atendentes.length === 0) {
    return (
      <Vazio motivo="Não há atendente com disponibilidade cadastrada — o motor não teria para quem mandar os próximos leads, e a cascata não tem o que mostrar." />
    );
  }

  return (
    <>
      <p className="mb-2.5 rounded-xl border border-line bg-canvas p-3 text-[12px] leading-relaxed text-ink2">
        Se cinco leads chegassem agora, um atrás do outro, esta seria a ordem — contando a carga que
        cada atribuição acrescenta. Nenhum lead é tocado; a lista é cálculo.
      </p>
      <ol className="space-y-2">
        {cascata.map((d, i) => (
          <li
            key={i}
            className="flex items-baseline gap-2.5 rounded-xl border border-line bg-canvas p-3"
          >
            <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-paper text-[11px] font-semibold tabular-nums text-ink2 ring-1 ring-line">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-semibold text-ink">
                {d.roteia ? d.paraNome : "ninguém"}
              </p>
              <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted">
                {d.regra} — {d.porque}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Um campo do cartão. `null` vira "não informado", jamais um número plausível. */
function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <p className="flex items-baseline gap-1.5 text-[11.5px] leading-snug">
      <span className="shrink-0 text-muted">{rotulo}:</span>
      {valor === null ? (
        <span className="italic text-muted">não informado</span>
      ) : (
        <span className="min-w-0 truncate text-ink2">{valor}</span>
      )}
    </p>
  );
}

function CartaoDoPreview({ lead }: { lead: LeadNoPreview }) {
  const d: DecisaoDoMotor = lead.decisao;

  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-canvas">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-3 py-2">
        <p className="text-[12.5px] font-semibold text-ink">
          {lead.codigo ? `Lead ${lead.codigo}` : "Lead sem código"}
        </p>
        <span
          className={
            d.roteia
              ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
              : "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800"
          }
        >
          {d.roteia
            ? lead.prioritario
              ? "Será roteado (prioritário)"
              : "Será roteado"
            : "Fica na fila"}
        </span>
      </div>

      <div className="grid gap-2.5 p-3 sm:grid-cols-2 lg:grid-cols-1">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold text-ink">{lead.nome}</p>
          <div className="mt-1 space-y-0.5">
            <Campo rotulo="Produto" valor={lead.produto} />
            <Campo rotulo="Região" valor={lead.regiao} />
            <Campo
              rotulo="Valor estimado"
              valor={lead.valorCents === null ? null : emReais(lead.valorCents)}
            />
            <Campo rotulo="Interesse" valor={lead.interesse} />
          </div>
          <p className="mt-1 text-[11px] text-muted">
            esperando desde {new Date(lead.esperandoDesde).toLocaleString("pt-BR")}
          </p>
        </div>

        <div className="min-w-0 rounded-xl border border-line bg-paper p-2.5">
          <p className="text-[11.5px] leading-snug text-ink2">
            {lead.atendidoPor === "AGUARDANDO_HUMANO" ? "A IA pediu gente" : "Ninguém assumiu ainda"}
          </p>
          <p className="my-1 text-center text-[13px] text-muted" aria-hidden="true">
            ↓
          </p>
          <p className="text-[12.5px] font-semibold leading-snug text-ink">
            {d.roteia ? `Roteia para ${d.paraNome}` : "Continua na fila aberta"}
          </p>
          <p className="mt-1.5 border-t border-line pt-1.5 text-[11.5px] leading-relaxed text-muted">
            <strong className="text-ink2">Motivo:</strong> {d.porque} — regra{" "}
            <strong className="text-ink2">{d.regra}</strong>.
          </p>
        </div>
      </div>
    </li>
  );
}
