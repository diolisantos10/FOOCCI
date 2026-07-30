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
 */

export interface SoundLeader {
  /** true quando ESTA aba é a que deve tocar. */
  isLeader: () => boolean;
  /** false em navegadores sem Web Locks — o chamador deve usar o fallback de foco. */
  supported: boolean;
  /** Libera o lock (outra aba assume) e para de se considerar líder. */
  dispose: () => void;
}

const LOCK_NAME = "foocci-sound-leader";

export function startSoundLeaderElection(onBecomeLeader: () => void): SoundLeader {
  let leader = false;
  let release: (() => void) | null = null;

  const locks =
    typeof navigator !== "undefined"
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined;
  const supported = !!(locks && typeof locks.request === "function");

  if (supported && locks) {
    // request resolve/rejeita quando a callback termina; mantemos a Promise viva
    // (via `release`) enquanto formos líder, segurando o lock até dispose()/close.
    locks
      .request(LOCK_NAME, { mode: "exclusive" }, () =>
        new Promise<void>((resolve) => {
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
        /* lock abortado/negado — seguimos sem liderança */
      });
  }

  return {
    isLeader: () => leader,
    supported,
    dispose: () => {
      leader = false;
      if (release) {
        release();
        release = null;
      }
    },
  };
}
