"use client";

/**
 * O quadro do agente, e os dois botões que importam.
 *
 * ── A REGRA DESTA TELA ──────────────────────────────────────────────────────
 *
 * Quem lê isto decide se um robô passa a falar com estranhos em nome da empresa.
 * Então nada aqui pode exigir que ele saiba o que é uma variável de ambiente,
 * uma versão de prompt ou um provedor de IA.
 *
 * O veredito vem primeiro, em uma frase: **ele está atendendo, ou não está e por
 * quê**. As peças aparecem embaixo, para quem quiser conferir — nunca em vez da
 * conclusão.
 */

import { useCallback, useEffect, useState } from "react";

interface Estado {
  ligado: boolean;
  temVersaoPublicada: boolean;
  versaoNumero: number | null;
  horaInicio: number;
  horaFim: number;
  maxSemResposta: number;
  identidade: string | null;
  proibidos: string[];
  cerebroLigado: boolean;
  canalConfigurado: boolean;
  envioLigado: boolean;
  podeLigar: boolean;
}

type Fase =
  | { f: "carregando" }
  | { f: "pronto"; e: Estado }
  | { f: "semAcesso" }
  | { f: "erro"; detalhe: string };

export function AgenteClient() {
  const [fase, setFase] = useState<Fase>({ f: "carregando" });
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/ta", { cache: "no-store" });
        if (!vivo) return;
        if (r.status === 401 || r.status === 403) return setFase({ f: "semAcesso" });

        const j = (await r.json()) as { ok: boolean; data?: Estado; error?: string };
        if (!vivo) return;
        if (!j.ok || !j.data) return setFase({ f: "erro", detalhe: j.error ?? "Não foi possível ler o agente." });
        setFase({ f: "pronto", e: j.data });
      } catch {
        if (vivo) setFase({ f: "erro", detalhe: "Sem resposta do servidor." });
      }
    })();
    return () => { vivo = false; };
  }, [tentativa]);

  async function agir(corpo: Record<string, unknown>) {
    setOcupado(true);
    setAviso(null);
    try {
      const r = await fetch("/api/admin/sala-de-vendas/ta", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(corpo),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) setAviso(j.error ?? "Não deu para fazer isso agora.");
      recarregar();
    } catch {
      setAviso("Sem resposta do servidor.");
    } finally {
      setOcupado(false);
    }
  }

  if (fase.f === "carregando") return <p className="p-6 text-[13px] text-muted">Lendo o agente…</p>;
  if (fase.f === "semAcesso") {
    return <p className="p-6 text-[13.5px] leading-relaxed text-ink2">Sem acesso a esta tela.</p>;
  }
  if (fase.f === "erro") {
    return <p className="p-6 text-[13.5px] leading-relaxed text-ink2">{fase.detalhe}</p>;
  }

  const e = fase.e;

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">O agente</h1>
          <p className="mt-1 max-w-[64ch] text-[13.5px] leading-relaxed text-muted">
            O TA é quem responde primeiro quem escreve no WhatsApp da Foocci.
          </p>
        </header>

        <Veredito e={e} />

        {aviso && (
          <p role="alert" className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] leading-relaxed text-amber-900">
            {aviso}
          </p>
        )}

        <Botoes e={e} ocupado={ocupado} agir={agir} />

        <AsPecas e={e} />

        {e.identidade && (
          <section className="mt-5 rounded-2xl border border-line bg-paper p-4">
            <h2 className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
              A ficha publicada {e.versaoNumero ? `(versão ${e.versaoNumero})` : null}
            </h2>
            <p className="mt-2 max-w-[70ch] text-[13.5px] leading-relaxed text-ink2">{e.identidade}</p>

            {e.proibidos.length > 0 && (
              <>
                <h3 className="mt-3 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                  O que ele não pode fazer
                </h3>
                <ul className="mt-1.5 space-y-1">
                  {e.proibidos.map((p) => (
                    <li key={p} className="text-[13px] leading-snug text-ink2">— {p}</li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * A conclusão, em uma frase.
 *
 * A ordem das checagens é a ordem em que elas quebram a corrente: sem ficha ele
 * nem pode ser ligado; ligado sem IA-piloto ele responde duro; atendendo sem
 * envio ele escreve e guarda. Mostrar a primeira que falha evita a tela que
 * lista quatro problemas e deixa o leitor adivinhar por onde começar.
 */
function Veredito({ e }: { e: Estado }) {
  if (!e.temVersaoPublicada) {
    return (
      <Cartao tom="parado" titulo="O agente ainda não existe">
        Falta publicar a ficha dele — quem ele é, como fala e o que não pode
        fazer. Sem isso ele ficaria calado mesmo ligado.
      </Cartao>
    );
  }

  if (!e.ligado) {
    return (
      <Cartao tom="parado" titulo="O agente está desligado">
        A ficha está publicada e ele está pronto. Enquanto estiver desligado,
        quem escrever no WhatsApp da Foocci espera uma pessoa da sala.
      </Cartao>
    );
  }

  if (!e.canalConfigurado) {
    return (
      <Cartao tom="atencao" titulo="Ligado, mas o WhatsApp não está de pé">
        Ele está ligado e as chaves da Meta ainda não estão completas — então
        nada chega até ele. A tela <strong>WhatsApp</strong> diz o que falta.
      </Cartao>
    );
  }

  if (!e.envioLigado) {
    return (
      <Cartao tom="atencao" titulo="Atendendo, mas ainda não entrega">
        Ele recebe, entende e <strong>escreve</strong> a resposta — e ela fica
        guardada, esperando. A entrega é uma decisão separada, e ainda não foi
        tomada.
        <span className="mt-1.5 block text-muted">
          É deliberado: receber e pensar é seguro; falar com um estranho em nome
          da empresa é outra coisa.
        </span>
      </Cartao>
    );
  }

  return (
    <Cartao tom="bom" titulo="Ele está atendendo">
      Responde de {e.horaInicio}h às {e.horaFim}h, em dias úteis, e para sozinho
      depois de {e.maxSemResposta} mensagens sem resposta.
      {!e.cerebroLigado && (
        <span className="mt-1.5 block text-muted">
          Sem IA disponível no momento — ele responde, mas de forma mais seca.
        </span>
      )}
    </Cartao>
  );
}

function Botoes({
  e, ocupado, agir,
}: {
  e: Estado;
  ocupado: boolean;
  agir: (c: Record<string, unknown>) => void;
}) {
  if (!e.podeLigar) {
    return (
      <p className="mt-3 text-[12.5px] text-muted">
        Ligar e desligar o agente é decisão do dono.
      </p>
    );
  }

  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {!e.temVersaoPublicada ? (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => agir({ acao: "publicar" })}
          className="rounded-xl bg-ink px-4 py-2 text-[13.5px] font-semibold text-paper disabled:opacity-60"
        >
          {ocupado ? "Publicando…" : "Publicar a ficha"}
        </button>
      ) : (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => agir({ acao: "ligar", ligado: !e.ligado })}
          className={
            e.ligado
              ? "rounded-xl border border-line2 bg-paper px-4 py-2 text-[13.5px] font-semibold text-ink2 disabled:opacity-60"
              : "rounded-xl bg-ink px-4 py-2 text-[13.5px] font-semibold text-paper disabled:opacity-60"
          }
        >
          {ocupado ? "Um instante…" : e.ligado ? "Desligar o agente" : "Ligar o agente"}
        </button>
      )}
    </div>
  );
}

function AsPecas({ e }: { e: Estado }) {
  const linhas = [
    { pronta: e.temVersaoPublicada, titulo: "A ficha dele", diz: e.temVersaoPublicada ? `publicada (versão ${e.versaoNumero})` : "ainda não publicada" },
    { pronta: e.ligado, titulo: "O agente", diz: e.ligado ? "ligado" : "desligado" },
    { pronta: e.cerebroLigado, titulo: "A inteligência", diz: e.cerebroLigado ? "disponível — ele conversa" : "indisponível — ele responde seco" },
    { pronta: e.canalConfigurado, titulo: "O WhatsApp", diz: e.canalConfigurado ? "de pé" : "faltam chaves da Meta" },
    { pronta: e.envioLigado, titulo: "A entrega", diz: e.envioLigado ? "ligada — as respostas saem" : "desligada — as respostas ficam guardadas" },
  ];

  return (
    <section className="mt-5 rounded-2xl border border-line bg-paper p-4">
      <h2 className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        As peças
      </h2>
      <ul className="mt-2.5 space-y-2">
        {linhas.map((l) => (
          <li key={l.titulo} className="flex items-start gap-2.5">
            <span
              aria-hidden
              className={`mt-[5px] h-2 w-2 shrink-0 rounded-full ${l.pronta ? "bg-emerald-500" : "bg-line2"}`}
            />
            <p className="text-[13.5px] leading-snug text-ink">
              <strong className="font-medium">{l.titulo}</strong> — {l.diz}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Cartao({
  tom, titulo, children,
}: {
  tom: "bom" | "parado" | "atencao";
  titulo: string;
  children: React.ReactNode;
}) {
  const borda = {
    bom: "border-emerald-500/40 bg-emerald-500/[.06]",
    parado: "border-line2 bg-canvas",
    atencao: "border-amber-500/50 bg-amber-500/[.07]",
  }[tom];

  return (
    <section className={`rounded-2xl border p-4 sm:p-5 ${borda}`}>
      <h2 className="text-[15px] font-semibold leading-snug tracking-[-.01em] text-ink">{titulo}</h2>
      <div className="mt-1.5 max-w-[64ch] text-[13.5px] leading-relaxed text-ink2">{children}</div>
    </section>
  );
}
