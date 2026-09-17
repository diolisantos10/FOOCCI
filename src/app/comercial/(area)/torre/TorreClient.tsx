"use client";

/**
 * A CONTROL TOWER — a sala do supervisor.
 *
 * ── A ORDEM DA TELA, E POR QUE ELA É ESSA ───────────────────────────────────
 *
 * 1. **O que está travado agora.** Um supervisor abre a torre no dia ruim. Se a
 *    primeira coisa que ele vê for um gráfico do mês, a torre virou relatório.
 * 2. **Alertas com causa.** Número vermelho sem causa é susto, não informação.
 * 3. **Hoje contra ontem.** Duas janelas de 24 h, medidas no MESMO instante.
 * 4. **Onde o volume morre.** A escada de seis degraus do raio-X.
 * 5. **O que a Supervisora pegou.** O controle de qualidade da conversa.
 *
 * ── O QUE ESTA TELA NÃO FAZ ─────────────────────────────────────────────────
 *
 * Não manda mensagem, não reatribui lead, não muda estágio. Ela é um vidro:
 * olha para fora e não mexe em nada. Quem age tem as telas de trabalho que já
 * existem — `/comercial/painel` e `/comercial/supervisora`, ambas intactas.
 *
 * ── E A REGRA QUE MANDA EM TUDO ─────────────────────────────────────────────
 *
 * Bloco não medido aparece com o MOTIVO, nunca como zero. Hoje, na base real,
 * o raio-X devolve `medido: false` para porteiros e decisores — porque a
 * classificação mora em `Contato`, que pende de `Empresa`, e a maioria dos
 * leads antigos não tem empresa ligada. A torre estampa esse motivo em vez de
 * um zero. Zero ali seria mentira: diria "medimos e não há nenhum porteiro",
 * quando o que existe é "ninguém conseguiu perguntar".
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
  NaoMedido,
  SemAcesso,
  Secao,
  cx,
  textoDaVariacao,
  type Fase,
  type Medida,
} from "../_pecas/Pecas";

// ─────────────────────────────────────────────────────────────────────────────
// O QUE A ROTA DEVOLVE — o mesmo formato dos serviços, sem tradução pelo meio
// ─────────────────────────────────────────────────────────────────────────────

type Taxa =
  | { medido: true; valor: number; base: number }
  | { medido: false; motivo: "amostraPequena"; base: number }
  | { medido: false; motivo: "semDados" };

export interface DadosDaTorre {
  periodo: { de: string; ate: string; agora: string };
  painel: {
    agora: {
      semResponsavel: number;
      aguardandoHumano: number;
      comIA: number;
      slaEstourado: number;
      followUpVencido: number;
      semProximaAcao: number;
      entrandoAgora: number;
    };
    time: {
      sdrs: Array<{ userId: string; nome: string; estado: string; carga: number; capacidade: number }>;
      porEstado: Record<string, number>;
      semCadastro: boolean;
    };
    conversao: {
      degraus: Array<{ etapa: string; rotulo: string; total: number }>;
      pontaAPonta: Taxa;
      ganhos: number;
      perdidos: number;
      emNutricao: number;
    };
  };
  supervisora: {
    conversasAcompanhadas: number;
    mensagensAvaliadas: number;
    mensagensCorrigidas: number;
    mensagensBloqueadas: number;
    escaladasParaGente: number;
    falhasTecnicas: number;
    optOuts: number;
    principaisRiscos: Array<{ motivo: string; rotulo: string; total: number }>;
  };
  comparacao: {
    janelaHoras: number;
    hoje: { funil: { degraus: Array<{ etapa: string; rotulo: string; total: number }>; ganhos: number } };
    ontem: { funil: { degraus: Array<{ etapa: string; rotulo: string; total: number }>; ganhos: number } };
  };
  raioX: {
    mensagensNaJanela: number;
    abordadosSemFicha: number;
    abordagem: Medida<{
      abordados: number;
      responderam: number;
      nuncaResponderam: number;
      taxaDeResposta: Taxa;
    }>;
    ondeMorreu: Medida<Array<{ etapa: string; rotulo: string; quantos: number }>>;
    gatekeepers: Medida<{ classificados: number }>;
    decisores: Medida<{ comTelefone: number; semTelefone: number }>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AS SEÇÕES — exportadas para o teste poder provar cada número sozinho
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um alerta só existe quando tem causa e tem o que fazer. Uma lista de números
 * vermelhos sem essas duas colunas é um alarme que ninguém sabe desligar.
 */
export interface Alerta {
  chave: string;
  titulo: string;
  quantos: number;
  causa: string;
}

/**
 * Os alertas saem DAS FILAS MEDIDAS, e só delas.
 *
 * Nenhum limiar inventado aqui: um alerta acende quando a contagem que o
 * serviço devolveu é maior que zero. A gravidade é a própria contagem.
 */
export function alertasDoAgora(agora: DadosDaTorre["painel"]["agora"]): Alerta[] {
  const candidatos: Alerta[] = [
    {
      chave: "semResponsavel",
      titulo: "Conversa sem dono",
      quantos: agora.semResponsavel,
      causa: "lead ativo com `atendidoPor = NINGUEM` — entrou e ninguém assumiu",
    },
    {
      chave: "slaEstourado",
      titulo: "Prazo de resposta estourado",
      quantos: agora.slaEstourado,
      causa: "o lead falou e o prazo da casa para responder já passou",
    },
    {
      chave: "followUpVencido",
      titulo: "Follow-up vencido",
      quantos: agora.followUpVencido,
      causa: "a próxima ação estava marcada para uma hora que já passou",
    },
    {
      chave: "semProximaAcao",
      titulo: "Sem próxima ação marcada",
      quantos: agora.semProximaAcao,
      causa: "conversa viva e sem nada agendado — some sem ninguém perceber",
    },
    {
      chave: "aguardandoHumano",
      titulo: "Esperando uma pessoa",
      quantos: agora.aguardandoHumano,
      causa: "a IA passou a bola e a pessoa ainda não pegou",
    },
  ];
  return candidatos.filter((a) => a.quantos > 0).sort((a, b) => b.quantos - a.quantos);
}

export function SecaoTravado({ dados }: { dados: DadosDaTorre }) {
  const a = dados.painel.agora;
  return (
    <Secao
      titulo="Travado agora"
      descricao="Retrato deste instante, não do período. É o que um supervisor destrava hoje."
    >
      <Grade>
        <Numero rotulo="Sem dono" valor={a.semResponsavel} destaque={a.semResponsavel > 0 ? "alerta" : undefined} />
        <Numero rotulo="Prazo estourado" valor={a.slaEstourado} destaque={a.slaEstourado > 0 ? "alerta" : undefined} />
        <Numero rotulo="Follow-up vencido" valor={a.followUpVencido} destaque={a.followUpVencido > 0 ? "alerta" : undefined} />
        <Numero rotulo="Sem próxima ação" valor={a.semProximaAcao} />
        <Numero rotulo="Esperando gente" valor={a.aguardandoHumano} />
        <Numero rotulo="Com a IA" valor={a.comIA} />
        <Numero rotulo="Entraram em 24 h" valor={a.entrandoAgora} />
      </Grade>
    </Secao>
  );
}

export function SecaoAlertas({ dados }: { dados: DadosDaTorre }) {
  const alertas = alertasDoAgora(dados.painel.agora);
  return (
    <Secao titulo="Alertas, com a causa" descricao="Um alerta sem causa é um susto. Cada linha diz por que acendeu.">
      {alertas.length === 0 ? (
        <Caixa>
          Nenhuma fila de travamento acima de zero neste instante. Isto é uma
          medição, não um silêncio: as sete contagens acima vieram do banco.
        </Caixa>
      ) : (
        <ul className="flex flex-col gap-2">
          {alertas.map((al) => (
            <li key={al.chave} className="rounded-2xl border border-red-200 bg-red-50 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[13.5px] font-semibold text-red-900">{al.titulo}</span>
                <span className="text-xl font-semibold tabular-nums text-red-700">{al.quantos}</span>
              </div>
              <p className="mt-0.5 max-w-[70ch] text-[11.5px] leading-snug text-red-900/80">{al.causa}</p>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

export function SecaoOntem({ dados }: { dados: DadosDaTorre }) {
  const { hoje, ontem, janelaHoras } = dados.comparacao;
  const porEtapaDeOntem = new Map(ontem.funil.degraus.map((d) => [d.etapa, d.total]));

  return (
    <Secao
      titulo={`Hoje contra ontem (${janelaHoras} h)`}
      descricao="Duas janelas encostadas, medidas no mesmo instante. Nenhum lead conta nas duas."
    >
      <ul className="flex flex-col gap-1.5">
        {hoje.funil.degraus.map((d) => {
          const de = porEtapaDeOntem.get(d.etapa) ?? 0;
          return (
            <li key={d.etapa} className="rounded-2xl border border-line bg-paper p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span className="text-[13.5px] font-semibold text-ink">{d.rotulo}</span>
                <span className="text-lg font-semibold tabular-nums text-ink">{d.total}</span>
              </div>
              <p className="mt-0.5 text-[11.5px] text-muted">{textoDaVariacao(de, d.total)}</p>
            </li>
          );
        })}
      </ul>
    </Secao>
  );
}

export function SecaoFunil({ dados }: { dados: DadosDaTorre }) {
  const c = dados.painel.conversao;
  return (
    <Secao titulo="Volume por etapa do funil" descricao="Leads criados no período, contados na etapa em que estão hoje.">
      <ul className="flex flex-col gap-1.5">
        {c.degraus.map((d) => (
          <li key={d.etapa} className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-paper px-3 py-2">
            <span className="text-[13px] text-ink2">{d.rotulo}</span>
            <span className="text-[15px] font-semibold tabular-nums text-ink">{d.total}</span>
          </li>
        ))}
      </ul>
      <p className="text-[12px] text-muted">
        Ponta a ponta:{" "}
        {c.pontaAPonta.medido ? (
          <strong className="text-ink2 tabular-nums">
            {Math.round(c.pontaAPonta.valor * 100)}% (de {c.pontaAPonta.base})
          </strong>
        ) : c.pontaAPonta.motivo === "amostraPequena" ? (
          <NaoMedido motivo={`amostra pequena demais para uma taxa honesta (base ${c.pontaAPonta.base})`} />
        ) : (
          <NaoMedido motivo="nenhum lead no período" />
        )}
      </p>
    </Secao>
  );
}

/**
 * A escada do raio-X. Esta é a seção onde a honestidade custa mais caro, porque
 * dois dos quatro blocos NÃO são mensuráveis na base de hoje.
 */
export function SecaoRaioX({ dados }: { dados: DadosDaTorre }) {
  const r = dados.raioX;
  return (
    <Secao
      titulo="Raio-X das conversas"
      descricao="Onde a conversa de prospecção parou, em seis degraus. Cada conversa conta só no degrau mais alto que alcançou."
    >
      <Grade>
        <Numero
          rotulo="Abordados"
          valor={r.abordagem.medido ? r.abordagem.valor.abordados : null}
          motivo={r.abordagem.medido ? undefined : r.abordagem.motivo}
        />
        <Numero
          rotulo="Responderam"
          valor={r.abordagem.medido ? r.abordagem.valor.responderam : null}
          motivo={r.abordagem.medido ? undefined : r.abordagem.motivo}
          rodape={
            r.abordagem.medido && r.abordagem.valor.taxaDeResposta.medido
              ? `${Math.round(r.abordagem.valor.taxaDeResposta.valor * 100)}% dos abordados`
              : undefined
          }
        />
        <Numero
          rotulo="Porteiros classificados"
          valor={r.gatekeepers.medido ? r.gatekeepers.valor.classificados : null}
          motivo={r.gatekeepers.medido ? undefined : r.gatekeepers.motivo}
        />
        <Numero
          rotulo="Decisores com telefone"
          valor={r.decisores.medido ? r.decisores.valor.comTelefone : null}
          motivo={r.decisores.medido ? undefined : r.decisores.motivo}
          rodape={
            r.decisores.medido ? `${r.decisores.valor.semTelefone} identificados sem telefone` : undefined
          }
        />
      </Grade>

      {(!r.gatekeepers.medido || !r.decisores.medido) && (
        <Aviso>
          <strong>Dois blocos acima não têm resposta na base de hoje — e por isso não trazem zero.</strong>{" "}
          A classificação de porteiro e a captura de decisor moram em{" "}
          <code className="rounded bg-amber-100 px-1">Contato</code>, que pende de{" "}
          <code className="rounded bg-amber-100 px-1">Empresa</code>, e a maior parte dos leads antigos
          nunca teve empresa ligada. Um zero aqui afirmaria &quot;medimos, e não há nenhum porteiro&quot;.
          O que existe é outra coisa: <em>ninguém conseguiu perguntar</em>. As duas
          exigem trabalho diferente, e por isso a tela não as confunde.
        </Aviso>
      )}

      <div>
        <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.04em] text-muted">Onde a conversa morreu</p>
        {r.ondeMorreu.medido ? (
          <ul className="flex flex-col gap-1.5">
            {r.ondeMorreu.valor.map((e) => (
              <li key={e.etapa} className="rounded-2xl border border-line bg-paper p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <span className="text-[13px] text-ink2">{e.rotulo}</span>
                  <span className="text-[15px] font-semibold tabular-nums text-ink">{e.quantos}</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <Caixa>
            <NaoMedido motivo={r.ondeMorreu.motivo} />
          </Caixa>
        )}
      </div>

      <p className="text-[11.5px] leading-snug text-muted">
        {r.mensagensNaJanela} mensagens varridas na janela.
        {r.abordadosSemFicha > 0 && (
          <>
            {" "}
            <strong className="text-ink2">{r.abordadosSemFicha}</strong> leads receberam mensagem
            nossa e não têm mais ficha — declarados aqui em vez de sumirem do total.
          </>
        )}
      </p>
    </Secao>
  );
}

export function SecaoSupervisora({ dados }: { dados: DadosDaTorre }) {
  const s = dados.supervisora;
  return (
    <Secao titulo="O que a Supervisora pegou" descricao="Controle de qualidade da conversa, no período selecionado.">
      <Grade>
        <Numero rotulo="Conversas acompanhadas" valor={s.conversasAcompanhadas} />
        <Numero rotulo="Mensagens avaliadas" valor={s.mensagensAvaliadas} />
        <Numero rotulo="Corrigidas antes de sair" valor={s.mensagensCorrigidas} />
        <Numero rotulo="Bloqueadas" valor={s.mensagensBloqueadas} destaque={s.mensagensBloqueadas > 0 ? "alerta" : undefined} />
        <Numero rotulo="Escaladas para gente" valor={s.escaladasParaGente} />
        <Numero rotulo="Pediram para parar" valor={s.optOuts} destaque={s.optOuts > 0 ? "alerta" : undefined} />
        <Numero
          rotulo="Falhas técnicas"
          valor={s.falhasTecnicas}
          destaque={s.falhasTecnicas > 0 ? "alerta" : undefined}
          rodape="a Supervisora tentou avaliar e não conseguiu — não é conversa boa, é conversa não avaliada"
        />
      </Grade>
      {s.principaisRiscos.length > 0 && (
        <ul className="flex flex-col gap-1">
          {s.principaisRiscos.map((r) => (
            <li key={r.motivo} className="flex items-baseline justify-between gap-3 rounded-2xl border border-line bg-paper px-3 py-2">
              <span className="text-[13px] text-ink2">{r.rotulo}</span>
              <span className="text-[14px] font-semibold tabular-nums text-ink">{r.total}</span>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

export function SecaoTime({ dados }: { dados: DadosDaTorre }) {
  const t = dados.painel.time;
  return (
    <Secao titulo="Quem está de pé" descricao="Carga sobre capacidade, por pessoa.">
      {t.semCadastro ? (
        <Caixa>
          <strong>Ninguém registrou disponibilidade.</strong> Isto NÃO é &quot;time
          todo offline&quot;: é ausência de cadastro. As duas produzem a mesma tela
          vazia e pedem coisas opostas — uma é cobrar presença, a outra é cadastrar.
        </Caixa>
      ) : t.sdrs.length === 0 ? (
        <Caixa>Nenhum SDR ativo no cadastro.</Caixa>
      ) : (
        <ul className="flex flex-col gap-1">
          {t.sdrs.map((s) => (
            <li key={s.userId} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-2xl border border-line bg-paper px-3 py-2">
              <span className="text-[13px] font-medium text-ink">{s.nome}</span>
              <span className="text-[11.5px] uppercase tracking-[.04em] text-muted">{s.estado}</span>
              <span
                className={cx(
                  "text-[13px] tabular-nums",
                  s.capacidade > 0 && s.carga > s.capacidade ? "font-semibold text-red-700" : "text-ink2",
                )}
              >
                {s.carga} / {s.capacidade}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A TELA
// ─────────────────────────────────────────────────────────────────────────────

export function TorreClient() {
  const [estado, setEstado] = useState<Fase<DadosDaTorre>>({ fase: "carregando" });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/torre", { cache: "no-store" });
        if (!vivo) return;
        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }
        const j = (await r.json()) as { ok: boolean; data?: DadosDaTorre; error?: string };
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
        titulo="Control Tower"
        subtitulo="A saúde da operação comercial inteira em uma tela. Só leitura: daqui não sai mensagem, nem atribuição, nem mudança de estágio."
      />

      {estado.fase === "carregando" && <Carregando texto="Medindo a operação inteira — filas, funil, raio-X e Supervisora…" />}
      {estado.fase === "semAcesso" && <SemAcesso />}
      {estado.fase === "erro" && <Erro detalhe={estado.detalhe} />}

      {estado.fase === "pronto" && (
        <>
          <SecaoTravado dados={estado.dados} />
          <SecaoAlertas dados={estado.dados} />
          <SecaoOntem dados={estado.dados} />
          <SecaoFunil dados={estado.dados} />
          <SecaoRaioX dados={estado.dados} />
          <SecaoSupervisora dados={estado.dados} />
          <SecaoTime dados={estado.dados} />
        </>
      )}
    </div>
  );
}
