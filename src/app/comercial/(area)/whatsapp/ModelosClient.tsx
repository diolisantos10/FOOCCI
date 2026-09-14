"use client";

/**
 * O QUE O LEAD VAI RECEBER — a tela que mostra a frase, e não o nome dela.
 *
 * A aprovação da Meta e a decisão operacional da Foocci são coisas diferentes:
 * APPROVED diz que a Meta aceita o modelo; "Pode enviar" diz se o SDR está
 * autorizado a usá-lo. O segundo nasce desligado e é controlado aqui.
 */

import { useCallback, useEffect, useState } from "react";

interface Numero {
  phoneNumberId: string;
  wabaId: string | null;
  numero: string | null;
  nomeVerificado: string | null;
  qualidade: string | null;
  tier: string | null;
  erro: string | null;
}

interface Modelo {
  nome: string;
  idioma: string;
  categoria: string | null;
  situacao: string;
  variaveis: number;
  corpo: string | null;
  podeEnviar: boolean;
}

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; numero: Numero; modelos: Modelo[] }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

const chaveDoModelo = (m: Pick<Modelo, "nome" | "idioma">) => `${m.nome}::${m.idioma}`;

export function ModelosClient() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [sincronizando, setSincronizando] = useState(false);
  const [alterando, setAlterando] = useState<string | null>(null);
  const [recado, setRecado] = useState<{ tom: "bom" | "ruim"; texto: string } | null>(null);

  useEffect(() => {
    let vivo = true;

    (async () => {
      try {
        const [rNumero, rSelecao] = await Promise.all([
          fetch("/api/admin/sala-de-vendas/whatsapp", { cache: "no-store" }),
          fetch("/api/admin/sala-de-vendas/whatsapp/selecao", { cache: "no-store" }),
        ]);
        if (!vivo) return;

        if (
          rNumero.status === 401 ||
          rNumero.status === 403 ||
          rSelecao.status === 401 ||
          rSelecao.status === 403
        ) {
          setEstado({ fase: "semAcesso" });
          return;
        }

        const jNumero = (await rNumero.json()) as {
          ok: boolean;
          data?: { numero: Numero };
          error?: string;
        };
        const jSelecao = (await rSelecao.json()) as {
          ok: boolean;
          data?: { modelos: Modelo[] };
          error?: string;
        };
        if (!vivo) return;

        if (!jNumero.ok || !jNumero.data) {
          setEstado({ fase: "erro", detalhe: jNumero.error ?? null });
          return;
        }
        if (!jSelecao.ok || !jSelecao.data) {
          setEstado({ fase: "erro", detalhe: jSelecao.error ?? "Não foi possível ler a seleção dos modelos." });
          return;
        }

        setEstado({
          fase: "pronto",
          numero: jNumero.data.numero,
          modelos: jSelecao.data.modelos,
        });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();

    return () => {
      vivo = false;
    };
  }, [tentativa]);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    setRecado(null);
    try {
      const r = await fetch("/api/admin/sala-de-vendas/whatsapp", { method: "POST" });
      const j = (await r.json()) as {
        ok: boolean;
        data?: { resultado: { sincronizados: number; sumiram: number; completa: boolean } };
        error?: string;
      };

      if (!j.ok || !j.data) {
        setRecado({ tom: "ruim", texto: j.error ?? "Não consegui perguntar à Meta." });
        return;
      }

      const { sincronizados, sumiram, completa } = j.data.resultado;
      setRecado({
        tom: "bom",
        texto:
          `${sincronizados} modelo(s) lidos da Meta` +
          (sumiram > 0 ? ` · ${sumiram} sumiram da conta e foram marcados` : "") +
          (completa ? "" : " · a conta tem mais modelos do que coube nesta varredura"),
      });
      setTentativa((t) => t + 1);
    } catch (e) {
      setRecado({ tom: "ruim", texto: e instanceof Error ? e.message : "Falha de rede." });
    } finally {
      setSincronizando(false);
    }
  }, []);

  const mudarPermissao = useCallback(async (modelo: Modelo, podeEnviar: boolean) => {
    const chave = chaveDoModelo(modelo);
    setAlterando(chave);
    setRecado(null);

    try {
      const r = await fetch("/api/admin/sala-de-vendas/whatsapp/selecao", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nome: modelo.nome, idioma: modelo.idioma, podeEnviar }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };

      if (!r.ok || !j.ok) {
        setRecado({ tom: "ruim", texto: j.error ?? "Não foi possível alterar este modelo." });
        return;
      }

      setEstado((anterior) => {
        if (anterior.fase !== "pronto") return anterior;
        return {
          ...anterior,
          modelos: anterior.modelos.map((m) =>
            chaveDoModelo(m) === chave ? { ...m, podeEnviar } : m,
          ),
        };
      });
      setRecado({
        tom: "bom",
        texto: podeEnviar
          ? `${modelo.nome} entrou no grupo que o SDR pode sortear.`
          : `${modelo.nome} foi retirado dos próximos disparos.`,
      });
    } catch (e) {
      setRecado({ tom: "ruim", texto: e instanceof Error ? e.message : "Falha de rede." });
    } finally {
      setAlterando(null);
    }
  }, []);

  if (estado.fase === "carregando") {
    return <p className="mt-5 text-[13px] text-muted">Lendo os modelos…</p>;
  }

  if (estado.fase === "semAcesso") {
    return (
      <p className="mt-5 text-[13.5px] leading-relaxed text-ink2">
        Sem acesso. Os modelos são de quem enxerga a operação inteira.
      </p>
    );
  }

  if (estado.fase === "erro") {
    return (
      <p className="mt-5 text-[13.5px] text-ink2">
        {estado.detalhe ?? "Não foi possível ler os modelos."}
      </p>
    );
  }

  const { numero, modelos } = estado;
  const ativos = modelos.filter((m) => m.situacao === "APPROVED" && m.podeEnviar).length;

  return (
    <>
      <OCadastroDoNumero numero={numero} />

      <section className="mt-5 rounded-2xl border border-line bg-paper p-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
              O que o lead recebe
            </h2>
            <p className="mt-1 max-w-[68ch] text-[12.5px] leading-relaxed text-muted">
              Ligue <strong className="font-medium text-ink2">Pode enviar</strong> somente nos modelos que podem sair para leads frios.
              O SDR sorteia apenas entre os aprovados pela Meta que estiverem ligados.
            </p>
            <p className={cx("mt-1 text-[12px]", ativos > 0 ? "text-emerald-700" : "text-amber-700")}>
              {ativos > 0
                ? `${ativos} modelo(s) participando do sorteio dos próximos disparos.`
                : "Nenhum modelo liberado: o SDR não envia abordagem fria até você ligar pelo menos um."}
            </p>
          </div>

          <button
            type="button"
            onClick={sincronizar}
            disabled={sincronizando}
            className="shrink-0 rounded-full border border-line2 bg-paper px-3.5 py-1.5 text-[12.5px] font-medium text-ink2 hover:bg-chip disabled:opacity-50"
          >
            {sincronizando ? "Perguntando à Meta…" : "Buscar modelos na Meta"}
          </button>
        </header>

        {recado ? (
          <p
            className={cx(
              "mt-3 break-words text-[12.5px]",
              recado.tom === "bom" ? "text-emerald-600" : "text-amber-700",
            )}
          >
            {recado.texto}
          </p>
        ) : null}

        {modelos.length === 0 ? (
          <p className="mt-3 max-w-[62ch] text-[13px] leading-relaxed text-ink2">
            Nenhum modelo guardado ainda. Clique em <strong>Buscar modelos na Meta</strong> — isso não manda mensagem para ninguém, só lê a conta.
          </p>
        ) : (
          <ul className="mt-3.5 space-y-3">
            {modelos.map((m) => (
              <Linha
                key={`${m.nome} ${m.idioma}`}
                modelo={m}
                alterando={alterando === chaveDoModelo(m)}
                onMudar={mudarPermissao}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function OCadastroDoNumero({ numero }: { numero: Numero }) {
  if (numero.erro && !numero.numero) {
    return (
      <section className="mt-5 rounded-2xl border border-line2 bg-canvas p-4">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
          O número na Meta
        </h2>
        <p className="mt-2 max-w-[62ch] break-words text-[13px] leading-relaxed text-ink2">
          Não consegui perguntar à Meta. Resposta dela:{" "}
          <span className="text-muted">{numero.erro}</span>
        </p>
      </section>
    );
  }

  const linhas: Array<{ rotulo: string; valor: string; nota?: string }> = [
    {
      rotulo: "Número comercial",
      valor: numero.numero ?? "sem identificação",
      nota: numero.nomeVerificado ?? undefined,
    },
    {
      rotulo: "Conta da Meta (WABA)",
      valor: numero.wabaId ?? "não resolvida",
      nota: numero.wabaId ? "é dela que os modelos abaixo são lidos" : numero.erro ?? undefined,
    },
    {
      rotulo: "Quantas conversas a Meta deixa iniciar por dia",
      valor: traduzirTier(numero.tier),
      nota: "sobe e desce sozinho, conforme qualidade e volume",
    },
    {
      rotulo: "Qualidade do número",
      valor: traduzirQualidade(numero.qualidade),
    },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-line bg-paper p-4">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        O número na Meta
      </h2>

      <dl className="mt-2.5 space-y-2.5">
        {linhas.map((l) => (
          <div key={l.rotulo}>
            <dt className="text-[11.5px] text-muted">{l.rotulo}</dt>
            <dd className="text-[13.5px] leading-snug text-ink">
              <strong className="font-medium">{l.valor}</strong>
              {l.nota ? <span className="text-muted"> — {l.nota}</span> : null}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Linha({
  modelo,
  alterando,
  onMudar,
}: {
  modelo: Modelo;
  alterando: boolean;
  onMudar: (modelo: Modelo, podeEnviar: boolean) => Promise<void>;
}) {
  const aprovado = modelo.situacao === "APPROVED";
  const ligado = aprovado && modelo.podeEnviar;

  return (
    <li
      className={cx(
        "rounded-xl border p-3",
        ligado ? "border-emerald-500/40 bg-emerald-500/[.05]" : "border-line2 bg-canvas",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <span className="text-[13.5px] font-medium text-ink">{modelo.nome}</span>
        <span className="text-[11.5px] text-muted">{modelo.idioma}</span>
        {modelo.categoria ? (
          <span className="text-[11.5px] text-muted">· {modelo.categoria}</span>
        ) : null}
        <span
          className={cx(
            "rounded-full px-2 py-[1px] text-[11px]",
            aprovado ? "bg-emerald-500/15 text-emerald-700" : "bg-chip text-ink2",
          )}
        >
          {traduzirSituacao(modelo.situacao)}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <span className={cx("text-[12px] font-medium", ligado ? "text-emerald-700" : "text-ink2")}>
            Pode enviar
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={ligado}
            aria-label={`Pode enviar ${modelo.nome}`}
            disabled={!aprovado || alterando}
            onClick={() => void onMudar(modelo, !ligado)}
            className={cx(
              "relative h-6 w-11 shrink-0 rounded-full border transition disabled:cursor-not-allowed disabled:opacity-40",
              ligado ? "border-emerald-600 bg-emerald-600" : "border-line2 bg-chip",
            )}
          >
            <span
              className={cx(
                "absolute top-1/2 h-5 w-5 -translate-y-1/2 rounded-full bg-white shadow-sm transition",
                ligado ? "left-[21px]" : "left-[1px]",
              )}
            />
          </button>
        </div>
      </div>

      {!aprovado ? (
        <p className="mt-1.5 text-[11.5px] text-amber-700">
          A Meta não aprovou este modelo; por segurança ele não pode participar dos disparos.
        </p>
      ) : null}

      {modelo.corpo ? (
        <p className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-paper px-3 py-2 text-[13px] leading-relaxed text-ink2">
          {modelo.corpo}
        </p>
      ) : (
        <p className="mt-2 text-[12.5px] text-muted">
          A Meta não devolveu o corpo deste modelo.
        </p>
      )}

      <p className="mt-1.5 text-[11.5px] text-muted">
        {modelo.variaveis === 0
          ? "não precisa de nenhuma informação do lead"
          : `precisa de ${modelo.variaveis} informação(ões) do lead — {{1}}${
              modelo.variaveis > 1 ? " … {{" + modelo.variaveis + "}}" : ""
            }`}
      </p>
    </li>
  );
}

function traduzirTier(tier: string | null): string {
  if (!tier) return "a Meta não informou";
  const mapa: Record<string, string> = {
    TIER_50: "50 por dia",
    TIER_250: "250 por dia",
    TIER_1K: "1.000 por dia",
    TIER_10K: "10.000 por dia",
    TIER_100K: "100.000 por dia",
    TIER_UNLIMITED: "sem teto declarado",
  };
  return mapa[tier.toUpperCase()] ?? tier;
}

function traduzirQualidade(q: string | null): string {
  if (!q) return "a Meta não informou";
  const mapa: Record<string, string> = {
    GREEN: "alta",
    YELLOW: "média — a Meta está de olho",
    RED: "baixa — risco de bloqueio",
    UNKNOWN: "ainda sem histórico",
  };
  return mapa[q.toUpperCase()] ?? q;
}

function traduzirSituacao(s: string): string {
  const mapa: Record<string, string> = {
    APPROVED: "aprovado",
    PENDING: "em análise",
    REJECTED: "recusado",
    PAUSED: "pausado pela Meta",
    DISABLED: "desativado",
    MISSING: "sumiu da conta",
  };
  return mapa[s.toUpperCase()] ?? s.toLowerCase();
}

function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}
