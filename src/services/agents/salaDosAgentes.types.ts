/**
 * O CONTRATO DA SALA DOS AGENTES.
 *
 * Doutrina 20 do kit (`dioli-brain-kit/docs/20-sala-dos-agentes.md`), obrigatória
 * em todo projeto da casa. Este arquivo é a fronteira entre quem BUSCA o dado e
 * quem DESENHA a tela — os dois lados são construídos em paralelo contra ele.
 *
 * ── A REGRA QUE GOVERNA ESTE ARQUIVO INTEIRO ──
 *
 * **O cartão nunca escreve zero quando a resposta é "não sei".**
 *
 * Por isso NENHUMA métrica aqui é `number`. Toda medida é uma união de três
 * estados, e o tipo obriga a tela a tratar os três. Se o campo fosse
 * `custo: number`, o caminho de menor esforço seria `?? 0` — e "não medido"
 * viraria "gastou zero" sem ninguém decidir isso.
 *
 * Três telas mentiram no Foocci por confundir esses estados: o "Total hoje" que
 * somava errado, o filtro da Central que devolvia vazio, e o painel de
 * Integrações que escrevia "Conectado" com o token morto. Nenhuma era feia.
 */

/**
 * Uma medida que a tela pode exibir.
 *
 * - `medido`      → o banco prova. Exibe o valor.
 * - `naoMedido`   → não existe instrumentação. Exibe "não medido", em itálico.
 * - `zeroProvado` → existe instrumentação e o valor é zero. Exibe "—".
 *
 * `naoMedido` carrega o MOTIVO. É o guardrail 6 aplicado a célula de tabela: o
 * usuário não deveria ter que perguntar por que está vazio.
 */
export type Medida =
  | { estado: "medido"; valor: number; unidade?: string }
  | { estado: "naoMedido"; motivo: string }
  | { estado: "zeroProvado" };

export const medido = (valor: number, unidade?: string): Medida =>
  ({ estado: "medido", valor, unidade });
export const naoMedido = (motivo: string): Medida =>
  ({ estado: "naoMedido", motivo });
export const zeroProvado = (): Medida => ({ estado: "zeroProvado" });

/**
 * As duas populações de agente. Elas NÃO se medem igual, e somá-las produz um
 * total sem significado.
 *
 * - `produto`       → roda em produção, consome IA paga. Mede-se em dinheiro.
 * - `desenvolvimento` → constrói o produto (`.claude/agents/`). Mede-se em
 *                       bloco entregue e registrado na oficina.
 */
export type Populacao = "produto" | "desenvolvimento";

/**
 * Estado operacional, o pontinho do cartão.
 *
 * `desconhecido` entrou em 07/08/2026, depois de o serviço mostrar que sem ele
 * TODO agente de produto ativo saía como `atencao` — não porque houvesse algo
 * errado, mas porque não dá para provar que ele trabalhou.
 *
 * Isso fazia um pontinho só significar duas coisas — "está com problema" e "não
 * sei" — e essa é exatamente a confusão que o tipo `Medida` existe para impedir
 * uma linha acima. Um pontinho amarelo que às vezes quer dizer "ignore" ensina o
 * dono a ignorar o amarelo que importa.
 */
export type EstadoAgente = "trabalhando" | "atencao" | "desligado" | "desconhecido";

/**
 * Em qual IA o agente roda — vai na CARA do cartão, por ordem do CEO.
 *
 * `naoAplica` existe porque os agentes de desenvolvimento rodam na sessão do
 * Diretor: o modelo deles não é configuração desta tela. Mostrar um seletor que
 * não faz nada seria um controle que mente.
 */
export type MotorDoAgente =
  | { tipo: "configurado"; provedor: string; modelo: string }
  | { tipo: "naoAplica"; explicacao: string };

/** O cartão da grade. */
export interface CartaoAgente {
  slug: string;
  nome: string;
  /** Uma frase, em linguagem de dono — não de engenheiro. */
  funcao: string;
  area: string;
  populacao: Populacao;
  estado: EstadoAgente;
  /** ISO. `null` quando o projeto não registra a data de criação. */
  noArDesde: string | null;
  motor: MotorDoAgente;
  /** É um dos seis Essenciais (doutrinas 21 e 27) — não pode ser apagado. */
  essencial: boolean;
  /** Até três medidas, na ordem em que aparecem no rodapé do cartão. */
  metricas: Array<{ rotulo: string; medida: Medida }>;
}

/** Uma IA contratada, na aba Configurações. */
export interface CartaoMotor {
  provedor: string;
  ligada: boolean;
  paraQueServe: string;
  /**
   * Custo nos últimos 30 dias. `naoMedido` cobre dois casos distintos e ambos
   * reais aqui: modelo fora da tabela de preços, e modelo cobrado em outra
   * unidade (transcrição por minuto, imagem por imagem).
   */
  custo30Dias: Medida;
  /** Quem usa. Vazio quando o registro não atribui a nenhum agente. */
  usadaPor: string[];
}

export interface SalaDosAgentes {
  agentes: CartaoAgente[];
  motores: CartaoMotor[];
  /**
   * O que a tela NÃO conseguiu medir, e por quê. A própria Sala declara os
   * próprios buracos em vez de escondê-los atrás de zeros.
   */
  lacunas: string[];
}
