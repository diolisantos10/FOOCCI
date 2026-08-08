/**
 * O pontinho de estado da Sala dos Agentes — a tabela, sem JSX.
 *
 * Mora fora do componente por um motivo de portão, não de arrumação: assim um
 * teste puro consegue afirmar que CADA estado do contrato tem tratamento
 * PRÓPRIO, e que nenhum deles compartilha o visual de outro.
 *
 * A história que justifica o cuidado: `desconhecido` entrou no contrato depois
 * que o serviço provou que, sem ele, todo agente de produto ativo sairia
 * amarelo — não por defeito, mas porque não há como provar que trabalhou.
 * Amarelo que às vezes quer dizer "ignore" ensina o dono a ignorar o amarelo
 * que importa. Se um sexto estado nascer amanhã e cair calado no visual de um
 * vizinho, o defeito volta pela mesma porta.
 *
 * `Record<EstadoAgente, …>` já barra o estado ESQUECIDO em tempo de compilação.
 * O teste barra o estado COPIADO, que o compilador não vê.
 */

import type { EstadoAgente } from "@/services/agents/salaDosAgentes.types";

export interface DesenhoDoEstado {
  /** Classes do ponto. Preenchido = "eu sei"; vazado = "eu não sei". */
  classe: string;
  /** O nome curto, usado na legenda e na ficha. */
  texto: string;
  /** A frase de ajuda — o alerta carregando a própria evidência. */
  ajuda: string;
}

/**
 * Cor distingue GRAVIDADE; forma distingue "eu sei" de "eu não sei". As duas
 * leituras precisam ser independentes, senão a tela pede que o dono decore
 * quatro tons de bolinha.
 */
export const DESENHO_DO_ESTADO: Record<EstadoAgente, DesenhoDoEstado> = {
  trabalhando: {
    classe: "bg-green-500 ring-[3px] ring-green-500/15",
    texto: "Trabalhando",
    ajuda: "Há prova de trabalho recente.",
  },
  atencao: {
    classe: "bg-amber-500 ring-[3px] ring-amber-500/20",
    texto: "Atenção",
    ajuda: "Há prova de que algo está fora do esperado.",
  },
  desligado: {
    classe: "bg-line2",
    texto: "Desligado",
    ajuda: "Está registrado como fora de operação.",
  },
  desconhecido: {
    classe: "border-[1.5px] border-muted bg-transparent",
    texto: "Estado não medido",
    ajuda: "Não existe instrumentação que prove se ele trabalhou. Não é o mesmo que estar parado.",
  },
};

/** A ordem em que a legenda apresenta os estados. */
export const ORDEM_DOS_ESTADOS: EstadoAgente[] = [
  "trabalhando",
  "atencao",
  "desligado",
  "desconhecido",
];

/**
 * O desenho de um estado.
 *
 * O fallback é `desconhecido` — nunca `desligado`. Um valor que a tela não
 * reconhece é literalmente "não sei o que é isso", e dizer "está desligado"
 * seria inventar uma informação que ninguém provou.
 */
export function desenhoDoEstado(estado: string): DesenhoDoEstado {
  return DESENHO_DO_ESTADO[estado as EstadoAgente] ?? DESENHO_DO_ESTADO.desconhecido;
}

export function nomeDoEstado(estado: string): string {
  return desenhoDoEstado(estado).texto;
}

/**
 * ⭐ O agente RODA hoje?
 *
 * Este predicado existe porque o contador do topo mentiu. Ele dizia "12 falam
 * com o cliente" enquanto oito daqueles doze cartões traziam, no corpo,
 * "Perfil em DRAFT — não roda em produção". A informação honesta estava no
 * cartão e o número grande a contradizia — e ninguém desce doze cartões para
 * conferir um número que já leu.
 *
 * É a mesma família do "Total hoje" que este produto já teve: **soma certa de
 * uma coisa errada**. Somar rascunho com agente vivo produz um número que
 * responde a uma pergunta que ninguém fez.
 *
 * O critério é o campo `estado` do contrato, não o texto da explicação do
 * motor: o serviço marca `desligado` exatamente quando o perfil não está
 * `ACTIVE`. Derivar categoria de frase livre quebraria na primeira vez que
 * alguém reescrevesse a frase.
 *
 * `desconhecido` conta como EM OPERAÇÃO, e isso é deliberado: ele quer dizer
 * "não consigo provar se trabalhou", não "não roda". Jogá-lo para fora seria
 * transformar ausência de medição em ausência de trabalho — o erro que esta
 * tela inteira existe para não cometer, só do outro lado.
 */
export function estaEmOperacao(agente: { estado: string }): boolean {
  return agente.estado !== "desligado";
}
