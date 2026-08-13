/**
 * sound-leader — elege UMA aba "líder" que toca os alarmes, mesmo em segundo plano.
 *
 * Antes, o alarme só tocava na aba em FOCO (document.visibilityState). Isso evitava
 * várias abas apitando juntas, mas impedia o caso mais comum do dono: o FOOCCI numa
 * aba de fundo enquanto ele trabalha em outra aba — aí não saía som nenhum.
 *
 * Solução: Web Locks API. Uma única aba segura o lock exclusivo "foocci-sound-leader"
 * (a mais antiga que pediu); só ela toca. Quando ela fecha, outra aba assume o lock
 * automaticamente. Assim o som sai mesmo com o FOOCCI em segundo plano, e nunca toca
 * em duas abas ao mesmo tempo.
 *
 * Sem Web Locks (navegador antigo), `supported=false` — o chamador cai no gate de
 * foco anterior (sem regressão; só perde o toque em background nesses navegadores).
 *
 * ── DUAS COISAS QUE ESTA VERSÃO GARANTE (13/08/2026) ────────────────────────────
 *
 * 1. **Nenhum pedido de lock fica órfão.** `dispose()` acontece com frequência ANTES
 *    de o lock ser concedido (a instância morre ainda na fila). A versão anterior só
 *    guardava o `release` DENTRO da callback: quem morria na fila não tinha o que
 *    liberar, o pedido continuava na fila, e quando o lock finalmente era concedido
 *    ele ia parar numa instância morta que o segurava **para sempre** — travando o
 *    alarme de TODAS as abas daquele navegador. Agora o pedido é abortável
 *    (`AbortSignal`) e uma concessão atrasada é devolvida na hora.
 *
 * 2. **Líder que não consegue tocar passa a vez.** O navegador só libera áudio para
 *    um documento que recebeu um gesto do usuário. Uma aba aberta e nunca clicada
 *    pode ganhar a liderança e ficar MUDA — segurando o direito de apitar enquanto o
 *    pedido entra. `stepDownIfSomeoneIsWaiting()` devolve o lock quando há outra aba
 *    na fila; se não há ninguém esperando, ele NÃO larga (largar sem substituto só
 *    criaria um buraco onde ninguém busca pedido).
 *
 * INVARIANTE, e é ela que impede o silêncio: enquanto não houver `dispose()`, este
 * cliente sempre tem **o lock ou um pedido na fila**. Nunca nenhum dos dois.
 */

export interface SoundLeader {
  /** true quando ESTA aba é a que deve tocar. */
  isLeader: () => boolean;
  /** false em navegadores sem Web Locks — o chamador deve usar o fallback de foco. */
  supported: boolean;
  /**
   * Esta aba está com a liderança e o navegador RECUSOU tocar. Passa a vez para
   * outra aba **se houver alguma esperando na fila**; volta a pedir o lock em
   * seguida (nunca fica sem lock e sem pedido). Devolve true se passou a vez.
   *
   * Sem ninguém na fila → mantém a liderança de propósito: uma aba muda que tenta
   * é melhor que nenhuma aba tentando.
   */
  stepDownIfSomeoneIsWaiting: () => Promise<boolean>;
  /** Libera o lock (outra aba assume) e para de se considerar líder. */
  dispose: () => void;
}

const LOCK_NAME = "foocci-sound-leader";

/** Intervalo mínimo entre duas cessões de liderança da MESMA aba. Duas abas mudas
 *  passariam a vez uma para a outra a cada toque do alarme sem isto. */
export const STEP_DOWN_COOLDOWN_MS = 30_000;

export interface SoundLeaderOptions {
  /** Relógio injetável (testes). */
  now?: () => number;
  /** Sobrescreve STEP_DOWN_COOLDOWN_MS (testes). */
  cooldownMs?: number;
}

export function startSoundLeaderElection(
  onBecomeLeader: () => void,
  options: SoundLeaderOptions = {},
): SoundLeader {
  const now = options.now ?? (() => Date.now());
  const cooldownMs = options.cooldownMs ?? STEP_DOWN_COOLDOWN_MS;

  let leader = false;
  let release: (() => void) | null = null;
  /** Há um pedido nosso na fila do navegador, ainda não concedido. */
  let pending = false;
  let disposed = false;
  let abort: AbortController | null = null;
  let lastStepDownAt: number | null = null;
  /** Invalida pedidos antigos: uma concessão de geração vencida é devolvida na hora. */
  let generation = 0;

  const locks =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;
  const supported = !!(locks && typeof locks.request === "function");

  /** Devolve o lock que estamos segurando (se estivermos). Não re-pede. */
  const releaseHeld = (): void => {
    leader = false;
    const r = release;
    release = null;
    if (r) {
      try { r(); } catch { /* resolver de Promise não lança */ }
    }
  };

  const requestLock = (): void => {
    if (!supported || !locks || disposed || leader || pending) return;
    const gen = ++generation;
    pending = true;
    const ctrl = typeof AbortController === "function" ? new AbortController() : null;
    abort = ctrl;
    const opts: LockOptions = ctrl
      ? { mode: "exclusive", signal: ctrl.signal }
      : { mode: "exclusive" };

    // request resolve/rejeita quando a callback termina; mantemos a Promise viva
    // (via `release`) enquanto formos líder, segurando o lock até dispose()/close.
    locks
      .request(LOCK_NAME, opts, () =>
        new Promise<void>((resolve) => {
          // Concessão atrasada de um pedido que já não vale (dispose() ou cessão
          // de liderança) — devolve o lock IMEDIATAMENTE em vez de segurá-lo numa
          // instância morta. É este resolve que impede o travamento eterno.
          if (gen !== generation || disposed) {
            resolve();
            return;
          }
          pending = false;
          abort = null;
          leader = true;
          release = resolve;
          try {
            onBecomeLeader();
          } catch {
            /* callback do consumidor não pode derrubar a eleição */
          }
        })
      )
      .catch(() => {
        // lock abortado/negado — seguimos sem liderança
        if (gen !== generation) return;
        pending = false;
        abort = null;
      });
  };

  /** Alguma OUTRA aba está na fila esperando este lock? */
  const someoneIsWaiting = async (): Promise<boolean> => {
    if (!locks || typeof locks.query !== "function") return false;
    try {
      const snapshot = await locks.query();
      return (snapshot?.pending ?? []).some((l) => l.name === LOCK_NAME);
    } catch {
      return false;
    }
  };

  // ── Congelamento (bfcache) ────────────────────────────────────────────────
  // Um documento congelado continua segurando o lock e não busca pedido nenhum:
  // seria o alarme de todas as abas parado por uma aba que nem está rodando.
  // Só reagimos ao `persisted` — no descarregamento real o navegador libera sozinho.
  const onPageHide = (e: PageTransitionEvent): void => {
    if (!e.persisted || disposed) return;
    generation++;          // o pedido na fila, se houver, deixa de valer
    if (abort) {
      try { abort.abort(); } catch { /* ignore */ }
      abort = null;
    }
    pending = false;
    releaseHeld();
  };
  const onPageShow = (e: PageTransitionEvent): void => {
    if (!e.persisted || disposed) return;
    requestLock();
  };
  if (supported && typeof window !== "undefined") {
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
  }

  requestLock();

  return {
    isLeader: () => leader,
    supported,
    stepDownIfSomeoneIsWaiting: async () => {
      if (!leader || disposed) return false;
      if (lastStepDownAt !== null && now() - lastStepDownAt < cooldownMs) return false;
      if (!(await someoneIsWaiting())) return false;
      // O await abriu uma janela — reconfere antes de largar.
      if (!leader || disposed) return false;
      lastStepDownAt = now();
      generation++;   // invalida a concessão atual: quem devolve não a quer de volta por engano
      releaseHeld();
      requestLock();  // INVARIANTE: sai da liderança, mas entra na fila no mesmo instante
      return true;
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      generation++;
      releaseHeld();
      if (abort) {
        try { abort.abort(); } catch { /* abort não deve derrubar o desmonte */ }
        abort = null;
      }
      pending = false;
      if (supported && typeof window !== "undefined") {
        window.removeEventListener("pagehide", onPageHide);
        window.removeEventListener("pageshow", onPageShow);
      }
    },
  };
}
