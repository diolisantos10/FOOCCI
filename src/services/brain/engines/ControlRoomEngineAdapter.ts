/**
 * ⭐⭐⭐ ControlRoomEngineAdapter — a Foocci deixa de falar com o laboratório.
 *
 * Ordem do CEO, 24/09/2026, registrada como D-105 na Control Room:
 * *"Não vamos fazer gambiarra, já liga toda a empresa no cofre. A gente vai
 * usar só uma chave. Controle e contenção de gastos."*
 *
 * ── O QUE MUDA, EM UMA FRASE ───────────────────────────────────────────────
 *
 * Antes, `AnthropicEngineAdapter` lia `ANTHROPIC_API_KEY` do ambiente DESTE
 * serviço e falava direto com a Anthropic. Agora o pedido vai para a **Control
 * Room**, que segura a chave da companhia, chama o laboratório e devolve a
 * resposta. ⭐ **A chave nunca viaja** — ela não está neste repositório, não
 * está no Railway da Foocci e não volta em nenhuma resposta.
 *
 * ⛔ **Isto NÃO é um fallback.** Quando o portão está configurado, ele é o
 * único caminho. Cair para uma chave própria no dia ruim desfaria D-105 no
 * primeiro incidente — e uma trava que se desliga quando dá problema é uma
 * trava que não existe. Se o portão não responde, o agente usa o **fallback
 * determinístico** que o Brain já tem, exatamente como faz para qualquer outra
 * falha de motor.
 *
 * ── ⚠️ A DEGRADAÇÃO, E POR QUE ELA É `FalhaDeMotor` E NÃO UM `retry` ───────
 *
 * Esta rota é atendimento ao vivo no WhatsApp. **Pendurar o cliente esperando é
 * o pior desfecho possível — pior que responder "não consegui".** Por isso:
 *
 *   · há um prazo curto (`AbortSignal.timeout`), e ele é MENOR que o prazo do
 *     portão do outro lado, para o cliente nunca ficar esperando os dois;
 *   · toda falha vira `FalhaDeMotor` com motivo NOMEADO, que é o que o diário
 *     do SDR já registra por turno;
 *   · ⛔ **não há retentativa aqui.** Retentativa cega contra um portão caído
 *     transforma uma indisponibilidade em uma tempestade — e o portão diz isso
 *     na própria resposta, no campo `oQueFazer`.
 *
 * ── ⚠️ O QUE PRECISA ESTAR SETADO (e quem seta é o CEO) ────────────────────
 *
 *   CONTROL_ROOM_IA_URL     ex.: https://<host-da-control-room>/api/ia/chamada
 *   CONTROL_ROOM_IA_SEGREDO o segredo DESTE produto na Control Room. É o mesmo
 *                           valor que lá vive em `CONNECT_CHAVE_DE_ENTRADA_FOOCCI`.
 *   CONTROL_ROOM_IA_CRACHA  o endereço corporativo da vaga que está pedindo —
 *                           `dioli.foocci.<departamento>.<cargo>`.
 *
 * ⛔ **Ausente nunca vira "chama direto".** Sem as três, `estaConfigurado()`
 * devolve `false` e o dispatcher mantém o caminho antigo — uma decisão
 * explícita de transição, não um vazamento. Configurou, não volta atrás.
 */

import type { StructuredCallInput } from "./EngineAdapter";
import { FalhaDeMotor, type MotivoDeFalhaDaIA } from "./FalhaDeMotor";

/**
 * ⚠️ Menor que o prazo do portão (12 s, `PRAZO_PADRAO_DA_PORTA_MS` em
 * `src/portao-de-ia/porta.ts` da Control Room). Se fosse maior, o cliente
 * esperaria o portão desistir E depois nós desistirmos — duas esperas
 * empilhadas para o mesmo silêncio.
 */
const PRAZO_MS = 10_000;

const JSON_INSTRUCTION =
  "\n\nIMPORTANTE: responda SOMENTE com um objeto JSON válido, sem markdown, sem cerca de código, sem texto fora do JSON.";

/** Remove ```json ... ``` quando o modelo insiste na cerca, e apara o que sobra. */
function limparCerca(texto: string): string {
  const t = texto.trim();
  const cerca = /^```(?:json)?\s*([\s\S]*?)\s*```$/.exec(t);
  return (cerca?.[1] ?? t).trim();
}

function env(nome: string): string {
  return (process.env[nome] ?? "").trim();
}

/** As três variáveis estão setadas? ⛔ Ausente nunca vira "chama direto". */
export function estaConfigurado(): boolean {
  return env("CONTROL_ROOM_IA_URL") !== "" &&
    env("CONTROL_ROOM_IA_SEGREDO") !== "" &&
    env("CONTROL_ROOM_IA_CRACHA") !== "";
}

/**
 * ⚠️ O código do portão vira o motivo que o diário do SDR já sabe registrar.
 * Traduzir é melhor que repassar: `MotivoDeFalhaDaIA` é o vocabulário desta
 * casa, e um código estranho nele viraria "desconhecido" para sempre.
 */
function motivoDoCodigo(codigo: string): MotivoDeFalhaDaIA {
  switch (codigo) {
    case "sem_chave_no_cofre":
    case "motor_desligado":
      return "sem_chave";
    case "prazo_vencido":
      return "timeout";
    case "teto_do_dia":
    case "teto_por_chamada":
      // ⚠️ Teto não é falha de rede nem de chave: é a companhia dizendo "chega".
      // Vai como `timeout` por ser o motivo que já significa "não deu para
      // responder agora, tente o caminho determinístico" — e o detalhe literal
      // do portão viaja na mensagem, para o diário não perder o porquê.
      return "timeout";
    case "laboratorio_falhou":
      return "erro_de_rede";
    default:
      return "desconhecido";
  }
}

/**
 * Uma chamada estruturada através do Portão de IA da Control Room.
 * Lança `FalhaDeMotor` em qualquer problema — quem chama decide o fallback,
 * exatamente como nos outros pilotos.
 */
export async function callControlRoom(input: StructuredCallInput): Promise<string> {
  if (!estaConfigurado()) {
    throw new FalhaDeMotor(
      "sem_chave",
      "portão de IA da Control Room não configurado (CONTROL_ROOM_IA_URL / _SEGREDO / _CRACHA)",
    );
  }

  const wantsJson = (input.responseFormat ?? "json") === "json";
  const system = wantsJson ? `${input.systemPrompt}${JSON_INSTRUCTION}` : input.systemPrompt;

  let resposta: Response;
  try {
    resposta = await fetch(env("CONTROL_ROOM_IA_URL"), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // ⚠️ O MESMO esquema de autenticação que a Control Room já usa para
        // agente de produto (D-007). Nada novo foi inventado dos dois lados.
        "x-dioli-connect-secret": env("CONTROL_ROOM_IA_SEGREDO"),
      },
      body: JSON.stringify({
        de: env("CONTROL_ROOM_IA_CRACHA"),
        trabalho: input.selection.model ? `whatsapp:${input.selection.model}` : "whatsapp",
        sistema: system,
        pergunta: input.userContent,
        // ⚠️ O modelo continua vindo do ROTEADOR, nunca cravado aqui — e a
        // Control Room pode REBAIXÁ-LO se a postura corporativa mandar. Ela diz
        // no campo `posturaRebaixouModelo` quando o faz.
        modelo: input.selection.model,
        maxTokens: input.maxTokens ?? 1024,
        // ⛔ `interno`: conteúdo de atendimento não é `publico`, e a Control Room
        // recusa o que estiver acima disso. Dado de cliente não sai de casa.
        classificacao: "interno",
        workClass: "customer_operation",
      }),
      // ⭐ O prazo. Sem ele, um portão mudo pendura o cliente no WhatsApp.
      signal: AbortSignal.timeout(PRAZO_MS),
    });
  } catch (e) {
    const texto = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    const ehPrazo = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
    throw new FalhaDeMotor(ehPrazo ? "timeout" : "erro_de_rede", `portão de IA inalcançável — ${texto}`);
  }

  const corpo = (await resposta.json().catch(() => null)) as
    | {
        atendido?: boolean;
        texto?: string;
        codigo?: string;
        motivo?: string;
        maxTokensReduzido?: { pedido: number; usado: number } | null;
      }
    | null;

  if (corpo === null) {
    throw new FalhaDeMotor("erro_de_rede", `portão de IA respondeu ${resposta.status} sem corpo legível`);
  }

  // ⚠️ Lê `atendido`, e não só o status HTTP: o portão responde o MESMO formato
  // nos dois casos, de propósito, para quem integra conseguir degradar lendo um
  // campo só mesmo que ignore o código.
  if (corpo.atendido !== true) {
    const codigo = corpo.codigo ?? "desconhecido";
    throw new FalhaDeMotor(
      motivoDoCodigo(codigo),
      `portão de IA recusou (${codigo}): ${corpo.motivo ?? "sem motivo declarado"}`,
    );
  }

  // ⚠️ O teto de tokens da Control Room é da COMPANHIA (padrão 400) e pode ser
  // menor que o que pedimos (1024). Ela declara o corte; nós não o engolimos —
  // resposta truncada parece inteira, e um JSON cortado vira `json_invalido`
  // logo adiante sem ninguém saber por quê. Aqui o porquê fica no log.
  if (corpo.maxTokensReduzido) {
    console.warn(
      `[control-room] teto de tokens da companhia cortou a resposta: pedidos ` +
        `${corpo.maxTokensReduzido.pedido}, usados ${corpo.maxTokensReduzido.usado}. ` +
        `Se o JSON vier quebrado, a causa é esta — o ajuste é LLM_MAX_TOKENS na Control Room.`,
    );
  }

  const texto = (corpo.texto ?? "").trim();
  if (texto === "") {
    throw new FalhaDeMotor("sem_conteudo", "o portão de IA devolveu resposta vazia");
  }

  return wantsJson ? limparCerca(texto) : texto;
}
