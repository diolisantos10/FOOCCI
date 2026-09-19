/**
 * AS PEÇAS COMPARTILHADAS DAS TELAS NOVAS DA ÁREA COMERCIAL.
 *
 * ── POR QUE COMPARTILHAR SÓ ISTO, E NADA MAIS ───────────────────────────────
 *
 * Torre, Central SDR e CRM IA são três telas com três perguntas diferentes.
 * O que elas têm em comum não é o conteúdo — é a GRAMÁTICA: o que é uma seção,
 * como um número aparece, e, sobretudo, **como se escreve um número que
 * ninguém mediu**. Essa última é a que não pode divergir entre telas: se uma
 * escreve "0" e a outra escreve "não medido" para a mesma ausência, o operador
 * aprende a ler zero como ausência — e a partir daí o zero verdadeiro, o que
 * merece ação, passa despercebido.
 *
 * Nada aqui inventa, arredonda ou completa dado. Estas peças só desenham.
 *
 * ⚠️ Pasta com `_` na frente: o Next não cria rota a partir dela.
 */

import * as React from "react";

export function cx(...p: Array<string | false | null | undefined>): string {
  return p.filter(Boolean).join(" ");
}

/** O formato que os serviços da casa usam para "medi ou não medi". */
export type Medida<T> = { medido: true; valor: T } | { medido: false; motivo: string };

export function Secao({
  titulo,
  descricao,
  children,
}: {
  titulo: string;
  descricao?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-[.08em] text-muted">{titulo}</h2>
        {descricao ? (
          <p className="mt-0.5 max-w-[80ch] text-[12px] leading-snug text-muted">{descricao}</p>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/**
 * A ausência de medição, escrita.
 *
 * Nunca um traço mudo e nunca um zero: o motivo aparece junto, porque
 * "não medido" sem motivo é a mesma parede de "0" — ninguém sabe o que fazer
 * com ela.
 */
export function NaoMedido({ motivo }: { motivo: string }) {
  return (
    <span className="inline-flex flex-col gap-0.5">
      <span className="text-[13px] font-normal italic text-muted">não medido</span>
      <span className="max-w-[60ch] text-[11.5px] leading-snug text-muted">{motivo}</span>
    </span>
  );
}

/**
 * O cartão de número: rótulo em cima, número embaixo, e o motivo no lugar do
 * número quando não houve medição.
 */
export function Numero({
  rotulo,
  valor,
  motivo,
  rodape,
  destaque,
}: {
  rotulo: string;
  /** `null` significa NÃO MEDIDO, e exige `motivo`. Zero é zero, e é medido. */
  valor: number | string | null;
  motivo?: string;
  rodape?: React.ReactNode;
  destaque?: "alerta" | "neutro";
}) {
  const semMedida = valor === null;
  return (
    <div
      className={cx(
        "rounded-2xl border p-3",
        destaque === "alerta" && !semMedida ? "border-red-200 bg-red-50" : "border-line bg-paper",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-[.04em] text-muted">{rotulo}</p>
      <div className="mt-1">
        {semMedida ? (
          <NaoMedido motivo={motivo ?? "o serviço não devolveu motivo — e isso também é um defeito"} />
        ) : (
          <span
            className={cx(
              "text-2xl font-semibold tabular-nums",
              destaque === "alerta" ? "text-red-700" : "text-ink",
            )}
          >
            {valor}
          </span>
        )}
      </div>
      {rodape ? <div className="mt-1 text-[11.5px] leading-snug text-muted">{rodape}</div> : null}
    </div>
  );
}

/** A grade de cartões — uma coluna no celular, sempre. */
export function Grade({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}

export function Aviso({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-[80ch] rounded-2xl border border-amber-200 bg-amber-50 p-4 text-[13px] leading-relaxed text-amber-950">
      {children}
    </p>
  );
}

export function Caixa({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[80ch] rounded-2xl border border-line bg-paper p-4 text-[13.5px] leading-relaxed text-ink2">
      {children}
    </div>
  );
}

/** O cabeçalho de uma tela: título, subtítulo e nada mais. */
export function Cabecalho({ titulo, subtitulo }: { titulo: string; subtitulo: string }) {
  return (
    <header>
      <h1 className="text-[22px] font-semibold tracking-tight text-ink">{titulo}</h1>
      <p className="mt-0.5 max-w-[80ch] text-[13px] leading-snug text-ink2">{subtitulo}</p>
    </header>
  );
}

/** O estado de uma tela que busca dados. Igual nas três, de propósito. */
export type Fase<T> =
  | { fase: "carregando" }
  | { fase: "pronto"; dados: T }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

export function Carregando({ texto }: { texto: string }) {
  return <Caixa>{texto}</Caixa>;
}

export function SemAcesso() {
  return (
    <Caixa>
      <strong>Esta tela não é sua.</strong> A recusa vem do servidor, não desta
      página: ela mostra a operação comercial inteira, e o SDR não vê a régua
      comparada do time.
    </Caixa>
  );
}

export function Erro({ detalhe }: { detalhe: string | null }) {
  return (
    <Caixa>
      <strong>Não deu para medir agora.</strong>{" "}
      {detalhe ?? "O servidor não explicou o motivo."} Nada aqui foi estimado para
      preencher o buraco — a tela prefere ficar vazia a ficar errada.
    </Caixa>
  );
}

/**
 * A variação entre duas janelas, escrita sem chute.
 *
 * Base zero não vira "+100%": crescer de 0 para 3 não tem porcentagem, e
 * inventar uma faz um dia comum parecer um recorde.
 */
export function textoDaVariacao(de: number, para: number): string {
  if (de === 0 && para === 0) return "zero nos dois dias";
  if (de === 0) return `sem base ontem para comparar (hoje: ${para})`;
  const p = Math.round(((para - de) / de) * 100);
  return `${p > 0 ? "+" : ""}${p}% vs. ontem (${de} → ${para})`;
}

/** Centavos em reais. Não arredonda para cima, e não esconde o centavo. */
export function emReais(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

// ═════════════════════════════════════════════════════════════════════════════
// A MOLDURA DOS DESENHOS DO CEO (18/09/2026)
//
// O que vem abaixo é a GRAMÁTICA VISUAL lida dos 14 desenhos, escrita uma vez
// só para as telas não divergirem entre si: a fila de cartões de indicador com
// ícone colorido, o corpo de três colunas com a direita reservada à IA, as
// barras do funil, a tabela de cabeçalho cinza e as pílulas de estado.
//
// ⚠️ NENHUMA PEÇA DAQUI INVENTA DADO. Todas aceitam `null` como "não medido" e
// TODAS exigem o motivo junto. O desenho ganhou cor; a régua da honestidade não
// mudou uma vírgula: o cartão bonito com um zero mentiroso dentro é pior que o
// cartão feio, porque a cor dá autoridade ao número errado.
//
// Fundo e texto saem dos tokens da casa (`bg-canvas`, `bg-paper`, `border-line`,
// `text-ink`, `text-ink2`, `text-muted`). As cores de ACENTO — azul de ação,
// verde de bom, âmbar de atenção, vermelho de risco, roxo de IA — são as do
// desenho, e só aparecem em ícone, pílula e barra. Nunca em fundo de página.
// ═════════════════════════════════════════════════════════════════════════════

/** Os cinco acentos do desenho, mais o cinza de "não medido". */
export type Tom = "azul" | "verde" | "ambar" | "vermelho" | "roxo" | "cinza";

/**
 * ⚠️ `traco` existe SEPARADO de `barra` de propósito: o Tailwind lê classe
 * escrita no fonte, e `"bg-blue-500".replace("bg-","stroke-")` produz uma classe
 * que o gerador nunca vê e que sai do build sem cor nenhuma. Duas colunas
 * escritas à mão custam menos que um gráfico invisível em produção.
 */
const TINTA: Record<Tom, { quadro: string; pilula: string; barra: string; traco: string; texto: string }> = {
  azul: { quadro: "bg-blue-50 text-blue-600", pilula: "bg-blue-50 text-blue-700", barra: "bg-blue-500", traco: "stroke-blue-500", texto: "text-blue-700" },
  verde: { quadro: "bg-emerald-50 text-emerald-600", pilula: "bg-emerald-50 text-emerald-700", barra: "bg-emerald-500", traco: "stroke-emerald-500", texto: "text-emerald-700" },
  ambar: { quadro: "bg-amber-50 text-amber-600", pilula: "bg-amber-50 text-amber-800", barra: "bg-amber-500", traco: "stroke-amber-500", texto: "text-amber-800" },
  vermelho: { quadro: "bg-red-50 text-red-600", pilula: "bg-red-50 text-red-700", barra: "bg-red-500", traco: "stroke-red-500", texto: "text-red-700" },
  roxo: { quadro: "bg-ia-50 text-ia-600", pilula: "bg-ia-50 text-ia-700", barra: "bg-ia-500", traco: "stroke-ia-500", texto: "text-ia-700" },
  cinza: { quadro: "bg-chip text-muted", pilula: "bg-chip text-ink2", barra: "bg-line2", traco: "stroke-line2", texto: "text-muted" },
};

/**
 * Os ícones do desenho, desenhados à mão em SVG.
 *
 * Nenhuma biblioteca nova por causa de sete riscos: dependência entra quando
 * paga o próprio peso, e `currentColor` deixa o quadro colorido mandar na cor.
 */
const TRACO = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export type NomeDeIcone =
  | "alvo" | "pessoas" | "porta" | "chave" | "agenda" | "relogio" | "dinheiro"
  | "grafico" | "funil" | "alerta" | "coracao" | "faisca" | "termometro" | "floco" | "chama";

export function Icone({ nome, className }: { nome: NomeDeIcone; className?: string }) {
  const c = className ?? "h-4 w-4";
  const svg = (filhos: React.ReactNode) => (
    <svg viewBox="0 0 24 24" className={c} aria-hidden="true" {...TRACO}>
      {filhos}
    </svg>
  );
  switch (nome) {
    case "alvo": return svg(<><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3" /></>);
    case "pessoas": return svg(<><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 5.5a3 3 0 0 1 0 5.5M17 14.5a6 6 0 0 1 4 5.5" /></>);
    case "porta": return svg(<><path d="M15 3H6v18h9" /><path d="M15 3v18" /><circle cx="12.5" cy="12" r="1" /></>);
    case "chave": return svg(<><circle cx="8" cy="15" r="4" /><path d="M11 12l9-9M17 6l2 2M14 9l2 2" /></>);
    case "agenda": return svg(<><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>);
    case "relogio": return svg(<><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>);
    case "dinheiro": return svg(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>);
    case "grafico": return svg(<><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>);
    case "funil": return svg(<><path d="M3 4h18l-7 8v8l-4-2v-6z" /></>);
    case "alerta": return svg(<><path d="M12 4l9 16H3z" /><path d="M12 10v4M12 17.2v.1" /></>);
    case "coracao": return svg(<><path d="M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9z" /></>);
    case "faisca": return svg(<><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" /><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></>);
    case "termometro": return svg(<><path d="M10 14V5a2 2 0 1 1 4 0v9a4 4 0 1 1-4 0z" /></>);
    case "floco": return svg(<><path d="M12 3v18M4 7.5l16 9M20 7.5l-16 9" /></>);
    case "chama": return svg(<><path d="M12 3s5 4.2 5 9a5 5 0 0 1-10 0c0-1.8.8-3.2 1.7-4.2.3 1.4 1 2.2 1.8 2.2 1 0 1.6-.9 1.5-2.4A9 9 0 0 0 12 3z" /></>);
  }
}

/**
 * O CARTÃO DE INDICADOR do desenho: quadrado colorido com ícone à esquerda,
 * rótulo pequeno em cinza, número grande em negrito, e embaixo a variação.
 *
 * `valor === null` é NÃO MEDIDO e exige `motivo` — o número dá lugar ao motivo,
 * o quadro do ícone fica cinza, e nenhum zero aparece. Zero é zero e é medido.
 */
export function Indicador({
  rotulo,
  valor,
  motivo,
  icone,
  tom = "azul",
  variacao,
  rodape,
}: {
  rotulo: string;
  valor: number | string | null;
  motivo?: string;
  icone: NomeDeIcone;
  tom?: Tom;
  /** A linha "vs. ontem" já escrita — use `textoDaVariacao`, que não inventa %. */
  variacao?: string;
  rodape?: React.ReactNode;
}) {
  const semMedida = valor === null;
  const t = TINTA[semMedida ? "cinza" : tom];
  return (
    <div className="flex min-w-0 items-start gap-3 rounded-2xl border border-line bg-paper p-3 shadow-[0_1px_2px_rgba(11,11,11,.03)]">
      <span className={cx("grid h-9 w-9 shrink-0 place-items-center rounded-xl", t.quadro)}>
        <Icone nome={icone} className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-medium uppercase tracking-[.04em] text-muted">{rotulo}</p>
        {semMedida ? (
          <div className="mt-0.5">
            <NaoMedido motivo={motivo ?? "o serviço não devolveu motivo — e isso também é um defeito"} />
          </div>
        ) : (
          <p className="mt-0.5 text-[26px] font-semibold leading-none tabular-nums text-ink">{valor}</p>
        )}
        {variacao && !semMedida ? (
          <p className="mt-1 text-[11.5px] leading-snug text-muted">{variacao}</p>
        ) : null}
        {rodape ? <div className="mt-1 text-[11.5px] leading-snug text-muted">{rodape}</div> : null}
      </div>
    </div>
  );
}

/**
 * A fila de indicadores do desenho. No celular são duas colunas — o CEO abre no
 * celular, e um cartão por linha empurraria o corpo da tela para fora da vista.
 */
export function FilaDeIndicadores({
  children,
  colunas = 4,
}: {
  children: React.ReactNode;
  /** Quantos cartões por linha no desktop. A peça 02 pede uma fileira de 5. */
  colunas?: 4 | 5;
}) {
  return (
    <div
      className={cx(
        "grid grid-cols-2 gap-2 sm:grid-cols-2",
        colunas === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

/**
 * O CORPO de três colunas: à esquerda e ao centro o que se mede, à direita —
 * mais estreita — a coluna da IA. No celular a coluna da IA vai para o fim,
 * porque a leitura começa pelo número e termina na recomendação.
 */
export function Corpo({ children, lateral }: { children: React.ReactNode; lateral: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
      <div className="flex min-w-0 flex-col gap-5">{children}</div>
      <aside className="flex min-w-0 flex-col gap-3">{lateral}</aside>
    </div>
  );
}

/** O cartão da coluna da direita: título com a faísca, como no desenho. */
export function CartaoDeIA({
  titulo,
  children,
  tom = "roxo",
}: {
  titulo: string;
  children: React.ReactNode;
  tom?: Tom;
}) {
  const t = TINTA[tom];
  return (
    <section className="rounded-2xl border border-line bg-paper p-3">
      <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink">
        <span className={cx("grid h-6 w-6 shrink-0 place-items-center rounded-lg", t.quadro)}>
          <Icone nome="faisca" className="h-[14px] w-[14px]" />
        </span>
        {titulo}
      </h3>
      <div className="mt-2 text-[12.5px] leading-relaxed text-ink2">{children}</div>
    </section>
  );
}

/** A pílula de estado — verde bom, âmbar atenção, vermelho risco, azul neutro. */
export function Pilula({ tom = "cinza", children }: { tom?: Tom; children: React.ReactNode }) {
  return (
    <span
      className={cx(
        "inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-[.04em]",
        TINTA[tom].pilula,
      )}
    >
      {children}
    </span>
  );
}

/**
 * A barra horizontal do funil: rótulo, número, e a barra proporcional.
 *
 * `fracao` é quem manda na largura, e vem calculada de fora. `null` em `valor`
 * é não medido: a barra some e o motivo ocupa o lugar — barra de largura zero
 * pareceria "medimos e deu nada".
 */
export function Barra({
  rotulo,
  valor,
  fracao,
  motivo,
  tom = "azul",
  nota,
}: {
  rotulo: string;
  valor: number | string | null;
  fracao: number | null;
  motivo?: string;
  tom?: Tom;
  nota?: React.ReactNode;
}) {
  const semMedida = valor === null;
  const largura = Math.max(0, Math.min(1, fracao ?? 0)) * 100;
  return (
    <li className="rounded-2xl border border-line bg-paper p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="text-[13px] font-medium text-ink">{rotulo}</span>
        {semMedida ? (
          <NaoMedido motivo={motivo ?? "sem motivo declarado — e isso também é um defeito"} />
        ) : (
          <span className="text-[17px] font-semibold tabular-nums text-ink">
            {valor}
            {fracao !== null ? (
              <span className="ml-1.5 text-[11.5px] font-normal text-muted">
                {Math.round(fracao * 100)}%
              </span>
            ) : null}
          </span>
        )}
      </div>
      {!semMedida && fracao !== null ? (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-canvas" role="presentation">
          <div className={cx("h-full rounded-full", TINTA[tom].barra)} style={{ width: `${largura}%` }} />
        </div>
      ) : null}
      {nota ? <p className="mt-1 text-[11.5px] leading-snug text-muted">{nota}</p> : null}
    </li>
  );
}

/**
 * A tabela do desenho: cabeçalho cinza claro, linhas finas.
 *
 * Rola na horizontal no celular em vez de espremer coluna — coluna espremida
 * vira reticências, e reticências escondem justamente o número que se foi ler.
 */
export function Tabela({ colunas, children }: { colunas: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-paper">
      <table className="w-full min-w-[520px] border-collapse text-left">
        <thead>
          <tr className="bg-canvas">
            {colunas.map((c) => (
              <th
                key={c}
                className="whitespace-nowrap border-b border-line px-3 py-2 text-[10.5px] font-semibold uppercase tracking-[.04em] text-muted"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Linha({ children, alerta }: { children: React.ReactNode; alerta?: boolean }) {
  return (
    <tr className={cx("border-b border-line last:border-0", alerta && "bg-red-50/60")}>{children}</tr>
  );
}

export function Celula({
  children,
  numero,
  forte,
}: {
  children: React.ReactNode;
  numero?: boolean;
  forte?: boolean;
}) {
  return (
    <td
      className={cx(
        "px-3 py-2 align-top text-[12.5px]",
        numero && "tabular-nums",
        forte ? "font-semibold text-ink" : "text-ink2",
      )}
    >
      {children}
    </td>
  );
}

/**
 * O TÍTULO DA PÁGINA do desenho: linha de contexto, título grande, uma frase
 * cinza dizendo para que a tela serve, e à direita as duas pastilhas (data e
 * atualidade).
 *
 * As pastilhas são TEXTO, não seletores: o desenho tem menus de data, e um menu
 * que não filtra nada ensinaria a operação a contar com um recorte que a tela
 * não faz. Quando o recorte existir de verdade, vira seletor aqui.
 */
export function TituloDaPagina({
  contexto,
  titulo,
  subtitulo,
  periodo,
  atualidade,
}: {
  contexto?: string;
  titulo: string;
  subtitulo: string;
  /** Ex.: "Últimos 30 dias" — só o que a rota de fato recortou. */
  periodo?: string;
  /** Ex.: "Tempo real" — ganha a bolinha verde do desenho. */
  atualidade?: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
      <div className="min-w-0">
        {contexto ? <p className="text-[12px] text-muted">{contexto}</p> : null}
        <h1 className="text-[22px] font-semibold tracking-tight text-ink">{titulo}</h1>
        <p className="mt-0.5 max-w-[80ch] text-[13px] leading-snug text-ink2">{subtitulo}</p>
      </div>
      {periodo || atualidade ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {periodo ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-[11.5px] text-ink2">
              <Icone nome="agenda" className="h-3.5 w-3.5 text-muted" />
              {periodo}
            </span>
          ) : null}
          {atualidade ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1 text-[11.5px] text-ink2">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              {atualidade}
            </span>
          ) : null}
        </div>
      ) : null}
    </header>
  );
}

/** A data de um recorte, como o desenho a escreve. Nunca inventa fuso. */
export function emDia(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

// ═════════════════════════════════════════════════════════════════════════════
// AS DUAS PEÇAS DE GRÁFICO DO DESENHO — rosca e série no tempo
//
// Desenhadas à mão em SVG, e não com biblioteca: as duas formas do desenho são
// um arco e uma polilinha, e uma dependência de gráfico entraria carregando
// tooltip, legenda, tema e escala próprios — tudo que teria de ser brigado de
// volta para os tokens da casa.
//
// ⚠️ NENHUMA DAS DUAS INVENTA PONTO. Série sem dado não vira linha reta entre
// dois pontos distantes: o balde vazio é ZERO MEDIDO e desce até o chão. Rosca
// sem total não desenha círculo cinza — devolve o motivo.
// ═════════════════════════════════════════════════════════════════════════════

export interface FatiaDaRosca {
  rotulo: string;
  valor: number;
  tom: Tom;
}

/**
 * A ROSCA do desenho: anel, número grande no centro, legenda à direita.
 *
 * As fatias precisam se EXCLUIR — a rosca afirma "o todo é a soma destas
 * partes". Subconjunto (ex.: "quem espera há +10 min", que já está dentro de
 * "aguardando") entra como `alerta`, fora do anel, porque desenhá-lo como
 * fatia inventaria um total maior que a fila.
 */
export function Rosca({
  fatias,
  centro,
  sobCentro,
  motivo,
  alerta,
}: {
  fatias: FatiaDaRosca[];
  /** O número do meio. */
  centro: number | string;
  sobCentro?: string;
  /** Quando o todo não pôde ser medido, isto ocupa o lugar do anel. */
  motivo?: string;
  alerta?: React.ReactNode;
}) {
  const total = fatias.reduce((s, f) => s + f.valor, 0);

  if (motivo || total <= 0) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-4">
        <NaoMedido
          motivo={
            motivo ?? "nenhum item nas fatias — um anel cinza aqui afirmaria um todo que ninguém contou"
          }
        />
      </div>
    );
  }

  // Geometria do anel. Raio 40, traço 14 — as proporções do desenho.
  const R = 40;
  const C = 2 * Math.PI * R;
  let percorrido = 0;

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="relative shrink-0">
          <svg viewBox="0 0 100 100" className="h-[132px] w-[132px] -rotate-90" role="img"
            aria-label={`Rosca: ${fatias.map((f) => `${f.rotulo} ${f.valor}`).join(", ")}`}>
            <circle cx="50" cy="50" r={R} fill="none" strokeWidth={14} className="stroke-canvas" />
            {fatias.map((f) => {
              const fatia = (f.valor / total) * C;
              const deslocamento = -percorrido;
              percorrido += fatia;
              return (
                <circle
                  key={f.rotulo}
                  cx="50" cy="50" r={R} fill="none" strokeWidth={14}
                  strokeDasharray={`${fatia} ${C - fatia}`}
                  strokeDashoffset={deslocamento}
                  className={cx("transition-[stroke-dasharray]", TINTA[f.tom].traco)}
                />
              );
            })}
          </svg>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-[24px] font-semibold leading-none tabular-nums text-ink">{centro}</p>
              {sobCentro ? <p className="mt-0.5 text-[10.5px] text-muted">{sobCentro}</p> : null}
            </div>
          </div>
        </div>

        <ul className="flex min-w-0 flex-1 flex-col gap-1.5">
          {fatias.map((f) => (
            <li key={f.rotulo} className="flex items-baseline gap-2">
              <span className={cx("mt-1 h-2 w-2 shrink-0 rounded-full", TINTA[f.tom].barra)} aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[12.5px] leading-snug text-ink2">{f.rotulo}</span>
              <span className="shrink-0 text-[13px] font-semibold tabular-nums text-ink">{f.valor}</span>
              <span className="w-[3.5rem] shrink-0 text-right text-[11.5px] tabular-nums text-muted">
                {((f.valor / total) * 100).toFixed(1).replace(".", ",")}%
              </span>
            </li>
          ))}
        </ul>
      </div>
      {alerta ? <div className="mt-3">{alerta}</div> : null}
    </div>
  );
}

export interface SerieDeLinha {
  rotulo: string;
  tom: Tom;
  /** Um valor por ponto do eixo X, na mesma ordem dos rótulos. */
  valores: number[];
  /** Linha tracejada, como a "meta projetada" do desenho. */
  tracejada?: boolean;
}

/**
 * A SÉRIE NO TEMPO do desenho: eixo Y com marcas, linha por série, legenda
 * embaixo.
 *
 * O desenho tem tooltip de ponto. Aqui cada ponto é um `<title>` do SVG — o
 * navegador mostra ao parar o cursor, funciona no leitor de tela, e não exige
 * estado nem biblioteca. No celular não há cursor; por isso os valores também
 * saem escritos na régua do eixo, e não só no balão.
 */
export function SerieNoTempo({
  series,
  rotulos,
  formatar,
  nota,
}: {
  series: SerieDeLinha[];
  rotulos: string[];
  /** Como o valor aparece no balão e no eixo. O padrão é o número cru. */
  formatar?: (v: number) => string;
  nota?: React.ReactNode;
}) {
  const fmt = formatar ?? ((v: number) => String(v));
  const todos = series.flatMap((s) => s.valores);

  if (rotulos.length === 0 || todos.length === 0) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-4">
        <NaoMedido motivo="nenhum ponto na janela — uma linha reta aqui desenharia um período que ninguém mediu" />
      </div>
    );
  }

  // O teto sobe até o maior ponto; o piso é sempre ZERO. Cortar o eixo faria
  // uma variação de 2% parecer um despencar — o truque de gráfico mais comum e
  // o mais caro numa tela que decide dinheiro.
  const teto = Math.max(1, ...todos);
  const L = 560;
  const A = 160;
  const passo = rotulos.length > 1 ? L / (rotulos.length - 1) : 0;
  const y = (v: number) => A - (v / teto) * A;

  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(teto * f));

  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <div className="flex gap-2">
        <ul className="flex w-[4.5rem] shrink-0 flex-col-reverse justify-between py-[2px] text-right text-[10.5px] tabular-nums text-muted">
          {marcas.map((m, i) => (
            <li key={`${m}-${i}`} className="leading-none">{fmt(m)}</li>
          ))}
        </ul>

        <div className="min-w-0 flex-1 overflow-x-auto">
          <svg viewBox={`0 0 ${L} ${A + 4}`} className="h-[180px] w-full min-w-[320px]" role="img"
            aria-label={`Série no tempo: ${series.map((s) => s.rotulo).join(" e ")}`}>
            {[0, 0.25, 0.5, 0.75, 1].map((f) => (
              <line key={f} x1={0} x2={L} y1={A * f} y2={A * f} className="stroke-line" strokeWidth={1} />
            ))}
            {series.map((s) => {
              const d = s.valores
                .map((v, i) => `${i === 0 ? "M" : "L"}${(i * passo).toFixed(1)},${y(v).toFixed(1)}`)
                .join(" ");
              return (
                <g key={s.rotulo}>
                  <path
                    d={d}
                    fill="none"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    strokeDasharray={s.tracejada ? "6 5" : undefined}
                    className={TINTA[s.tom].traco}
                  />
                  {s.valores.map((v, i) => (
                    <circle
                      key={`${s.rotulo}-${i}`}
                      cx={i * passo}
                      cy={y(v)}
                      r={7}
                      fill="transparent"
                      className={TINTA[s.tom].traco}
                      strokeWidth={0}
                    >
                      <title>{`${rotulos[i] ?? ""} · ${s.rotulo}: ${fmt(v)}`}</title>
                    </circle>
                  ))}
                </g>
              );
            })}
          </svg>

          <div className="flex justify-between gap-1 text-[10.5px] tabular-nums text-muted">
            {rotulos.map((r, i) =>
              // Num eixo de 24 horas, 24 rótulos viram um borrão. Um a cada três,
              // como no desenho.
              i % Math.max(1, Math.ceil(rotulos.length / 8)) === 0 ? (
                <span key={`${r}-${i}`}>{r}</span>
              ) : null,
            )}
          </div>
        </div>
      </div>

      <ul className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
        {series.map((s) => (
          <li key={s.rotulo} className="flex items-center gap-1.5 text-[11.5px] text-ink2">
            <span
              className={cx("h-2 w-2 shrink-0 rounded-full", TINTA[s.tom].barra, s.tracejada && "opacity-60")}
              aria-hidden="true"
            />
            {s.rotulo}
          </li>
        ))}
      </ul>

      {nota ? <div className="mt-2 text-[11.5px] leading-snug text-muted">{nota}</div> : null}
    </div>
  );
}
