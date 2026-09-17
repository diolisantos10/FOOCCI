/**
 * O COPILOTO DO VENDEDOR — a IA que não some quando a gente assume.
 *
 * ── O QUE O DOCUMENTO PEDE, E O QUE FALTAVA ─────────────────────────────────
 *
 * O projeto da área comercial diz, no item 7: *"Quando o humano assume, a IA não
 * desaparece. Ela passa de autopilot para copilot"* — resumir conversa, sugerir
 * a próxima resposta, identificar objeção, recomendar oferta, lembrar o que foi
 * esquecido, registrar no CRM.
 *
 * Até aqui a casa tinha só a metade de saída: `handoff.devolverParaIAComDossie`
 * sabia devolver a conversa. O que não existia era a IA **do lado** do vendedor:
 * a tela de atendimento não trazia uma única sugestão.
 *
 * ── ⛔ A REGRA QUE DESENHA ESTE ARQUIVO INTEIRO ─────────────────────────────
 *
 * **O que o modelo devolve é DADO, não AUTORIDADE.** Nada aqui envia mensagem,
 * nada aqui muda estágio, nada aqui escreve no lead. Este serviço LÊ a conversa
 * e devolve texto para uma pessoa olhar. Quem aperta o botão é gente.
 *
 * É a mesma doutrina da Supervisora, invertida: lá a IA revisa o que vai sair;
 * aqui a IA propõe e a pessoa revisa. Nos dois casos existe um revisor entre o
 * modelo e o cliente — e é o revisor, não o modelo, que autoriza.
 *
 * ── POR QUE TEMPERATURA BAIXA E NÃO ZERO ────────────────────────────────────
 *
 * `sondagem.ts` extrai fato e usa zero: `unidades: 3` está certo ou errado. Aqui
 * metade da saída é medição (intenção, objeção) e metade é composição (as
 * respostas sugeridas). Duas sugestões diferentes podem ser as duas boas, e três
 * sugestões idênticas entre si não ajudam ninguém. 0.4 é o meio termo: o resumo
 * não vira ficção, e as sugestões não saem clonadas.
 *
 * ── O RELÓGIO, QUE É REQUISITO E NÃO ZELO ───────────────────────────────────
 *
 * Isto roda com um vendedor olhando a tela, no meio de um atendimento. Um motor
 * lento sem teto trava a coluna direita por minutos e o vendedor conclui que o
 * copiloto "não funciona". Com teto ele vê "demorou demais — tentar de novo",
 * que é verdade e tem conserto na mão dele.
 *
 * ── SEM CHAVE, A TELA DIZ QUE NÃO TEM CHAVE ─────────────────────────────────
 *
 * `selectEngineRouted` devolve `MOCK` quando não há provider configurado. Aqui
 * isso vira `{ ok:false, causa:"semMotor" }` — e **não** uma leitura vazia com
 * cara de resposta. Painel em branco sem explicação ensina o vendedor a achar
 * que a conversa não tem sinal nenhum, quando o que falta é a chave.
 */

import { selectEngineRouted } from "@/services/brain/engines/AIEngineRouter";
import { callStructuredJson } from "@/services/brain/engines/OpenAIEngineAdapter";
import type { AIEngineSelection } from "@/services/brain/engines/AIEngineTypes";

/** O agente, no vocabulário do roteador do Brain. */
export const AGENTE_COPILOTO = "copiloto-vendedor-foocci";

/**
 * O teto de espera. Doze segundos porque a chamada é longa (resumo + sugestões
 * numa tacada) e cinco produziria falha em conversa comprida saudável — falso
 * alarme ensina a ignorar o alarme.
 */
export const LIMITE_DE_ESPERA_MS = 12_000;

/** Quantos turnos entram na leitura. Conversa de três meses não cabe no prompt. */
export const TURNOS_LIDOS = 40;

/** O teto de tokens da resposta. Ver `cerebro.ts` sobre por que não é apertado. */
export const TETO_DE_TOKENS = 900;

/** Nenhuma conversa curta demais é lida: não há o que resumir em uma frase só. */
export const MINIMO_DE_TURNOS = 1;

// ─────────────────────────────────────────────────────────────────────────────
// O VOCABULÁRIO FECHADO
// ─────────────────────────────────────────────────────────────────────────────

/**
 * As intenções que o copiloto pode devolver.
 *
 * Fechada de propósito. Intenção em texto livre vira trinta nomes para cinco
 * situações, e aí nenhum relatório de "por que as conversas param" fecha. O que
 * o modelo escrever fora desta lista cai em `OUTRA` — que é resposta honesta e
 * não um chute reclassificado.
 */
export const INTENCOES = [
  "QUER_CONHECER",
  "QUER_PRECO",
  "QUER_CONTRATAR",
  "COMPARANDO_CONCORRENTE",
  "SO_PESQUISANDO",
  "PROBLEMA_OU_RECLAMACAO",
  "NAO_E_O_PUBLICO",
  "OUTRA",
] as const;
export type Intencao = (typeof INTENCOES)[number];

/** O rótulo que o vendedor lê. A tela nunca imprime a chave do enum. */
export const ROTULO_DA_INTENCAO: Record<Intencao, string> = {
  QUER_CONHECER: "quer entender o que é o Foocci",
  QUER_PRECO: "quer saber preço",
  QUER_CONTRATAR: "quer fechar",
  COMPARANDO_CONCORRENTE: "comparando com outro sistema",
  SO_PESQUISANDO: "só pesquisando, sem pressa",
  PROBLEMA_OU_RECLAMACAO: "trouxe um problema ou reclamação",
  NAO_E_O_PUBLICO: "não parece ser público da Foocci",
  OUTRA: "não deu para classificar",
};

/**
 * As objeções que aparecem de verdade vendendo Foocci para dono de restaurante.
 *
 * Mesma razão da lista fechada acima: é sobre esta lista que o relatório "o que
 * mais nos derruba" é montado. Objeção fora da lista entra como `OUTRA` com o
 * texto que o modelo escreveu, preservado em `detalhe` — perder a frase original
 * seria perder justamente a objeção nova, que é a que interessa descobrir.
 */
export const OBJECOES = [
  "PRECO",
  "JA_TEM_SISTEMA",
  "SEM_TEMPO_PARA_TROCAR",
  "PRECISA_FALAR_COM_SOCIO",
  "MEDO_DE_FIDELIDADE",
  "NAO_VE_VALOR",
  "DESCONFIANCA",
  "OUTRA",
] as const;
export type CodigoDeObjecao = (typeof OBJECOES)[number];

export const ROTULO_DA_OBJECAO: Record<CodigoDeObjecao, string> = {
  PRECO: "acha caro",
  JA_TEM_SISTEMA: "já tem outro sistema",
  SEM_TEMPO_PARA_TROCAR: "não tem tempo para trocar agora",
  PRECISA_FALAR_COM_SOCIO: "precisa falar com sócio ou matriz",
  MEDO_DE_FIDELIDADE: "receio de contrato e fidelidade",
  NAO_VE_VALOR: "não viu valor ainda",
  DESCONFIANCA: "desconfia da empresa",
  OUTRA: "outra objeção",
};

// ─────────────────────────────────────────────────────────────────────────────
// O QUE ENTRA E O QUE SAI
// ─────────────────────────────────────────────────────────────────────────────

/** Um turno da conversa, no mesmo formato que a sondagem já usa. */
export interface TurnoLido {
  deQuem: "cliente" | "foocci";
  texto: string;
}

/**
 * O contexto que o copiloto recebe junto da conversa.
 *
 * Tudo opcional, e **campo ausente entra como ausente**: o prompt diz ao modelo
 * que ele não pode preencher lacuna. Mandar "não informado" como se fosse fato
 * é o caminho conhecido para o modelo inventar o que faltou.
 */
export interface ContextoParaOCopiloto {
  nomeDoLead?: string | null;
  restaurante?: string | null;
  cidade?: string | null;
  etapa?: string | null;
  score?: number | null;
  temperatura?: string | null;
  dorConhecida?: string | null;
  sistemaAtual?: string | null;
  unidades?: number | null;
  planoDeInteresse?: string | null;
}

export interface ObjecaoLida {
  codigo: CodigoDeObjecao;
  rotulo: string;
  /** A frase do cliente que sustenta a leitura. Sem ela, é palpite sem prova. */
  detalhe: string | null;
}

export interface SugestaoDeResposta {
  /** Uma palavra sobre o ângulo ("reforçar valor", "quebrar objeção de preço"). */
  angulo: string;
  /** O texto pronto — que ainda assim passa pelos olhos de uma pessoa. */
  texto: string;
}

export interface LeituraDoCopiloto {
  resumo: string;
  intencao: Intencao;
  rotuloDaIntencao: string;
  /** 0 a 100. **Confiança do modelo, não probabilidade de venda.** */
  confianca: number;
  objecoes: ObjecaoLida[];
  proximaAcao: string | null;
  sugestoes: SugestaoDeResposta[];
  /** Quantos turnos sustentaram a leitura — a tela mostra sobre o que ela fala. */
  turnosLidos: number;
  /** Qual piloto respondeu. Sem isto não há como auditar custo nem qualidade. */
  motor: string;
}

export type CausaDaFalha =
  | "semMotor"
  | "semConversa"
  | "demorouDemais"
  | "motorFalhou"
  | "respostaIlegivel";

export type ResultadoDoCopiloto =
  | { ok: true; leitura: LeituraDoCopiloto }
  | { ok: false; causa: CausaDaFalha; detalhe: string | null };

/** A frase que a tela mostra. Mora aqui para o texto ser testável. */
export const EXPLICACAO_DA_FALHA: Record<CausaDaFalha, string> = {
  semMotor:
    "O copiloto está sem motor de IA configurado neste ambiente. Nada foi lido — isto não quer dizer que a conversa não tenha sinal.",
  semConversa: "Ainda não há conversa para o copiloto ler.",
  demorouDemais: "O copiloto demorou demais para responder.",
  motorFalhou: "O motor de IA não respondeu.",
  respostaIlegivel: "O motor respondeu algo que não deu para aproveitar.",
};

// ─────────────────────────────────────────────────────────────────────────────
// O PROMPT
// ─────────────────────────────────────────────────────────────────────────────

const FORMATO_ESCRITO = [
  "Devolva SOMENTE um objeto JSON com exatamente estes campos:",
  "",
  '  "resumo": texto de 1 a 3 frases — o que já foi conversado, sem enfeite.',
  `  "intencao": um destes: ${INTENCOES.join(", ")}.`,
  '  "confianca": inteiro de 0 a 100 — o quanto VOCÊ confia na intenção acima.',
  '  "objecoes": lista (pode ser vazia) de objetos:',
  `      { "codigo": um de ${OBJECOES.join(", ")}, "detalhe": a FRASE do cliente que mostra isso }`,
  '  "proximaAcao": texto curto ou null — a melhor coisa a fazer agora.',
  '  "sugestoes": 2 ou 3 objetos:',
  '      { "angulo": 2 a 4 palavras, "texto": a mensagem pronta para o cliente }',
].join("\n");

export const INSTRUCAO = [
  "Você é o copiloto de um VENDEDOR HUMANO da Foocci.",
  "A Foocci vende um sistema de gestão e pedidos para DONO DE RESTAURANTE.",
  "",
  "Você lê a conversa e prepara o vendedor. Você NÃO fala com o cliente:",
  "quem decide o que sai é a pessoa que vai ler o que você escreveu.",
  "",
  FORMATO_ESCRITO,
  "",
  "REGRAS, e elas valem mais que a vontade de parecer útil:",
  "1. O resumo só contém o que está na conversa. Não deduza a dor, não estime",
  "   o tamanho do restaurante, não invente que já houve proposta.",
  "2. Objeção só entra com a FRASE que a sustenta. Sem frase, não é objeção:",
  "   é impressão sua, e impressão vira relatório errado sobre o que nos derruba.",
  "3. Objeção que não couber na lista entra como OUTRA — com a frase no detalhe.",
  "4. Lista de objeções VAZIA é resposta certa e comum. Nem toda conversa tem uma.",
  "5. Confiança baixa é honestidade. Conversa de duas linhas não sustenta 95.",
  "6. NUNCA cite preço, desconto, prazo de contrato ou condição comercial nas",
  "   sugestões. Preço nesta casa tem tabela publicada e quem responde é o",
  "   vendedor com a tabela na mão. Se o cliente perguntou preço, a sugestão",
  "   deve levar o assunto adiante SEM número.",
  "7. Nunca prometa funcionalidade, integração ou prazo que não apareceu na",
  "   conversa. Promessa inventada vira cobrança depois da venda.",
  "8. Sugestões em português do Brasil, tom de gente, curtas — é WhatsApp.",
  "   Nada de 'prezado', nada de parágrafo de cinco linhas.",
  "9. As 2 ou 3 sugestões precisam ser CAMINHOS diferentes, não a mesma frase",
  "   reescrita. Três variações da mesma coisa não ajudam a escolher.",
  "",
  "Você não conversa e não opina fora do objeto. Devolve o JSON, e só.",
].join("\n");

/**
 * A transcrição, do jeito que o modelo lê.
 *
 * Só os últimos `TURNOS_LIDOS` turnos: uma conversa de três meses estoura o
 * prompt, e o que decide a próxima resposta é o fim, não o começo.
 */
export function montarTranscricao(turnos: TurnoLido[]): string {
  return turnos
    .filter((t) => t.texto.trim())
    .slice(-TURNOS_LIDOS)
    .map((t) => `${t.deQuem === "cliente" ? "CLIENTE" : "FOOCCI"}: ${t.texto.trim()}`)
    .join("\n");
}

/** O bloco de contexto. Campo sem dado simplesmente não aparece — ver acima. */
export function montarContexto(c: ContextoParaOCopiloto): string {
  const linhas: string[] = [];
  const por = (rotulo: string, valor: unknown) => {
    if (valor === null || valor === undefined) return;
    const t = String(valor).trim();
    if (t) linhas.push(`${rotulo}: ${t}`);
  };

  por("Nome", c.nomeDoLead);
  por("Restaurante", c.restaurante);
  por("Cidade", c.cidade);
  por("Etapa no funil", c.etapa);
  por("Lead score", c.score);
  por("Temperatura", c.temperatura);
  por("Dor já registrada", c.dorConhecida);
  por("Sistema atual", c.sistemaAtual);
  por("Unidades", c.unidades);
  por("Plano de interesse", c.planoDeInteresse);

  return linhas.length ? linhas.join("\n") : "(nenhum dado de ficha registrado)";
}

// ─────────────────────────────────────────────────────────────────────────────
// A LEITURA
// ─────────────────────────────────────────────────────────────────────────────

/** As peças trocáveis, para o teste não gastar API. */
export interface MotorDoCopiloto {
  selecionar?: (agente: string) => Promise<AIEngineSelection>;
  chamar?: typeof callStructuredJson;
  limiteMs?: number;
}

/**
 * Lê a conversa e prepara o vendedor.
 *
 * **Nunca lança.** Toda falha vira `{ ok:false, causa }` com um motivo nomeado,
 * porque a tela precisa dizer O QUE deu errado — "erro" genérico não tem
 * conserto do lado de quem está atendendo.
 */
export async function lerComOCopiloto(
  turnos: TurnoLido[],
  contexto: ContextoParaOCopiloto = {},
  motor: MotorDoCopiloto = {},
): Promise<ResultadoDoCopiloto> {
  const transcricao = montarTranscricao(turnos);
  const turnosLidos = turnos.filter((t) => t.texto.trim()).slice(-TURNOS_LIDOS).length;

  if (turnosLidos < MINIMO_DE_TURNOS) {
    return { ok: false, causa: "semConversa", detalhe: null };
  }

  const selecionar = motor.selecionar ?? selectEngineRouted;
  const chamar = motor.chamar ?? callStructuredJson;
  const limiteMs = motor.limiteMs ?? LIMITE_DE_ESPERA_MS;

  let engine: AIEngineSelection;
  try {
    engine = await selecionar(AGENTE_COPILOTO);
  } catch (e) {
    return { ok: false, causa: "motorFalhou", detalhe: mensagemDe(e) };
  }

  // MOCK = nenhum provider configurado. Ver o cabeçalho: isto é "sem chave", e
  // a tela diz isso em vez de mostrar um painel vazio que parece resposta.
  if (engine.provider === "MOCK") {
    return { ok: false, causa: "semMotor", detalhe: engine.reason ?? null };
  }

  let bruto: string;
  try {
    bruto = await comTeto(
      chamar({
        selection: engine,
        systemPrompt: INSTRUCAO,
        userContent: `FICHA DO LEAD:\n${montarContexto(contexto)}\n\nCONVERSA:\n${transcricao}`,
        responseFormat: "json",
        temperature: 0.4,
        maxTokens: TETO_DE_TOKENS,
      }),
      limiteMs,
    );
  } catch (e) {
    if (e instanceof EstourouOTeto) {
      return { ok: false, causa: "demorouDemais", detalhe: `${limiteMs}ms` };
    }
    return { ok: false, causa: "motorFalhou", detalhe: mensagemDe(e) };
  }

  const leitura = limparLeitura(bruto, { turnosLidos, motor: `${engine.provider}/${engine.model}` });
  if (!leitura) return { ok: false, causa: "respostaIlegivel", detalhe: null };

  return { ok: true, leitura };
}

class EstourouOTeto extends Error {}

/**
 * O teto de espera.
 *
 * `Promise.race` e não `AbortSignal`: o contrato do motor da casa
 * (`callStructuredJson`) não recebe sinal de cancelamento, e inventar um aqui
 * significaria mexer no adapter que quatro agentes de produção já usam. O custo
 * honesto: a chamada continua correndo no servidor depois do teto — o que ela
 * não faz mais é segurar a tela do vendedor.
 */
async function comTeto<T>(promessa: Promise<T>, ms: number): Promise<T> {
  let relogio: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promessa,
      new Promise<never>((_, rejeitar) => {
        relogio = setTimeout(() => rejeitar(new EstourouOTeto()), ms);
      }),
    ]);
  } finally {
    if (relogio) clearTimeout(relogio);
  }
}

function mensagemDe(e: unknown): string | null {
  return e instanceof Error ? e.message : null;
}

/**
 * Confere o que voltou do modelo antes de virar tela.
 *
 * Não é desconfiança decorativa: `confianca: 180` viraria uma barra fora da
 * caixa, e uma "sugestão" de dois mil caracteres viraria uma mensagem de
 * WhatsApp impossível que alguém colaria assim mesmo.
 *
 * Devolve `null` quando nem o mínimo veio — e aí a tela diz "não deu para
 * aproveitar", que é melhor que um painel meio preenchido com cara de leitura.
 */
export function limparLeitura(
  bruto: string,
  extras: { turnosLidos: number; motor: string },
): LeituraDoCopiloto | null {
  let o: Record<string, unknown>;
  try {
    const parseado: unknown = JSON.parse(bruto);
    if (!parseado || typeof parseado !== "object" || Array.isArray(parseado)) return null;
    o = parseado as Record<string, unknown>;
  } catch {
    return null;
  }

  const resumo = textoCurto(o.resumo, 600);
  // Sem resumo não há leitura: é o único campo que o vendedor lê primeiro, e um
  // painel com sugestões e sem resumo é a IA falando antes de ter entendido.
  if (!resumo) return null;

  const intencao: Intencao = INTENCOES.includes(o.intencao as Intencao)
    ? (o.intencao as Intencao)
    : "OUTRA";

  // Confiança fora da faixa não vira 0 nem 100: vira o valor preso na faixa.
  // Zero diria "tenho certeza de que não sei", e não é isso que aconteceu.
  const confianca =
    typeof o.confianca === "number" && Number.isFinite(o.confianca)
      ? Math.min(100, Math.max(0, Math.round(o.confianca)))
      : 0;

  const objecoes: ObjecaoLida[] = Array.isArray(o.objecoes)
    ? o.objecoes
        .map((bruta): ObjecaoLida | null => {
          if (!bruta || typeof bruta !== "object") return null;
          const x = bruta as Record<string, unknown>;
          const codigo: CodigoDeObjecao = OBJECOES.includes(x.codigo as CodigoDeObjecao)
            ? (x.codigo as CodigoDeObjecao)
            : "OUTRA";
          return {
            codigo,
            rotulo: ROTULO_DA_OBJECAO[codigo],
            detalhe: textoCurto(x.detalhe, 240),
          };
        })
        .filter((x): x is ObjecaoLida => x !== null)
        .slice(0, 6)
    : [];

  const sugestoes: SugestaoDeResposta[] = Array.isArray(o.sugestoes)
    ? o.sugestoes
        .map((bruta): SugestaoDeResposta | null => {
          if (!bruta || typeof bruta !== "object") return null;
          const x = bruta as Record<string, unknown>;
          const texto = textoCurto(x.texto, 900);
          if (!texto) return null;
          return { angulo: textoCurto(x.angulo, 60) ?? "sugestão", texto };
        })
        .filter((x): x is SugestaoDeResposta => x !== null)
        .slice(0, 3)
    : [];

  return {
    resumo,
    intencao,
    rotuloDaIntencao: ROTULO_DA_INTENCAO[intencao],
    confianca,
    objecoes,
    proximaAcao: textoCurto(o.proximaAcao, 240),
    sugestoes,
    turnosLidos: extras.turnosLidos,
    motor: extras.motor,
  };
}

function textoCurto(v: unknown, teto: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  return t.length <= teto ? t : t.slice(0, teto);
}
