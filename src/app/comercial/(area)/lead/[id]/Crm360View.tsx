/**
 * O CRM 360 DO LEAD, desenhado — tela 04 do desenho do CEO.
 *
 * Mesma doutrina da Central: componente PURO, sem `"use client"` e sem `fetch`.
 * Recebe a ficha já lida por `crm360.lerFichaDoLead` e devolve markup — que é o
 * que permite ao teste medir o HTML que o vendedor recebe, com dado saído do
 * serviço de verdade.
 *
 * ── O QUE ESTA TELA MOSTRA QUE NENHUMA OUTRA MOSTRAVA ───────────────────────
 *
 * A empresa, o decisor e o gatekeeper. Eles estavam gravados desde a
 * reestruturação e não apareciam em lugar nenhum. A ficha da conversa mostra a
 * PESSOA; esta mostra a pessoa, a casa dela, quem manda lá dentro e quem é só o
 * porteiro.
 *
 * ── ⛔ O QUE ELA NÃO FAZ ────────────────────────────────────────────────────
 *
 * Não envia mensagem, não move estágio, não cria proposta. É ficha. Os dois
 * únicos links saem para telas que já existem: a conversa e as filas.
 *
 * ── "NÃO MEDIDO" É UMA RESPOSTA, ZERO NÃO É ─────────────────────────────────
 *
 * `naoMedido()` existe para não haver neste arquivo um único `?? 0` nem um
 * `|| "—"` mudo. Score nulo vira "ninguém pontuou"; unidades nulas viram "não
 * apurado"; `deliveryProprio` tem TRÊS leituras (sim, não, não apurado) e as
 * três estão escritas, porque `false` e `null` significam coisas diferentes e
 * só uma delas manda alguém ir apurar.
 */

import Link from "next/link";
import type {
  CompromissoDaFicha,
  ContatoDaFicha,
  FichaDoLead,
  MensagemDaFicha,
  OportunidadeDaFicha,
  QualificacaoDaFicha,
  TarefaDaFicha,
} from "@/services/salaDeVendas/crm360";
import { Icone, Pilula, Rosca, cx, type Tom } from "../../_pecas/Pecas";
import { AbasDaFicha, TelefoneCopiavel, type AbaDaFicha } from "./AbasDaFicha";
import { tintaDe } from "../../qualificacao/tintaDaTemperatura";

const ROTULO_DO_GATEKEEPER: Record<string, string> = {
  BOT_DE_PEDIDOS: "Bot de pedidos",
  RECEPCIONISTA: "Recepcionista",
  ATENDENTE: "Atendente",
  SAC: "SAC",
  CAIXA: "Caixa",
  FORMULARIO: "Formulário",
  WHATSAPP_GERAL: "WhatsApp geral",
  CENTRAL_TELEFONICA: "Central telefônica",
  OUTRO: "Outro",
};

const ROTULO_DA_OPORTUNIDADE: Record<string, string> = {
  DESCOBERTA: "Descoberta",
  QUALIFICACAO: "Qualificação",
  PROPOSTA: "Proposta",
  NEGOCIACAO: "Negociação",
  GANHA: "Ganha",
  PERDIDA: "Perdida",
};

/** Centavos viram "R$ 249,00". Nunca chamada com `null` — quem chama decide antes. */
export function reais(centavos: number): string {
  return (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

/** A frase de um dado ausente. Sempre com o MOTIVO, nunca só um traço. */
export function naoMedido(motivo: string): string {
  return `não medido — ${motivo}`;
}

/** As três leituras de um booleano que pode ser nulo. */
export function simNaoOuNaoApurado(v: boolean | null): string {
  if (v === null) return naoMedido("ninguém apurou");
  return v ? "sim" : "não";
}

// ─────────────────────────────────────────────────────────────────────────────

function Campo(props: { rotulo: string; valor: string; medido?: boolean }) {
  const ausente = props.medido === false;
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-semibold uppercase tracking-[.04em] text-muted">
        {props.rotulo}
      </p>
      <p className={`mt-0.5 break-words text-[12.5px] ${ausente ? "text-muted" : "text-ink"}`}>
        {props.valor}
      </p>
    </div>
  );
}

function Bloco(props: { titulo: string; children: React.ReactNode; nota?: string }) {
  return (
    <section className="mt-5 rounded-2xl border border-line bg-paper p-4">
      <h2 className="text-[13px] font-semibold tracking-[-.01em] text-ink">{props.titulo}</h2>
      {props.nota && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{props.nota}</p>}
      <div className="mt-3">{props.children}</div>
    </section>
  );
}

function Vazio({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line2 bg-canvas px-3 py-3 text-[12.5px] leading-relaxed text-muted">
      {children}
    </p>
  );
}

function CartaoDoContato({ c }: { c: ContatoDaFicha }) {
  return (
    <li className="rounded-xl border border-line2 bg-canvas p-3">
      <p className="text-[13px] font-semibold text-ink">
        {c.nome}
        {c.ehDecisor && (
          <span className="ml-1.5 rounded-md bg-brand-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-brand-700">
            decisor
          </span>
        )}
        {c.ehGatekeeper && (
          <span className="ml-1.5 rounded-md bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-900">
            gatekeeper{c.tipoDeGatekeeper ? `: ${ROTULO_DO_GATEKEEPER[c.tipoDeGatekeeper] ?? c.tipoDeGatekeeper}` : ""}
          </span>
        )}
      </p>
      <p className="mt-0.5 text-[11.5px] text-muted">
        {c.cargo ?? naoMedido("cargo não informado")}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Campo rotulo="Canal" valor={c.canal ?? naoMedido("sem canal")} medido={Boolean(c.canal)} />
        <Campo
          rotulo="Telefone"
          valor={c.telefone ?? naoMedido("sem telefone")}
          medido={Boolean(c.telefone)}
        />
        <Campo rotulo="Confiança" valor={c.confianca} />
        <Campo
          rotulo="Como se soube"
          valor={c.comoFoiDescoberto ?? naoMedido("origem não registrada")}
          medido={Boolean(c.comoFoiDescoberto)}
        />
      </div>
    </li>
  );
}

function CartaoDaOportunidade({ o }: { o: OportunidadeDaFicha }) {
  return (
    <li className="rounded-xl border border-line2 bg-canvas p-3">
      <p className="text-[13px] font-semibold text-ink">
        {ROTULO_DA_OPORTUNIDADE[o.estagio] ?? o.estagio}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Campo
          rotulo="Valor potencial"
          valor={
            o.valorPotencialCents === null
              ? naoMedido("ninguém estimou")
              : reais(o.valorPotencialCents)
          }
          medido={o.valorPotencialCents !== null}
        />
        <Campo
          rotulo="Probabilidade"
          valor={o.probabilidade === null ? naoMedido("não estimada") : `${o.probabilidade}%`}
          medido={o.probabilidade !== null}
        />
        <Campo
          rotulo="Produto de interesse"
          valor={o.produtoDeInteresse ?? naoMedido("não registrado")}
          medido={Boolean(o.produtoDeInteresse)}
        />
        <Campo
          rotulo="Dor identificada"
          valor={o.dorIdentificada ?? naoMedido("não registrada")}
          medido={Boolean(o.dorIdentificada)}
        />
      </div>
      {o.objecoes.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {o.objecoes.map((ob, i) => (
            <li
              key={`${o.id}-ob-${i}`}
              className="rounded-lg bg-amber-50 px-2 py-1 text-[12px] leading-relaxed text-amber-900"
            >
              {ob}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OS TRÊS ESTADOS
// ─────────────────────────────────────────────────────────────────────────────

export function FichaCarregando() {
  return <p className="p-6 text-[13px] text-muted">Carregando a ficha…</p>;
}

export function FichaNaoEncontrada() {
  return (
    <div className="p-6">
      <p className="text-[13px] font-semibold text-ink">Lead não encontrado.</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
        Ou ele não existe, ou não está ao seu alcance. As duas respostas são a
        mesma de propósito: distinguir uma da outra entregaria o tamanho da base a
        quem estivesse testando ids.
      </p>
      <Link
        href="/comercial/conversas"
        className="mt-3 inline-block rounded-xl border border-line2 px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
      >
        Voltar para as conversas
      </Link>
    </div>
  );
}

export function FichaComErro({ detalhe }: { detalhe: string | null }) {
  return (
    <div className="p-6">
      <p className="text-[13px] font-semibold text-ink">A ficha não pôde ser lida.</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
        Nada é mostrado enquanto a leitura falhar — ficha meio carregada é pior
        que ficha nenhuma, porque parece completa.
      </p>
      {detalhe && <p className="mt-2 text-[11.5px] text-muted">Detalhe técnico: {detalhe}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────


// ═════════════════════════════════════════════════════════════════════════════
// AS PEÇAS QUE A PEÇA 04 PEDE E A FICHA NÃO TINHA
// ═════════════════════════════════════════════════════════════════════════════

/** As iniciais da pessoa. Não há foto de lead no cadastro — ver o cabeçalho. */
export function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return ((partes[0]![0] ?? "") + (partes.length > 1 ? (partes[partes.length - 1]![0] ?? "") : ""))
    .toUpperCase();
}

/** Data e hora como o desenho as escreve, no fuso de quem olha. */
export function emDataHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export function emData(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function humano(e: string): string {
  return e.charAt(0) + e.slice(1).toLowerCase().replace(/_/g, " ");
}

/**
 * A LEITURA DO LEAD SCORE em palavra — a "Muito alto" que o desenho põe ao lado
 * do 92.
 *
 * ⚠️ Ela é a leitura da TEMPERATURA gravada, não uma faixa redigitada aqui. Uma
 * tabela de cortes escrita nesta tela divergiria de `temperaturaDe` no dia em
 * que alguém mexesse na régua — e a ficha diria "muito alto" para um lead que o
 * termômetro chama de morno.
 */
export function leituraDoScore(temperatura: string | null): string | null {
  switch (temperatura) {
    case "PRIORIDADE_MAXIMA": return "Muito alto";
    case "QUENTE": return "Alto";
    case "MORNO": return "Médio";
    case "FRIO": return "Baixo";
    default: return temperatura ? humano(temperatura) : null;
  }
}

/** O tom da pílula de temperatura — a MESMA tabela da tela de qualificação. */
export function tomDaTemperatura(t: string | null): Tom {
  return t ? tintaDe(t).tom : "cinza";
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[.04em] text-muted">{children}</p>
  );
}

/** Uma linha "rótulo → valor" das Informações do Lead. */
function Ficha({ rotulo, valor, nota }: { rotulo: string; valor: string | null; nota?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-line py-1.5 last:border-0">
      <span className="text-[12px] text-muted">{rotulo}</span>
      <span
        className={cx(
          "max-w-[34ch] text-right text-[12.5px] leading-snug",
          valor === null ? "italic text-muted" : "text-ink",
        )}
      >
        {valor ?? "não informado — ninguém perguntou"}
      </span>
      {nota && <span className="w-full text-right text-[11px] leading-snug text-muted">{nota}</span>}
    </div>
  );
}

/** O cartão branco de cada bloco das abas. */
function Painel({
  titulo,
  children,
  acao,
  nota,
}: {
  titulo: string;
  children: React.ReactNode;
  acao?: React.ReactNode;
  nota?: string;
}) {
  return (
    <section className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-semibold tracking-[-.01em] text-ink">{titulo}</h2>
        {acao}
      </div>
      {nota && <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{nota}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/**
 * A LINHA DO TEMPO do desenho: bolinha com ícone, título, nota e a hora à
 * direita. O fio cinza liga os eventos.
 */
function LinhaDoTempo({ f }: { f: FichaDoLead }) {
  if (f.linhaDoTempo.length === 0) {
    return <Vazio>Nada registrado além das mensagens, que ficam na aba Conversas.</Vazio>;
  }
  return (
    <ol className="relative flex flex-col gap-3 pl-7">
      <span className="absolute bottom-2 left-[11px] top-2 w-px bg-line" aria-hidden="true" />
      {f.linhaDoTempo.map((ev) => (
        <li key={ev.id} className="relative">
          <span className="absolute -left-7 top-0 grid h-[22px] w-[22px] place-items-center rounded-full border border-line bg-paper text-muted">
            <Icone nome={ev.interna ? "chave" : "relogio"} className="h-3 w-3" />
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="text-[12.5px] font-semibold leading-snug text-ink">{ev.titulo}</p>
            <p className="shrink-0 text-[11px] tabular-nums text-muted">{emDataHora(ev.quando)}</p>
          </div>
          {ev.nota && <p className="text-[12px] leading-snug text-ink2">{ev.nota}</p>}
          <p className="text-[11px] text-muted">
            {ev.autor}
            {ev.interna ? " · interna" : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

/** Uma bolha de conversa. Quem mandou decide o lado e a cor, como no desenho. */
function Bolha({ m }: { m: MensagemDaFicha }) {
  const daCasa = m.direcao === "SAIDA";
  return (
    <li className={cx("flex", daCasa ? "justify-end" : "justify-start")}>
      <div
        className={cx(
          "max-w-[46ch] rounded-2xl px-3 py-2",
          daCasa ? "bg-emerald-50 text-ink" : "bg-canvas text-ink",
        )}
      >
        <p className="text-[11px] font-semibold text-muted">
          {daCasa ? (m.autorNome ?? (m.autor ? humano(m.autor) : "Foocci")) : "O lead"}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] leading-relaxed">
          {m.texto ?? (
            <span className="italic text-muted">
              {humano(m.tipo)} sem texto — o conteúdo está na conversa
            </span>
          )}
        </p>
        <p className="mt-0.5 text-right text-[10.5px] tabular-nums text-muted">
          {emDataHora(m.quando)}
          {daCasa ? ` · ${humano(m.status)}` : ""}
        </p>
      </div>
    </li>
  );
}

function CartaoDaTarefa({ t }: { t: TarefaDaFicha }) {
  return (
    <li
      className={cx(
        "rounded-xl border p-3",
        t.vencida ? "border-red-200 bg-red-50/60" : "border-line2 bg-canvas",
      )}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[13px] font-semibold text-ink">{t.titulo}</p>
        <Pilula tom={t.concluidaEm ? "verde" : t.vencida ? "vermelho" : "azul"}>
          {humano(t.situacao)}
        </Pilula>
      </div>
      {t.nota && <p className="mt-1 text-[12px] leading-relaxed text-ink2">{t.nota}</p>}
      <p className="mt-1 text-[11.5px] text-muted">
        {humano(t.tipo)} · vence {emDataHora(t.venceEm)}
        {t.concluidaEm ? ` · concluída ${emDataHora(t.concluidaEm)}` : ""}
        {t.vencida ? " · prazo vencido e ninguém fechou" : ""}
        {" · "}
        {t.responsavelNome ?? "sem responsável"}
      </p>
    </li>
  );
}

function CartaoDoCompromisso({ c }: { c: CompromissoDaFicha }) {
  return (
    <li className="rounded-xl border border-line2 bg-canvas p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <p className="text-[13px] font-semibold text-ink">{c.titulo}</p>
        <Pilula tom={c.situacao === "CANCELADO" ? "vermelho" : "azul"}>{humano(c.situacao)}</Pilula>
      </div>
      {c.nota && <p className="mt-1 text-[12px] leading-relaxed text-ink2">{c.nota}</p>}
      <p className="mt-1 text-[11.5px] text-muted">
        {emDataHora(c.comecaEm)} · {c.duracaoMin} min
        {c.local ? ` · ${c.local}` : ""} · {c.responsavelNome ?? "sem responsável"}
      </p>
    </li>
  );
}

/**
 * A FICHA DE QUALIFICAÇÃO — o que o SDR preencheu para o closer.
 *
 * Ordem do CEO: quanto mais completa, melhor. Por isso **toda** pergunta
 * aparece, inclusive as sem resposta: uma ficha que esconde o que não foi
 * perguntado parece completa, e é justamente a lista do que falta que faz a
 * próxima conversa acontecer.
 */
function FichaDeQualificacao({ q }: { q: QualificacaoDaFicha | null }) {
  if (!q) {
    return (
      <Vazio>
        Ninguém abriu a ficha de qualificação deste lead. Não é uma ficha vazia —
        é uma ficha que não existe, e a diferença é quem precisa ir perguntar.
      </Vazio>
    );
  }

  const lista = (v: string[]) => (v.length > 0 ? v.join(", ") : null);

  return (
    <div>
      <Ficha rotulo="Segmento" valor={q.segmento} />
      <Ficha rotulo="Unidades" valor={q.unidades === null ? null : String(q.unidades)} />
      <Ficha
        rotulo="Pedidos por mês"
        valor={q.volumeMensal === null ? null : String(q.volumeMensal)}
      />
      <Ficha rotulo="Canais que usa hoje" valor={lista(q.canaisAtuais)} />
      <Ficha rotulo="Marketplace" valor={q.marketplaceAtual} />
      <Ficha rotulo="Sistema atual" valor={q.sistemaAtual} />
      <Ficha rotulo="Dor principal" valor={q.dorPrincipal} />
      <Ficha rotulo="Objetivo" valor={q.objetivo} />
      <Ficha rotulo="Plano de interesse" valor={q.planoDeInteresse} />
      <Ficha rotulo="Urgência" valor={q.urgencia} />
      <Ficha rotulo="Quem decide" valor={q.poderDeDecisao} />
      <Ficha
        rotulo="Faixa de orçamento"
        valor={q.faixaDeOrcamento}
        nota={
          q.faixaDeOrcamento
            ? undefined
            : "não é lacuna cobrada: perguntar preço cedo demais queima a conversa"
        }
      />
      <Ficha rotulo="Objeções" valor={lista(q.objecoes)} />
      <Ficha rotulo="Funcionalidades de interesse" valor={lista(q.funcionalidadesDeInteresse)} />
      <Ficha rotulo="Pedido explícito" valor={q.pedidoExplicito} />
      {(q.pediuHumano || q.pediuPararSondagem) && (
        <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12px] leading-relaxed text-amber-900">
          {q.pediuHumano ? "Este lead pediu falar com gente. " : ""}
          {q.pediuPararSondagem ? "Ele pediu para a sondagem parar — não insistir em perguntas." : ""}
        </p>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// A TELA
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O CABEÇALHO DO LEAD — a faixa branca do topo da peça 04.
 *
 * ── AS TRÊS ADAPTAÇÕES, E O PORQUÊ DE CADA UMA ──────────────────────────────
 *
 *   · **Foto** — o desenho tem retrato do lead. Não existe foto de lead em
 *     lugar nenhum da nossa base (nem campo, nem arquivo), e não se busca
 *     imagem de pessoa na internet para preencher ficha. Entram as iniciais.
 *   · **"Cliente pessoa física"** — o desenho afirma a natureza jurídica. Nós
 *     não a apuramos; o que temos é o tipo de cozinha (`tipo`). Fica o que é
 *     verdade, e o rótulo diz o que ele é.
 *   · **"Alterar" o vendedor** — ver `VendedorResponsavel`.
 */
function CabecalhoDoLead({ f }: { f: FichaDoLead }) {
  const p = f.pessoa;
  const leitura = leituraDoScore(p.temperatura);

  return (
    <section className="rounded-2xl border border-line bg-paper p-4">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,.9fr)]">
        {/* ── A PESSOA ───────────────────────────────────────────────── */}
        <div className="flex min-w-0 gap-3">
          <span
            className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full bg-chip text-[22px] font-semibold text-ink2"
            aria-hidden="true"
          >
            {iniciais(p.nome)}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-[20px] font-semibold tracking-[-.02em] text-ink">{p.nome}</h1>
              {p.temperatura ? (
                <Pilula tom={tomDaTemperatura(p.temperatura)}>
                  Lead {humano(p.temperatura)}
                </Pilula>
              ) : (
                <span className="text-[11.5px] italic text-muted">
                  ninguém pontuou — não é frio
                </span>
              )}
            </div>
            <p className="mt-1 text-[12.5px] text-ink2">
              <TelefoneCopiavel numero={p.whatsapp} />
            </p>
            <p className="text-[12.5px] text-ink2">
              {p.email ?? <span className="italic text-muted">e-mail não informado</span>}
            </p>
            <p className="mt-0.5 text-[12px] text-muted">
              {p.cidade ?? "cidade não informada"}
              {" · "}
              {p.tipo ? `cozinha ${p.tipo}` : "tipo de cozinha não apurado"}
            </p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">
              O desenho traz aqui &quot;Cliente pessoa física&quot;. Natureza jurídica não é
              apurada nesta base — no lugar dela fica o que de fato se sabe.
            </p>
          </div>
        </div>

        {/* ── ORIGEM E PRODUTO ───────────────────────────────────────── */}
        <div className="min-w-0 border-line lg:border-l lg:pl-5">
          <Rotulo>Canal de origem</Rotulo>
          <p className="mt-0.5 text-[14px] font-semibold text-ink">{humano(p.fonte)}</p>
          <p className="text-[11.5px] text-muted">
            {p.campanha ?? (p.origem ? `página: ${p.origem}` : "sem campanha identificada")}
          </p>

          <div className="mt-3">
            <Rotulo>Produto de interesse</Rotulo>
            <p className="mt-0.5 text-[14px] font-semibold text-ink">
              {f.qualificacao?.planoDeInteresse ?? (
                <span className="text-[12.5px] font-normal italic text-muted">
                  não perguntado
                </span>
              )}
            </p>
            <p className="text-[11.5px] text-muted">
              O desenho mostra o preço do plano ao lado. O valor de uma proposta
              deste lead está na aba Compras — preço de tabela aqui seria número
              que ninguém negociou.
            </p>
          </div>

          <div className="mt-3">
            <Rotulo>Status do lead</Rotulo>
            <p className="mt-0.5 text-[13.5px] font-semibold text-ink">{humano(p.stage)}</p>
            <p className="text-[11.5px] text-muted">desde {emData(p.stageDesde)}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-muted">
              O desenho põe um seletor aqui. Mover de etapa tem regra própria
              (PERDIDO exige motivo, GANHO é desfecho) e mora na{" "}
              <Link href="/comercial/funil" className="underline">
                tela do funil
              </Link>{" "}
              e na mesa da{" "}
              <Link href="/comercial/qualificacao" className="underline">
                qualificação
              </Link>
              . Um segundo seletor aqui seria uma segunda régua de funil.
            </p>
          </div>
        </div>

        {/* ── SCORE E VENDEDOR ───────────────────────────────────────── */}
        <div className="min-w-0 border-line lg:border-l lg:pl-5">
          <Rotulo>Lead Score</Rotulo>
          {p.score === null ? (
            <p className="mt-1 max-w-[30ch] text-[12px] italic leading-snug text-muted">
              ninguém pontuou este lead — e isso não é zero: zero diria
              &quot;avaliado e não presta&quot;
            </p>
          ) : (
            <div className="mt-1 flex items-center gap-3">
              <Rosca
                rotuloDoCentro="Score"
                total={100}
                centro={p.score}
                semLegenda
                motivo="sem régua"
                fatias={[
                  { rotulo: `${p.score} pontos`, valor: p.score, tom: tomDaTemperatura(p.temperatura) },
                  { rotulo: "o que falta somar", valor: Math.max(0, 100 - p.score), tom: "cinza" },
                ]}
              />
            </div>
          )}
          {leitura && p.score !== null && (
            <p className="mt-1 text-[13px] font-semibold text-ink">{leitura}</p>
          )}

          <div className="mt-3">
            <VendedorResponsavel f={f} />
          </div>
        </div>
      </div>
    </section>
  );
}

/**
 * O VENDEDOR RESPONSÁVEL, com o ato que EXISTE.
 *
 * ⚠️ O desenho tem um link **"Alterar"** ao lado do nome, que passa o lead para
 * outra pessoa. Esse ato **não existe nesta casa**: a única troca de dono que o
 * sistema tem é *assumir para si* (`/api/admin/sala-de-vendas/responsavel`,
 * ação `assumir`) — designar terceiro não tem rota, nem regra, nem registro de
 * handoff correspondente. Desenhar "Alterar" abriria um menu que não salvaria
 * nada, e a regra 3 da moldura é clara: ato que não existe não vira botão.
 *
 * Fica escrito o que é verdade e o caminho de quem quiser pegar o lead.
 */
function VendedorResponsavel({ f }: { f: FichaDoLead }) {
  const p = f.pessoa;

  return (
    <>
      <Rotulo>Vendedor responsável</Rotulo>
      {f.vendedor ? (
        <>
          <p className="mt-0.5 text-[13.5px] font-semibold text-ink">{f.vendedor.nome}</p>
          {f.vendedor.desde && (
            <p className="text-[11.5px] text-muted">responde desde {emData(f.vendedor.desde)}</p>
          )}
        </>
      ) : (
        <p className="mt-0.5 text-[12.5px] text-ink2">
          {p.atendidoPor === "NINGUEM"
            ? "ninguém assumiu — está na fila"
            : `sem gente: ${humano(p.atendidoPor)}`}
        </p>
      )}
      <p className="mt-1 text-[11px] leading-snug text-muted">
        O desenho traz &quot;Alterar&quot; aqui. Passar o lead para outra pessoa não é
        um ato que este sistema tem — só existe <em>assumir para si</em>, nas{" "}
        <Link href="/comercial/conversas" className="underline">
          conversas
        </Link>
        , onde ele fica registrado como handoff.
      </p>
    </>
  );
}

/**
 * A COLUNA DA IA da peça 04 — "Análise e Insights da IA".
 *
 * ⛔ Cada bloco só aparece com o dado que o sustenta. O desenho tem um parágrafo
 * de leitura ("Lead com alto potencial de compra…") que nenhuma tabela nossa
 * produz: não há resumo gravado por IA para o lead. Escrever um texto plausível
 * aqui seria a pior mentira desta tela, porque é a que mais parece análise.
 */
function AnaliseDaIA({ f }: { f: FichaDoLead }) {
  const q = f.qualificacao;
  const op = f.oportunidade;
  const objecoes = [...new Set([...(q?.objecoes ?? []), ...(op?.objecoes ?? [])])];

  return (
    <section className="rounded-2xl border border-ia-200 bg-ia-50 p-4">
      <div className="flex items-center gap-2">
        <Icone nome="faisca" className="h-4 w-4 text-ia-600" />
        <h2 className="text-[13px] font-semibold text-ia-800">Análise e insights</h2>
      </div>

      <p className="mt-2 rounded-xl border border-ia-200 bg-paper px-3 py-2 text-[11.5px] leading-relaxed text-ink2">
        O desenho abre este cartão com um parágrafo de leitura do lead. Nenhuma
        tabela guarda um resumo desses — e um texto plausível escrito aqui seria
        a mentira mais cara da ficha, porque é a que mais parece análise. O que
        segue são fatos gravados.
      </p>

      <div className="mt-3">
        <Rotulo>Principais objeções</Rotulo>
        {objecoes.length > 0 ? (
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[12.5px] leading-relaxed text-ink2">
            {objecoes.map((o, i) => (
              <li key={`obj-${i}`}>{o}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-0.5 text-[12px] italic leading-snug text-muted">
            nenhuma registrada — não é ausência de objeção, é ausência de registro
          </p>
        )}
      </div>

      <div className="mt-3">
        <Rotulo>Probabilidade de compra</Rotulo>
        {op?.probabilidade === undefined || op?.probabilidade === null ? (
          <p className="mt-0.5 max-w-[34ch] text-[12px] italic leading-snug text-muted">
            {op
              ? "ninguém estimou a probabilidade desta oportunidade"
              : "não há oportunidade aberta — a probabilidade mora nela"}
          </p>
        ) : (
          <div className="mt-1 flex items-center gap-2">
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-paper">
              <span
                className="block h-full rounded-full bg-ia-500"
                style={{ width: `${Math.max(0, Math.min(100, op.probabilidade))}%` }}
              />
            </span>
            <span className="shrink-0 text-[15px] font-semibold tabular-nums text-ia-800">
              {op.probabilidade}%
            </span>
          </div>
        )}
      </div>

      <div className="mt-3">
        <Rotulo>Próximo follow-up</Rotulo>
        {f.pessoa.proximaAcaoEm ? (
          <>
            <p className="mt-0.5 text-[13px] font-semibold text-ink">
              {emDataHora(f.pessoa.proximaAcaoEm)}
            </p>
            {f.pessoa.proximaAcaoNota && (
              <p className="text-[12px] leading-snug text-ink2">{f.pessoa.proximaAcaoNota}</p>
            )}
            <p className="mt-1 text-[11px] leading-snug text-muted">
              O desenho tem &quot;Marcar como realizado&quot; aqui. Dar o follow-up por
              feito é ato, e o que o encerra é a próxima interação registrada na
              conversa — um botão nesta ficha marcaria por fora do que a operação
              mede.
            </p>
          </>
        ) : (
          <p className="mt-0.5 text-[12px] italic leading-snug text-muted">
            nenhum agendado
          </p>
        )}
      </div>

      <div className="mt-3">
        <Rotulo>Campanha de atribuição</Rotulo>
        <p className="mt-0.5 text-[13px] font-semibold text-ink">
          {f.pessoa.campanha ?? (
            <span className="text-[12px] font-normal italic text-muted">
              nenhuma campanha identificada no primeiro toque
            </span>
          )}
        </p>
        <p className="text-[11.5px] text-muted">
          {[f.pessoa.utmSource, f.pessoa.utmMedium].filter(Boolean).join(" · ") ||
            "sem origem de anúncio gravada"}
        </p>
      </div>

      <div className="mt-3">
        <Rotulo>Observações importantes</Rotulo>
        {f.qualificacao?.observacoes ? (
          <>
            <p className="mt-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] leading-relaxed text-amber-900">
              {f.qualificacao.observacoes}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted">
              O desenho assina a observação (&quot;adicionada por Fulano em tal dia&quot;).
              A ficha guarda um texto só, sem autor nem data — a assinatura não
              existe no banco, e inventá-la daria a uma anotação a autoridade de
              outra pessoa.
            </p>
          </>
        ) : (
          <p className="mt-0.5 text-[12px] italic leading-snug text-muted">
            nenhuma observação na ficha de qualificação
          </p>
        )}
      </div>
    </section>
  );
}

export function Crm360View({ f }: { f: FichaDoLead }) {
  const p = f.pessoa;

  const abas: AbaDaFicha[] = [
    {
      id: "resumo",
      rotulo: "Resumo",
      icone: "alvo",
      conteudo: (
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)_minmax(0,.95fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            <Painel
              titulo="Informações do lead"
              nota="O que a base sabe desta pessoa. O que ninguém perguntou aparece dito, não escondido."
            >
              <Ficha rotulo="Nome completo" valor={p.nome} />
              <Ficha rotulo="Telefone" valor={p.whatsapp} />
              <Ficha rotulo="E-mail" valor={p.email} />
              <Ficha rotulo="Empresa" valor={p.restaurante} />
              <Ficha
                rotulo="Cargo"
                valor={f.decisor?.cargo ?? null}
                nota={
                  f.decisor?.cargo
                    ? "do contato decisor da empresa"
                    : "o lead não tem cargo próprio na base — só os contatos da empresa têm"
                }
              />
              <Ficha rotulo="Localização" valor={p.cidade} />
              <Ficha rotulo="Origem" valor={humano(p.fonte)} />
              <Ficha rotulo="Produto de interesse" valor={f.qualificacao?.planoDeInteresse ?? null} />
              {/* ⚠️ A pergunta do desenho que NÃO existe como campo. */}
              <Ficha
                rotulo="Como nos conheceu?"
                valor={p.comoNosConheceu}
                nota="⚠️ não é a resposta da pessoa: não há campo que a guarde. É de onde o clique veio, medido por nós (utm/referrer)."
              />
              <Ficha rotulo="Data de cadastro" valor={emDataHora(p.criadoEm)} />
              <Ficha
                rotulo="Última atividade"
                valor={p.ultimaAtividadeEm ? emDataHora(p.ultimaAtividadeEm) : null}
              />
            </Painel>

            <Painel titulo="Tags" nota="Etiquetas livres do time comercial.">
              <Etiquetas tags={p.tags} />
            </Painel>
          </div>

          <div className="flex min-w-0 flex-col gap-4">
            <Painel titulo="Linha do tempo" nota="Do mais recente para o mais antigo.">
              <LinhaDoTempo f={f} />
            </Painel>

            <Painel
              titulo="Últimas conversas"
              acao={
                <Link
                  href={`/comercial/conversas?leadId=${p.leadId}`}
                  className="text-[12px] font-semibold text-brand-600 hover:underline"
                >
                  Ver todas
                </Link>
              }
              nota="O desenho põe aqui uma caixa de anotação interna. Anotação interna não tem tabela nesta base — o que existe são mensagens, e mensagem escrita aqui iria para o lead. Enquanto não houver onde guardar, a caixa não é desenhada."
            >
              <Conversas f={f} />
            </Painel>

            <Painel
              titulo="Compras / oportunidades"
              nota="O negócio em si — separado da etapa da conversa. Criar oportunidade é ato do fluxo comercial, e não desta ficha."
            >
              {f.oportunidades.length === 0 ? (
                <Vazio>Nenhuma oportunidade aberta para este lead.</Vazio>
              ) : (
                <ul className="flex flex-col gap-2">
                  {f.oportunidades.map((o) => (
                    <CartaoDaOportunidade key={o.id} o={o} />
                  ))}
                </ul>
              )}
            </Painel>
          </div>

          <AnaliseDaIA f={f} />
        </div>
      ),
    },
    {
      id: "historico",
      rotulo: "Histórico",
      icone: "relogio",
      contagem: f.linhaDoTempo.length,
      conteudo: (
        <div className="mt-4">
          <Painel
            titulo="Tudo o que aconteceu"
            nota="A trilha inteira do lead: etapa, abordagem, resposta, proposta. É a fonte da verdade — a etapa atual é só o cache do último evento."
          >
            <LinhaDoTempo f={f} />
          </Painel>
        </div>
      ),
    },
    {
      id: "compras",
      rotulo: "Compras",
      icone: "dinheiro",
      contagem: f.oportunidades.length + f.propostas.length,
      conteudo: (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Painel titulo="Oportunidades">
            {f.oportunidades.length === 0 ? (
              <Vazio>Nenhuma oportunidade registrada para este lead.</Vazio>
            ) : (
              <ul className="flex flex-col gap-2">
                {f.oportunidades.map((o) => (
                  <CartaoDaOportunidade key={o.id} o={o} />
                ))}
              </ul>
            )}
          </Painel>
          <Painel titulo="Propostas">
            {f.propostas.length === 0 ? (
              <Vazio>Nenhuma proposta emitida.</Vazio>
            ) : (
              <ul className="flex flex-col gap-2">
                {f.propostas.map((pr) => (
                  <li
                    key={pr.id}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-xl border border-line2 bg-canvas px-3 py-2.5"
                  >
                    <span>
                      <span className="text-[13px] font-semibold text-ink">
                        {pr.plano ?? naoMedido("plano não registrado")}
                      </span>
                      <span className="block text-[11.5px] text-muted">
                        {pr.situacao}
                        {pr.vencida ? " · validade vencida" : ""}
                      </span>
                    </span>
                    <span className="text-[12.5px] text-ink2">
                      {pr.valorMensalCent === null
                        ? naoMedido("sem valor")
                        : `${reais(pr.valorMensalCent)}/mês`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Painel>
        </div>
      ),
    },
    {
      id: "conversas",
      rotulo: "Conversas",
      icone: "pessoas",
      contagem: f.totalDeMensagens,
      conteudo: (
        <div className="mt-4">
          <Painel
            titulo="O fio da conversa"
            acao={
              <Link
                href={`/comercial/conversas?leadId=${p.leadId}`}
                className="text-[12px] font-semibold text-brand-600 hover:underline"
              >
                Abrir a conversa
              </Link>
            }
            nota="Ficha é leitura. Responder acontece na tela de conversas, onde está o freio de consentimento e a trilha do que saiu."
          >
            <Conversas f={f} todas />
          </Painel>
        </div>
      ),
    },
    {
      id: "tags",
      rotulo: "Tags",
      icone: "chave",
      contagem: p.tags.length,
      conteudo: (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Painel
            titulo="Etiquetas do time"
            nota="O desenho tem '+ Adicionar tag'. Etiquetar é ato, e esta ficha é leitura — o botão não é desenhado enquanto a escrita não tiver caminho próprio, com registro de quem etiquetou."
          >
            <Etiquetas tags={p.tags} />
          </Painel>
          <Painel
            titulo="Ficha de qualificação"
            nota="O que o SDR levantou para o closer. Toda pergunta aparece — inclusive as que ninguém fez."
          >
            <FichaDeQualificacao q={f.qualificacao} />
          </Painel>
        </div>
      ),
    },
    {
      id: "atividades",
      rotulo: "Atividades",
      icone: "agenda",
      contagem: f.tarefas.length + f.compromissos.length,
      conteudo: (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Painel titulo="Tarefas">
            {f.tarefas.length === 0 ? (
              <Vazio>
                Nenhuma tarefa para este lead. Vazio aqui é ausência de tarefa, e
                não &quot;tudo em dia&quot;.
              </Vazio>
            ) : (
              <ul className="flex flex-col gap-2">
                {f.tarefas.map((t) => (
                  <CartaoDaTarefa key={t.id} t={t} />
                ))}
              </ul>
            )}
          </Painel>
          <Painel titulo="Compromissos">
            {f.compromissos.length === 0 ? (
              <Vazio>Nenhuma reunião ou visita marcada.</Vazio>
            ) : (
              <ul className="flex flex-col gap-2">
                {f.compromissos.map((c) => (
                  <CartaoDoCompromisso key={c.id} c={c} />
                ))}
              </ul>
            )}
          </Painel>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-full bg-canvas px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        {/* ⚠️ A migalha do desenho diz "Leads" e o menu aceso é "Painel" — é
            incoerência da própria imagem. Aqui as duas dizem Leads. */}
        <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <p className="text-[12px] text-muted">
              <Link href="/comercial/qualificacao" className="hover:underline">
                Leads
              </Link>{" "}
              › Perfil do Lead
            </p>
            <h1 className="text-[22px] font-semibold tracking-tight text-ink">
              Perfil do Lead / CRM 360
            </h1>
            <p className="mt-0.5 max-w-[80ch] text-[13px] leading-snug text-ink2">
              Visão completa do lead: dados, histórico, conversas e oportunidades em um só lugar.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/comercial/qualificacao"
              className="rounded-xl border border-line bg-paper px-3 py-1.5 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-canvas"
            >
              ← Voltar
            </Link>
            <Link
              href={`/comercial/conversas?leadId=${p.leadId}`}
              className="rounded-xl bg-brand-500 px-3.5 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-600"
            >
              Abrir conversa
            </Link>
          </div>
        </header>

        {p.optOutEm && (
          <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] font-semibold leading-relaxed text-amber-900">
            Este contato pediu silêncio em {emData(p.optOutEm)}. Não abordar.
          </p>
        )}

        <p className="mt-3 max-w-[100ch] text-[11.5px] leading-snug text-muted">
          O desenho traz o botão <strong className="text-ink2">Editar Lead</strong> no topo.
          Esta ficha é <strong className="text-ink2">leitura</strong>: ela não envia mensagem,
          não cria proposta e não edita cadastro. O que ela faz é reunir num lugar só o que
          estava gravado e invisível.
        </p>

        <div className="mt-4">
          <CabecalhoDoLead f={f} />
        </div>

        <AbasDaFicha abas={abas} />

        {/* ── A EMPRESA, O DECISOR E O PORTEIRO ───────────────────────────
            Fora das abas de propósito: eles não estão na peça 04, e são a
            única coisa que esta ficha mostra e nenhuma outra tela mostra.
            Enfiá-los dentro de uma aba do desenho os esconderia. */}
        <Bloco
          titulo="A empresa"
          nota="A casa do contato, do jeito que a jornada comercial a conhece. Não está na peça 04 do desenho — é nosso, e some se ficar escondido numa aba."
        >
          {!f.empresa ? (
            <Vazio>
              Este lead ainda não foi ligado a uma empresa da jornada. Sem empresa
              não há ICP, nem decisor, nem gatekeeper — e é isso que está faltando,
              não um zero.
            </Vazio>
          ) : (
            <DadosDaEmpresa e={f.empresa} />
          )}
        </Bloco>

        <Bloco
          titulo="Quem manda, e quem é o porteiro"
          nota="Gatekeeper não é o cliente: é o caminho até ele."
        >
          {f.contatos.length === 0 ? (
            <Vazio>
              Nenhum contato registrado nesta empresa. Isto não diz que não há
              decisor — diz que ninguém o encontrou ainda.
            </Vazio>
          ) : (
            <>
              {!f.decisor && (
                <p className="mb-2 text-[12px] leading-relaxed text-muted">
                  Decisor ainda não encontrado. Os contatos abaixo são o que se sabe até aqui.
                </p>
              )}
              <ul className="flex flex-col gap-2">
                {f.contatos.map((c) => (
                  <CartaoDoContato key={c.id} c={c} />
                ))}
              </ul>
            </>
          )}
        </Bloco>

        <Bloco
          titulo="Estado de follow-up"
          nota="O estado E o porquê — número sem explicação ninguém contesta."
        >
          {!f.followUp ? (
            <Vazio>Não classificado.</Vazio>
          ) : (
            <>
              <p className="text-[13px] font-semibold text-ink">{f.followUp.classificacao.estado}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-ink2">
                {f.followUp.classificacao.porque}
              </p>
              <p className="mt-1 text-[11.5px] text-muted">
                regra: {f.followUp.classificacao.regra}
              </p>
            </>
          )}
        </Bloco>
      </div>
    </div>
  );
}

/** As tags do lead, como pílulas. Sem tag, o vazio diz o que isso significa. */
function Etiquetas({ tags }: { tags: string[] }) {
  if (tags.length === 0) {
    return (
      <Vazio>
        Nenhuma etiqueta. Ninguém classificou este lead à mão — não é um lead sem
        características, é um lead que ninguém marcou.
      </Vazio>
    );
  }
  return (
    <ul className="flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <li key={t}>
          <Pilula tom="azul">{t}</Pilula>
        </li>
      ))}
    </ul>
  );
}

/** As bolhas da conversa. `todas` muda só o recorte mostrado, não a fonte. */
function Conversas({ f, todas }: { f: FichaDoLead; todas?: boolean }) {
  const recorte = todas ? f.conversas : f.conversas.slice(0, 5);

  if (recorte.length === 0) {
    return (
      <Vazio>
        Nenhuma mensagem trocada com este lead. Vazio aqui é silêncio de verdade —
        ninguém falou com ele, e ele não falou com a gente.
      </Vazio>
    );
  }

  return (
    <>
      {/* Do mais antigo para o mais recente DENTRO do recorte: a leitura de uma
          conversa é de cima para baixo, mesmo quando o recorte pegou o fim. */}
      <ul className="flex flex-col gap-2">
        {[...recorte].reverse().map((m) => (
          <Bolha key={m.id} m={m} />
        ))}
      </ul>
      {f.totalDeMensagens > recorte.length && (
        <p className="mt-2 text-[11.5px] text-muted">
          Mostrando {recorte.length} de {f.totalDeMensagens} mensagens. O resto está na
          conversa — recorte que não se anuncia faz alguém concluir que o lead falou
          cinco vezes quando falou {f.totalDeMensagens}.
        </p>
      )}
    </>
  );
}

/** Os campos da empresa, como já estavam. Extraído para caber no corpo novo. */
function DadosDaEmpresa({ e }: { e: NonNullable<FichaDoLead["empresa"]> }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <Campo rotulo="Nome" valor={e.nome} />
      <Campo
        rotulo="Categoria"
        valor={e.categoria ?? naoMedido("não classificada")}
        medido={Boolean(e.categoria)}
      />
      <Campo
        rotulo="Onde fica"
        valor={
          [e.bairro, e.cidade, e.estado].filter(Boolean).join(", ") ||
          naoMedido("endereço não apurado")
        }
        medido={Boolean(e.cidade ?? e.estado ?? e.bairro)}
      />
      <Campo rotulo="Estágio" valor={e.estagio} />
      <Campo
        rotulo="ICP"
        valor={e.scoreIcp === null ? naoMedido("ninguém mediu o ICP") : String(e.scoreIcp)}
        medido={e.scoreIcp !== null}
      />
      <Campo
        rotulo="Prioridade"
        valor={e.prioridade ?? naoMedido("não priorizada")}
        medido={Boolean(e.prioridade)}
      />
      <Campo
        rotulo="Unidades"
        valor={e.numeroDeUnidades === null ? naoMedido("não apurado") : String(e.numeroDeUnidades)}
        medido={e.numeroDeUnidades !== null}
      />
      <Campo
        rotulo="Delivery próprio"
        valor={simNaoOuNaoApurado(e.deliveryProprio)}
        medido={e.deliveryProprio !== null}
      />
      <Campo
        rotulo="Cardápio próprio"
        valor={simNaoOuNaoApurado(e.cardapioProprio)}
        medido={e.cardapioProprio !== null}
      />
      <Campo
        rotulo="Marketplaces"
        valor={
          e.marketplaces.length > 0
            ? e.marketplaces.join(", ")
            : e.apuradoMarketplaceEm
              ? "apurado: nenhum"
              : naoMedido("nunca apurado")
        }
        medido={e.marketplaces.length > 0 || Boolean(e.apuradoMarketplaceEm)}
      />
      <Campo
        rotulo="Sistema atual"
        valor={e.sistemaIdentificado ?? naoMedido("não identificado")}
        medido={Boolean(e.sistemaIdentificado)}
      />
      <Campo
        rotulo="Ticket estimado"
        valor={
          e.ticketEstimadoCents === null
            ? naoMedido("não estimado")
            : reais(e.ticketEstimadoCents)
        }
        medido={e.ticketEstimadoCents !== null}
      />
      <Campo rotulo="Descoberta por" valor={e.fonteDaDescoberta} />
    </div>
  );
}
