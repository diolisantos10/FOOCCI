import { describe, it, expect, vi, afterEach } from "vitest";
import { startSoundLeaderElection, type SoundLeader } from "./sound-leader";

const realNavigator = (globalThis as { navigator?: unknown }).navigator;
function setNavigator(n: unknown) {
  Object.defineProperty(globalThis, "navigator", { value: n, configurable: true, writable: true });
}
afterEach(() => setNavigator(realNavigator));

/**
 * LockManager FALSO que modela a fila de verdade — é o único jeito honesto de
 * provar "o líder morto é substituído" e "o líder vivo não é duplicado".
 *
 * Regras copiadas da Web Locks API:
 *  • um único titular por nome, modo exclusivo;
 *  • quem chega com o lock ocupado entra numa FILA (FIFO);
 *  • a callback recebe o lock e o segura até a Promise dela resolver;
 *  • `signal` abortado remove o pedido da fila e rejeita;
 *  • `query()` devolve `{ held, pending }`.
 */
class FakeLocks {
  held: string | null = null;
  queue: { name: string; run: () => void; abortListener?: () => void }[] = [];
  /** Nomes que já seguraram o lock, na ordem — é a prova de quem assumiu. */
  grants: string[] = [];

  request(
    name: string,
    opts: { mode?: string; signal?: AbortSignal },
    cb: () => Promise<void>,
  ): Promise<void> {
    return new Promise<void>((settle, reject) => {
      const start = () => {
        this.held = name;
        this.grants.push(name);
        void cb().then(() => {
          this.held = null;
          settle();
          this.pump();
        });
      };
      if (opts?.signal?.aborted) { reject(new DOMException("aborted", "AbortError")); return; }
      const entry: { name: string; run: () => void; abortListener?: () => void } = { name, run: start };
      if (opts?.signal) {
        const onAbort = () => {
          const i = this.queue.indexOf(entry);
          if (i >= 0) this.queue.splice(i, 1);
          reject(new DOMException("aborted", "AbortError"));
        };
        entry.abortListener = onAbort;
        opts.signal.addEventListener("abort", onAbort);
      }
      if (this.held === null && this.queue.length === 0) { start(); return; }
      this.queue.push(entry);
    });
  }

  private pump() {
    if (this.held !== null) return;
    const next = this.queue.shift();
    if (next) next.run();
  }

  query() {
    return Promise.resolve({
      held: this.held ? [{ name: this.held, mode: "exclusive" as const }] : [],
      pending: this.queue.map((q) => ({ name: q.name, mode: "exclusive" as const })),
    });
  }
}

/** Instala um FakeLocks e devolve uma fábrica de "abas" sobre ele. */
function comFila() {
  const locks = new FakeLocks();
  setNavigator({ locks });
  const abrirAba = (
    onLeader: () => void = () => {},
    opts?: { now?: () => number; cooldownMs?: number },
  ): SoundLeader => startSoundLeaderElection(onLeader, opts);
  return { locks, abrirAba };
}

/** Deixa a fila do lock andar (as concessões são assíncronas por Promise). */
const assentar = () => new Promise<void>((r) => setTimeout(r, 0));

describe("startSoundLeaderElection — degradação", () => {
  it("sem Web Locks → supported=false e nunca é líder", () => {
    setNavigator({}); // sem .locks
    const l = startSoundLeaderElection(() => {});
    expect(l.supported).toBe(false);
    expect(l.isLeader()).toBe(false);
    l.dispose(); // não pode lançar
  });

  it("sem Web Locks → passar a vez é no-op (o chamador cai no gate de foco)", async () => {
    setNavigator({});
    const l = startSoundLeaderElection(() => {});
    await expect(l.stepDownIfSomeoneIsWaiting()).resolves.toBe(false);
    l.dispose();
  });
});

describe("startSoundLeaderElection — eleição", () => {
  it("com Web Locks → vira líder ao receber o lock e libera no dispose", async () => {
    const { abrirAba } = comFila();
    const onLeader = vi.fn();
    const a = abrirAba(onLeader);

    expect(a.supported).toBe(true);
    await assentar();
    expect(a.isLeader()).toBe(true);
    expect(onLeader).toHaveBeenCalledTimes(1);

    a.dispose();
    expect(a.isLeader()).toBe(false);
  });

  it("UMA aba de cada vez: a segunda espera na fila e não se acha líder", async () => {
    const { abrirAba } = comFila();
    const a = abrirAba();
    await assentar();
    const b = abrirAba();
    await assentar();

    expect(a.isLeader()).toBe(true);
    expect(b.isLeader()).toBe(false);
    a.dispose(); b.dispose();
  });
});

// ── METADE 1: o líder morto É substituído ────────────────────────────────────
describe("líder morto é substituído", () => {
  it("aba líder que fecha entrega a liderança à próxima da fila", async () => {
    const { abrirAba } = comFila();
    const a = abrirAba();
    await assentar();
    const b = abrirAba();
    await assentar();
    expect(b.isLeader()).toBe(false);

    a.dispose();          // a aba líder foi fechada
    await assentar();
    expect(b.isLeader()).toBe(true);   // sem espera, sem timeout: assume na hora
    b.dispose();
  });

  it("REGRESSÃO: aba que morre AINDA NA FILA não trava o lock para sempre", async () => {
    // Era este o buraco: `release` só existia dentro da callback, então quem
    // morria na fila não tinha o que liberar. Quando o lock finalmente chegava,
    // ia parar numa instância morta que o segurava eternamente — e NENHUMA aba
    // do navegador conseguia mais se eleger líder (o alarme morria inteiro).
    const { abrirAba } = comFila();
    const a = abrirAba();
    await assentar();

    const b = abrirAba();   // entra na fila, ainda não é líder
    expect(b.isLeader()).toBe(false);
    b.dispose();            // morre ANTES de a callback do lock rodar

    const c = abrirAba();   // a aba que continua viva
    await assentar();

    a.dispose();            // o líder sai
    await assentar();

    expect(c.isLeader()).toBe(true);   // c assume — o lock não ficou preso em b
    expect(b.isLeader()).toBe(false);
    c.dispose();
  });

  it("REGRESSÃO: concessão que chega DEPOIS do dispose é devolvida na hora", async () => {
    // Mesmo sem AbortController (navegador que não o tenha), a concessão atrasada
    // não pode ficar segurando o lock numa instância morta.
    const { locks, abrirAba } = comFila();
    const semAbort = globalThis.AbortController;
    // @ts-expect-error — simulando ambiente sem AbortController
    delete globalThis.AbortController;
    try {
      const a = abrirAba();
      await assentar();
      const b = abrirAba();
      b.dispose();          // morre na fila, sem poder abortar o pedido
      const c = abrirAba();
      await assentar();

      a.dispose();
      await assentar();     // o lock é concedido a b (morto) → devolvido na hora
      await assentar();     // e segue para c

      expect(c.isLeader()).toBe(true);
      expect(locks.held).not.toBeNull();
      c.dispose();
    } finally {
      globalThis.AbortController = semAbort;
    }
  });
});

// ── METADE 2: o líder vivo NÃO é duplicado ───────────────────────────────────
describe("líder vivo não é duplicado", () => {
  it("nunca há duas abas se achando líderes ao mesmo tempo", async () => {
    const { abrirAba } = comFila();
    const abas = [abrirAba(), abrirAba(), abrirAba(), abrirAba()];
    await assentar();
    expect(abas.filter((t) => t.isLeader()).length).toBe(1);

    // O líder cede a vez: ainda assim, exatamente UM líder depois da troca.
    await abas[0].stepDownIfSomeoneIsWaiting();
    await assentar();
    expect(abas.filter((t) => t.isLeader()).length).toBe(1);
    expect(abas[0].isLeader()).toBe(false);

    for (const t of abas) t.dispose();
  });

  it("passar a vez tira a liderança desta aba ANTES de qualquer outra assumir", async () => {
    const { abrirAba } = comFila();
    const a = abrirAba();
    await assentar();
    const b = abrirAba();
    await assentar();

    const passou = await a.stepDownIfSomeoneIsWaiting();
    expect(passou).toBe(true);
    expect(a.isLeader()).toBe(false);   // já não é líder no instante em que larga
    await assentar();
    expect(b.isLeader()).toBe(true);
    a.dispose(); b.dispose();
  });
});

// ── O líder mudo passa a vez — mas só quando há substituto ───────────────────
describe("líder que não consegue tocar passa a vez", () => {
  it("com outra aba na fila → passa a vez, e volta para a fila (nunca fica de fora)", async () => {
    const { locks, abrirAba } = comFila();
    const a = abrirAba();
    await assentar();
    const b = abrirAba();
    await assentar();

    expect(await a.stepDownIfSomeoneIsWaiting()).toBe(true);
    await assentar();
    expect(b.isLeader()).toBe(true);

    // INVARIANTE: `a` saiu da liderança mas entrou na fila — quando `b` fechar,
    // `a` volta a ser líder. Uma aba que cede e some deixaria o alarme órfão.
    b.dispose();
    await assentar();
    expect(a.isLeader()).toBe(true);
    expect(locks.held).not.toBeNull();
    a.dispose();
  });

  it("SEM ninguém na fila → NÃO larga a liderança", async () => {
    // Largar sem substituto é o pior dos mundos: ninguém busca pedido e ninguém
    // toca. Uma aba muda que continua tentando é melhor que aba nenhuma.
    const { abrirAba } = comFila();
    const a = abrirAba();
    await assentar();

    expect(await a.stepDownIfSomeoneIsWaiting()).toBe(false);
    expect(a.isLeader()).toBe(true);
    a.dispose();
  });

  it("uma aba não pode passar a vez em rajada (batata quente entre duas abas mudas)", async () => {
    const { abrirAba } = comFila();
    let agora = 0;
    const relogio = { now: () => agora, cooldownMs: 30_000 };
    const a = abrirAba(() => {}, relogio);
    await assentar();
    const b = abrirAba(() => {}, relogio);
    await assentar();

    expect(await a.stepDownIfSomeoneIsWaiting()).toBe(true);
    await assentar();
    expect(b.isLeader()).toBe(true);

    // `b` também está muda e devolve para `a`; `a` recebe de volta e, dentro da
    // janela de descanso, NÃO devolve de novo — o alarme para de ricochetear.
    expect(await b.stepDownIfSomeoneIsWaiting()).toBe(true);
    await assentar();
    expect(a.isLeader()).toBe(true);
    expect(await a.stepDownIfSomeoneIsWaiting()).toBe(false);
    expect(a.isLeader()).toBe(true);

    // Passado o descanso, volta a poder ceder — o revezamento não fica travado.
    agora += 30_001;
    expect(await a.stepDownIfSomeoneIsWaiting()).toBe(true);
    a.dispose(); b.dispose();
  });

  it("aba que já não é líder não tenta passar a vez", async () => {
    const { abrirAba } = comFila();
    const a = abrirAba();
    await assentar();
    const b = abrirAba();
    await assentar();

    expect(await b.stepDownIfSomeoneIsWaiting()).toBe(false);
    expect(a.isLeader()).toBe(true);
    a.dispose(); b.dispose();
  });
});
