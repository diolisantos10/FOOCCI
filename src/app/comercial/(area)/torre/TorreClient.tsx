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
  Barra,
  Rosca,
  SerieNoTempo,
  Caixa,
  Carregando,
  CartaoDeIA,
  Celula,
  Corpo,
  Erro,
  FilaDeIndicadores,
  Grade,
  Indicador,
  Linha,
  Numero,
  NaoMedido,
  Pilula,
  SemAcesso,
  Secao,
  Tabela,
  TituloDaPagina,
  cx,
  emDia,
  emReais,
  textoDaVariacao,
  type Fase,
  type Medida,
} from "../_pecas/Pecas";

/**
 * ⚠️ A RESSALVA DO PRAZO, ESCRITA UMA VEZ E REPETIDA ONDE O NÚMERO APARECE.
 *
 * `slaVenceEm` só passou a ser gravado em 18/09/2026. Lead anterior a isso não
 * tem prazo, e por isso NUNCA entra na conta de "prazo estourado" — a contagem
 * é de quem tem prazo e o perdeu, não de quem está atrasado. **Ausência de
 * prazo não é ausência de atraso**, e a torre não deixa o número passar sozinho.
 */
export const RESSALVA_DO_PRAZO =
  "conta só leads com prazo gravado (o campo passou a ser escrito em 18/09/2026): " +
  "lead mais antigo não tem prazo e não aparece aqui — ausência de prazo não é ausência de atraso";

// ─────────────────────────────────────────────────────────────────────────────
// O QUE A ROTA DEVOLVE — o mesmo formato dos serviços, sem tradução pelo meio
// ─────────────────────────────────────────────────────────────────────────────

export type Receita =
  | { medido: true; centavos: number; propostas: number }
  | { medido: false; motivo: "semValores"; propostas: number }
  | { medido: false; motivo: "semPropostas" };

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
    /** Já vinha no corpo da resposta; a tela só não o declarava. */
    perdas: Array<{ rotulo: string; grupo: string | null; total: number }>;
    receita: Receita;
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
  /** As seis medições da peça 02 — ver `services/salaDeVendas/telas/controlTower.ts`. */
  serie: {
    janelaHoras: number;
    pontos: Array<{ instante: string; recebidos: number; qualificados: number }>;
    comoSeMede: { recebidos: string; qualificados: string };
  };
  fila: {
    emAtendimento: number;
    aguardandoVendedor: number;
    total: number;
    esperandoDemais: number;
    limiarMin: number;
  };
  quentes: { quantos: number; semScore: number };
  conversoes: { ia: Taxa; agente: Taxa; comoSeMede: string };
  ranking: {
    linhas: Array<{
      userId: string;
      nome: string;
      atendimentos: number;
      vendas: number;
      conversao: Taxa;
    }>;
    slaPorPessoa: Medida<never>;
  };
  sla: Medida<{ minutos: number; base: number; semResposta: number }>;
  receitaDoDia: { hoje: Receita; ontem: Receita };
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

/**
 * ⚠️ O "SLA MÉDIO" DO DESENHO MEDE O TEMPO **DA CASA**, NÃO O DO LEAD.
 *
 * `painel.ts` tem `tempoDePrimeiraResposta`, que mede o tempo até o LEAD
 * responder. Tem o mesmo nome no português da operação e mede o contrário: se
 * menos gente responde, ele MELHORA. O número deste cartão sai de
 * `slaMedioDeResposta`, que cronometra da primeira mensagem do lead até a
 * primeira nossa depois dela.
 */
export function textoDoSla(sla: DadosDaTorre["sla"]): { valor: string | null; motivo?: string; rodape?: string } {
  if (!sla.medido) return { valor: null, motivo: sla.motivo };
  const { minutos, base, semResposta } = sla.valor;
  const valor = minutos < 60 ? `${minutos}m` : `${Math.floor(minutos / 60)}h ${minutos % 60}m`;
  return {
    valor,
    rodape:
      `sobre ${base} conversas com pergunta e resposta no período` +
      (semResposta > 0
        ? ` · ${semResposta} escreveram e ainda não foram respondidos — fora da média, de propósito`
        : ""),
  };
}

/** Uma receita medida, ou o motivo. Nunca R$ 0,00 no lugar de "não sei". */
export function textoDaReceita(r: Receita): { valor: string | null; motivo?: string; rodape?: string } {
  if (r.medido) {
    return { valor: emReais(r.centavos), rodape: `${r.propostas} propostas aceitas com valor` };
  }
  if (r.motivo === "semValores") {
    return {
      valor: null,
      motivo:
        `${r.propostas} propostas foram aceitas e nenhuma tem valor gravado — o preço foi combinado ` +
        `fora do sistema. Somar como zero diria "fechou e não entrou dinheiro"`,
    };
  }
  return { valor: null, motivo: "nenhuma proposta aceita no período — não há receita a somar" };
}

function textoDaTaxa(t: Taxa): { valor: string | null; motivo?: string; rodape?: string } {
  if (t.medido) {
    return {
      valor: `${(t.valor * 100).toFixed(1).replace(".", ",")}%`,
      rodape: `sobre ${t.base} leads`,
    };
  }
  if (t.motivo === "amostraPequena") {
    return { valor: null, motivo: `amostra pequena demais para uma taxa honesta (base ${t.base})` };
  }
  return { valor: null, motivo: "nenhum lead nesta trilha no período" };
}

/**
 * OS NOVE INDICADORES DA PEÇA 02, em 4 + 5 como no desenho.
 *
 * ── O QUE MUDOU, E POR QUE ──────────────────────────────────────────────────
 *
 * A fileira antiga mostrava sete contagens de FILA ("sem dono", "prazo
 * estourado", "follow-up vencido"…). Elas não sumiram — desceram para "Alertas,
 * com a causa", que é onde uma fila travada de fato pede ação. O topo passa a
 * ser o que o CEO desenhou: entrada, atendimento, espera, prazo, quentes,
 * conversões, receita e perdas.
 *
 * ⛔ **Três dos nove não têm número, e por motivos diferentes.** Cada um estampa
 * o seu. Nenhum estampa zero.
 */
export function SecaoIndicadores({ dados }: { dados: DadosDaTorre }) {
  const a = dados.painel.agora;
  const sla = textoDoSla(dados.sla);
  const receita = textoDaReceita(dados.receitaDoDia.hoje);
  const ia = textoDaTaxa(dados.conversoes.ia);
  const agente = textoDaTaxa(dados.conversoes.agente);
  const perdas = dados.painel.perdas.reduce((s, p) => s + p.total, 0);

  return (
    <Secao
      titulo="Os números do dia"
      descricao="Retrato deste instante para as filas; o período do recorte para conversão, receita e perdas."
    >
      <FilaDeIndicadores>
        <Indicador
          rotulo="Leads entrando"
          valor={a.entrandoAgora}
          icone="pessoas"
          tom="azul"
          rodape="criados nas últimas 24 h"
        />
        <Indicador rotulo="IA atendendo" valor={a.comIA} icone="faisca" tom="roxo" />
        <Indicador
          rotulo="Aguardando vendedor"
          valor={a.aguardandoHumano}
          icone="relogio"
          tom={a.aguardandoHumano > 0 ? "ambar" : "verde"}
        />
        <Indicador
          rotulo="SLA médio"
          valor={sla.valor}
          motivo={sla.motivo}
          icone="relogio"
          tom="verde"
          rodape={sla.rodape}
        />
      </FilaDeIndicadores>

      <FilaDeIndicadores colunas={5}>
        <Indicador
          rotulo="Leads quentes sem dono"
          valor={dados.quentes.quantos}
          icone="chama"
          tom={dados.quentes.quantos > 0 ? "vermelho" : "verde"}
          rodape={
            dados.quentes.semScore > 0
              ? `${dados.quentes.semScore} leads ativos nunca foram pontuados — este número é “quantos achamos”, não “quantos existem”`
              : undefined
          }
        />
        <Indicador
          rotulo="Conversão da IA"
          valor={ia.valor}
          motivo={ia.motivo}
          icone="grafico"
          tom="roxo"
          rodape={ia.rodape}
        />
        <Indicador
          rotulo="Conversão por agente"
          valor={agente.valor}
          motivo={agente.motivo}
          icone="grafico"
          tom="azul"
          rodape={agente.rodape}
        />
        <Indicador
          rotulo="Receita do dia"
          valor={receita.valor}
          motivo={receita.motivo}
          icone="dinheiro"
          tom="verde"
          rodape={receita.rodape}
        />
        <Indicador
          rotulo="Perdas"
          valor={perdas}
          icone="alerta"
          tom={perdas > 0 ? "vermelho" : "verde"}
          rodape="leads que foram a PERDIDO no período"
        />
      </FilaDeIndicadores>

      <p className="max-w-[90ch] text-[11.5px] leading-snug text-muted">
        <strong className="text-ink2">Como as duas conversões são separadas:</strong>{" "}
        {dados.conversoes.comoSeMede}.
      </p>
    </Secao>
  );
}

/**
 * AS FILAS DE TRAVAMENTO — a fileira que o desenho não tem, e que fica.
 *
 * ── POR QUE ELA NÃO FOI APAGADA QUANDO OS NOVE DO DESENHO ENTRARAM ──────────
 *
 * O desenho abre com entrada, conversão e receita. Um supervisor abre a Torre
 * no dia ruim — e no dia ruim a pergunta é "o que está travado". As duas
 * fileiras respondem coisas diferentes e nenhuma substitui a outra, então a do
 * desenho vai para o topo e esta desce, inteira.
 *
 * ⚠️ É aqui que a RESSALVA DO PRAZO viaja colada ao número. Ela não pode sair
 * daqui sem sair junto com o cartão: "prazo estourado: 0" sem ela afirma
 * "ninguém está atrasado", quando o que existe é "a maioria dos leads nem tem
 * prazo para perder".
 */
export function SecaoTravado({ dados }: { dados: DadosDaTorre }) {
  const a = dados.painel.agora;
  return (
    <Secao
      titulo="Travado agora"
      descricao="Retrato deste instante, não do período. É o que um supervisor destrava hoje."
    >
      <FilaDeIndicadores>
        <Indicador
          rotulo="Sem dono"
          valor={a.semResponsavel}
          icone="pessoas"
          tom={a.semResponsavel > 0 ? "vermelho" : "verde"}
        />
        <Indicador
          rotulo="Prazo estourado"
          valor={a.slaEstourado}
          icone="relogio"
          tom={a.slaEstourado > 0 ? "vermelho" : "verde"}
          rodape={RESSALVA_DO_PRAZO}
        />
        <Indicador
          rotulo="Follow-up vencido"
          valor={a.followUpVencido}
          icone="alerta"
          tom={a.followUpVencido > 0 ? "ambar" : "verde"}
        />
        <Indicador rotulo="Sem próxima ação" valor={a.semProximaAcao} icone="alvo" tom="ambar" />
      </FilaDeIndicadores>
    </Secao>
  );
}

/**
 * A SÉRIE DO DESENHO — "Volume de Leads ao Longo do Tempo", duas linhas.
 *
 * O que o desenho chama de "Leads qualificados (IA)" aqui é **o lead que a
 * régua de score pontuou naquela hora**. Não é "lead bom": é "a IA olhou". A
 * diferença vai escrita embaixo do gráfico, porque as duas leituras pedem
 * providências opostas.
 */
export function SecaoSerie({ dados }: { dados: DadosDaTorre }) {
  const rotulos = dados.serie.pontos.map((p) =>
    new Date(p.instante).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
  );

  return (
    <Secao
      titulo={`Volume ao longo do tempo (${dados.serie.janelaHoras} h)`}
      descricao="Hora a hora. Hora sem lead é zero medido e desce até o chão — a linha não pula o vazio."
    >
      <SerieNoTempo
        rotulos={rotulos}
        series={[
          { rotulo: "Leads recebidos", tom: "azul", valores: dados.serie.pontos.map((p) => p.recebidos) },
          { rotulo: "Leads qualificados (IA)", tom: "roxo", valores: dados.serie.pontos.map((p) => p.qualificados) },
        ]}
        nota={
          <>
            <span className="block">Recebidos: {dados.serie.comoSeMede.recebidos}.</span>
            <span className="block">Qualificados: {dados.serie.comoSeMede.qualificados}.</span>
            <span className="mt-1 block">
              As duas linhas <strong>não somam nem se contêm</strong>: um lead pode entrar numa hora e
              ser pontuado em outra.
            </span>
          </>
        }
      />
    </Secao>
  );
}

/**
 * A ROSCA DA FILA — e por que "aguardando há +10 min" NÃO é uma fatia.
 *
 * Quem espera há mais de dez minutos já está contado dentro de "aguardando
 * vendedor". Desenhá-lo como terceira fatia inventaria um total maior que a
 * fila. Ele sai do anel e vira o alerta vermelho do desenho, que é o papel que
 * ele de fato tem.
 */
export function SecaoSaudeDaFila({ dados }: { dados: DadosDaTorre }) {
  const f = dados.fila;
  return (
    <Secao titulo="Saúde da fila de atendimento" descricao="Retrato do agora: quem está com a IA e quem espera uma pessoa.">
      <Rosca
        centro={f.total}
        sobCentro="Total"
        fatias={[
          { rotulo: "Em atendimento (IA)", valor: f.emAtendimento, tom: "verde" },
          { rotulo: "Aguardando vendedor", valor: f.aguardandoVendedor, tom: "ambar" },
        ]}
        motivo={
          f.total === 0
            ? "nenhum lead com a IA nem esperando vendedor neste instante — a fila está vazia, e um anel aqui não teria o que dividir"
            : undefined
        }
        alerta={
          f.esperandoDemais > 0 ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2">
              <p className="text-[12.5px] font-semibold leading-snug text-red-900">
                {f.esperandoDemais} {f.esperandoDemais === 1 ? "lead aguarda" : "leads aguardam"} há mais de{" "}
                {f.limiarMin} minutos.
              </p>
              <p className="mt-0.5 text-[11px] leading-snug text-red-900/80">
                conta handoffs abertos (`aceitoEm` vazio) criados antes do limiar — quem já foi aceito sai
                da conta mesmo que a conversa continue
              </p>
            </div>
          ) : null
        }
      />
    </Secao>
  );
}

/**
 * O RANKING DE VENDEDORES do desenho — com a coluna SLA declarada ausente.
 *
 * O desenho tem seis colunas; cinco têm fonte. A sexta fica na tabela, vazia e
 * explicada: coluna que some é coluna que ninguém percebe que falta.
 */
export function SecaoRanking({ dados }: { dados: DadosDaTorre }) {
  const r = dados.ranking;
  return (
    <Secao
      titulo="Ranking de vendedores"
      descricao="Leads do período por pessoa que os detém HOJE — um lead repassado conta para quem o tem agora. É a única atribuição que o banco sustenta."
    >
      {r.linhas.length === 0 ? (
        <Caixa>
          Nenhum lead do período tem atendente humano registrado. Isto não é &quot;time
          sem resultado&quot;: é ausência de atribuição. As duas pedem coisas opostas.
        </Caixa>
      ) : (
        <>
          <Tabela colunas={["#", "Nome", "Atendimentos", "Conversão", "Vendas", "SLA"]}>
            {r.linhas.map((l, i) => {
              const c = textoDaTaxa(l.conversao);
              return (
                <Linha key={l.userId}>
                  <Celula numero forte>{i === 0 ? "1 👑" : i + 1}</Celula>
                  <Celula forte>{l.nome}</Celula>
                  <Celula numero>{l.atendimentos}</Celula>
                  <Celula numero>
                    {c.valor ?? <span className="italic text-muted">não medido</span>}
                  </Celula>
                  <Celula numero>{l.vendas}</Celula>
                  <Celula>
                    <span className="italic text-muted">não medido</span>
                  </Celula>
                </Linha>
              );
            })}
          </Tabela>
          {!r.slaPorPessoa.medido && (
            <Aviso>
              <strong>A coluna SLA do desenho fica vazia, e não com um tempo estimado.</strong>{" "}
              {r.slaPorPessoa.motivo}.
            </Aviso>
          )}
        </>
      )}
    </Secao>
  );
}

/**
 * PRINCIPAIS MOTIVOS DE PERDA.
 *
 * ⚠️ A linha "sem motivo registrado" vem do serviço e **não é ordenada junto**:
 * ela é sempre a última e sempre visível. Se metade das perdas não tem motivo,
 * a leitura correta é "não sabemos por que perdemos metade" — e não um ranking
 * limpo dos que alguém se deu ao trabalho de preencher.
 */
export function SecaoPerdas({ dados }: { dados: DadosDaTorre }) {
  const perdas = dados.painel.perdas;
  const total = perdas.reduce((s, p) => s + p.total, 0);

  return (
    <Secao titulo="Principais motivos de perda" descricao="Leads que foram a PERDIDO no período, pelo motivo cadastrado.">
      {total === 0 ? (
        <Caixa>
          Nenhum lead foi a PERDIDO no período. Isto é uma medição — a contagem
          veio do banco, e não de um bloco que não carregou.
        </Caixa>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {perdas.map((p) => (
            <Barra
              key={p.rotulo}
              rotulo={p.rotulo}
              valor={p.total}
              fracao={p.total / total}
              tom={p.rotulo === "sem motivo registrado" ? "cinza" : "vermelho"}
              nota={
                p.rotulo === "sem motivo registrado"
                  ? "perdas sem motivo cadastrado — não é um motivo, é o buraco do relatório"
                  : p.grupo ?? undefined
              }
            />
          ))}
        </ul>
      )}
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
  const teto = Math.max(1, ...hoje.funil.degraus.map((d) => d.total));

  return (
    <Secao
      titulo={`Hoje contra ontem (${janelaHoras} h)`}
      descricao="Duas janelas encostadas, medidas no mesmo instante. Nenhum lead conta nas duas."
    >
      <ul className="flex flex-col gap-1.5">
        {hoje.funil.degraus.map((d) => {
          const de = porEtapaDeOntem.get(d.etapa) ?? 0;
          return (
            <Barra
              key={d.etapa}
              rotulo={d.rotulo}
              valor={d.total}
              /* A barra compara com o MAIOR degrau de hoje — é proporção dentro
                 da janela, não porcentagem contra ontem. A comparação com ontem
                 é a linha de texto, que se recusa a dividir por zero. */
              fracao={null}
              nota={textoDaVariacao(de, d.total)}
              tom="azul"
            />
          );
        })}
      </ul>
      <p className="text-[11.5px] leading-snug text-muted">
        Maior degrau da janela: {teto}. Nenhuma variação foi calculada sobre base
        zero — crescer de 0 para 3 não tem porcentagem.
      </p>
    </Secao>
  );
}

export function SecaoFunil({ dados }: { dados: DadosDaTorre }) {
  const c = dados.painel.conversao;
  const topo = Math.max(1, ...c.degraus.map((d) => d.total));
  return (
    <Secao titulo="Funil de receita" descricao="Leads criados no período, contados na etapa em que estão hoje. A barra é a fatia do topo do funil.">
      <ul className="flex flex-col gap-1.5">
        {c.degraus.map((d, i) => (
          <Barra
            key={d.etapa}
            rotulo={d.rotulo}
            valor={d.total}
            fracao={d.total / topo}
            tom={i === 0 ? "azul" : i >= c.degraus.length - 1 ? "verde" : "azul"}
          />
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
      <FilaDeIndicadores>
        <Indicador
          rotulo="Abordados"
          valor={r.abordagem.medido ? r.abordagem.valor.abordados : null}
          motivo={r.abordagem.medido ? undefined : r.abordagem.motivo}
          icone="alvo"
          tom="azul"
        />
        <Indicador
          rotulo="Responderam"
          valor={r.abordagem.medido ? r.abordagem.valor.responderam : null}
          motivo={r.abordagem.medido ? undefined : r.abordagem.motivo}
          icone="pessoas"
          tom="verde"
          rodape={
            r.abordagem.medido && r.abordagem.valor.taxaDeResposta.medido
              ? `${Math.round(r.abordagem.valor.taxaDeResposta.valor * 100)}% dos abordados`
              : undefined
          }
        />
        <Indicador
          rotulo="Porteiros classificados"
          valor={r.gatekeepers.medido ? r.gatekeepers.valor.classificados : null}
          motivo={r.gatekeepers.medido ? undefined : r.gatekeepers.motivo}
          icone="porta"
          tom="ambar"
        />
        <Indicador
          rotulo="Decisores com telefone"
          valor={r.decisores.medido ? r.decisores.valor.comTelefone : null}
          motivo={r.decisores.medido ? undefined : r.decisores.motivo}
          icone="chave"
          tom="roxo"
          rodape={
            r.decisores.medido ? `${r.decisores.valor.semTelefone} identificados sem telefone` : undefined
          }
        />
      </FilaDeIndicadores>

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
            {r.ondeMorreu.valor.map((e) => {
              const topo = Math.max(1, ...(r.ondeMorreu.medido ? r.ondeMorreu.valor : []).map((x) => x.quantos));
              return (
                <Barra key={e.etapa} rotulo={e.rotulo} valor={e.quantos} fracao={e.quantos / topo} tom="ambar" />
              );
            })}
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
        <Tabela colunas={["Risco pego pela Supervisora", "Gravidade", "Quantas"]}>
          {s.principaisRiscos.map((r) => (
            <Linha key={r.motivo}>
              <Celula forte>{r.rotulo}</Celula>
              <Celula>
                <Pilula tom={r.total > 0 ? "ambar" : "cinza"}>
                  {r.total > 0 ? "atenção" : "sem ocorrência"}
                </Pilula>
              </Celula>
              <Celula numero forte>
                {r.total}
              </Celula>
            </Linha>
          ))}
        </Tabela>
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
      <TituloDaPagina
        contexto="Sala de Vendas › Control Tower"
        titulo="Sala do Supervisor / Control Tower"
        subtitulo="Acompanhe em tempo real o desempenho do atendimento e das vendas. Só leitura: daqui não sai mensagem, nem atribuição, nem mudança de estágio."
        periodo={
          estado.fase === "pronto"
            ? `${emDia(estado.dados.periodo.de)} – ${emDia(estado.dados.periodo.ate)}`
            : undefined
        }
        atualidade={estado.fase === "pronto" ? "Tempo real" : undefined}
      />

      {estado.fase === "carregando" && <Carregando texto="Medindo a operação inteira — filas, funil, raio-X e Supervisora…" />}
      {estado.fase === "semAcesso" && <SemAcesso />}
      {estado.fase === "erro" && <Erro detalhe={estado.detalhe} />}

      {estado.fase === "pronto" && (
        <>
          <SecaoIndicadores dados={estado.dados} />

          <Corpo
            lateral={
              <>
                <SecaoSaudeDaFila dados={estado.dados} />
                <SecaoAlertas dados={estado.dados} />
                <CartaoDeIA titulo="O que este painel NÃO viu">
                  <p>
                    A coluna de prazo do desenho existe aqui, mas com ressalva:{" "}
                    {RESSALVA_DO_PRAZO}.
                  </p>
                  <p className="mt-2">
                    Porteiro e decisor saem como <strong>não medido</strong> enquanto a
                    maior parte dos leads antigos não tiver <code>Empresa</code> ligada —
                    o motivo está escrito no raio-X, ao lado do lugar onde estaria o
                    número. Esta caixa não recomenda por palpite: ela lista o que a
                    operação ainda não consegue perguntar.
                  </p>
                </CartaoDeIA>
                <SecaoTime dados={estado.dados} />
              </>
            }
          >
            <SecaoTravado dados={estado.dados} />
            <SecaoFunil dados={estado.dados} />
            <SecaoSerie dados={estado.dados} />
            <SecaoOntem dados={estado.dados} />
            <SecaoRaioX dados={estado.dados} />
            <SecaoSupervisora dados={estado.dados} />
          </Corpo>

          {/* O rodapé do desenho: as duas tabelas largas, lado a lado. */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SecaoRanking dados={estado.dados} />
            <SecaoPerdas dados={estado.dados} />
          </div>
        </>
      )}
    </div>
  );
}
