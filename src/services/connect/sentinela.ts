/**
 * A SENTINELA DE REDE — a medição que substitui uma promessa que não podia falhar.
 *
 * ─── O DEFEITO QUE ORIGINOU ESTE ARQUIVO (achado B-1, 30/08/2026) ───────────
 *
 * A porta dizia, em comentário, que a "Trava 0" LANÇA "se qualquer efeito
 * colateral estiver ligado — envio, pagamento, pedido". Não lançava, e não
 * podia: `assertSimulationSafeMode()` sem argumento confere o
 * `SIMULATION_SAFE_MODE`, que é um `Object.freeze` com os seis campos seguros
 * escritos no código. Um assert de uma constante contra si mesma. Nenhuma
 * entrada, nenhum ambiente e nenhum estado do mundo conseguiam fazê-lo falhar.
 *
 * O efeito ERA seguro — o auditor mediu rede zero — mas a segurança vinha do
 * adapter ser função pura, **não daquela trava**. Afirmação de trava que não
 * pode falhar é o defeito que vira ✅ falso três semanas depois: alguém troca o
 * executor por um que chama um provedor, e a "trava" continua verde.
 *
 * ─── O QUE ESTE ARQUIVO FAZ, DITO SEM ENFEITE ──────────────────────────────
 *
 * Ele **mede** as saídas de rede durante a janela em que o agente executa, e
 * devolve a contagem. Não é promessa: é número, e ele pode vir diferente de
 * zero. Quem chama decide o que fazer — e no `despacho.ts` a decisão é derrubar
 * para `nao_verificavel`, porque a porta promete acionamento sem credencial e
 * sem rede, e o que não cumpre a promessa não é certificado.
 *
 * ─── ⚠️ O QUE ELE **NÃO** FAZ — e isto precisa estar escrito ────────────────
 *
 * 1. **Ele mede; ele não impede.** Um `fetch` dentro da janela acontece e é
 *    contado; o pacote não é bloqueado. Bloquear exigiria derrubar a rede do
 *    processo inteiro, e o processo é compartilhado com todo o resto do Foocci
 *    — a cura seria pior que a doença. A trava é de SAÍDA: a resposta cai para
 *    `nao_verificavel` e o chamador não recebe 2xx. O que se garante é que
 *    ninguém CERTIFICA uma execução que saiu para a rede, não que a saída seja
 *    fisicamente impossível.
 *
 * 2. **A janela é do processo, não da requisição.** Não existe, em Node, um
 *    escopo de rede por requisição. Se outra requisição do mesmo processo fizer
 *    um `fetch` enquanto a janela está aberta, ele entra na conta. O erro
 *    possível é, portanto, um falso ALARME (`nao_verificavel` sem culpa), nunca
 *    um falso verde — que é o lado certo para errar. Em produção, esta porta é
 *    de homologação e de tráfego baixíssimo (a Control Room, sob demanda).
 *
 * 3. **Ele só mede os canais que conseguiu instrumentar**, e diz quais foram em
 *    `canais`. Se `fetch` não puder ser instrumentado, a medição não vale — e
 *    `despacho.ts` recusa em vez de fingir que mediu. Não medir não é medir zero.
 *
 * Por que `fetch` é o canal obrigatório: os dois SDKs de IA desta casa
 * (`@anthropic-ai/sdk` e `openai`) falam por `fetch`. É por ele que sairia a
 * chamada que esta porta jura não fazer.
 */

import http from "node:http";
import https from "node:https";

/** O canal sem o qual a medição não vale nada. */
export const CANAL_OBRIGATORIO = "fetch" as const;

/** Quantos destinos distintos entram no motivo antes de a lista ser cortada. */
export const TETO_DE_DESTINOS = 5;

/** O que a janela mediu. Números e nomes — nenhuma promessa. */
export interface MedicaoDeRede {
  /** Saídas de rede contadas na janela. Zero é o esperado; não é o garantido. */
  chamadas: number;
  /** Até `TETO_DE_DESTINOS` destinos vistos, para o motivo poder ser específico. */
  destinos: string[];
  /** Os canais efetivamente instrumentados. O que não está aqui não foi medido. */
  canais: string[];
  /**
   * Como ler este bloco: ele é medido nesta execução, no processo — não é lido
   * do banco e não é uma declaração do executor sobre si mesmo.
   */
  fonte: "medido no processo durante o acionamento";
}

/** Uma janela aberta. Cada `medindoRede` em curso tem a sua. */
interface Janela {
  chamadas: number;
  destinos: string[];
}

const janelasAbertas = new Set<Janela>();

/** O que foi trocado, para poder ser devolvido exatamente como estava. */
interface Originais {
  fetch?: typeof globalThis.fetch;
  httpRequest?: typeof http.request;
  httpGet?: typeof http.get;
  httpsRequest?: typeof https.request;
  httpsGet?: typeof https.get;
}

let originais: Originais | null = null;
let canaisInstalados: string[] = [];

function registrar(destino: string): void {
  for (const janela of janelasAbertas) {
    janela.chamadas += 1;
    if (janela.destinos.length < TETO_DE_DESTINOS && !janela.destinos.includes(destino)) {
      janela.destinos.push(destino);
    }
  }
}

/** O destino, em texto curto e sem segredo dentro (nada de query string). */
function destinoDe(alvo: unknown): string {
  try {
    if (typeof alvo === "string") return new URL(alvo).origin;
    if (alvo instanceof URL) return alvo.origin;
    if (alvo && typeof alvo === "object") {
      const o = alvo as { url?: unknown; hostname?: unknown; host?: unknown; protocol?: unknown };
      if (typeof o.url === "string") return new URL(o.url).origin;
      const host = typeof o.hostname === "string" ? o.hostname : typeof o.host === "string" ? o.host : null;
      if (host) return `${typeof o.protocol === "string" ? o.protocol : "?"}//${host}`;
    }
  } catch {
    /* destino ilegível não invalida a contagem — a contagem é o que importa */
  }
  return "destino-não-identificado";
}

/**
 * Instala os grampos. Idempotente por contagem: quem abre a primeira janela
 * instala, quem fecha a última desinstala. Cada canal é instalado dentro de um
 * `try` próprio — o que não der para instrumentar simplesmente não é declarado
 * em `canais`, em vez de virar uma medição inventada.
 */
function instalar(): void {
  if (originais) return;
  const guardados: Originais = {};
  const canais: string[] = [];

  try {
    const original = globalThis.fetch;
    if (typeof original === "function") {
      guardados.fetch = original;
      globalThis.fetch = function (this: unknown, ...args: Parameters<typeof fetch>) {
        registrar(destinoDe(args[0]));
        return original.apply(this, args) as ReturnType<typeof fetch>;
      } as typeof globalThis.fetch;
      canais.push("fetch");
    }
  } catch {
    /* canal não instrumentado — e por isso não declarado */
  }

  for (const [nome, mod] of [
    ["http", http],
    ["https", https],
  ] as const) {
    try {
      const req = mod.request;
      const get = mod.get;
      if (typeof req !== "function" || typeof get !== "function") continue;
      if (nome === "http") {
        guardados.httpRequest = req;
        guardados.httpGet = get;
      } else {
        guardados.httpsRequest = req;
        guardados.httpsGet = get;
      }
      // `get` chama a `request` INTERNA do módulo, não a nossa — por isso os dois
      // são grampeados e cada um conta uma vez só.
      (mod as { request: unknown }).request = function (this: unknown, ...args: unknown[]) {
        registrar(destinoDe(args[0]));
        return (req as (...a: unknown[]) => unknown).apply(this, args);
      };
      (mod as { get: unknown }).get = function (this: unknown, ...args: unknown[]) {
        registrar(destinoDe(args[0]));
        return (get as (...a: unknown[]) => unknown).apply(this, args);
      };
      canais.push(nome);
    } catch {
      /* idem */
    }
  }

  originais = guardados;
  canaisInstalados = canais;
}

/** Devolve tudo como estava. Só a última janela a fechar desinstala. */
function desinstalar(): void {
  if (!originais) return;
  const g = originais;
  try {
    if (g.fetch) globalThis.fetch = g.fetch;
    if (g.httpRequest) (http as { request: unknown }).request = g.httpRequest;
    if (g.httpGet) (http as { get: unknown }).get = g.httpGet;
    if (g.httpsRequest) (https as { request: unknown }).request = g.httpsRequest;
    if (g.httpsGet) (https as { get: unknown }).get = g.httpsGet;
  } finally {
    originais = null;
    canaisInstalados = [];
  }
}

/**
 * Roda `fn` com a sentinela aberta e devolve o valor JUNTO com a medição.
 *
 * Se `fn` lançar, a sentinela é fechada do mesmo jeito (o `finally` é a parte
 * que não pode faltar: janela que fica aberta contamina toda requisição
 * seguinte do processo) e a exceção sobe intacta — quem chama é que decide o
 * que um agente que estourou significa.
 */
export async function medindoRede<T>(fn: () => Promise<T>): Promise<{ valor: T; rede: MedicaoDeRede }> {
  const janela: Janela = { chamadas: 0, destinos: [] };
  janelasAbertas.add(janela);
  instalar();
  const canais = [...canaisInstalados];
  try {
    const valor = await fn();
    return { valor, rede: medicao(janela, canais) };
  } finally {
    janelasAbertas.delete(janela);
    if (janelasAbertas.size === 0) desinstalar();
  }
}

function medicao(janela: Janela, canais: string[]): MedicaoDeRede {
  return {
    chamadas: janela.chamadas,
    destinos: [...janela.destinos],
    canais,
    fonte: "medido no processo durante o acionamento",
  };
}

/** A medição vale? Só se o canal por onde sairia a chamada de IA foi grampeado. */
export function medicaoConfiavel(rede: MedicaoDeRede): boolean {
  return rede.canais.includes(CANAL_OBRIGATORIO);
}
