"use client";

/**
 * A TELA DE ATENDIMENTO — quatro áreas (item 5 do comando).
 *
 *   filas · lista de conversas · a conversa · ficha 360º
 *
 * ── COMO ELA CABE NO CELULAR ────────────────────────────────────────────────
 *
 * Quatro colunas não cabem em 390px, e espremê-las produz quatro colunas
 * ilegíveis em vez de uma útil. No celular a tela mostra UM painel por vez, com
 * volta explícita — que é como qualquer aplicativo de mensagem funciona, e é o
 * gesto que o vendedor já tem no dedo.
 *
 * A escolha do painel visível é estado da tela, não rota: trocar de conversa não
 * pode custar um recarregamento no meio do atendimento.
 *
 * ── O ORÇAMENTO DE LARGURA, QUE É REAL E NÃO CABE SOZINHO ───────────────────
 *
 * A barra do Admin come 208px antes de esta tela começar. Sobram 1072px num
 * monitor de 1280, e é dentro deles que quatro colunas precisam caber:
 *
 *     filas 160 + lista 240 + ficha 256 = 656   →   conversa 416 ✓
 *
 * A 1024px sobrariam 816, e a conversa cairia para 160px. Por isso **a ficha só
 * aparece a partir de 1280** (`xl`); abaixo disso ela é uma aba, e a barra de
 * abas continua visível até lá.
 *
 * ── E POR QUE ISTO PRECISOU DE DUAS TENTATIVAS ─────────────────────────────
 *
 * A primeira versão dava 224+320+320 às laterais, e a conversa ficava com 208px:
 * as bolhas quebravam em uma palavra por linha. A segunda apertou as laterais e
 * pôs piso na conversa — e aí a soma passou de 1280 e a **ficha saiu da tela
 * pela direita, recortada**.
 *
 * Nenhuma das duas foi pega por teste. A primeira apareceu na captura; a segunda
 * escapou até do meu próprio verificador de transbordo, porque o conteúdo era
 * RECORTADO e não rolável — `scrollWidth` não cresce quando alguém corta. Largura
 * de layout não se verifica por regra: se verifica somando, e olhando.
 *
 * ── O QUE ESTA TELA SE RECUSA A FINGIR ──────────────────────────────────────
 *
 * O botão de enviar existe e funciona: ele GRAVA a mensagem na conversa. O que
 * ele não faz é entregar — `FOOCCI_SDR_SEND_ENABLED` está desligada por decisão
 * do CEO. E a tela diz isso, em texto, toda vez que uma mensagem é registrada.
 *
 * Um botão que finge ter enviado é o pior defeito possível aqui: o vendedor fica
 * esperando uma resposta que nunca vem, e culpa o cliente.
 */

import { useState } from "react";
import { useSalaDeVendas, mudarResponsavel } from "../_dados";
import {
  useConversa, escrever, marcarLidas, salvarFicha, moverEtapa,
  registrarContatoManual, apagarDadosDoLead,
  desde, hora, dataEHora, paraCampoDeDataHora,
  type DadosDaConversa,
} from "./_dados";
import type { NomeDaFila, LeadNaFila } from "@/services/salaDeVendas/filas";
import type { MensagemNaTela } from "@/services/salaDeVendas/conversa";

function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}

type PainelVisivel = "filas" | "lista" | "conversa" | "ficha";

const ROTULO_ETAPA: Record<string, string> = {
  NOVO: "Novo lead",
  PRIMEIRO_CONTATO: "Primeiro contato",
  EM_QUALIFICACAO: "Em qualificação",
  QUALIFICADO: "Qualificado",
  DEMO_AGENDADA: "Demo agendada",
  DEMO_REALIZADA: "Demo realizada",
  PROPOSTA_ENVIADA: "Proposta enviada",
  EM_NEGOCIACAO: "Em negociação",
  GANHO: "Ganho",
  PERDIDO: "Perdido",
  NUTRICAO: "Nutrição",
};

const ETAPAS = Object.keys(ROTULO_ETAPA);

const COR_TEMPERATURA: Record<string, string> = {
  PRIORIDADE_MAXIMA: "bg-red-50 text-red-700 border-red-200",
  QUENTE: "bg-orange-50 text-orange-700 border-orange-200",
  MORNO: "bg-amber-50 text-amber-700 border-amber-200",
  FRIO: "bg-sky-50 text-sky-700 border-sky-200",
  DESQUALIFICADO: "bg-gray-100 text-gray-600 border-gray-200",
  NUTRICAO: "bg-cyan-50 text-cyan-700 border-cyan-200",
};

export function AtendimentoClient() {
  const [fila, setFila] = useState<NomeDaFila>("aguardandoHumano");
  const [leadId, setLeadId] = useState<string | null>(null);
  const [painel, setPainel] = useState<PainelVisivel>("lista");
  const [aviso, setAviso] = useState<string | null>(null);

  const { estado: estadoDaLista, recarregar: recarregarLista } = useSalaDeVendas(fila);
  const { estado: estadoDaConversa, recarregar: recarregarConversa } = useConversa(leadId);

  function abrir(id: string) {
    setLeadId(id);
    setPainel("conversa");
    void marcarLidas(id).then(() => recarregarLista());
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col bg-canvas">
      {aviso && (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-[13px] text-amber-900"
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

      {/* No celular, uma barra de navegação entre os quatro painéis. */}
      <nav className="flex shrink-0 gap-1 border-b border-line bg-paper px-2 py-1.5 xl:hidden">
        {(["filas", "lista", "conversa", "ficha"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPainel(p)}
            disabled={(p === "conversa" || p === "ficha") && !leadId}
            className={cx(
              "flex-1 rounded-lg px-2 py-1.5 text-[12.5px] font-semibold capitalize transition-colors",
              painel === p ? "bg-brand-500 text-white" : "text-ink2 hover:bg-canvas",
              (p === "conversa" || p === "ficha") && !leadId && "opacity-40",
            )}
          >
            {p}
          </button>
        ))}
      </nav>

      <div className="flex min-h-0 flex-1">
        {/* ── 1. FILAS ─────────────────────────────────────────────────── */}
        <aside
          className={cx(
            "w-full shrink-0 overflow-y-auto border-r border-line bg-paper lg:block lg:w-40",
            painel === "filas" ? "block" : "hidden",
          )}
        >
          <ColunaDeFilas
            estado={estadoDaLista}
            fila={fila}
            aoEscolher={(f) => {
              setFila(f);
              setPainel("lista");
            }}
          />
        </aside>

        {/* ── 2. LISTA DE CONVERSAS ────────────────────────────────────── */}
        <section
          className={cx(
            "w-full shrink-0 overflow-y-auto border-r border-line bg-paper lg:block lg:w-60",
            painel === "lista" ? "block" : "hidden",
          )}
        >
          <ColunaDeConversas
            estado={estadoDaLista}
            selecionado={leadId}
            aoAbrir={abrir}
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
            aoAvisar={setAviso}
            aoMudar={() => {
              recarregarConversa();
              recarregarLista();
            }}
            aoAgir={async (acao, id, extra) => {
              const r = await mudarResponsavel({ acao, leadId: id, ...extra });
              if (!r.ok) setAviso(r.mensagem);
              recarregarConversa();
              recarregarLista();
            }}
          />
        </main>

        {/* ── 4. FICHA 360º ────────────────────────────────────────────── */}
        <aside
          className={cx(
            "w-full shrink-0 overflow-y-auto border-l border-line bg-paper xl:block xl:w-64",
            painel === "ficha" ? "block" : "hidden",
          )}
        >
          <PainelDaFicha
            estado={estadoDaConversa}
            aoAvisar={setAviso}
            aoSalvar={() => {
              recarregarConversa();
              recarregarLista();
            }}
            aoApagar={() => {
              // Depois do apagamento o lead não existe mais. Recarregar a
              // conversa devolveria 404 e a tela diria "esta conversa não está
              // disponível para você" — que é falso e assustador logo depois de
              // um apagamento bem-sucedido. Voltar para a lista é o fim honesto.
              setLeadId(null);
              setPainel("lista");
              recarregarLista();
            }}
          />
        </aside>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. FILAS
// ═══════════════════════════════════════════════════════════════════════════

function ColunaDeFilas({
  estado,
  fila,
  aoEscolher,
}: {
  estado: ReturnType<typeof useSalaDeVendas>["estado"];
  fila: NomeDaFila;
  aoEscolher: (f: NomeDaFila) => void;
}) {
  if (estado.fase !== "pronto") {
    return <p className="p-4 text-[13px] text-muted">Carregando filas…</p>;
  }

  return (
    <div className="p-2">
      {estado.dados.filas.map((f) => {
        const total = estado.dados.contagens[f.nome] ?? 0;
        const ativa = f.nome === fila;

        return (
          <button
            key={f.nome}
            onClick={() => aoEscolher(f.nome)}
            className={cx(
              "mb-0.5 flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left transition-colors",
              ativa ? "bg-brand-50 text-brand-700" : "text-ink2 hover:bg-canvas",
            )}
          >
            <span className="truncate text-[13.5px] font-semibold">{f.titulo}</span>
            <span
              className={cx(
                "shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums",
                ativa ? "bg-brand-500 text-white" : "bg-chip text-muted",
              )}
            >
              {total}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. LISTA DE CONVERSAS
// ═══════════════════════════════════════════════════════════════════════════

function ColunaDeConversas({
  estado,
  selecionado,
  aoAbrir,
}: {
  estado: ReturnType<typeof useSalaDeVendas>["estado"];
  selecionado: string | null;
  aoAbrir: (id: string) => void;
}) {
  if (estado.fase === "semAcesso") {
    return (
      <p className="p-4 text-[13px] text-muted">
        Sem acesso. É preciso um login interno para abrir a Sala.
      </p>
    );
  }

  if (estado.fase !== "pronto") {
    return <p className="p-4 text-[13px] text-muted">Carregando…</p>;
  }

  if (estado.dados.leads.length === 0) {
    return (
      <p className="p-4 text-[13px] leading-relaxed text-muted">
        Nenhuma conversa nesta fila.
      </p>
    );
  }

  return (
    <ul>
      {estado.dados.leads.map((l) => (
        <LinhaDaConversa
          key={l.id}
          lead={l}
          ativo={l.id === selecionado}
          aoAbrir={() => aoAbrir(l.id)}
        />
      ))}
    </ul>
  );
}

function LinhaDaConversa({
  lead,
  ativo,
  aoAbrir,
}: {
  lead: LeadNaFila;
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
          <span className="truncate text-[13.5px] font-semibold text-ink">{lead.nome}</span>
          <span className="shrink-0 text-[11px] text-muted">
            {desde(lead.lastContactedAt ?? lead.createdAt) ?? ""}
          </span>
        </div>

        {lead.restaurante && (
          <p className="truncate text-[12.5px] text-ink2">{lead.restaurante}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Etiqueta texto={ROTULO_ETAPA[lead.stage] ?? lead.stage} />
          <Etiqueta texto={rotuloDeQuem(lead.atendidoPor)} />
        </div>
      </button>
    </li>
  );
}

function rotuloDeQuem(v: string): string {
  switch (v) {
    case "NINGUEM": return "sem responsável";
    case "IA": return "com a IA";
    case "HUMANO": return "com uma pessoa";
    case "AGUARDANDO_HUMANO": return "esperando gente";
    default: return v;
  }
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

function PainelDaConversa({
  estado,
  aoAvisar,
  aoMudar,
  aoAgir,
}: {
  estado: ReturnType<typeof useConversa>["estado"];
  aoAvisar: (s: string | null) => void;
  aoMudar: () => void;
  aoAgir: (
    acao: "assumir" | "devolver" | "pedirHumano",
    leadId: string,
    extra?: { objetivo?: string; motivo?: string },
  ) => void | Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [interna, setInterna] = useState(false);
  const [enviando, setEnviando] = useState(false);

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
        <p className="text-[13.5px] text-ink2">
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
    const r = await escrever(lead.id, t, interna ? "notaInterna" : undefined);
    setEnviando(false);

    if (r.ok) {
      setTexto("");
      // O aviso do envio desligado vem da ROTA, e não é escrito aqui: quem sabe
      // se a mensagem saiu é o servidor.
      aoAvisar(r.aviso ?? null);
      aoMudar();
      return;
    }
    aoAvisar(r.mensagem);
  }

  return (
    <>
      <header className="shrink-0 border-b border-line bg-paper px-4 py-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{lead.nome}</h2>
            <p className="truncate text-[12.5px] text-muted">
              {lead.whatsapp}
              {lead.restaurante ? ` · ${lead.restaurante}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {lead.atendidoPor === "HUMANO" && lead.atendente && (
              <Etiqueta texto={`com ${lead.atendente.nome}`} />
            )}
            {lead.atendidoPor !== "HUMANO" && (
              <button
                onClick={() => aoAgir("assumir", lead.id)}
                className="rounded-xl bg-brand-500 px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600"
              >
                Assumir
              </button>
            )}
          </div>
        </div>

        {/* O pedido da IA fica à vista: é o contexto de quem acabou de pegar. */}
        {lead.motivoDoPedido && (
          <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-1.5 text-[12.5px] text-amber-900">
            <span className="font-semibold">A IA pediu gente:</span> {lead.motivoDoPedido}
          </p>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {mensagens.length === 0 ? (
          /* ── DUAS TELAS VAZIAS QUE COBRAM COISAS OPOSTAS ────────────────────
             "Ninguém falou com ele" e "ele chegou antes de a gente ter onde
             falar" produzem exatamente o mesmo branco — e o primeiro é falha de
             atendimento, o segundo é história. Sem a distinção o time trata os
             dois igual, e trata pelo mais barato dos dois: ignorar.

             Quem decide é o servidor (`anterioresASala`), não esta tela: a regra
             do que é "anterior à Sala" precisa viver perto do teste, e não no
             navegador, longe dele. */
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

      <footer className="shrink-0 border-t border-line bg-paper p-3">
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
            rows={2}
            disabled={!podeEscrever}
            placeholder={interna ? "Nota interna — o lead nunca vê" : "Escreva uma mensagem"}
            className={cx(
              "min-w-0 flex-1 resize-none rounded-xl border px-3 py-2 text-[13.5px] text-ink outline-none transition-colors",
              interna
                ? "border-amber-300 bg-amber-50 focus:border-amber-400"
                : "border-line2 bg-paper focus:border-brand-400",
              !podeEscrever && "opacity-50",
            )}
          />
          <button
            onClick={mandar}
            disabled={!podeEscrever || !texto.trim() || enviando}
            className="shrink-0 rounded-xl bg-brand-500 px-4 py-2.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-40"
          >
            {enviando ? "…" : "Registrar"}
          </button>
        </div>

        <label className="mt-2 flex cursor-pointer items-center gap-2 text-[12.5px] text-ink2">
          <input
            type="checkbox"
            checked={interna}
            onChange={(e) => setInterna(e.target.checked)}
            className="h-3.5 w-3.5 accent-brand-500"
          />
          Nota interna (o lead nunca vê)
        </label>
      </footer>
    </>
  );
}

/**
 * O aviso da janela de 24h.
 *
 * Ele existe porque, sem ele, o vendedor digita a mensagem, aperta enviar, e
 * recebe um erro de API que não explica nada. A informação precisa chegar ANTES
 * de ele escrever.
 */
function AvisoDaJanela({ janela }: { janela: { aberta: boolean; motivo?: string } }) {
  if (janela.aberta) return null;

  return (
    <p className="mb-2 rounded-lg bg-canvas px-2.5 py-1.5 text-[12.5px] text-ink2">
      {janela.motivo === "nuncaFalou"
        ? "Esta pessoa ainda não escreveu. Pelas regras da Meta, o primeiro contato exige modelo aprovado."
        : "A janela de 24 horas fechou. Fora dela, só sai modelo aprovado pela Meta."}
    </p>
  );
}

function Bolha({ m }: { m: MensagemNaTela }) {
  const daFoocci = m.direcao === "SAIDA";

  return (
    <li className={cx("flex", daFoocci ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[85%] rounded-2xl px-3 py-2 text-[13.5px] leading-relaxed sm:max-w-[70%]",
          daFoocci
            ? "rounded-br-sm bg-brand-50 text-ink"
            : "rounded-bl-sm border border-line bg-paper text-ink",
        )}
      >
        {m.texto || m.legenda ? (
          <p className="whitespace-pre-wrap break-words">{m.texto ?? m.legenda}</p>
        ) : (
          <p className="italic text-muted">{descricaoDaMidia(m)}</p>
        )}

        <div className="mt-1 flex items-center justify-end gap-1.5 text-[10.5px] text-muted">
          {daFoocci && m.autor && (
            <span>{m.autor === "IA" ? "IA" : (m.autorNome ?? "equipe")}</span>
          )}
          <span>{hora(m.ocorreuEm)}</span>
          {daFoocci && <MarcaDeEntrega status={m.status} />}
        </div>

        {/* A falha aparece na própria bolha. Uma mensagem que não chegou e se
            parece com uma que chegou faz o vendedor esperar resposta que não vem. */}
        {m.status === "FALHOU" && (
          <p className="mt-1 rounded bg-red-50 px-1.5 py-0.5 text-[11px] text-red-700">
            Não foi entregue{m.erro ? `: ${m.erro}` : ""}
          </p>
        )}
      </div>
    </li>
  );
}

function descricaoDaMidia(m: MensagemNaTela): string {
  switch (m.tipo) {
    case "AUDIO": return "🎤 Áudio";
    case "IMAGEM": return "🖼️ Imagem";
    case "VIDEO": return "🎬 Vídeo";
    case "DOCUMENTO": return m.midiaNome ? `📎 ${m.midiaNome}` : "📎 Documento";
    default: return "📦 Conteúdo não suportado";
  }
}

function MarcaDeEntrega({ status }: { status: string }) {
  switch (status) {
    case "PENDENTE": return <span title="Registrada, não enviada">◷</span>;
    case "ENVIADA": return <span title="Enviada">✓</span>;
    case "ENTREGUE": return <span title="Entregue">✓✓</span>;
    case "LIDA": return <span className="text-sky-600" title="Lida">✓✓</span>;
    case "FALHOU": return <span className="text-red-600" title="Falhou">!</span>;
    default: return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. FICHA 360º
// ═══════════════════════════════════════════════════════════════════════════

function PainelDaFicha({
  estado,
  aoAvisar,
  aoSalvar,
  aoApagar,
}: {
  estado: ReturnType<typeof useConversa>["estado"];
  aoAvisar: (s: string | null) => void;
  aoSalvar: () => void;
  aoApagar: () => void;
}) {
  if (estado.fase !== "pronto") {
    return <p className="p-4 text-[13px] text-muted">—</p>;
  }
  return (
    <FichaEditavel
      // `key` pelo id do lead: sem ela, o React reaproveita o formulário desta
      // ficha ao trocar de conversa, e o nome digitado na confirmação de
      // apagamento sobreviveria à troca — apontando para outra pessoa.
      key={estado.dados.lead.id}
      dados={estado.dados}
      aoAvisar={aoAvisar}
      aoSalvar={aoSalvar}
      aoApagar={aoApagar}
    />
  );
}

function FichaEditavel({
  dados,
  aoAvisar,
  aoSalvar,
  aoApagar,
}: {
  dados: DadosDaConversa;
  aoAvisar: (s: string | null) => void;
  aoSalvar: () => void;
  aoApagar: () => void;
}) {
  const { lead, fatoresDoScore } = dados;
  const q = lead.qualificacao;

  const [form, setForm] = useState({
    unidades: q?.unidades?.toString() ?? "",
    volumeMensal: q?.volumeMensal?.toString() ?? "",
    canaisAtuais: (q?.canaisAtuais ?? []).join(", "),
    sistemaAtual: q?.sistemaAtual ?? "",
    dorPrincipal: q?.dorPrincipal ?? "",
    urgencia: q?.urgencia ?? "",
    poderDeDecisao: q?.poderDeDecisao ?? "",
    faixaDeOrcamento: q?.faixaDeOrcamento ?? "",
  });
  const [salvando, setSalvando] = useState(false);

  const campo = (k: keyof typeof form) => ({
    value: form[k],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value })),
  });

  async function salvar() {
    setSalvando(true);
    const r = await salvarFicha({
      leadId: lead.id,
      unidades: form.unidades ? Number(form.unidades) : null,
      volumeMensal: form.volumeMensal ? Number(form.volumeMensal) : null,
      canaisAtuais: form.canaisAtuais.split(",").map((s) => s.trim()).filter(Boolean),
      sistemaAtual: form.sistemaAtual || null,
      dorPrincipal: form.dorPrincipal || null,
      urgencia: form.urgencia || null,
      poderDeDecisao: form.poderDeDecisao || null,
      faixaDeOrcamento: form.faixaDeOrcamento || null,
    });
    setSalvando(false);

    if (r.ok) {
      aoAvisar(null);
      aoSalvar();
      return;
    }
    aoAvisar(r.mensagem);
  }

  async function mover(para: string) {
    // Perder exige motivo estruturado, e o motivo mora na tela de funil. Aqui a
    // mudança para PERDIDO é bloqueada em vez de mandar sem motivo e receber uma
    // recusa que o vendedor não sabe resolver.
    if (para === "PERDIDO") {
      aoAvisar("Para marcar como perdido, use o Funil — lá o motivo é obrigatório.");
      return;
    }

    const r = await moverEtapa({ leadId: lead.id, para });
    if (!r.ok) {
      aoAvisar(r.mensagem);
      return;
    }
    aoSalvar();
  }

  return (
    <div className="p-3">
      <Secao titulo="Situação">
        <div className="flex flex-wrap items-center gap-1.5">
          <Nota score={lead.score} temperatura={lead.temperatura} />
          {lead.prioritario && (
            <Etiqueta texto="prioritário" tom="border-red-200 bg-red-50 text-red-700" />
          )}
        </div>

        <label className="mt-2 block text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
          Etapa
        </label>
        <select
          value={lead.stage}
          onChange={(e) => void mover(e.target.value)}
          className="mt-1 w-full rounded-xl border border-line2 bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand-400"
        >
          {ETAPAS.map((e) => (
            <option key={e} value={e}>{ROTULO_ETAPA[e]}</option>
          ))}
        </select>

        {lead.proximaAcaoEm && (
          <p className="mt-2 text-[12.5px] text-ink2">
            <span className="font-semibold">Próxima ação:</span>{" "}
            {lead.proximaAcaoNota ?? "—"} ({desde(lead.proximaAcaoEm)})
          </p>
        )}
      </Secao>

      {/* ── O QUE A PESSOA RESPONDEU NO SITE ─────────────────────────────────
          Vinha só na tela velha do CRM. É o que a pessoa escreveu ANTES de
          qualquer conversa — inclusive a dor, no campo "Principal desafio". Sem
          isto na ficha, o vendedor abre a conversa e pergunta exatamente o que
          já está respondido. */}
      <Secao titulo="Respondeu no formulário">
        {dados.respostas.length === 0 ? (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Só nome e WhatsApp. Os outros campos do formulário são opcionais e
            esta pessoa não preencheu.
          </p>
        ) : (
          <dl className="flex flex-col gap-1.5">
            {dados.respostas.map((r) => (
              <div key={r.pergunta}>
                <dt className="text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
                  {r.pergunta}
                </dt>
                <dd className="text-[12.5px] leading-relaxed text-ink2">{r.resposta}</dd>
              </div>
            ))}
          </dl>
        )}
      </Secao>

      <RegistrarContato
        leadId={lead.id}
        tipos={dados.opcoes.contatoManual}
        registrados={dados.contatosManuais}
        aoAvisar={aoAvisar}
        aoRegistrar={aoSalvar}
      />

      {/* A CONTA do score, e não só o número. Item 10 do comando. */}
      <Secao titulo="Por que este score">
        {lead.score === null ? (
          <p className="text-[12.5px] leading-relaxed text-muted">
            Ninguém pontuou este lead ainda. Preencha a ficha abaixo e o score é
            calculado — <strong>sem score não é o mesmo que score zero</strong>.
          </p>
        ) : fatoresDoScore.length === 0 ? (
          <p className="text-[12.5px] text-muted">Sem fatores registrados.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {fatoresDoScore.map((f) => (
              <li key={f.fator} className="flex items-baseline justify-between gap-2 text-[12.5px]">
                <span className="truncate text-ink2">{f.observado}</span>
                <span className="shrink-0 font-semibold tabular-nums text-ink">
                  +{f.pontos}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Qualificação">
        <Campo rotulo="Unidades" tipo="number" {...campo("unidades")} />
        <Campo rotulo="Pedidos por mês" tipo="number" {...campo("volumeMensal")} />
        <Campo rotulo="Canais hoje (separe por vírgula)" {...campo("canaisAtuais")} />
        <Campo rotulo="Sistema atual" {...campo("sistemaAtual")} />
        <CampoLongo rotulo="Dor principal" {...campo("dorPrincipal")} />
        <Campo rotulo="Para quando" {...campo("urgencia")} />
        <Campo rotulo="Quem decide" {...campo("poderDeDecisao")} />
        <Campo rotulo="Faixa de orçamento" {...campo("faixaDeOrcamento")} />

        <button
          onClick={salvar}
          disabled={salvando}
          className="mt-3 w-full rounded-xl bg-brand-500 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
        >
          {salvando ? "Salvando…" : "Salvar e recalcular o score"}
        </button>
      </Secao>

      <SecaoDeOrigem origem={dados.origem} codigo={lead.codigo} />

      <Secao titulo="Consentimento">
        <Linha
          rotulo="Consentiu em"
          valor={lead.consentAt ? new Date(lead.consentAt).toLocaleDateString("pt-BR") : null}
        />
        <Linha rotulo="Pediu silêncio" valor={lead.optOutAt ? "sim — definitivo" : "não"} />
      </Secao>

      {/* Por último, e em vermelho: é o único botão desta tela que não tem
          desfazer. Fica escondido de quem não pode — e a rota recusa igual. */}
      {dados.podeApagarDados && (
        <ApagarDados
          leadId={lead.id}
          nome={lead.nome}
          origens={dados.opcoes.origemDoPedidoDeApagamento}
          aoAvisar={aoAvisar}
          aoApagar={aoApagar}
        />
      )}
    </div>
  );
}

// ── Origem e UTM ─────────────────────────────────────────────────────────────

/**
 * De onde o contato veio.
 *
 * ── O QUE ESTA SEÇÃO CONSERTA ───────────────────────────────────────────────
 *
 * Antes eram três linhas cruas — campanha, fonte, página — e cada uma vazia
 * virava um travessão. Um lead sem UTM mostrava três travessões, que a pessoa lê
 * como "o sistema não sabe", quando a resposta certa é "esta pessoa entrou
 * direto, e ninguém pagou anúncio por ela".
 *
 * Agora o rótulo vem pronto do servidor e NUNCA é vazio: no pior caso ele diz
 * "Direto / não identificado". As linhas de baixo só aparecem quando existem.
 */
function SecaoDeOrigem({
  origem,
  codigo,
}: {
  origem: DadosDaConversa["origem"];
  codigo: string | null;
}) {
  return (
    <Secao titulo="De onde veio">
      <p className="text-[13px] font-semibold leading-relaxed text-ink">{origem.rotulo}</p>
      <p className="mt-0.5 text-[11.5px] text-muted">Canal: {origem.canalRotulo}</p>

      <div className="mt-2">
        {origem.utmCampaign && <Linha rotulo="Campanha" valor={origem.utmCampaign} />}
        {origem.utmContent && <Linha rotulo="Anúncio" valor={origem.utmContent} />}
        {origem.utmSource && <Linha rotulo="Fonte" valor={origem.utmSource} />}
        {origem.utmMedium && <Linha rotulo="Mídia" valor={origem.utmMedium} />}
        {origem.utmTerm && <Linha rotulo="Termo" valor={origem.utmTerm} />}
        {origem.referrer && <Linha rotulo="Veio de" valor={origem.referrer} />}
        {origem.landingPath && <Linha rotulo="Entrou por" valor={origem.landingPath} />}
        {origem.legado && <Linha rotulo="Enviou de" valor={origem.legado} />}
        {codigo && <Linha rotulo="Código" valor={codigo} />}
      </div>

      {!origem.temSinalDeCampanha && (
        <p className="mt-2 rounded-lg bg-canvas px-2.5 py-1.5 text-[12px] leading-relaxed text-ink2">
          Sem sinal de campanha. Não dá para dizer qual anúncio trouxe este
          contato — e chutar seria pior que não saber.
        </p>
      )}
    </Secao>
  );
}

// ── Contato registrado à mão ─────────────────────────────────────────────────

/**
 * "Liguei para ele ontem."
 *
 * ── POR QUE ISTO PRECISA EXISTIR NA SALA ────────────────────────────────────
 *
 * A Sala só enxerga o que passou pelo WhatsApp dela. O que ela não enxerga, para
 * efeito de fila, nunca aconteceu: o lead segue marcado como "ainda não
 * abordado" e o próximo vendedor liga para quem já foi atendido ontem.
 *
 * ── E POR QUE A DATA É UM CAMPO, E NÃO O RELÓGIO ────────────────────────────
 *
 * Registro manual é quase sempre lançado depois. O campo já abre em "agora" para
 * o caso comum custar um clique, mas quem lançar a ligação de terça na sexta
 * corrige a data — senão a linha do tempo do lead conta a história fora de ordem.
 */
function RegistrarContato({
  leadId,
  tipos,
  registrados,
  aoAvisar,
  aoRegistrar,
}: {
  leadId: string;
  tipos: Array<{ valor: string; rotulo: string }>;
  registrados: DadosDaConversa["contatosManuais"];
  aoAvisar: (s: string | null) => void;
  aoRegistrar: () => void;
}) {
  const [tipo, setTipo] = useState(tipos[0]?.valor ?? "LIGACAO");
  const [quando, setQuando] = useState(() => paraCampoDeDataHora(new Date()));
  const [nota, setNota] = useState("");
  const [salvando, setSalvando] = useState(false);

  async function registrar() {
    if (salvando) return;
    setSalvando(true);

    const r = await registrarContatoManual({
      leadId,
      tipo,
      // O campo devolve hora LOCAL sem fuso. `new Date(...)` o interpreta no
      // fuso de quem está olhando, que é justamente o de quem fez a ligação.
      ocorridoEm: new Date(quando).toISOString(),
      nota: nota.trim() || null,
    });
    setSalvando(false);

    if (!r.ok) {
      aoAvisar(r.mensagem);
      return;
    }

    setNota("");
    setQuando(paraCampoDeDataHora(new Date()));
    // A tela diz o EFEITO, e não só "salvo". Um registro que não conta como
    // abordagem deixa o lead na fila de quem falta abordar, e quem acabou de
    // registrar precisa saber disso agora.
    aoAvisar(
      r.dados.contouComoAbordagem
        ? "Contato registrado. Este lead sai da fila de quem falta abordar."
        : "Registrado. Não conta como abordagem — o lead continua na fila de quem falta abordar.",
    );
    aoRegistrar();
  }

  return (
    <Secao titulo="Contato fora do sistema">
      <label className="mb-2 block">
        <span className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
          O que aconteceu
        </span>
        <select
          value={tipo}
          onChange={(e) => setTipo(e.target.value)}
          className="mt-0.5 w-full rounded-xl border border-line2 bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-brand-400"
        >
          {tipos.map((t) => (
            <option key={t.valor} value={t.valor}>{t.rotulo}</option>
          ))}
        </select>
      </label>

      <label className="mb-2 block">
        <span className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
          Quando aconteceu
        </span>
        <input
          type="datetime-local"
          value={quando}
          onChange={(e) => setQuando(e.target.value)}
          className="mt-0.5 w-full rounded-xl border border-line2 bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-brand-400"
        />
      </label>

      <CampoLongo
        rotulo="O que foi dito"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
      />

      <button
        onClick={registrar}
        disabled={salvando || !quando}
        className="w-full rounded-xl bg-brand-500 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-50"
      >
        {salvando ? "Registrando…" : "Registrar contato"}
      </button>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-muted">
        Fica registrado com o seu nome e com a data que você informar.
      </p>

      {registrados.length > 0 && (
        <ol className="mt-3 flex flex-col gap-2 border-t border-line pt-3">
          {registrados.map((c) => (
            <li key={c.id} className="border-l-2 border-line2 pl-2">
              <p className="text-[12.5px] font-semibold text-ink">{c.rotulo}</p>
              <p className="text-[11.5px] text-muted">
                {dataEHora(c.quando)} · por {c.quem}
              </p>
              {c.nota && (
                <p className="mt-0.5 text-[12px] italic leading-relaxed text-ink2">“{c.nota}”</p>
              )}
            </li>
          ))}
        </ol>
      )}
    </Secao>
  );
}

// ── LGPD ─────────────────────────────────────────────────────────────────────

/**
 * Apagar os dados do contato.
 *
 * ── POR QUE O NOME É DIGITADO ───────────────────────────────────────────────
 *
 * Um botão "Confirmo" é apertado por engano — a lista recarrega embaixo do dedo,
 * a ficha aberta é a de outra pessoa, e o que some é o contato errado. Não tem
 * desfazer. Digitar o nome do contato só confere com UM contato, e é o servidor
 * que confere: a tela não decide isto, ela só pede.
 *
 * A tela também não decide QUEM pode apagar. Ela desenha o bloco quando a rota
 * diz que sim — e a mesma rota recusa quem chamar direto sem passar por aqui.
 */
function ApagarDados({
  leadId,
  nome,
  origens,
  aoAvisar,
  aoApagar,
}: {
  leadId: string;
  nome: string;
  origens: Array<{ valor: string; rotulo: string }>;
  aoAvisar: (s: string | null) => void;
  aoApagar: () => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [digitado, setDigitado] = useState("");
  const [origem, setOrigem] = useState(origens[0]?.valor ?? "TITULAR");
  const [apagando, setApagando] = useState(false);

  async function apagar() {
    if (apagando) return;
    setApagando(true);

    const r = await apagarDadosDoLead({
      leadId,
      confirmacaoNome: digitado,
      origemDoPedido: origem,
    });
    setApagando(false);

    if (!r.ok) {
      aoAvisar(r.mensagem);
      return;
    }

    aoAvisar(
      `Dados apagados: ${r.dados.apagados.interacoes} registros de histórico e ` +
        `${r.dados.apagados.mensagens} mensagens. Não tem volta.`,
    );
    aoApagar();
  }

  return (
    <section className="mb-4 rounded-2xl border border-red-200 bg-red-50/60 p-3">
      <h3 className="mb-1 text-[11.5px] font-semibold uppercase tracking-[.04em] text-red-700">
        Apagar dados (LGPD)
      </h3>
      <p className="text-[12px] leading-relaxed text-red-900/80">
        Apaga o contato, a conversa e todo o histórico. É o direito de eliminação
        da LGPD — e o jeito de tirar um contato de teste da base. Não tem volta.
      </p>

      {!aberto ? (
        <button
          onClick={() => setAberto(true)}
          className="mt-2 w-full rounded-xl border border-red-300 bg-paper px-3 py-2 text-[13px] font-semibold text-red-700 transition-colors hover:bg-red-100"
        >
          Apagar dados deste contato
        </button>
      ) : (
        <div className="mt-2">
          <label className="mb-2 block">
            <span className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-red-700">
              De onde veio o pedido
            </span>
            <select
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
              className="mt-0.5 w-full rounded-xl border border-red-200 bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none focus:border-red-400"
            >
              {origens.map((o) => (
                <option key={o.valor} value={o.valor}>{o.rotulo}</option>
              ))}
            </select>
          </label>

          <label className="mb-2 block">
            <span className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-red-700">
              Escreva “{nome}” para confirmar
            </span>
            <input
              type="text"
              value={digitado}
              onChange={(e) => setDigitado(e.target.value)}
              placeholder={nome}
              className="mt-0.5 w-full rounded-xl border border-red-200 bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-red-400"
            />
          </label>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={apagar}
              // O botão só desbloqueia com texto digitado, mas quem CONFERE o
              // nome é o servidor. Um `disabled` é conveniência de tela; a trava
              // não pode morar num atributo que qualquer um remove.
              disabled={apagando || !digitado.trim()}
              className="flex-1 rounded-xl bg-red-600 px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-40"
            >
              {apagando ? "Apagando…" : "Apagar para sempre"}
            </button>
            <button
              onClick={() => {
                setAberto(false);
                setDigitado("");
              }}
              className="rounded-xl border border-line2 bg-paper px-3 py-2 text-[13px] font-semibold text-ink2 transition-colors hover:bg-canvas"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

function Nota({ score, temperatura }: { score: number | null; temperatura: string | null }) {
  // "Não pontuado" e "pontuado zero" são coisas diferentes, e a tela precisa
  // dizer qual das duas é. Um "0" no lugar de "—" arquivaria quem ninguém olhou.
  if (score === null) {
    return <Etiqueta texto="não pontuado" tom="border-line2 bg-chip text-muted" />;
  }

  return (
    <>
      <span className="rounded-full bg-ink px-2 py-0.5 text-[12px] font-semibold tabular-nums text-paper">
        {score}
      </span>
      {temperatura && (
        <Etiqueta
          texto={temperatura.toLowerCase().replace("_", " ")}
          tom={COR_TEMPERATURA[temperatura]}
        />
      )}
    </>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-2xl border border-line bg-paper p-3">
      <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {titulo}
      </h3>
      {children}
    </section>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <p className="flex items-baseline justify-between gap-2 py-0.5 text-[12.5px]">
      <span className="shrink-0 text-muted">{rotulo}</span>
      <span className="truncate text-right text-ink2">{valor || "—"}</span>
    </p>
  );
}

function Campo({
  rotulo,
  tipo = "text",
  ...resto
}: {
  rotulo: string;
  tipo?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="mb-2 block">
      <span className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {rotulo}
      </span>
      <input
        type={tipo}
        {...resto}
        className="mt-0.5 w-full rounded-xl border border-line2 bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-brand-400"
      />
    </label>
  );
}

function CampoLongo({
  rotulo,
  ...resto
}: {
  rotulo: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
}) {
  return (
    <label className="mb-2 block">
      <span className="block text-[11.5px] font-semibold uppercase tracking-[.04em] text-muted">
        {rotulo}
      </span>
      <textarea
        rows={2}
        {...resto}
        className="mt-0.5 w-full resize-none rounded-xl border border-line2 bg-paper px-2.5 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-brand-400"
      />
    </label>
  );
}
