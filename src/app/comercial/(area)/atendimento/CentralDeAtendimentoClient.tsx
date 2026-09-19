"use client";

/**
 * ⭐ A CENTRAL DE ATENDIMENTO — a MESA DE TRABALHO da tela 03 do CEO.
 *
 * ── O QUE MUDOU AQUI, E POR QUÊ ─────────────────────────────────────────────
 *
 * Este endereço era um **painel de supervisão** ("o que exige ação agora",
 * "carga por atendente", "fila do SDR"). A auditoria de 19/09/2026 mediu contra
 * o pixel e escreveu: *"o desenho não pede esta tela"* — `desenho-03` é uma
 * mesa de três colunas, com caixas de conversa, lista e a conversa aberta com
 * campo de digitar. A infidelidade era de PROPÓSITO, não de enfeite.
 *
 * A visão de cima não se perdeu: ela já existe, medida, em `/comercial/torre`
 * (tela 02, "a mais bem construída da área") e em `/comercial/painel`. Manter
 * uma terceira cópia dela aqui era o que fazia a Central duplicar a Torre e não
 * atender ao desenho.
 *
 * ── ⛔ O QUE ESTA TELA NÃO INVENTA ──────────────────────────────────────────
 *
 * O desenho traz gente e valores de exemplo (Ana Beatriz Santos, 12 conversas,
 * 62 no WhatsApp, seis frases prontas de venda). **Nada disso foi replicado.**
 * Cada número desta tela sai de uma consulta ao banco, com o escopo da sessão
 * no `where`; o que não tem fonte aparece dizendo que não tem — a caixa
 * "Pagamento pendente" e a aba "Respostas rápidas" são os dois casos, e ambos
 * carregam o motivo escrito.
 *
 * ── AS TRÊS COLUNAS, E O ORÇAMENTO DE LARGURA ───────────────────────────────
 *
 * A moldura come 230px de lateral antes desta tela começar. Num monitor de
 * 1280 sobram 1050, e é dentro deles que as três colunas cabem:
 *
 *     caixas 232 + lista 288 = 520   →   a conversa fica com ~530 ✓
 *
 * Abaixo de `lg` a tela mostra UM painel por vez, com navegação explícita — que
 * é como qualquer aplicativo de mensagem funciona e é o gesto que o vendedor já
 * tem no dedo.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { rotuloCurto } from "@/services/salaDeVendas/rotulosDaSala";
import type {
  CentralDeConversas,
  ConversaNaCaixa,
  NomeDaCaixa,
  NomeDoCanal,
} from "@/services/salaDeVendas/caixasDeConversa";
import { mudarResponsavel } from "../_dados";
import { useConversa, escrever, marcarLidas, moverEtapa } from "../conversas/_dados";
import { Bolha, AvisoDaJanela } from "../_conversa/Fio";
import {
  useCentralDeConversas,
  transferirConversa,
  marcarPrioridade,
  enviarModeloAprovado,
  quando,
  type EstadoDaCentral,
} from "./_dados";

function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}

type PainelVisivel = "caixas" | "lista" | "conversa";

/** O rótulo de canal que aparece na pílula da lista e no topo da conversa. */
const ROTULO_DO_CANAL: Record<NomeDoCanal, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  site: "Site",
  indicacao: "Indicação",
  outros: "Outros",
};

export function CentralDeAtendimentoClient({
  leadInicial = null,
}: {
  leadInicial?: string | null;
}) {
  const [caixa, setCaixa] = useState<NomeDaCaixa>("meusLeads");
  const [canal, setCanal] = useState<NomeDoCanal | null>(null);
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [ordem, setOrdem] = useState<"recentes" | "antigas">("recentes");
  const [leadId, setLeadId] = useState<string | null>(leadInicial);
  const [painel, setPainel] = useState<PainelVisivel>(leadInicial ? "conversa" : "lista");
  const [aviso, setAviso] = useState<string | null>(null);

  const { estado, recarregar } = useCentralDeConversas({
    caixa,
    canal,
    busca: buscaAplicada,
    ordem,
  });
  const { estado: estadoDaConversa, recarregar: recarregarConversa } = useConversa(leadId);

  // A busca é aplicada com um respiro. Sem isso, cada tecla vira uma consulta ao
  // banco com a base inteira no `where` — e a lista pisca a cada letra.
  useEffect(() => {
    const t = setTimeout(() => setBuscaAplicada(busca), 350);
    return () => clearTimeout(t);
  }, [busca]);

  useEffect(() => {
    if (!leadInicial) return;
    void marcarLidas(leadInicial).then(() => recarregar());
    // Só na entrada: recarregar a cada render seria um laço.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadInicial]);

  function abrir(id: string) {
    setLeadId(id);
    setPainel("conversa");
    void marcarLidas(id).then(() => recarregar());
  }

  const dados = estado.fase === "pronto" ? estado.dados : null;
  const conversaAberta = useMemo(
    () => dados?.conversas.find((c) => c.leadId === leadId) ?? null,
    [dados, leadId],
  );

  return (
    <div className="flex h-[calc(100vh-4rem)] min-h-0 flex-col bg-canvas">
      <header className="shrink-0 border-b border-line bg-paper px-4 py-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[17px] font-semibold tracking-[-.02em] text-ink">
              Central de Atendimento
            </h1>
            <p className="mt-0.5 text-[12.5px] leading-snug text-muted">
              Converse, atenda e converta mais vendas no WhatsApp.
            </p>
          </div>

          {/* O desenho tem "Todos os atendentes · Filtros · Abertas" aqui.
              Quem faz esse recorte, nesta tela, são as Caixas de Conversa e os
              Canais de Origem da coluna da esquerda — dois seletores que
              repetissem o mesmo filtro em lugares diferentes é como uma tela
              passa a mostrar dois números para a mesma pergunta. */}
          <label className="shrink-0">
            <span className="sr-only">Ordenar as conversas</span>
            <select
              value={ordem}
              onChange={(e) => setOrdem(e.target.value === "antigas" ? "antigas" : "recentes")}
              className="rounded-xl border border-line2 bg-paper px-3 py-2 text-[13px] font-medium text-ink outline-none transition-colors focus:border-brand-400"
            >
              <option value="recentes">Mais recentes</option>
              <option value="antigas">Mais antigas</option>
            </select>
          </label>
        </div>
      </header>

      {aviso && (
        <div
          role="status"
          className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900"
        >
          {aviso}
          <button
            onClick={() => setAviso(null)}
            className="ml-3 font-semibold underline underline-offset-2"
          >
            fechar
          </button>
        </div>
      )}

      {/* No celular e no tablet, um painel por vez. */}
      <nav className="flex shrink-0 gap-1 border-b border-line bg-paper px-2 py-1.5 lg:hidden">
        {(
          [
            ["caixas", "Caixas"],
            ["lista", "Conversas"],
            ["conversa", "A conversa"],
          ] as const
        ).map(([p, rotulo]) => (
          <button
            key={p}
            onClick={() => setPainel(p)}
            disabled={p === "conversa" && !leadId}
            className={cx(
              "min-w-0 flex-1 truncate rounded-lg px-1.5 py-1.5 text-[12px] font-semibold transition-colors",
              painel === p ? "bg-brand-500 text-white" : "text-ink2 hover:bg-canvas",
              p === "conversa" && !leadId && "opacity-40",
            )}
          >
            {rotulo}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1">
        {/* ── 1. CAIXAS DE CONVERSA + CANAIS DE ORIGEM ─────────────────── */}
        <aside
          className={cx(
            "w-full shrink-0 overflow-y-auto border-r border-line bg-paper lg:block lg:w-[232px]",
            painel === "caixas" ? "block" : "hidden",
          )}
        >
          <ColunaDeCaixas
            estado={estado}
            caixa={caixa}
            canal={canal}
            busca={busca}
            aoBuscar={setBusca}
            aoEscolherCaixa={(c) => {
              setCaixa(c);
              setPainel("lista");
            }}
            aoEscolherCanal={(c) => {
              setCanal(c);
              setPainel("lista");
            }}
            aoTentarDeNovo={recarregar}
          />
        </aside>

        {/* ── 2. AS CONVERSAS ──────────────────────────────────────────── */}
        <section
          className={cx(
            "w-full shrink-0 overflow-y-auto border-r border-line bg-paper lg:block lg:w-72",
            painel === "lista" ? "block" : "hidden",
          )}
        >
          <ColunaDeConversas
            estado={estado}
            selecionado={leadId}
            aoAbrir={abrir}
            aoTentarDeNovo={recarregar}
          />
        </section>

        {/* ── 3. A CONVERSA ────────────────────────────────────────────── */}
        <main
          className={cx(
            "min-w-0 flex-1 flex-col bg-canvas lg:flex",
            painel === "conversa" ? "flex w-full" : "hidden",
          )}
        >
          <PainelDaConversa
            estado={estadoDaConversa}
            resumo={conversaAberta}
            atendentes={dados?.atendentes ?? []}
            aoAvisar={setAviso}
            aoMudar={() => {
              recarregarConversa();
              recarregar();
            }}
          />
        </main>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. CAIXAS DE CONVERSA E CANAIS DE ORIGEM
// ═══════════════════════════════════════════════════════════════════════════

function ColunaDeCaixas({
  estado,
  caixa,
  canal,
  busca,
  aoBuscar,
  aoEscolherCaixa,
  aoEscolherCanal,
  aoTentarDeNovo,
}: {
  estado: EstadoDaCentral;
  caixa: NomeDaCaixa;
  canal: NomeDoCanal | null;
  busca: string;
  aoBuscar: (t: string) => void;
  aoEscolherCaixa: (c: NomeDaCaixa) => void;
  aoEscolherCanal: (c: NomeDoCanal | null) => void;
  aoTentarDeNovo: () => void;
}) {
  return (
    <div className="p-3">
      <label className="block">
        <span className="sr-only">Buscar conversas</span>
        <input
          type="search"
          value={busca}
          onChange={(e) => aoBuscar(e.target.value)}
          placeholder="Buscar conversas…"
          autoComplete="off"
          className="w-full rounded-xl border border-line2 bg-paper px-3 py-2 text-[13px] text-ink outline-none transition-colors placeholder:text-muted focus:border-brand-400"
        />
      </label>

      <h2 className="mb-1.5 mt-4 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        Caixas de Conversa
      </h2>

      {estado.fase === "carregando" && (
        <p className="text-[12.5px] text-muted">Contando as caixas…</p>
      )}

      {estado.fase === "semAcesso" && (
        <p className="text-[12.5px] leading-relaxed text-muted">
          Sem acesso. É preciso um login interno para abrir a Central.
        </p>
      )}

      {estado.fase === "erro" && (
        <div>
          <p className="text-[12.5px] leading-relaxed text-ink2">
            {estado.detalhe ?? "Não foi possível contar as caixas."}
          </p>
          {/* Nenhuma contagem é mostrada enquanto a consulta não voltar: uma
              coluna de zeros faria banco fora do ar parecer dia tranquilo. */}
          <button
            onClick={aoTentarDeNovo}
            className="mt-2 rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {estado.fase === "pronto" && (
        <>
          <ul>
            {estado.dados.caixas.map((c) => {
              const ativa = c.nome === caixa;
              return (
                <li key={c.nome}>
                  <button
                    onClick={() => aoEscolherCaixa(c.nome)}
                    title={c.pergunta}
                    className={cx(
                      "mb-0.5 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left transition-colors",
                      ativa ? "bg-brand-50 text-brand-700" : "text-ink2 hover:bg-canvas",
                    )}
                  >
                    <span className="min-w-0 break-words text-[13px] font-semibold leading-snug">
                      {c.titulo}
                    </span>
                    {/* ⛔ Caixa sem fonte NÃO mostra zero. Mostra um traço, e o
                        motivo aparece embaixo quando ela é a escolhida. */}
                    <span
                      className={cx(
                        "shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums",
                        c.total === null
                          ? "bg-chip text-muted"
                          : ativa
                            ? "bg-brand-500 text-white"
                            : "bg-chip text-muted",
                      )}
                      title={c.total === null ? "não medido" : undefined}
                    >
                      {c.total === null ? "—" : c.total}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <h2 className="mb-1.5 mt-5 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
            Canais de Origem
          </h2>

          <ul>
            <li>
              <button
                onClick={() => aoEscolherCanal(null)}
                className={cx(
                  "mb-0.5 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left text-[12.5px] font-semibold transition-colors",
                  canal === null ? "bg-brand-50 text-brand-700" : "text-ink2 hover:bg-canvas",
                )}
              >
                Todos os canais
              </button>
            </li>
            {estado.dados.canais.map((c) => (
              <li key={c.nome}>
                <button
                  onClick={() => aoEscolherCanal(canal === c.nome ? null : c.nome)}
                  className={cx(
                    "mb-0.5 flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors",
                    canal === c.nome ? "bg-brand-50 text-brand-700" : "text-ink2 hover:bg-canvas",
                  )}
                >
                  <span className="min-w-0 truncate text-[12.5px] font-semibold">{c.rotulo}</span>
                  <span className="shrink-0 rounded-full bg-chip px-2 py-0.5 text-[11.5px] font-semibold tabular-nums text-muted">
                    {c.total}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            As contagens são sobre quem <strong>tem mensagem registrada</strong> e está
            no seu escopo. Contato sem conversa fica na{" "}
            <Link
              href="/comercial/base-fria"
              className="font-semibold text-brand-600 underline underline-offset-2"
            >
              Base fria
            </Link>
            .
          </p>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. A LISTA DE CONVERSAS
// ═══════════════════════════════════════════════════════════════════════════

function ColunaDeConversas({
  estado,
  selecionado,
  aoAbrir,
  aoTentarDeNovo,
}: {
  estado: EstadoDaCentral;
  selecionado: string | null;
  aoAbrir: (id: string) => void;
  aoTentarDeNovo: () => void;
}) {
  if (estado.fase === "carregando") {
    return <p className="p-4 text-[13px] text-muted">Carregando as conversas…</p>;
  }

  if (estado.fase === "semAcesso") {
    return (
      <p className="p-4 text-[13px] leading-relaxed text-muted">
        Sem acesso a esta lista.
      </p>
    );
  }

  if (estado.fase === "erro") {
    return (
      <div className="p-4">
        <p className="text-[13px] leading-relaxed text-ink2">
          {estado.detalhe ?? "Não foi possível carregar as conversas."}
        </p>
        <button
          onClick={aoTentarDeNovo}
          className="mt-2 rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
        >
          Tentar de novo
        </button>
      </div>
    );
  }

  const { conversas, caixaMedida, porQueNaoMedida, caixas, caixa } = estado.dados;
  const titulo = caixas.find((c) => c.nome === caixa)?.titulo ?? "Conversas";

  return (
    <>
      <div className="sticky top-0 z-10 flex items-baseline justify-between gap-2 border-b border-line bg-paper px-3 py-2.5">
        <h2 className="truncate text-[13.5px] font-semibold text-ink">{titulo}</h2>
        <span className="shrink-0 text-[12px] tabular-nums text-muted">
          {caixaMedida ? conversas.length : "—"}
        </span>
      </div>

      {/* ⛔ Caixa sem fonte não devolve lista vazia calada: vazio mudo se lê como
          "não há ninguém", e aqui a verdade é "não sabemos contar isso". */}
      {!caixaMedida ? (
        <div className="p-4">
          <p className="text-[13px] font-semibold text-ink">Não medido</p>
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">{porQueNaoMedida}</p>
        </div>
      ) : conversas.length === 0 ? (
        <div className="p-4 text-[12.5px] leading-relaxed text-muted">
          <p className="font-semibold text-ink2">Nenhuma conversa nesta caixa.</p>
          <p className="mt-1">
            Aqui só aparece quem já trocou mensagem, dentro do seu escopo e do canal
            escolhido.
          </p>
        </div>
      ) : (
        <ul>
          {conversas.map((c) => (
            <LinhaDaConversa
              key={c.leadId}
              c={c}
              ativo={c.leadId === selecionado}
              aoAbrir={() => aoAbrir(c.leadId)}
            />
          ))}
        </ul>
      )}
    </>
  );
}

function LinhaDaConversa({
  c,
  ativo,
  aoAbrir,
}: {
  c: ConversaNaCaixa;
  ativo: boolean;
  aoAbrir: () => void;
}) {
  return (
    <li>
      <button
        onClick={aoAbrir}
        className={cx(
          "w-full border-b border-line px-3 py-2.5 text-left transition-colors",
          ativo ? "bg-brand-50" : "hover:bg-canvas",
        )}
      >
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate text-[13.5px] font-semibold text-ink">{c.nome}</span>
          <span className="shrink-0 text-[11px] text-muted">{quando(c.ultimaMensagemEm)}</span>
        </div>

        {/* A prévia é o espelho da última mensagem gravada. Quando não há
            espelho, a linha DIZ isso — reaproveitar o nome do restaurante no
            lugar da prévia faria a lista parecer cheia de conversa que não houve. */}
        <p className="mt-0.5 truncate text-[12.5px] text-ink2">
          {c.previa ?? <span className="italic text-muted">sem prévia gravada</span>}
        </p>

        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Etiqueta texto={rotuloCurto(c.stage)} />
          <Etiqueta texto={ROTULO_DO_CANAL[c.canal]} />
          {c.prioritario && (
            <Etiqueta texto="prioritário" tom="border-red-200 bg-red-50 text-red-700" />
          )}
          {c.naoLidas > 0 && (
            <span className="ml-auto shrink-0 rounded-full bg-red-500 px-1.5 py-0.5 text-[10.5px] font-semibold tabular-nums text-white">
              {c.naoLidas}
            </span>
          )}
        </div>
      </button>
    </li>
  );
}

function Etiqueta({ texto, tom }: { texto: string; tom?: string }) {
  return (
    <span
      className={cx(
        "rounded-full border px-1.5 py-0.5 text-[11px] font-semibold",
        tom ?? "border-line2 bg-chip text-ink2",
      )}
    >
      {texto}
    </span>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. A CONVERSA
// ═══════════════════════════════════════════════════════════════════════════

type AbaDoRodape = "rapidas" | "modelos" | "notas";

function PainelDaConversa({
  estado,
  resumo,
  atendentes,
  aoAvisar,
  aoMudar,
}: {
  estado: ReturnType<typeof useConversa>["estado"];
  resumo: ConversaNaCaixa | null;
  atendentes: Array<{ userId: string; nome: string }>;
  aoAvisar: (s: string | null) => void;
  aoMudar: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [aba, setAba] = useState<AbaDoRodape>("rapidas");
  const [enviando, setEnviando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [transferindo, setTransferindo] = useState(false);
  const [encerrando, setEncerrando] = useState(false);
  const [paraQuem, setParaQuem] = useState("");

  const leadDaVez = estado.fase === "pronto" ? estado.dados.lead.id : null;

  // Trocar de conversa limpa o rascunho e fecha os painéis de ação. Sem isto, o
  // texto preparado para um lead ficaria no campo do lead seguinte — e alguém
  // mandaria.
  useEffect(() => {
    setTexto("");
    setTransferindo(false);
    setEncerrando(false);
    setParaQuem("");
  }, [leadDaVez]);

  if (estado.fase === "vazio") {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <p className="max-w-[36ch] text-center text-[13.5px] leading-relaxed text-muted">
          Escolha uma conversa na lista para atender.
        </p>
      </div>
    );
  }

  if (estado.fase === "carregando") {
    return <p className="p-4 text-[13px] text-muted">Abrindo a conversa…</p>;
  }

  if (estado.fase === "semAcesso" || estado.fase === "erro") {
    return (
      <div className="p-4">
        <p className="text-[13.5px] leading-relaxed text-ink2">
          {estado.fase === "semAcesso"
            ? "Sem acesso a esta conversa."
            : (estado.detalhe ?? "Não foi possível abrir a conversa.")}
        </p>
      </div>
    );
  }

  const { lead, mensagens, janela, podeEscrever, avisoDoSilencio } = estado.dados;

  async function mandar() {
    const t = texto.trim();
    if (!t || enviando) return;

    setEnviando(true);
    const r = await escrever(lead.id, t, aba === "notas" ? "notaInterna" : undefined);
    setEnviando(false);

    if (r.ok) {
      setTexto("");
      // O aviso do envio desligado vem da ROTA: quem sabe se a mensagem saiu é
      // o servidor, nunca esta tela.
      aoAvisar(r.aviso ?? null);
      aoMudar();
      return;
    }
    aoAvisar(r.mensagem);
  }

  async function agir(fn: () => Promise<{ ok: boolean; mensagem?: string; aviso?: string }>) {
    if (ocupado) return;
    setOcupado(true);
    const r = await fn();
    setOcupado(false);
    if (!r.ok) {
      aoAvisar(r.mensagem ?? "Não foi possível concluir.");
      return;
    }
    aoAvisar(r.aviso ?? null);
    aoMudar();
  }

  return (
    <>
      {/* ── O CABEÇALHO DA CONVERSA ─────────────────────────────────────── */}
      <header className="shrink-0 border-b border-line bg-paper px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{lead.nome}</h2>
            <p className="truncate text-[12.5px] text-muted">
              {lead.whatsapp}
              {lead.restaurante ? ` · ${lead.restaurante}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              <Etiqueta texto={rotuloCurto(lead.stage)} />
              {resumo && <Etiqueta texto={ROTULO_DO_CANAL[resumo.canal]} />}
              <Etiqueta
                texto={lead.prioritario ? "prioritário" : "prioridade normal"}
                tom={
                  lead.prioritario
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-line2 bg-chip text-ink2"
                }
              />
            </div>
          </div>

          {/* ⭐ "Atribuir a mim" só aparece quando o lead NÃO está com uma
              pessoa. Um botão que não faz nada ensina a operação a contar com o
              que não existe (regra 3 de `00-MOLDURA-COMUM.md`). */}
          {lead.atendidoPor === "HUMANO" && lead.atendente ? (
            <Etiqueta texto={`com ${lead.atendente.nome}`} />
          ) : (
            <button
              onClick={() =>
                void agir(async () => {
                  const r = await mudarResponsavel({ acao: "assumir", leadId: lead.id });
                  return r.ok ? { ok: true } : { ok: false, mensagem: r.mensagem };
                })
              }
              disabled={ocupado}
              className="shrink-0 rounded-xl bg-brand-500 px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
            >
              Atribuir a mim
            </button>
          )}
        </div>

        {/* ── Transferir · Prioridade · Encerrar ───────────────────────── */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              setTransferindo((v) => !v);
              setEncerrando(false);
            }}
            className="rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
          >
            Transferir
          </button>
          <button
            onClick={() =>
              void agir(async () => {
                const r = await marcarPrioridade({
                  leadId: lead.id,
                  prioritario: !lead.prioritario,
                });
                return r.ok ? { ok: true } : { ok: false, mensagem: r.mensagem };
              })
            }
            disabled={ocupado}
            className="rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas disabled:opacity-50"
          >
            {lead.prioritario ? "Tirar prioridade" : "Prioridade"}
          </button>
          <button
            onClick={() => {
              setEncerrando((v) => !v);
              setTransferindo(false);
            }}
            className="rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
          >
            Encerrar
          </button>
        </div>

        {transferindo && (
          <div className="mt-2 rounded-xl border border-line2 bg-canvas p-2.5">
            {atendentes.length === 0 ? (
              /* Ninguém com disponibilidade cadastrada NÃO é "o time está
                 offline" — é "não há cadastro para ler". Ver `timeNoPainel`. */
              <p className="text-[12px] leading-relaxed text-muted">
                Não há outra pessoa com disponibilidade cadastrada para receber esta
                conversa. Isso <strong>não</strong> quer dizer que o time está fora:
                quer dizer que ninguém registrou disponibilidade.
              </p>
            ) : (
              <>
                <label className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                  Passar para
                </label>
                <select
                  value={paraQuem}
                  onChange={(e) => setParaQuem(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-line2 bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand-400"
                >
                  <option value="">Escolha uma pessoa…</option>
                  {atendentes.map((a) => (
                    <option key={a.userId} value={a.userId}>
                      {a.nome}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() =>
                    void agir(async () => {
                      const r = await transferirConversa({
                        leadId: lead.id,
                        paraUserId: paraQuem,
                      });
                      if (r.ok) {
                        setTransferindo(false);
                        setParaQuem("");
                      }
                      return r;
                    })
                  }
                  disabled={!paraQuem || ocupado}
                  className="mt-2 w-full rounded-xl bg-brand-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
                >
                  Transferir
                </button>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
                  Transferir exige ser o dono da conversa. A recusa, quando vier, diz o
                  motivo.
                </p>
              </>
            )}
          </div>
        )}

        {encerrando && (
          <div className="mt-2 rounded-xl border border-line2 bg-canvas p-2.5">
            <p className="text-[12px] leading-relaxed text-ink2">
              Encerrar é dizer <strong>como</strong> terminou. São dois fins
              diferentes, e um deles não pode ser registrado daqui.
            </p>
            <button
              onClick={() =>
                void agir(async () => {
                  const r = await moverEtapa({ leadId: lead.id, para: "GANHO" });
                  if (r.ok) setEncerrando(false);
                  return r;
                })
              }
              disabled={ocupado}
              className="mt-2 w-full rounded-xl border border-green-200 bg-green-50 px-3 py-1.5 text-[12.5px] font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-40"
            >
              Encerrar como fechado (ganho)
            </button>
            {/* ⛔ Perder exige motivo ESTRUTURADO — sem catálogo de motivo não
                há perda registrável, e um botão aqui mandaria sem motivo e
                receberia uma recusa que o vendedor não sabe resolver. */}
            {/* ⚠️ O link leva ao Funil e PARA ali: aquela tela ainda não abre
                num lead por endereço (`?leadId=` não é lido lá). Mandar o
                parâmetro mesmo assim faria a tela abrir em qualquer lugar e a
                pessoa achar que clicou errado. O texto diz o que fazer ao
                chegar. */}
            <Link
              href="/comercial/funil"
              className="mt-1.5 block w-full rounded-xl border border-line2 px-3 py-1.5 text-center text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-paper"
            >
              Encerrar como perdido — no Funil
            </Link>
            <p className="mt-1.5 text-[11px] leading-relaxed text-muted">
              Perder exige motivo estruturado, e o motivo mora no Funil — procure{" "}
              <strong className="font-semibold text-ink2">{lead.nome}</strong> por lá.
              “O que mais nos faz perder” é a pergunta que paga a próxima decisão de
              produto.
            </p>
          </div>
        )}

        {lead.motivoDoPedido && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12.5px] text-amber-900">
            <span className="font-semibold">A IA pediu gente:</span> {lead.motivoDoPedido}
          </p>
        )}
      </header>

      {/* ── O FIO ──────────────────────────────────────────────────────── */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {mensagens.length === 0 ? (
          avisoDoSilencio ? (
            <div
              className={`rounded-xl border px-3.5 py-3 ${
                avisoDoSilencio.tom === "historico"
                  ? "border-line bg-canvas"
                  : "border-amber-200 bg-amber-50"
              }`}
            >
              <p
                className={`text-[13px] font-semibold ${
                  avisoDoSilencio.tom === "historico" ? "text-ink" : "text-amber-900"
                }`}
              >
                {avisoDoSilencio.titulo}
              </p>
              <p
                className={`mt-1 max-w-[60ch] text-[12.5px] leading-relaxed ${
                  avisoDoSilencio.tom === "historico" ? "text-muted" : "text-amber-900/85"
                }`}
              >
                {avisoDoSilencio.texto}
              </p>
            </div>
          ) : (
            <p className="text-[13px] leading-relaxed text-muted">
              Nenhuma mensagem ainda. Quando o lead escrever no WhatsApp de vendas, a
              conversa aparece aqui.
            </p>
          )
        ) : (
          <ul className="flex flex-col gap-2">
            {mensagens.map((m) => (
              <Bolha key={m.id} m={m} />
            ))}
          </ul>
        )}
      </div>

      {/* ── O RODAPÉ: Respostas rápidas · Modelos · Anotações internas ─── */}
      <footer className="shrink-0 border-t border-line bg-paper p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {(
            [
              ["rapidas", "Respostas rápidas"],
              ["modelos", "Modelos"],
              ["notas", "Anotações internas"],
            ] as const
          ).map(([a, rotulo]) => (
            <button
              key={a}
              onClick={() => setAba(a)}
              className={cx(
                "rounded-xl px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                aba === a ? "bg-brand-500 text-white" : "text-ink2 hover:bg-canvas",
              )}
            >
              {rotulo}
            </button>
          ))}
        </div>

        {aba === "rapidas" && (
          /* ⛔ O desenho traz seis frases prontas de venda ("Apresentar planos",
             "Enviar proposta"…). Elas são CONTEÚDO, e conteúdo sem fonte é
             conteúdo inventado: não existe catálogo de respostas rápidas nesta
             base. A aba fica, dizendo o que falta — é a regra 2 da moldura. */
          <p className="mb-2 rounded-xl border border-dashed border-line2 bg-canvas px-3 py-2.5 text-[12px] leading-relaxed text-muted">
            <strong className="font-semibold text-ink2">Não há respostas rápidas
            cadastradas.</strong>{" "}
            O desenho mostra seis frases prontas de exemplo; escrevê-las aqui seria
            inventar a fala da empresa. Quando existir um catálogo de respostas — com
            dono e revisão —, ele aparece nesta aba.
          </p>
        )}

        {aba === "modelos" && (
          <div className="mb-2 rounded-xl border border-line2 bg-canvas px-3 py-2.5">
            <p className="text-[12px] leading-relaxed text-ink2">
              Modelo aprovado pela Meta é o que pode sair <strong>fora</strong> da janela
              de 24 horas. Quem escolhe qual sai é a fila de modelos liberados — e as
              travas de opt-out, ritmo e repetição decidem se sai.
            </p>
            <button
              onClick={() =>
                void agir(async () => {
                  const r = await enviarModeloAprovado(lead.id);
                  return r;
                })
              }
              disabled={ocupado}
              className="mt-2 w-full rounded-xl border border-line2 bg-paper px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas disabled:opacity-40"
            >
              {ocupado ? "…" : "Enviar modelo aprovado"}
            </button>
          </div>
        )}

        <AvisoDaJanela janela={janela} />

        {lead.optOutAt && (
          <p className="mb-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-[12.5px] text-red-800">
            Este contato pediu para não receber mensagens. O pedido é definitivo.
          </p>
        )}

        <div className="flex items-end gap-2">
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void mandar();
              }
            }}
            rows={2}
            disabled={!podeEscrever && aba !== "notas"}
            placeholder={
              aba === "notas" ? "Nota interna — o lead nunca vê" : "Digite uma mensagem…"
            }
            className={cx(
              "min-w-0 flex-1 resize-none rounded-xl border px-3 py-2 text-[13.5px] text-ink outline-none transition-colors",
              aba === "notas"
                ? "border-amber-300 bg-amber-50 focus:border-amber-400"
                : "border-line2 bg-paper focus:border-brand-400",
              !podeEscrever && aba !== "notas" && "opacity-50",
            )}
          />
          <button
            onClick={() => void mandar()}
            disabled={(!podeEscrever && aba !== "notas") || !texto.trim() || enviando}
            className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
          >
            {enviando ? "…" : aba === "notas" ? "Anotar" : "Registrar"}
          </button>
        </div>

        {/* ⚠️ O botão diz "Registrar", e não "Enviar": o que ele garante é a
            linha gravada. Se o canal estiver desligado, a mensagem fica
            PENDENTE — e quem avisa isso é a rota, no aviso acima. */}
        <p className="mt-1.5 text-[11px] text-muted">
          Shift + Enter para nova linha.{" "}
          {aba === "notas"
            ? "Anotação interna não sai para o cliente."
            : "O envio só é confirmado pelo servidor."}
        </p>
      </footer>
    </>
  );
}
