"use client";

/**
 * O ENSAIO DO TA — ver o vendedor de IA trabalhando, sem ele falar com ninguém.
 *
 * ── O QUE ESTA TELA MOSTRA QUE UM CHAT NÃO MOSTRARIA ────────────────────────
 *
 * Um chat bonito provaria que ele responde. O que precisa ser visto antes de
 * ligar é outra coisa: **em que ele se apoiou**. Por isso cada resposta vem com
 * a origem colada — qual item da base de verdade sustentou a frase — e com o
 * motivo pelo qual ela saiu assim.
 *
 * Quando `apoiadoEm` está vazio e ele mesmo assim afirmou algo, isso é um
 * defeito visível na tela. É esse o exame.
 *
 * ── ⛔ NADA AQUI SAI ────────────────────────────────────────────────────────
 *
 * A rota não escreve, não grava e não chama o canal. Fechar esta aba apaga o
 * ensaio inteiro — é de propósito: ensaio que vira histórico acaba confundido
 * com conversa de verdade três semanas depois.
 */

import { useState } from "react";

/** Os turnos anteriores, no formato que o servidor entende. */
function paraOServidor(linhas: Linha[]): Array<{ deQuem: "cliente" | "ta"; texto: string }> {
  return linhas.map((l) =>
    l.de === "lead"
      ? { deQuem: "cliente" as const, texto: l.texto }
      : { deQuem: "ta" as const, texto: l.r.texto },
  );
}

interface RespostaDoTA {
  texto: string;
  apoiadoEm: Array<{ id: string; fonte: string }>;
  perguntouIndice: number | null;
  handoff: { deve: boolean; motivo: string | null };
  porque: string;
  /** De onde veio o texto: o modelo, o modelo depois de corrigido, ou o chão. */
  origem: "modelo" | "modelo-na-segunda" | "chao-deterministico" | "handoff-deterministico";
  /** O que o verificador reprovou no caminho. Vazio no caminho feliz. */
  reprovacoes: Array<{ motivos: string[]; detalhe: string }>;
}

interface Ficha {
  identidade: string;
  proibidos: string[];
  perguntas: string[];
}

type Linha =
  | { de: "lead"; texto: string }
  | { de: "ta"; r: RespostaDoTA };

/**
 * As perguntas que aparecem numa venda de verdade — e três armadilhas.
 *
 * "Vocês trabalham com iFood?" e "em quanto tempo fico no ar?" estão aqui de
 * propósito: são as duas em que um modelo solto mente com mais naturalidade, e
 * é nelas que o ensaio precisa ser olhado com mais atenção.
 */
const SUGESTOES = [
  "Oi, vi o site de vocês",
  "Quanto custa o plano Crescimento?",
  "Como funciona o pagamento por Pix?",
  "Vocês trabalham com iFood?",
  "Em quanto tempo eu fico no ar?",
  "Consegue fazer um desconto?",
  "Quero falar com uma pessoa",
];

export function EnsaioClient() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [texto, setTexto] = useState("");
  const [nome, setNome] = useState("Marcos");
  const [jaPerguntou, setJaPerguntou] = useState<number[]>([]);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [pensando, setPensando] = useState(false);
  const [cerebroLigado, setCerebroLigado] = useState<boolean | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(mensagem: string) {
    if (!mensagem.trim() || pensando) return;

    setLinhas((L) => [...L, { de: "lead", texto: mensagem }]);
    setTexto("");
    setPensando(true);
    setErro(null);

    try {
      const res = await fetch("/api/admin/sala-de-vendas/ensaio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // O histórico vai junto: sem ele o TA cumprimenta a mesma pessoa a cada
        // turno e responde como se fosse a primeira mensagem do dia. É a
        // diferença entre ensaiar uma CONVERSA e ensaiar respostas soltas.
        body: JSON.stringify({ mensagem, nome, jaPerguntou, historico: paraOServidor(linhas) }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        data?: { resposta: RespostaDoTA; ficha: Ficha; cerebroLigado?: boolean };
        error?: string;
      };

      if (!j.ok || !j.data) {
        setErro(j.error ?? "Não foi possível ensaiar agora.");
        return;
      }

      setFicha(j.data.ficha);
      setCerebroLigado(j.data.cerebroLigado ?? null);
      setLinhas((L) => [...L, { de: "ta", r: j.data!.resposta }]);

      // A sondagem só anda quando ele de fato perguntou. Marcar antes faria a
      // próxima resposta pular uma pergunta que ninguém fez.
      if (j.data.resposta.perguntouIndice !== null) {
        setJaPerguntou((p) => [...p, j.data!.resposta.perguntouIndice!]);
      }
    } catch {
      setErro("Sem resposta do servidor.");
    } finally {
      setPensando(false);
    }
  }

  function recomecar() {
    setLinhas([]);
    setJaPerguntou([]);
    setErro(null);
  }

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl">
        <header className="mb-5">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">
              Ensaio do TA
            </h1>
            <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11.5px] font-semibold uppercase tracking-wide text-amber-800">
              não envia nada
            </span>
          </div>
          <p className="mt-1 max-w-[68ch] text-[13.5px] leading-relaxed text-muted">
            Escreva como se você fosse o dono do restaurante. O TA responde aqui,
            e ao lado de cada resposta aparece <strong className="text-ink2">em
            que ele se apoiou</strong> — é isso que precisa ser examinado antes de
            ligá-lo, não se ele fala bonito.
          </p>
        </header>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-[12.5px] text-muted" htmlFor="nome-do-lead">
            O lead se chama
          </label>
          <input
            id="nome-do-lead"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            className="w-36 rounded-lg border border-line bg-paper px-2 py-1 text-[13px] text-ink"
          />
          {linhas.length > 0 && (
            <button
              onClick={recomecar}
              className="ml-auto rounded-lg border border-line px-2.5 py-1 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-paper"
            >
              Recomeçar
            </button>
          )}
        </div>

        {/* ── A conversa ───────────────────────────────────────────────── */}
        <div className="mb-4 flex flex-col gap-3">
          {linhas.length === 0 && (
            <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-[13px] text-muted">
              Comece por uma das frases abaixo, ou escreva a sua.
            </p>
          )}

          {linhas.map((l, i) =>
            l.de === "lead" ? (
              <div key={i} className="self-end max-w-[85%]">
                <p className="rounded-2xl rounded-br-sm bg-ink px-3.5 py-2 text-[13.5px] leading-relaxed text-paper">
                  {l.texto}
                </p>
              </div>
            ) : (
              <div key={i} className="self-start w-full max-w-[92%]">
                <p className="rounded-2xl rounded-bl-sm border border-line bg-paper px-3.5 py-2 text-[13.5px] leading-relaxed text-ink">
                  {l.r.texto}
                </p>

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-1">
                  {/* De onde veio o TEXTO. É a primeira coisa a olhar: uma sala
                      inteira de respostas "chão" quer dizer que o modelo está
                      fora do ar ou sendo reprovado, e a conversa está dura por
                      um motivo que não é o prompt. */}
                  <Origem origem={l.r.origem} />

                  {/* ⭐ O que o verificador BARROU antes de a resposta existir.
                      É a informação mais valiosa desta tela: mostra o que o
                      modelo tentou dizer e não pôde. Um ensaio sem isto parece
                      um chat bonito; com isto, é auditoria. */}
                  {(l.r.reprovacoes ?? []).map((v, k) => (
                    <span
                      key={k}
                      className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-800"
                      title={v.detalhe}
                    >
                      barrado: {v.motivos.join(", ")}
                    </span>
                  ))}

                  {l.r.apoiadoEm.length > 0 ? (
                    l.r.apoiadoEm.map((a) => (
                      <span
                        key={a.id}
                        className="rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800"
                        title={`fonte: ${a.fonte}`}
                      >
                        {a.id}
                      </span>
                    ))
                  ) : (
                    <span className="rounded border border-line bg-canvas px-1.5 py-0.5 text-[11px] text-muted">
                      sem afirmação
                    </span>
                  )}

                  {l.r.handoff.deve && (
                    <span className="rounded border border-sky-200 bg-sky-50 px-1.5 py-0.5 text-[11px] font-semibold text-sky-800">
                      chama gente · {l.r.handoff.motivo}
                    </span>
                  )}

                  <span className="text-[11px] text-muted">{l.r.porque}</span>
                </div>
              </div>
            ),
          )}

          {pensando && <p className="pl-1 text-[12.5px] text-muted">o TA está montando…</p>}
          {erro && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
              {erro}
            </p>
          )}
        </div>

        {/* ── O que dizer ──────────────────────────────────────────────── */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          {SUGESTOES.map((s) => (
            <button
              key={s}
              onClick={() => enviar(s)}
              disabled={pensando}
              className="rounded-full border border-line bg-paper px-2.5 py-1 text-[12px] text-ink2 transition-colors hover:bg-canvas disabled:opacity-50"
            >
              {s}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void enviar(texto);
          }}
          className="flex gap-2"
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva como o dono do restaurante escreveria…"
            className="min-w-0 flex-1 rounded-xl border border-line bg-paper px-3 py-2 text-[13.5px] text-ink placeholder:text-muted"
          />
          <button
            type="submit"
            disabled={pensando || !texto.trim()}
            className="rounded-xl bg-brand-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
          >
            Enviar
          </button>
        </form>

        {/* ── Contra o que ele foi conferido ───────────────────────────── */}
        {ficha && (
          <section className="mt-6 rounded-xl border border-line bg-paper p-4">
            <h2 className="text-[13px] font-semibold uppercase tracking-wide text-ink2">
              O que ele nunca pode dizer
            </h2>
            <p className="mt-1 max-w-[68ch] text-[12.5px] leading-relaxed text-muted">
              Esta lista não é conselho: é a ficha publicada dele. Se você vir
              qualquer uma acontecendo na conversa acima, é defeito — e é para
              isso que este ensaio existe.
            </p>
            <ul className="mt-2 grid gap-1 sm:grid-cols-2">
              {ficha.proibidos.map((p) => (
                <li key={p} className="flex gap-1.5 text-[12.5px] text-ink2">
                  <span className="text-red-600">✕</span>
                  {p}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

/**
 * De onde veio o texto desta resposta.
 *
 * As quatro origens contam coisas diferentes, e a diferença é o que se examina
 * num ensaio:
 *
 *   · **modelo** — o caminho normal: ele redigiu e o verificador aprovou.
 *   · **corrigido** — ele errou, foi avisado do motivo e consertou. Saudável em
 *     pequena quantidade; muitos seguidos é sinal de que o contexto está ruim.
 *   · **chão** — o modelo falhou ou foi reprovado duas vezes, e saiu a resposta
 *     determinística. O TA não mentiu e também não conversou.
 *   · **chama gente** — nem foi ao modelo: o gatilho de handoff resolveu antes,
 *     em código, e é assim que tem que ser.
 */
function Origem({ origem }: { origem: RespostaDoTA["origem"] }) {
  const mapa = {
    "modelo": { rotulo: "modelo", cor: "border-line2 bg-canvas text-muted" },
    "modelo-na-segunda": { rotulo: "corrigido", cor: "border-amber-200 bg-amber-50 text-amber-800" },
    "chao-deterministico": { rotulo: "chão", cor: "border-line2 bg-chip text-ink2" },
    "handoff-deterministico": { rotulo: "chama gente", cor: "border-sky-200 bg-sky-50 text-sky-800" },
  } as const;

  // `origem` pode faltar numa resposta antiga em cache do navegador — e uma tela
  // de auditoria que quebra por causa disso é pior que uma etiqueta a menos.
  const e = mapa[origem] ?? { rotulo: String(origem ?? "?"), cor: "border-line2 bg-canvas text-muted" };

  return (
    <span className={`rounded border px-1.5 py-0.5 text-[11px] font-medium ${e.cor}`}>
      {e.rotulo}
    </span>
  );
}
