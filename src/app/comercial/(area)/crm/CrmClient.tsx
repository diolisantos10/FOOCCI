"use client";

/**
 * O DEPARTAMENTO DE CRM — a CRM IA.
 *
 * ── O QUE ELA MOSTRA ────────────────────────────────────────────────────────
 *
 * O plano do dia (as filas que a CRM IA trabalharia hoje), os catorze estados
 * de follow-up com quantos contatos caíram em cada um, a cadência que atende
 * cada estado e o que faz uma cadência parar, e a régua da jornada de
 * pós-venda.
 *
 * ── PLANO NÃO É EXECUÇÃO ────────────────────────────────────────────────────
 *
 * Abrir esta tela não inscreve ninguém em cadência nenhuma. A rota chama
 * `montarPlanoDoDia`, que só lê e classifica; `enfileirarPlano`, que escreve,
 * não é chamado em lugar nenhum daqui. Um painel que age ao ser aberto
 * transforma "dar uma olhada" em "mandar mensagem para setecentas pessoas".
 *
 * ── A RECEITA POTENCIAL É UM PISO ───────────────────────────────────────────
 *
 * Ela soma só o que foi estimado. A tela escreve, junto do valor, quantos itens
 * entraram na fila SEM estimativa — enquanto esse número for maior que zero, o
 * total é um piso, e chamá-lo de total seria mentir com uma soma correta.
 */

import { useEffect, useState } from "react";
import {
  Aviso,
  Cabecalho,
  Caixa,
  Carregando,
  Erro,
  Grade,
  Numero,
  SemAcesso,
  Secao,
  cx,
  emReais,
  type Fase,
} from "../_pecas/Pecas";

export interface ItemDaFila {
  leadId: string;
  nome: string;
  estado: string;
  porque: string;
  valorPotencialCents: number | null;
}

export interface ItemDeCliente {
  clienteId: string;
  motivo: string;
  receitaTotalCents: number;
}

export interface DadosDoCrm {
  plano: {
    emitidoEm: string;
    contatosAnalisados: number;
    clientesAnalisados: number;
    naoMedidos: number;
    limiteAtingido: boolean;
    porEstado: Record<string, number>;
    receitaPotencial: { cents: number; comEstimativa: number; semEstimativa: number };
    filas: {
      precisamDeFollowUp: ItemDaFila[];
      esfriando: ItemDaFila[];
      oportunidadesAbandonadas: ItemDaFila[];
      propostasSemRetorno: ItemDaFila[];
      reunioesPendentes: ItemDaFila[];
      chanceDeUpsell: ItemDeCliente[];
      paraReativar: ItemDeCliente[];
      riscoDeChurn: ItemDeCliente[];
    };
  };
  estados: Array<{
    estado: string;
    rotulo: string;
    explicacao: string;
    quantos: number;
    cadencia: string | null;
  }>;
  cadencia: {
    paradas: Array<{ motivo: string; explicacao: string }>;
    condicoes: Array<{ chave: string; descricao: string; estados: readonly string[]; temFiltroExtra: boolean }>;
  };
  posVenda: {
    marcos: Array<{ marco: string; rotulo: string }>;
    regua: Record<string, number>;
    reguaDeChurn: Record<string, number>;
    sinaisDeChurn: Array<{ codigo: string; peso: number; descricao: string }>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AS SEÇÕES
// ─────────────────────────────────────────────────────────────────────────────

/** As oito filas do plano, com o nome que a operação usa. */
export const FILAS_NA_TELA: ReadonlyArray<{ chave: keyof DadosDoCrm["plano"]["filas"]; rotulo: string; deCliente: boolean }> = [
  { chave: "precisamDeFollowUp", rotulo: "Precisam de follow-up", deCliente: false },
  { chave: "esfriando", rotulo: "Esfriando", deCliente: false },
  { chave: "oportunidadesAbandonadas", rotulo: "Oportunidades abandonadas", deCliente: false },
  { chave: "propostasSemRetorno", rotulo: "Propostas sem retorno", deCliente: false },
  { chave: "reunioesPendentes", rotulo: "Reuniões pendentes", deCliente: false },
  { chave: "chanceDeUpsell", rotulo: "Chance de upsell", deCliente: true },
  { chave: "paraReativar", rotulo: "Para reativar", deCliente: true },
  { chave: "riscoDeChurn", rotulo: "Risco de churn", deCliente: true },
];

export function SecaoPlanoDoDia({ dados }: { dados: DadosDoCrm }) {
  const p = dados.plano;
  return (
    <Secao
      titulo="O plano do dia"
      descricao="O que a CRM IA trabalharia hoje. Abrir esta tela não inscreve ninguém em cadência — ela só lê."
    >
      {p.limiteAtingido && (
        <Aviso>
          <strong>A leitura bateu no teto de linhas.</strong> Toda contagem desta tela
          é um <em>piso</em>, não um total. Um piso estampado como total é a mentira
          mais cara que um painel conta, porque ela parece um número.
        </Aviso>
      )}

      <Grade>
        {FILAS_NA_TELA.map((f) => (
          <Numero
            key={f.chave}
            rotulo={f.rotulo}
            valor={p.filas[f.chave].length}
            destaque={f.chave === "riscoDeChurn" && p.filas.riscoDeChurn.length > 0 ? "alerta" : undefined}
            rodape={f.deCliente ? "contas já clientes" : "contatos em prospecção"}
          />
        ))}
      </Grade>

      <Caixa>
        <p>
          <strong className="text-ink">{p.contatosAnalisados}</strong> contatos e{" "}
          <strong className="text-ink">{p.clientesAnalisados}</strong> contas analisados.
        </p>
        <p className="mt-1">
          Receita potencial das filas:{" "}
          <strong className="text-ink tabular-nums">{emReais(p.receitaPotencial.cents)}</strong>{" "}
          — somada sobre {p.receitaPotencial.comEstimativa} itens com estimativa.
          {p.receitaPotencial.semEstimativa > 0 && (
            <>
              {" "}
              <strong className="text-ink">{p.receitaPotencial.semEstimativa}</strong> itens
              entraram sem valor nenhum, então este número é um piso, não um total.
            </>
          )}
        </p>
        {p.naoMedidos > 0 && (
          <p className="mt-1">
            <strong className="text-ink">{p.naoMedidos}</strong> contatos a régua não
            conseguiu classificar. Eles não foram distribuídos por chute entre os outros
            estados: ficam em &quot;não medido&quot;, que é onde a verdade deles está.
          </p>
        )}
      </Caixa>
    </Secao>
  );
}

export function SecaoEstados({ dados }: { dados: DadosDoCrm }) {
  return (
    <Secao
      titulo="Os 14 estados de follow-up"
      descricao="Cada contato classificado conta em um estado só. Os catorze aparecem sempre, inclusive os zerados."
    >
      <ul className="flex flex-col gap-1.5">
        {dados.estados.map((e) => (
          <li
            key={e.estado}
            className={cx(
              "rounded-2xl border p-3",
              e.estado === "NAO_MEDIDO" && e.quantos > 0 ? "border-amber-200 bg-amber-50" : "border-line bg-paper",
            )}
          >
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-[13.5px] font-semibold text-ink">{e.rotulo}</span>
              <span className="text-[16px] font-semibold tabular-nums text-ink">{e.quantos}</span>
            </div>
            <p className="mt-0.5 max-w-[70ch] text-[11.5px] leading-snug text-muted">{e.explicacao}</p>
            <p className="mt-0.5 text-[11.5px] text-muted">
              {e.cadencia ? (
                <>
                  cadência: <code className="rounded bg-chip px-1 text-ink2">{e.cadencia}</code>
                </>
              ) : (
                <span className="italic">nenhuma cadência automática atende este estado</span>
              )}
            </p>
          </li>
        ))}
      </ul>
    </Secao>
  );
}

export function SecaoCadencia({ dados }: { dados: DadosDoCrm }) {
  return (
    <Secao
      titulo="Cadência por comportamento"
      descricao="A cadência não dispara por calendário: cada passo confere a condição antes de sair, e para de vez quando uma parada casa."
    >
      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.04em] text-muted">O que faz parar</p>
        <ul className="flex flex-col gap-1">
          {dados.cadencia.paradas.map((p) => (
            <li key={p.motivo} className="rounded-2xl border border-line bg-paper px-3 py-2">
              <span className="text-[13px] font-semibold text-ink">{p.motivo}</span>
              <p className="mt-0.5 max-w-[70ch] text-[11.5px] leading-snug text-muted">{p.explicacao}</p>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <p className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-[.04em] text-muted">
          Condição de cada passo
        </p>
        {dados.cadencia.condicoes.length === 0 ? (
          <Caixa>Nenhum passo condicionado no catálogo.</Caixa>
        ) : (
          <ul className="flex flex-col gap-1">
            {dados.cadencia.condicoes.map((c) => (
              <li key={c.chave} className="rounded-2xl border border-line bg-paper px-3 py-2">
                <code className="text-[12px] text-ink2">{c.chave}</code>
                <p className="mt-0.5 max-w-[70ch] text-[11.5px] leading-snug text-muted">
                  {c.descricao}
                  {c.temFiltroExtra && " (tem filtro extra sobre a ficha)"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Secao>
  );
}

export function SecaoPosVenda({ dados }: { dados: DadosDoCrm }) {
  const pv = dados.posVenda;
  const risco = dados.plano.filas.riscoDeChurn;
  return (
    <Secao
      titulo="Jornada de pós-venda"
      descricao="Depois do ganho, quem cuida é a jornada — e o risco de churn nasce de sinais observados, nunca de ausência de dado."
    >
      <ul className="flex flex-wrap gap-1.5">
        {pv.marcos.map((m, i) => (
          <li
            key={m.marco}
            className="rounded-full border border-line bg-paper px-3 py-1 text-[12px] text-ink2"
          >
            <span className="mr-1 tabular-nums text-muted">{i + 1}.</span>
            {m.rotulo}
          </li>
        ))}
      </ul>

      <Grade>
        <Numero rotulo="Contas em risco de churn" valor={risco.length} destaque={risco.length > 0 ? "alerta" : undefined} />
        <Numero rotulo="Chance de upsell" valor={dados.plano.filas.chanceDeUpsell.length} />
        <Numero rotulo="Para reativar" valor={dados.plano.filas.paraReativar.length} />
      </Grade>

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.04em] text-muted">
          Os sinais de churn, e o peso de cada um
        </p>
        <ul className="flex flex-col gap-1">
          {pv.sinaisDeChurn.map((s) => (
            <li
              key={s.codigo}
              className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-2xl border border-line bg-paper px-3 py-2"
            >
              <span className="text-[13px] text-ink2">{s.descricao}</span>
              <span className="text-[12px] tabular-nums text-muted">peso {s.peso}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 max-w-[80ch] text-[11.5px] leading-snug text-muted">
          Um sinal que depende de dado não medido NUNCA dispara: saúde ausente não é
          saúde ruim, NPS ausente não é detrator. Tratar ausência como sinal negativo
          encheria a fila de risco de contas que ninguém mediu, e a fila de risco de
          verdade sumiria dentro dela.
        </p>
      </div>
    </Secao>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A TELA
// ─────────────────────────────────────────────────────────────────────────────

export function CrmClient() {
  const [estado, setEstado] = useState<Fase<DadosDoCrm>>({ fase: "carregando" });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/crm", { cache: "no-store" });
        if (!vivo) return;
        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }
        const j = (await r.json()) as { ok: boolean; data?: DadosDoCrm; error?: string };
        if (!vivo) return;
        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? null });
          return;
        }
        setEstado({ fase: "pronto", dados: j.data });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <Cabecalho
        titulo="CRM IA"
        subtitulo="O departamento que cuida de quem já entrou. Só leitura: abrir esta tela não inscreve ninguém em cadência nenhuma."
      />

      {estado.fase === "carregando" && <Carregando texto="Classificando os contatos e montando o plano do dia…" />}
      {estado.fase === "semAcesso" && <SemAcesso />}
      {estado.fase === "erro" && <Erro detalhe={estado.detalhe} />}

      {estado.fase === "pronto" && (
        <>
          <SecaoPlanoDoDia dados={estado.dados} />
          <SecaoEstados dados={estado.dados} />
          <SecaoCadencia dados={estado.dados} />
          <SecaoPosVenda dados={estado.dados} />
        </>
      )}
    </div>
  );
}
