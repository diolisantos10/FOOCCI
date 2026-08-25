"use client";

/**
 * O FUNIL — o quadro (item 6 do comando).
 *
 * ── POR QUE AS TERMINAIS APARECEM NO QUADRO ─────────────────────────────────
 *
 * Um Kanban que só mostra o caminho feliz obriga a sair do quadro para registrar
 * a perda. E o que não se registra no fluxo não se registra: o vendedor fecha a
 * tela, promete voltar depois, e o lead perdido fica em "negociação" para sempre
 * inflando o funil.
 *
 * ── E POR QUE PERDER ABRE UMA PERGUNTA ──────────────────────────────────────
 *
 * Arrastar para "Perdido" abre o motivo, e o motivo é obrigatório. É o único
 * lugar do produto que interrompe o gesto do usuário para exigir um dado — e a
 * interrupção é o ponto: "o que mais nos faz perder" é a pergunta que paga a
 * próxima decisão de produto, e ela não se responde lendo trezentas notas.
 */

import { useCallback, useEffect, useState } from "react";

interface Coluna {
  etapa: string;
  rotulo: string;
  total: number;
}

interface Motivo {
  id: string;
  rotulo: string;
  grupo: string | null;
  exigeDetalhe: boolean;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; colunas: Coluna[]; motivos: Motivo[] }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

/** Terminais ficam visualmente separadas: elas encerram, não avançam. */
const TERMINAIS = new Set(["GANHO", "PERDIDO", "NUTRICAO"]);

export function FunilClient() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/funil", { cache: "no-store" });
        if (!vivo) return;

        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }

        const j = (await r.json()) as {
          ok: boolean;
          data?: { colunas: Coluna[]; motivosDePerda: Motivo[] };
          error?: string;
        };
        if (!vivo) return;

        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? null });
          return;
        }

        setEstado({ fase: "pronto", colunas: j.data.colunas, motivos: j.data.motivosDePerda });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();

    return () => { vivo = false; };
  }, [tentativa]);

  if (estado.fase === "carregando") {
    return <p className="p-6 text-[13px] text-muted">Carregando o funil…</p>;
  }

  if (estado.fase === "semAcesso") {
    return (
      <p className="p-6 text-[13.5px] leading-relaxed text-ink2">
        Sem acesso ao funil. É preciso um login interno.
      </p>
    );
  }

  if (estado.fase === "erro") {
    return (
      <p className="p-6 text-[13.5px] text-ink2">
        {estado.detalhe ?? "Não foi possível carregar o funil."}
      </p>
    );
  }

  const total = estado.colunas.reduce((s, c) => s + c.total, 0);

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">Funil comercial</h1>
          <p className="mt-1 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
            As onze etapas, no seu escopo. A soma das colunas bate com o que você
            consegue abrir — um quadro que mostra mais do que deixa ver ensina que
            o número mente.
          </p>
        </header>

        {total === 0 ? (
          <p className="rounded-2xl border border-line bg-paper p-5 text-[13.5px] leading-relaxed text-ink2">
            Nenhum lead no seu escopo ainda. Quando os primeiros entrarem, as
            colunas se enchem sozinhas.
          </p>
        ) : (
          /* Rola na horizontal DENTRO do próprio contêiner: onze colunas nunca
             cabem numa tela, e deixar a página rolar de lado quebraria o resto. */
          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="flex min-w-max gap-2">
              {estado.colunas.map((c) => (
                <ColunaDoQuadro key={c.etapa} coluna={c} total={total} />
              ))}
            </div>
          </div>
        )}

        <MotivosDePerda motivos={estado.motivos} />
      </div>
    </div>
  );
}

function ColunaDoQuadro({ coluna, total }: { coluna: Coluna; total: number }) {
  const terminal = TERMINAIS.has(coluna.etapa);
  const proporcao = total > 0 ? Math.round((coluna.total / total) * 100) : 0;

  return (
    <section
      className={cx(
        "w-[168px] shrink-0 rounded-2xl border p-3",
        terminal ? "border-dashed border-line2 bg-canvas" : "border-line bg-paper",
      )}
    >
      <h2 className="text-[12px] font-semibold leading-snug text-ink2">{coluna.rotulo}</h2>

      <p className="mt-1.5 text-2xl font-semibold tabular-nums text-ink">{coluna.total}</p>

      {/* A proporção só aparece quando há coluna cheia: "0%" em toda coluna de um
          funil vazio é ruído que ninguém consegue usar. */}
      {coluna.total > 0 && (
        <p className="text-[11.5px] tabular-nums text-muted">{proporcao}% do total</p>
      )}
    </section>
  );
}

function MotivosDePerda({ motivos }: { motivos: Motivo[] }) {
  return (
    <section className="mt-6 rounded-2xl border border-line bg-paper p-4">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        Motivos de perda cadastrados
      </h2>

      {motivos.length === 0 ? (
        <p className="mt-2 max-w-[70ch] text-[13px] leading-relaxed text-ink2">
          <strong>Nenhum motivo cadastrado ainda</strong> — e enquanto for assim,
          nenhum lead pode ser marcado como perdido. É deliberado: perda sem motivo
          estruturado não vira relatório, e a pergunta &quot;o que mais nos faz
          perder&quot; fica sem resposta. Rode{" "}
          <code className="rounded bg-chip px-1 py-0.5 text-[12px]">npm run db:seed-sala</code>{" "}
          para criar o catálogo inicial.
        </p>
      ) : (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {motivos.map((m) => (
            <li
              key={m.id}
              className="rounded-full border border-line2 bg-chip px-2 py-0.5 text-[12px] text-ink2"
            >
              {m.rotulo}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}
