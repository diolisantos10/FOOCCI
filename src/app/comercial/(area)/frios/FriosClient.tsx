"use client";

/**
 * O CADASTRO FRIO — a planilha do Google Drive, dentro da Sala.
 *
 * ── AS DUAS ENTRADAS, E POR QUE SÃO DUAS ────────────────────────────────────
 *
 *   · **Colar lista** é o caso principal, e é ele que aposenta a planilha:
 *     seleciona no Google Sheets, copia, cola, escolhe a origem, envia.
 *   · **Um a um** é a conversa de corredor — o dono do bar que passou o número
 *     agora. Obrigar essa pessoa a montar uma planilha de uma linha faria o
 *     contato ser anotado no papel, que é onde ele morre.
 *
 * As duas caem na MESMA rota e no mesmo leitor. Nada aqui decide o que é lead.
 *
 * ── ⚠️ O QUE ESTA TELA NÃO DECIDE ───────────────────────────────────────────
 *
 * Ela não valida telefone, não confere duplicata e não sabe quais origens
 * existem — a lista do seletor vem da rota que a valida. Um seletor montado
 * aqui divergiria da regra do servidor no primeiro ajuste, e a divergência
 * apareceria como "escolhi e não funciona".
 *
 * O que ela faz é MOSTRAR o resultado inteiro: quantos entraram, quantos já
 * estavam e cada linha recusada com o número e o motivo. Uma tela que só
 * dissesse "pronto" deixaria oito linhas sumidas em vinte sem explicação — e
 * quem cola a lista voltaria à planilha, que era o problema.
 *
 * ── ⛔ CADASTRAR É CADASTRAR ────────────────────────────────────────────────
 *
 * Nada aqui envia mensagem. O contato entra na base e passa a existir para a
 * fila; quem fala com ele é o atendimento, com as regras de lá.
 */

import { useEffect, useState } from "react";

const ROTA_FRIOS = "/api/admin/sala-de-vendas/frios";

interface Origem {
  valor: string;
  rotulo: string;
}

interface LinhaRecusada {
  numero: number;
  texto: string;
  motivo: string;
}

interface Opcoes {
  origens: Origem[];
  ordemDasColunas: string[];
}

interface Resultado {
  criados: number;
  jaExistiam: number;
  recusadas: LinhaRecusada[];
}

type Estado =
  | { fase: "carregando" }
  | { fase: "pronto"; opcoes: Opcoes }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string };

type Modo = "colar" | "umAUm";

const CAMPOS_VAZIOS = { nome: "", whatsapp: "", estabelecimento: "", cidade: "" };

export function FriosClient() {
  const [estado, setEstado] = useState<Estado>({ fase: "carregando" });

  const [modo, setModo] = useState<Modo>("colar");
  const [origem, setOrigem] = useState("");
  const [descricaoDaOrigem, setDescricaoDaOrigem] = useState("");
  const [texto, setTexto] = useState("");
  const [campos, setCampos] = useState(CAMPOS_VAZIOS);

  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<{ mensagem: string; recusadas: LinhaRecusada[] } | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const res = await fetch(ROTA_FRIOS, { cache: "no-store" });
        if (!vivo) return;

        if (res.status === 401 || res.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }

        const j = (await res.json()) as { ok: boolean; data?: Opcoes; error?: string };
        if (!vivo) return;

        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? "resposta inesperada" });
          return;
        }
        setEstado({ fase: "pronto", opcoes: j.data });
      } catch (e) {
        if (vivo) {
          setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : "falha de rede" });
        }
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  async function cadastrar() {
    if (enviando) return;
    setEnviando(true);
    setErro(null);
    setResultado(null);

    try {
      const res = await fetch(ROTA_FRIOS, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // ⚠️ Nenhum campo de autor viaja daqui. Quem assina o cadastro é a
        // sessão, no servidor — mandar um nome no corpo seria forjar assinatura,
        // e a rota ignora de qualquer jeito.
        body: JSON.stringify(
          modo === "colar"
            ? { texto, origem, descricaoDaOrigem }
            : { campos, origem, descricaoDaOrigem },
        ),
      });

      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        data?: Resultado;
        error?: string;
        recusadas?: LinhaRecusada[];
      };

      if (!res.ok || !j.ok || !j.data) {
        setErro({
          mensagem: j.error ?? `Não foi possível cadastrar (HTTP ${res.status}).`,
          recusadas: j.recusadas ?? [],
        });
        return;
      }

      setResultado(j.data);

      // O que foi aceito some do campo; o que foi recusado FICA, para a pessoa
      // corrigir onde está em vez de voltar para a planilha e procurar a linha.
      if (j.data.recusadas.length === 0) {
        if (modo === "colar") setTexto("");
        else setCampos(CAMPOS_VAZIOS);
      }
    } catch (e) {
      setErro({
        mensagem: e instanceof Error ? e.message : "Falha de rede.",
        recusadas: [],
      });
    } finally {
      setEnviando(false);
    }
  }

  if (estado.fase === "carregando") {
    return <p className="p-6 text-[13px] text-muted">Carregando…</p>;
  }

  if (estado.fase === "semAcesso") {
    return (
      <p className="p-6 text-[13px] leading-relaxed text-muted">
        Sem acesso. É preciso um login da Sala para cadastrar contatos.
      </p>
    );
  }

  if (estado.fase === "erro") {
    return (
      <p className="p-6 text-[13px] leading-relaxed text-ink2">
        Não foi possível abrir esta tela: {estado.detalhe}
      </p>
    );
  }

  const { origens, ordemDasColunas } = estado.opcoes;
  const precisaDescrever = origem === "OUTRO";
  const temOrigem = origem !== "" && (!precisaDescrever || descricaoDaOrigem.trim() !== "");
  // Basta ter começado a preencher. O que FALTA é o servidor que diz, com o
  // nome do campo — travar o botão até o formulário estar completo esconderia
  // justamente a frase que ensina o que estava errado.
  const temConteudo =
    modo === "colar"
      ? texto.trim() !== ""
      : campos.nome.trim() !== "" || campos.whatsapp.trim() !== "";

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-2xl">
        <header className="mb-5">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">Cadastro frio</h1>
          <p className="mt-1 max-w-[62ch] text-[13.5px] leading-relaxed text-muted">
            Contatos que ainda não pediram para falar com a gente. Cole a lista da
            planilha ou digite um por vez — os dois entram na base e passam a
            aparecer nas filas.
          </p>
        </header>

        {/* ── 1. DE ONDE VIERAM ────────────────────────────────────────────
            Primeiro, e sozinho no cartão: é a única pergunta desta tela que não
            tem resposta padrão, e é a que faz o cadastro valer depois. */}
        <Cartao titulo="De onde vieram">
          <label className="block">
            <span className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
              Origem
            </span>
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-line2 bg-paper px-2.5 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-brand-400"
            >
              <option value="">Escolha a origem…</option>
              {origens.map((o) => (
                <option key={o.valor} value={o.valor}>
                  {o.rotulo}
                </option>
              ))}
            </select>
          </label>

          <p className="mt-2 text-[12.5px] leading-relaxed text-ink2">
            A origem fica registrada porque é ela que diz como a gente pode falar
            com essa pessoa depois.
          </p>

          {/* O campo só aparece quando "Outro" é escolhido — e aí ele é
              obrigatório. "Outro" em branco seria o mesmo que não perguntar, e
              quem recusa é a rota; aqui é só o aviso chegar antes do envio. */}
          {precisaDescrever && (
            <label className="mt-3 block">
              <span className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                Descreva de onde vieram
              </span>
              <input
                type="text"
                value={descricaoDaOrigem}
                onChange={(e) => setDescricaoDaOrigem(e.target.value)}
                placeholder="ex.: grupo de donos de bar no WhatsApp"
                className="mt-0.5 w-full rounded-xl border border-line2 bg-paper px-2.5 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-brand-400"
              />
              <span className="mt-1 block text-[12px] leading-relaxed text-muted">
                Uma linha basta. Sem ela o cadastro não sai.
              </span>
            </label>
          )}
        </Cartao>

        {/* ── 2. COMO VOCÊ VAI CADASTRAR ───────────────────────────────── */}
        <div className="mb-4 flex gap-1.5">
          <BotaoDeModo atual={modo} valor="colar" aoTrocar={setModo}>
            Colar lista
          </BotaoDeModo>
          <BotaoDeModo atual={modo} valor="umAUm" aoTrocar={setModo}>
            Um a um
          </BotaoDeModo>
        </div>

        {modo === "colar" ? (
          <Cartao titulo="Colar da planilha">
            <p className="mb-2 text-[12.5px] leading-relaxed text-ink2">
              Uma pessoa por linha, nesta ordem:{" "}
              <span className="font-semibold text-ink">{ordemDasColunas.join(" · ")}</span>.
              Coluna a mais é ignorada; estabelecimento e cidade podem ficar em branco.
            </p>
            <textarea
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={10}
              placeholder={
                "Ana Paula\t11 98888-7777\tBar do Zé\tSão Paulo\n" +
                "Bia Ramos\t21 97777-6666\tCantina da Bia\tRio de Janeiro"
              }
              className="w-full resize-y rounded-xl border border-line2 bg-paper px-3 py-2 font-mono text-[12.5px] leading-relaxed text-ink outline-none transition-colors focus:border-brand-400"
            />
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted">
              Colar de novo a mesma lista é seguro: quem já está na base não é
              cadastrado duas vezes.
            </p>
          </Cartao>
        ) : (
          <Cartao titulo="Um contato">
            <Campo
              rotulo="Nome"
              value={campos.nome}
              onChange={(v) => setCampos((c) => ({ ...c, nome: v }))}
            />
            <Campo
              rotulo="WhatsApp"
              value={campos.whatsapp}
              onChange={(v) => setCampos((c) => ({ ...c, whatsapp: v }))}
              dica="Com DDD — ex.: (11) 98765-4321."
            />
            <Campo
              rotulo="Estabelecimento (opcional)"
              value={campos.estabelecimento}
              onChange={(v) => setCampos((c) => ({ ...c, estabelecimento: v }))}
            />
            <Campo
              rotulo="Cidade (opcional)"
              value={campos.cidade}
              onChange={(v) => setCampos((c) => ({ ...c, cidade: v }))}
            />
          </Cartao>
        )}

        <button
          onClick={cadastrar}
          // O botão trava sem origem e sem conteúdo, mas quem RECUSA é a rota.
          // `disabled` é conveniência de tela: a trava não pode morar num
          // atributo que qualquer um remove pelo navegador.
          disabled={enviando || !temOrigem || !temConteudo}
          className="w-full rounded-xl bg-brand-500 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600 disabled:opacity-40 disabled:shadow-none"
        >
          {enviando ? "Cadastrando…" : modo === "colar" ? "Cadastrar a lista" : "Cadastrar contato"}
        </button>

        {!temOrigem && (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            Escolha a origem para liberar o cadastro.
          </p>
        )}

        {erro && <BlocoDeErro erro={erro} />}
        {resultado && <BlocoDoResultado r={resultado} />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// O RESULTADO
// ═══════════════════════════════════════════════════════════════════════════

/**
 * A conta inteira, e não só "pronto".
 *
 * ── AS TRÊS PARCELAS, E POR QUE NENHUMA PODE SUMIR ──────────────────────────
 *
 *   · **entraram** — o trabalho novo;
 *   · **já estavam aqui** — NÃO é erro, e dizer isso em voz alta é o que dá
 *     coragem de recolar a lista amanhã sem medo de dobrar a base;
 *   · **recusadas** — com o número da linha, senão "8 recusadas de 20" manda a
 *     pessoa reler a planilha inteira para achar quais.
 */
function BlocoDoResultado({ r }: { r: Resultado }) {
  const nadaNovo = r.criados === 0 && r.jaExistiam > 0;

  return (
    <section className="mt-4 rounded-2xl border border-line bg-paper p-4">
      <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        O que aconteceu
      </h2>

      <div className="flex flex-wrap gap-4">
        <Numero valor={r.criados} rotulo="entraram na base" destaque />
        <Numero valor={r.jaExistiam} rotulo="já estavam aqui" />
        <Numero valor={r.recusadas.length} rotulo="não deu para aproveitar" />
      </div>

      {nadaNovo && (
        <p className="mt-3 rounded-xl bg-canvas px-3 py-2 text-[12.5px] leading-relaxed text-ink2">
          Nada novo entrou: todos os contatos desta lista já estavam na base. Não é
          erro — é a mesma lista chegando de novo, e nada foi duplicado.
        </p>
      )}

      {r.recusadas.length > 0 && <ListaDeRecusas recusadas={r.recusadas} />}
    </section>
  );
}

function BlocoDeErro({
  erro,
}: {
  erro: { mensagem: string; recusadas: LinhaRecusada[] };
}) {
  return (
    <section
      role="status"
      className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4"
    >
      <p className="text-[13px] font-semibold leading-relaxed text-amber-900">
        {erro.mensagem}
      </p>
      {erro.recusadas.length > 0 && <ListaDeRecusas recusadas={erro.recusadas} />}
    </section>
  );
}

function ListaDeRecusas({ recusadas }: { recusadas: LinhaRecusada[] }) {
  return (
    <ol className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
      {recusadas.map((l) => (
        <li key={l.numero} className="border-l-2 border-line2 pl-2.5">
          <p className="text-[12.5px] font-semibold text-ink">
            Linha {l.numero} — {l.motivo}
          </p>
          {/* O texto original, do jeito que foi colado: é por ele que a pessoa
              acha a linha na planilha de onde copiou. */}
          <p className="mt-0.5 break-words font-mono text-[11.5px] leading-relaxed text-muted">
            {l.texto}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Numero({
  valor,
  rotulo,
  destaque,
}: {
  valor: number;
  rotulo: string;
  destaque?: boolean;
}) {
  return (
    <div>
      <p
        className={`text-2xl font-semibold tabular-nums ${destaque ? "text-brand-600" : "text-ink"}`}
      >
        {valor}
      </p>
      <p className="text-[12px] text-muted">{rotulo}</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Peças
// ═══════════════════════════════════════════════════════════════════════════

function Cartao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl border border-line bg-paper p-4">
      <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function BotaoDeModo({
  atual,
  valor,
  aoTrocar,
  children,
}: {
  atual: Modo;
  valor: Modo;
  aoTrocar: (m: Modo) => void;
  children: React.ReactNode;
}) {
  const ativo = atual === valor;
  return (
    <button
      onClick={() => aoTrocar(valor)}
      className={`rounded-xl border px-3.5 py-2 text-[13px] font-semibold transition-colors ${
        ativo
          ? "border-brand-500 bg-brand-50 text-brand-700"
          : "border-line2 bg-paper text-ink2 hover:bg-canvas"
      }`}
    >
      {children}
    </button>
  );
}

function Campo({
  rotulo,
  value,
  onChange,
  dica,
}: {
  rotulo: string;
  value: string;
  onChange: (v: string) => void;
  dica?: string;
}) {
  return (
    <label className="mb-2.5 block">
      <span className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {rotulo}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 w-full rounded-xl border border-line2 bg-paper px-2.5 py-2 text-[13.5px] text-ink outline-none transition-colors focus:border-brand-400"
      />
      {dica && <span className="mt-1 block text-[12px] text-muted">{dica}</span>}
    </label>
  );
}
