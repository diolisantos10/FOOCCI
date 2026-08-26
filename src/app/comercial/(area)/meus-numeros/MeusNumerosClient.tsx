"use client";

/**
 * OS MEUS NÚMEROS — a tela.
 *
 * ── O QUE ELA MOSTRA, E EM QUE ORDEM ────────────────────────────────────────
 *
 * A ordem não é decorativa: é a ordem em que a pessoa deve agir. Primeiro o que
 * está esperando resposta AGORA, depois o que está apodrecendo, e só então o
 * total e o que ela já fez hoje.
 *
 * Um painel que abre com "3 clientes, 8 respostas hoje" começa por elogiar. Este
 * abre pelo que ainda dói — e os números de conforto vêm depois, quando já se
 * sabe o tamanho do problema.
 *
 * ── ⚠️ POR QUE OS NÚMEROS RUINS NÃO FICAM VERMELHOS QUANDO SÃO ZERO ─────────
 *
 * Zero esperando resposta é a coisa certa acontecendo. Pintar o cartão de
 * vermelho porque o rótulo dele fala de problema treina a pessoa a ignorar a
 * cor — e no dia em que houver doze, a cor não vai significar nada.
 */

import { useEffect, useState } from "react";
import { ROTAS } from "@/lib/sala/rotas";
import type { MeusNumeros } from "@/services/salaDeVendas/meusNumeros";

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; n: MeusNumeros }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string };

export function MeusNumerosClient() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/sala-de-vendas/meus-numeros", { cache: "no-store" });
        if (res.status === 401 || res.status === 403) {
          if (vivo) setEstado({ fase: "semAcesso" });
          return;
        }
        const j = (await res.json()) as { ok: boolean; data?: MeusNumeros; error?: string };
        if (!vivo) return;
        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? "resposta inesperada" });
          return;
        }
        setEstado({ fase: "pronto", n: j.data });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : "falha de rede" });
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">
            {estado.fase === "pronto" ? `Os números de ${estado.n.nome}` : "Os meus números"}
          </h1>
          <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
            Só os seus. O que aparece aqui é o que está sob a sua responsabilidade —
            a carteira dos colegas não entra nesta conta.
          </p>
        </header>

        {estado.fase === "carregando" && (
          <p className="text-[13px] text-muted">Carregando…</p>
        )}

        {estado.fase === "semAcesso" && (
          <div className="rounded-2xl border border-line2 bg-paper px-5 py-6">
            <h3 className="text-[15px] font-semibold text-ink">Entre com o seu login</h3>
            <p className="mt-1.5 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">
              Estes números são de uma pessoa, e a senha da casa não tem nome.
            </p>
          </div>
        )}

        {estado.fase === "erro" && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-[13.5px] font-semibold text-red-800">Não consegui carregar</p>
            <p className="mt-0.5 text-[13px] text-red-700">{estado.detalhe}</p>
          </div>
        )}

        {estado.fase === "pronto" && <Numeros n={estado.n} />}
      </div>
    </div>
  );
}

function Numeros({ n }: { n: MeusNumeros }) {
  return (
    <>
      {/* Primeiro o que exige ação hoje. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Cartao
          rotulo="Esperando você responder"
          valor={n.esperandoMinhaResposta}
          nota={
            n.esperandoMinhaResposta > 0
              ? "o cliente falou e ainda não voltou resposta"
              : "ninguém esperando — está em dia"
          }
          alarme={n.esperandoMinhaResposta > 0}
          href={ROTAS.conversas}
        />
        <Cartao
          rotulo="Parados há dias"
          valor={n.esquecidos}
          nota={
            n.horasDoMaisParado === null
              ? n.meusClientes === 0
                ? "você ainda não tem cliente"
                : "sem data de contato para comparar"
              : `o mais parado está há ${emPortugues(n.horasDoMaisParado)} sem contato`
          }
          alarme={n.esquecidos > 0}
          href={ROTAS.filas}
        />
      </div>

      {/* Depois o retrato, que não pede nada. */}
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Cartao rotulo="Seus clientes" valor={n.meusClientes} nota="sob a sua responsabilidade" />
        <Cartao rotulo="Você respondeu hoje" valor={n.respondiHoje} nota="mensagens que você mandou" />
        <Cartao
          rotulo="Livres na fila"
          valor={n.livresNaFila}
          nota="ainda sem dono — dá para pegar"
          href={ROTAS.filas}
        />
      </div>

      <p className="mt-4 max-w-[62ch] text-[12.5px] leading-relaxed text-muted">
        “Livres na fila” é o único número aqui que não é seu: é o que está esperando
        alguém pegar. Os outros cinco contam só o que está no seu nome.
      </p>
    </>
  );
}

function Cartao({
  rotulo,
  valor,
  nota,
  alarme = false,
  href,
}: {
  rotulo: string;
  valor: number;
  nota: string;
  alarme?: boolean;
  href?: string;
}) {
  const corpo = (
    <>
      <p className="text-[12.5px] font-semibold uppercase tracking-wide text-muted">{rotulo}</p>
      <p
        className={`mt-1 text-[30px] font-semibold leading-none tracking-[-.02em] ${
          alarme ? "text-amber-700" : "text-ink"
        }`}
      >
        {valor}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">{nota}</p>
    </>
  );

  const classe = `block rounded-xl border bg-paper px-4 py-3.5 ${
    alarme ? "border-amber-300" : "border-line"
  } ${href ? "transition-colors hover:bg-canvas" : ""}`;

  // O cartão vira link só quando há para onde ir. Um cartão clicável que não
  // leva a lugar nenhum é pior que um cartão parado.
  return href ? (
    <a href={href} className={classe}>
      {corpo}
    </a>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

/** Horas em português curto — o CEO não lê "72h". */
function emPortugues(horas: number): string {
  if (horas < 1) return "menos de uma hora";
  if (horas < 24) return `${horas} ${horas === 1 ? "hora" : "horas"}`;
  const dias = Math.round(horas / 24);
  return `${dias} ${dias === 1 ? "dia" : "dias"}`;
}
