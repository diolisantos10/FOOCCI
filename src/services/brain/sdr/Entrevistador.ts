/**
 * Entrevistador — quem conduz a sondagem de verdade.
 *
 * A `Sondagem` (em ../oficina) é a REGRA: ela diz o que precisa estar sabido
 * antes de existir proposta. Mas regra não pergunta sozinha. Foi exatamente
 * assim que a falha aconteceu: as perguntas existiam num documento e o agente
 * mandou o plano do mesmo jeito.
 *
 * Este arquivo é o que fecha esse buraco. Ele recebe:
 *   1. o que já se sabe (o estado da sondagem),
 *   2. o que acabou de ser PERGUNTADO,
 *   3. o que o cliente respondeu, em português solto,
 * e devolve o estado atualizado mais as próximas perguntas.
 *
 * Duas travas, nesta ordem de importância:
 *
 * TRAVA 1 — o que foi perguntado fica registrado SEMPRE, entendendo a resposta
 * ou não. É o que sustenta a regra do dono: falta de resposta não trava, falta
 * de pergunta trava. Se o registro dependesse de a IA ter entendido, uma
 * resposta confusa viraria "nunca perguntei" e a trava perderia o sentido.
 *
 * TRAVA 2 — a IA só preenche o que está escrito na resposta. Ela não deduz, não
 * completa e não escolhe serviço por conta própria. Um campo preenchido por
 * palpite é pior que um campo vazio: o vazio a proposta declara, o palpite ela
 * promete.
 *
 * IA falhando não trava a entrevista: o turno cai no caminho determinístico,
 * que registra a pergunta e guarda a resposta crua. Perde-se a interpretação,
 * nunca o registro.
 */

import { selectEngine } from "../engines/AIEngineRouter";
import { callStructuredJson } from "../engines/OpenAIEngineAdapter";
import {
  classificarFalhaDeMotor,
  explicarMotivo,
  type MotivoDeFalhaDaIA,
} from "../engines/FalhaDeMotor";
import {
  avaliarSondagem,
  CAMPOS_DA_FICHA,
  CATALOGO_DE_SERVICOS,
  type EstadoDaSondagem,
  type OrigemDoInsumo,
  type Pendencia,
  type ServicoContratado,
} from "../oficina/Sondagem";

// ─────────────────────────────────────────────────────────────────────────────
//  Contratos
// ─────────────────────────────────────────────────────────────────────────────

export interface TurnoDaEntrevista {
  /** O que já se sabe. Vazio no primeiro turno. */
  estado: EstadoDaSondagem;
  /** As chaves que o SDR acabou de perguntar. Registradas mesmo sem resposta. */
  perguntadasAgora?: string[];
  /** O que o cliente respondeu, em linguagem solta. */
  resposta: string;
  /** Qual agente do Brain roteia a chamada. */
  agentId?: string;
}

export interface CampoEntendido {
  chave: string;
  valor: string;
  /** Serviço a que pertence, quando é campo de serviço. */
  servico?: string;
  /**
   * Quem preencheu: o motor de regras (leitura determinística ou queda sem IA)
   * ou a interpretação da IA.
   *
   * Existe porque a queda para o motor era INVISÍVEL. Sem IA e com UMA pergunta
   * no ar, o texto cru do cliente vira o valor do campo — decisão defensável,
   * mas que ninguém conseguia distinguir de uma leitura interpretada. Um campo
   * preenchido pelo motor merece outra confiança na hora de auditar.
   */
  origem: "motor" | "ia";
}

export interface ResultadoDoTurno {
  /** O estado da sondagem depois deste turno. É o que se persiste. */
  estado: EstadoDaSondagem;
  /** O que a resposta preencheu. Vazio é resultado legítimo. */
  entendido: CampoEntendido[];
  /** Serviços que o cliente escolheu nesta fala. */
  servicosDetectados: string[];
  /** Perguntadas agora e que a resposta não cobriu — ficam declaradas. */
  semResposta: string[];
  /** As próximas perguntas, já na ordem de conversa. */
  proximas: Pendencia[];
  podePropor: boolean;
  /** true quando a IA não respondeu e o turno caiu no determinístico. */
  semIA: boolean;
  /** Por que a IA não respondeu. Só existe quando `semIA` é true. */
  motivoSemIA?: MotivoDeFalhaDaIA;
  /**
   * A conversa não andou neste turno: havia pergunta no ar e nada foi entendido.
   * É o sinal de "travou" que o diário do SDR precisa contar.
   */
  travou: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Leitura determinística — o que não precisa de IA para ser entendido
// ─────────────────────────────────────────────────────────────────────────────

function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * De onde vem o material, lido da própria frase.
 *
 * Vale a pena ser determinístico aqui: é A pergunta da sondagem, e as respostas
 * do mundo real são curtas e repetidas ("a gente produz", "eu já tenho"). Não
 * faz sentido pagar IA — nem correr o risco dela — para ler três palavras.
 */
export function lerOrigem(resposta: string): OrigemDoInsumo | null {
  const t = normalizar(resposta);

  const cliente = ["eu tenho", "ja tenho", "tenho tudo", "eu mando", "eu envio", "eu gravo",
                   "a gente grava", "eu produzo", "eu faco", "eu que faco", "por minha conta",
                   "temos as fotos", "tenho as fotos", "tenho os videos", "eu forneco"];
  const agencia = ["voces produzem", "voces fazem", "a agencia produz", "a agencia faz",
                   "voces que fazem", "quero que voces", "preciso que voces", "nao tenho nada",
                   "nao tenho material", "nao tenho foto", "nao tenho video", "voces gravam"];
  const misto   = ["um pouco de cada", "parte eu", "algumas eu", "os dois", "misto",
                   "eu tenho alguns", "tenho algumas", "o que eu tiver"];

  if (misto.some((p) => t.includes(p)))   return "misto";
  if (agencia.some((p) => t.includes(p))) return "agencia";
  if (cliente.some((p) => t.includes(p))) return "cliente";
  return null;
}

/** Serviços nomeados na fala. Só o que está escrito — não sugere nada. */
export function lerServicos(resposta: string): string[] {
  const t = normalizar(resposta);
  const pistas: [string, string[]][] = [
    ["reels",        ["reels", "reel", "video curto", "tiktok", "shorts"]],
    ["carrossel",    ["carrossel", "carroussel"]],
    ["post_foto",    ["post de foto", "foto unica", "post simples", "feed de foto"]],
    ["story",        ["story", "stories", "storie"]],
    ["arte_grafica", ["arte grafica", "artes", "peca grafica", "design"]],
    ["legenda",      ["legenda", "texto do post", "copy"]],
    ["trafego",      ["trafego", "anuncio", "ads", "impulsionar", "midia paga", "patrocinado"]],
    ["comunidade",   ["comentario", "direct", "responder mensagem", "comunidade", "inbox"]],
    ["relatorio",    ["relatorio", "report", "metrica mensal", "prestacao de contas"]],
  ];
  const achados: string[] = [];
  for (const [chave, termos] of pistas) {
    if (termos.some((p) => t.includes(p))) achados.push(chave);
  }
  return achados;
}

// ─────────────────────────────────────────────────────────────────────────────
//  A leitura por IA
// ─────────────────────────────────────────────────────────────────────────────

const SYSTEM = `Você é o SDR de uma agência de marketing, ouvindo o cliente na entrevista inicial.

Recebe as PERGUNTAS que estão em aberto e a RESPOSTA do cliente em português solto.
Sua única tarefa é dizer QUAL pergunta cada pedaço da resposta respondeu.

Devolva JSON com exatamente estas chaves:
{"respostas": {"<chave>": "<o que o cliente disse, resumido em uma frase>"}, "servicos": ["<chave>"], "semResposta": ["<chave>"]}

Regras, em ordem de importância:
1. NUNCA invente. Só inclua uma chave se a resposta REALMENTE trouxer aquilo. Na dúvida, não inclua — deixe em semResposta.
2. Não deduza. "Tenho um restaurante" não responde qual é o público, nem a região, nem o objetivo.
3. Não escolha serviço pelo cliente. Só liste em "servicos" o que ele pediu com todas as letras.
4. Use as palavras do cliente. Você resume, não reescreve nem melhora.
5. "Não tenho" / "não sei" / "tanto faz" SÃO respostas — registre o que ele disse.
6. Responda só o JSON, sem comentário.`;

interface LeituraDaIA {
  respostas: Record<string, string>;
  servicos: string[];
  semResposta: string[];
}

interface LeituraOuFalha {
  leitura: LeituraDaIA | null;
  motivo: MotivoDeFalhaDaIA | null;
}

/**
 * Lê o JSON da IA. O `catch` daqui era vazio: devolvia `null` e o turno inteiro
 * seguia como se a IA simplesmente não tivesse entendido nada. Agora o motivo
 * sai nomeado e vai para o diário — sem o texto do cliente junto.
 */
function extrairLeitura(bruto: string): LeituraOuFalha {
  let dados: Record<string, unknown>;
  try {
    dados = JSON.parse(bruto) as Record<string, unknown>;
  } catch (e) {
    console.warn("[sdr] a IA respondeu fora de JSON", {
      motivo: "json_invalido",
      tamanho: bruto.length,
      erro: e instanceof Error ? e.message.slice(0, 120) : "erro desconhecido",
    });
    return { leitura: null, motivo: "json_invalido" };
  }
  if (!dados || typeof dados !== "object" || Array.isArray(dados)) {
    console.warn("[sdr] a IA respondeu JSON que não é objeto", { motivo: "json_invalido" });
    return { leitura: null, motivo: "json_invalido" };
  }

  const respostas: Record<string, string> = {};
  const cru = dados.respostas;
  if (cru && typeof cru === "object" && !Array.isArray(cru)) {
    for (const [chave, valor] of Object.entries(cru as Record<string, unknown>)) {
      if (typeof valor === "string" && valor.trim()) respostas[chave] = valor.trim();
    }
  }

  const lista = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0) : [];

  return {
    leitura: { respostas, servicos: lista(dados.servicos), semResposta: lista(dados.semResposta) },
    motivo: null,
  };
}

/** As chaves que existem — a IA não pode inventar campo fora desta lista. */
function chavesValidas(estado: EstadoDaSondagem): Set<string> {
  const chaves = new Set<string>(CAMPOS_DA_FICHA.map((c) => c.chave));
  for (const sc of estado.servicos ?? []) {
    const cat = CATALOGO_DE_SERVICOS.find((s) => s.chave === sc.chave);
    chaves.add(`${sc.chave}.origemDoInsumo`);
    chaves.add(`${sc.chave}.quemExecuta`);
    for (const d of cat?.definicoes ?? []) chaves.add(`${sc.chave}.${d.chave}`);
  }
  return chaves;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Aplicação no estado
// ─────────────────────────────────────────────────────────────────────────────

function clonar(estado: EstadoDaSondagem): Required<EstadoDaSondagem> {
  return {
    ficha: { ...(estado.ficha ?? {}) },
    perguntadas: [...(estado.perguntadas ?? [])],
    servicos: (estado.servicos ?? []).map((s) => ({ ...s, definicoes: { ...(s.definicoes ?? {}) } })),
  };
}

function aplicarCampo(
  estado: Required<EstadoDaSondagem>,
  chave: string,
  valor: string,
  origem: "motor" | "ia",
): CampoEntendido | null {
  const ponto = chave.indexOf(".");

  if (ponto < 0) {
    if (!CAMPOS_DA_FICHA.some((c) => c.chave === chave)) return null;
    estado.ficha[chave] = valor;
    return { chave, valor, origem };
  }

  const servico = chave.slice(0, ponto);
  const campo   = chave.slice(ponto + 1);
  const alvo    = estado.servicos.find((s) => s.chave === servico);
  if (!alvo) return null;

  if (campo === "origemDoInsumo") {
    // A origem é enum, não texto solto. Vale o que a frase original disser; se
    // não der para ler, fica indefinida — e continua travando, que é o certo.
    const lida = lerOrigem(valor);
    if (!lida) return null;
    alvo.origemDoInsumo = lida;
    return { chave, valor: lida, servico, origem };
  }

  if (campo === "quemExecuta") {
    alvo.quemExecuta = valor;
    return { chave, valor, servico, origem };
  }

  const cat = CATALOGO_DE_SERVICOS.find((s) => s.chave === servico);
  if (!cat?.definicoes.some((d) => d.chave === campo)) return null;
  alvo.definicoes = { ...(alvo.definicoes ?? {}), [campo]: valor };
  return { chave, valor, servico, origem };
}

function adicionarServicos(estado: Required<EstadoDaSondagem>, chaves: string[]): string[] {
  const novos: string[] = [];
  for (const chave of chaves) {
    if (!CATALOGO_DE_SERVICOS.some((s) => s.chave === chave)) continue;
    if (estado.servicos.some((s) => s.chave === chave)) continue;
    const servico: ServicoContratado = { chave, origemDoInsumo: null };
    estado.servicos.push(servico);
    novos.push(chave);
  }
  return novos;
}

// ─────────────────────────────────────────────────────────────────────────────
//  O turno
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Um turno da entrevista: entra a fala do cliente, sai o estado atualizado.
 *
 * A ordem importa. As perguntas feitas são registradas ANTES de qualquer
 * tentativa de interpretar — se a IA falhar no meio, o registro já aconteceu.
 */
export async function ouvir(turno: TurnoDaEntrevista): Promise<ResultadoDoTurno> {
  const estado = clonar(turno.estado);
  const perguntadasAgora = (turno.perguntadasAgora ?? []).filter((c) => c.trim().length > 0);

  // TRAVA 1 — perguntou, ficou registrado. Independe de entender a resposta.
  for (const chave of perguntadasAgora) {
    if (!estado.perguntadas.includes(chave)) estado.perguntadas.push(chave);
  }

  const texto = turno.resposta.trim();
  const entendido: CampoEntendido[] = [];

  // O determinístico roda primeiro e é a base: serviço citado é serviço pedido.
  const servicosDetectados = adicionarServicos(estado, lerServicos(texto));

  // Quando o turno inteiro é sobre a origem de UM serviço, a frase resolve.
  const perguntaDeOrigem = perguntadasAgora.find((c) => c.endsWith(".origemDoInsumo"));
  if (perguntaDeOrigem) {
    const campo = aplicarCampo(estado, perguntaDeOrigem, texto, "motor");
    if (campo) entendido.push(campo);
  }

  let semIA = false;
  let motivoSemIA: MotivoDeFalhaDaIA | undefined;
  let semResposta = [...perguntadasAgora];

  if (texto.length > 0) {
    const { leitura, motivo } = await lerComIA(turno, estado);
    if (leitura) {
      const validas = chavesValidas(estado);
      for (const [chave, valor] of Object.entries(leitura.respostas)) {
        if (!validas.has(chave)) continue;                          // TRAVA 2
        if (entendido.some((e) => e.chave === chave)) continue;     // determinístico ganha
        const campo = aplicarCampo(estado, chave, valor, "ia");
        if (campo) entendido.push(campo);
      }
      servicosDetectados.push(...adicionarServicos(estado, leitura.servicos));
      semResposta = perguntadasAgora.filter((c) => !entendido.some((e) => e.chave === c));
    } else {
      semIA = true;
      motivoSemIA = motivo ?? "desconhecido";
      // A queda deixa de ser invisível: fica no log com o motivo, e o SdrService
      // leva o mesmo motivo para o diário. Nunca o texto do cliente.
      console.warn("[sdr] turno caiu no motor de regras", {
        motivo: motivoSemIA,
        explicacao: explicarMotivo(motivoSemIA),
        perguntasNoAr: perguntadasAgora.length,
      });
      // Sem IA, uma pergunta única com resposta em texto vira resposta direta.
      // Mais de uma pergunta no ar não dá para dividir sem chutar — e chutar é
      // pior que ficar em branco, porque some da lista de pendências.
      const unica = perguntadasAgora.length === 1 ? perguntadasAgora[0] : undefined;
      if (unica && !entendido.some((e) => e.chave === unica)) {
        const campo = aplicarCampo(estado, unica, texto, "motor");
        if (campo) entendido.push(campo);
      }
      semResposta = perguntadasAgora.filter((c) => !entendido.some((e) => e.chave === c));
    }
  }

  const avaliacao = avaliarSondagem(estado);

  return {
    estado,
    entendido,
    servicosDetectados: [...new Set(servicosDetectados)],
    semResposta,
    proximas: avaliacao.perguntar,
    podePropor: avaliacao.podePropor,
    semIA,
    ...(motivoSemIA !== undefined ? { motivoSemIA } : {}),
    travou: perguntadasAgora.length > 0 && entendido.length === 0,
  };
}

async function lerComIA(turno: TurnoDaEntrevista, estado: Required<EstadoDaSondagem>): Promise<LeituraOuFalha> {
  try {
    const avaliacao = avaliarSondagem(estado);
    const emAberto = avaliacao.perguntar.map((p) => ({ chave: p.chave, pergunta: p.pergunta }));
    const selection = selectEngine(turno.agentId ?? "sdr");
    const bruto = await callStructuredJson({
      selection,
      systemPrompt: SYSTEM,
      userContent: JSON.stringify({
        perguntasEmAberto: emAberto,
        perguntadasAgora: turno.perguntadasAgora ?? [],
        servicosDisponiveis: CATALOGO_DE_SERVICOS.map((s) => ({ chave: s.chave, nome: s.nome })),
        resposta: turno.resposta.trim(),
      }),
      temperature: 0.1,
      maxTokens: 700,
      responseFormat: "json",
    });
    return extrairLeitura(bruto);
  } catch (e) {
    // O `catch` era vazio. Agora o erro é classificado — chave ausente, timeout,
    // rede ou resposta cortada pelo teto de tokens são problemas diferentes, com
    // donos diferentes, e viravam todos o mesmo silêncio.
    return { leitura: null, motivo: classificarFalhaDeMotor(e) };
  }
}

/**
 * O roteiro do próximo bloco de fala do SDR — as perguntas já redigidas.
 *
 * Existe para que quem conduz não precise formular nada: chama, lê em voz alta
 * e devolve a resposta pelo `ouvir`. Perguntar de menos foi o erro; ter a
 * pergunta pronta é o que evita repetir.
 */
export function roteiroDoTurno(estado: EstadoDaSondagem, quantas = 3): { perguntas: Pendencia[]; chaves: string[] } {
  const perguntas = avaliarSondagem(estado).perguntar.slice(0, Math.max(1, quantas));
  return { perguntas, chaves: perguntas.map((p) => p.chave) };
}
