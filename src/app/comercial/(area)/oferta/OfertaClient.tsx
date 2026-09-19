"use client";

/**
 * CATÁLOGO, OFERTA E CHECKOUT — a peça 08 do desenho do CEO.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * A TRADUÇÃO: O DESENHO É DE UMA LOJA DE VAREJO; NÓS VENDEMOS UM PLANO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A imagem tem iPhone, AirPods, tênis e liquidificador, com "Em estoque: 12" e
 * um carrinho de três itens. A Foocci vende **assinatura de plano para
 * restaurante**. O layout foi mantido inteiro; o que mudou foi o que entra nele:
 *
 * | No desenho                | Aqui                                          |
 * |---------------------------|-----------------------------------------------|
 * | Produto (iPhone, tênis)   | **Plano × ciclo** (Growth/Anual) — 9 itens     |
 * | Marca (Apple, Nike)       | **O ciclo da cobrança**                        |
 * | "Em estoque: 12"          | **"Assinatura — não tem estoque"**             |
 * | Categorias (Smartphones)  | **Os planos e os ciclos**                      |
 * | Preço do produto          | O que sai do cartão **por cobrança**           |
 * | Desconto do cupom         | O **abatimento real da 1ª cobrança**           |
 * | Frete                     | **Não existe** — software não tem frete        |
 *
 * ── ⛔ OS TRÊS BOTÕES DO DESENHO, E POR QUE NENHUM ESTÁ AQUI ───────────────
 *
 * O desenho tem "Enviar proposta no WhatsApp", "Gerar link de pagamento" e
 * "Salvar proposta". Os motivos de cada ausência são diferentes — por isso cada
 * uma sai escrita no seu lugar, em vez de a tela simplesmente ficar sem eles:
 *
 *  1. **Enviar no WhatsApp** — o envio está PAUSADO por ordem do CEO. Mesmo que
 *     não estivesse, o caminho de envio mora atrás das travas de janela,
 *     opt-out e freio de ritmo, e um segundo caminho a partir de uma tela nova
 *     seria um atalho por fora delas. Trava que se contorna por outra porta não
 *     é trava.
 *  2. **Gerar link de pagamento** — este ato **EXISTE DE VERDADE** na casa
 *     (`checkoutDaProposta.gerarLinkDePagamento`, que cria a assinatura no
 *     Mercado Pago com chave idempotente). Ele só não é alcançável DAQUI: esta
 *     frente é só-leitura por contrato (`telas.contrato.test.ts`). Então a tela
 *     diz que o ato existe e **onde ele mora** — que é diferente de dizer que
 *     não existe, e muito diferente de desenhar um botão morto.
 *  3. **Salvar proposta** — mesma razão que o 2.
 *
 * ── A "SUA PROPOSTA" DA DIREITA É CONFERÊNCIA, NÃO RASCUNHO GRAVADO ────────
 *
 * O painel monta a conta com os números REAIS do catálogo (a mesma fonte única
 * que o site e o cartão usam), e diz com todas as letras que não grava nada. É
 * a calculadora que o vendedor tem na mão durante a conversa. Uma que dissesse
 * "salvo" sem gravar seria pior que não existir.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { PanoramaDaOferta } from "@/services/salaDeVendas/telas/oferta";
import type { ItemDoCatalogo } from "@/services/salaDeVendas/propostas";
import {
  buscarPainel,
  Carregando,
  Erro,
  NaoMedido,
  SemAcesso,
  Vazio,
  type Estado,
} from "../_frenteComercial/Moldura";
import { cx, emReais, Icone, Pilula, Secao, TituloDaPagina } from "../_pecas/Pecas";

type Aba = "catalogo" | "combos" | "propostas";

const ABAS: { chave: Aba; rotulo: string; icone: "dinheiro" | "faisca" | "funil" }[] = [
  { chave: "catalogo", rotulo: "Catálogo de planos", icone: "dinheiro" },
  { chave: "combos", rotulo: "Ofertas e combos", icone: "faisca" },
  { chave: "propostas", rotulo: "Minhas propostas", icone: "funil" },
];

/**
 * As pílulas de categoria do desenho. Lá eram Smartphones e Moda; aqui são as
 * duas únicas dimensões que o catálogo tem — qual plano, e de quanto em quanto
 * tempo se cobra.
 */
const CATEGORIAS = [
  { chave: "todos", rotulo: "Todos" },
  { chave: "STARTER", rotulo: "Starter" },
  { chave: "GROWTH", rotulo: "Growth" },
  { chave: "PRO", rotulo: "Pro" },
  { chave: "MENSAL", rotulo: "Mensal" },
  { chave: "TRIMESTRAL", rotulo: "Trimestral" },
  { chave: "ANUAL", rotulo: "Anual" },
] as const;

/** A chave de um item do catálogo. Plano e ciclo, que juntos são únicos. */
function chaveDoItem(i: ItemDoCatalogo): string {
  return `${i.plano}/${i.ciclo}`;
}

export function OfertaClient() {
  const [estado, setEstado] = useState<Estado<PanoramaDaOferta>>({ fase: "carregando" });
  const [aba, setAba] = useState<Aba>("catalogo");
  const [busca, setBusca] = useState("");
  const [categoria, setCategoria] = useState<string>("todos");
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    let vivo = true;
    void buscarPainel<PanoramaDaOferta>("/api/admin/sala-de-vendas/oferta").then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  const dados = estado.fase === "pronto" ? estado.dados : null;

  /** A grade, já filtrada pela busca e pela pílula. Puro cliente, sem rota. */
  const naGrade = useMemo(() => {
    if (!dados) return [];
    const termo = busca.trim().toLowerCase();
    return dados.catalogo.filter((i) => {
      const casaCategoria =
        categoria === "todos" || i.plano === categoria || i.ciclo === categoria;
      const casaBusca =
        !termo || `${i.nome} ${i.nomeDoCiclo} ${i.plano} ${i.ciclo}`.toLowerCase().includes(termo);
      return casaCategoria && casaBusca;
    });
  }, [dados, busca, categoria]);

  const item = useMemo(
    () => dados?.catalogo.find((i) => chaveDoItem(i) === escolhido) ?? null,
    [dados, escolhido],
  );

  if (estado.fase === "carregando")
    return <Carregando oQue="Montando o catálogo e lendo as propostas…" />;
  if (estado.fase === "semAcesso") return <SemAcesso porque={estado.porque} />;
  if (estado.fase === "erro") return <Erro detalhe={estado.detalhe} tentarDeNovo={recarregar} />;

  const p = estado.dados;

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-[1180px] flex-col gap-5">
        <TituloDaPagina
          contexto="Vendas › Nova proposta"
          titulo="Catálogo, Oferta e Checkout"
          subtitulo="Transforme conversas em vendas. Monte a proposta, confira a primeira cobrança e acompanhe onde cada uma parou."
        />

        <CabecalhoDosAtos />

        <NaoMedido frases={p.naoMedido} />

        {/* ── ABAS ─────────────────────────────────────────────────────── */}
        <div className="flex flex-wrap gap-1 border-b border-line">
          {ABAS.map((a) => (
            <button
              key={a.chave}
              type="button"
              onClick={() => setAba(a.chave)}
              aria-current={aba === a.chave ? "page" : undefined}
              className={cx(
                "-mb-px flex items-center gap-2 rounded-t-xl border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors",
                aba === a.chave
                  ? "border-blue-500 text-blue-700"
                  : "border-transparent text-muted hover:text-ink2",
              )}
            >
              <Icone nome={a.icone} className="h-4 w-4" />
              {a.rotulo}
            </button>
          ))}
        </div>

        {/* ── O CORPO: grade à esquerda, "Sua Proposta" à direita ──────── */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.9fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-4">
            {aba === "catalogo" ? (
              <GradeDoCatalogo
                itens={naGrade}
                busca={busca}
                aoBuscar={setBusca}
                categoria={categoria}
                aoTrocarCategoria={setCategoria}
                escolhido={escolhido}
                aoEscolher={setEscolhido}
              />
            ) : null}

            {aba === "combos" ? <OfertasECombos catalogo={p.catalogo} /> : null}

            {aba === "propostas" ? <MinhasPropostas p={p} /> : null}
          </div>

          <aside className="flex min-w-0 flex-col gap-3">
            <SuaProposta
              item={item}
              limiteDeDescontoPct={p.limiteDeDescontoPct}
              aoLimpar={() => setEscolhido(null)}
            />
            <OndeMoramOsAtos />
          </aside>
        </div>

        {/* ── O RODAPÉ: os quatro passos do pagamento ──────────────────── */}
        <StatusDoPagamento p={p} />
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// O TOPO — onde o desenho põe "Selecionar cliente" e o botão verde de envio
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O desenho tem dois controles aqui. Nenhum dos dois pode existir nesta tela, e
 * a ausência é escrita no lugar deles — cartão apagado esconderia a pergunta,
 * botão desligado ensinaria a operação a esperar por ele.
 */
function CabecalhoDosAtos() {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5">
      <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-700">
        <Icone nome="alerta" className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-amber-950">
          Selecionar cliente e enviar a proposta não acontecem nesta tela
        </p>
        <p className="mt-1 max-w-[86ch] text-[12.5px] leading-relaxed text-amber-950">
          O <strong>envio no WhatsApp está pausado por ordem do CEO</strong>. Além da pausa, todo
          envio da casa sai por um caminho só, onde ficam as travas de janela, de opt-out e de
          ritmo — abrir um segundo caminho a partir daqui contornaria justamente essas travas.
          Esta tela lê, calcula e confere; ela não fala com ninguém.
        </p>
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// A GRADE DE ITENS — no desenho, oito produtos com foto
// ═════════════════════════════════════════════════════════════════════════════

function GradeDoCatalogo({
  itens,
  busca,
  aoBuscar,
  categoria,
  aoTrocarCategoria,
  escolhido,
  aoEscolher,
}: {
  itens: ItemDoCatalogo[];
  busca: string;
  aoBuscar: (v: string) => void;
  categoria: string;
  aoTrocarCategoria: (v: string) => void;
  escolhido: string | null;
  aoEscolher: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* A busca do desenho. Ela filtra de verdade — filtra a grade abaixo. */}
      <label className="relative block">
        <span className="sr-only">Buscar plano ou ciclo de cobrança</span>
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
          <Icone nome="alvo" className="h-4 w-4" />
        </span>
        <input
          type="search"
          value={busca}
          onChange={(e) => aoBuscar(e.target.value)}
          placeholder="Buscar plano ou ciclo de cobrança…"
          className="w-full rounded-xl border border-line2 bg-paper py-2.5 pl-9 pr-3 text-[13px] text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
        />
      </label>

      <div className="flex flex-wrap gap-1.5">
        {CATEGORIAS.map((c) => (
          <button
            key={c.chave}
            type="button"
            onClick={() => aoTrocarCategoria(c.chave)}
            className={cx(
              "rounded-full px-3 py-1.5 text-[12px] font-medium transition-colors",
              categoria === c.chave
                ? "bg-blue-500 text-white"
                : "bg-chip text-ink2 hover:bg-line2",
            )}
          >
            {c.rotulo}
          </button>
        ))}
      </div>

      {itens.length === 0 ? (
        <Vazio motivo="Nenhum plano casa com esta busca. O catálogo tem nove itens — três planos em três ciclos —, e o filtro acima é o único recorte desta grade." />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {itens.map((i) => (
            <CartaoDePlano
              key={chaveDoItem(i)}
              item={i}
              escolhido={escolhido === chaveDoItem(i)}
              aoEscolher={() => aoEscolher(chaveDoItem(i))}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * O cartão de produto do desenho: foto, nome, marca, preço grande, estoque e o
 * botão azul. Aqui a foto dá lugar ao selo do plano — um plano não tem foto, e
 * uma ilustração de estoque para software seria enfeite que mente.
 */
function CartaoDePlano({
  item,
  escolhido,
  aoEscolher,
}: {
  item: ItemDoCatalogo;
  escolhido: boolean;
  aoEscolher: () => void;
}) {
  return (
    <article
      className={cx(
        "flex flex-col rounded-2xl border bg-paper p-3 shadow-[0_1px_2px_rgba(11,11,11,.03)] transition-colors",
        escolhido ? "border-blue-400 ring-1 ring-blue-100" : "border-line",
      )}
    >
      <div className="mb-3 grid h-24 place-items-center rounded-xl bg-canvas">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-blue-50 text-blue-600">
          <Icone nome="dinheiro" className="h-5 w-5" />
        </span>
      </div>

      <h3 className="text-[14px] font-semibold text-ink">Plano {item.nome}</h3>
      <p className="text-[12px] text-muted">Cobrança {item.nomeDoCiclo.toLowerCase()}</p>

      <p className="mt-2 text-[19px] font-semibold leading-none tabular-nums text-ink">
        {item.emReais.doCiclo}
      </p>
      <p className="mt-1 text-[11.5px] text-muted">
        por cobrança · equivale a {item.emReais.equivalenteAoMes}/mês
      </p>

      <p className="mt-1.5 text-[12px] text-ink2">
        1ª cobrança{" "}
        <span className="font-semibold tabular-nums text-ink">{item.emReais.primeiraCobranca}</span>
        {item.descontoDaPrimeiraPct > 0 ? (
          <span className="ml-1.5">
            <Pilula tom="verde">−{item.descontoDaPrimeiraPct}%</Pilula>
          </span>
        ) : null}
      </p>

      {/* No lugar de "Em estoque: 12". */}
      <p className="mt-1.5 text-[11.5px] italic text-muted">
        Assinatura — não tem estoque a acabar.
      </p>

      <button
        type="button"
        onClick={aoEscolher}
        className={cx(
          "mt-3 w-full rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-colors",
          escolhido ? "bg-blue-50 text-blue-700" : "bg-blue-500 text-white hover:bg-blue-600",
        )}
      >
        {escolhido ? "Na proposta" : "Selecionar"}
      </button>
    </article>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// "OFERTAS E COMBOS" — a aba do meio do desenho
// ═════════════════════════════════════════════════════════════════════════════

/**
 * No desenho, "Ofertas e Combos" junta produtos num pacote. Aqui não há pacote
 * a montar: o que a casa de fato concede é **o abatimento da primeira cobrança
 * no ciclo mais longo**. Esta aba mostra exatamente esse abatimento — que é
 * real e sai da mesma fonte de preço — em vez de inventar um combo.
 */
function OfertasECombos({ catalogo }: { catalogo: ItemDoCatalogo[] }) {
  const comAbatimento = catalogo.filter((i) => i.descontoDaPrimeiraPct > 0);

  return (
    <Secao
      titulo="Ofertas e combos"
      descricao="O desenho junta produtos num pacote. Aqui a única vantagem que a máquina concede é o abatimento da primeira cobrança — e é esta. Nenhum pacote foi inventado para preencher a aba."
    >
      {comAbatimento.length === 0 ? (
        <Vazio motivo="Nenhum ciclo do catálogo abate nada da primeira cobrança hoje. A tabela de preço é a fonte, e ela não tem oferta em vigor — vazio aqui é ausência de oferta, não oferta de 0%." />
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {comAbatimento.map((i) => (
            <li key={chaveDoItem(i)} className="rounded-2xl border border-line bg-paper p-3">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13.5px] font-semibold text-ink">
                  {i.nome} · {i.nomeDoCiclo}
                </p>
                <Pilula tom="verde">−{i.descontoDaPrimeiraPct}%</Pilula>
              </div>
              <p className="mt-1.5 text-[12.5px] text-ink2">
                Ciclo cheio <span className="tabular-nums">{i.emReais.doCiclo}</span> · 1ª cobrança{" "}
                <span className="font-semibold tabular-nums text-ink">
                  {i.emReais.primeiraCobranca}
                </span>
              </p>
              <p className="mt-1 text-[11.5px] leading-snug text-muted">
                O abatimento vale só na primeira. Da segunda em diante sai o ciclo cheio — dizer o
                contrário faria a renovação chegar como surpresa.
              </p>
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// "MINHAS PROPOSTAS" — no desenho, "Meus Produtos"
// ═════════════════════════════════════════════════════════════════════════════

function MinhasPropostas({ p }: { p: PanoramaDaOferta }) {
  const semValor = p.colunas.reduce((t, c) => t + c.soma.semValor, 0);

  return (
    <div className="flex flex-col gap-4">
      <Secao
        titulo="Onde está cada proposta"
        descricao="As setas são a máquina de estados real: uma proposta em rascunho não vira aceita sem passar por enviada. As somas só incluem propostas com valor gravado."
      >
        {p.totalDePropostas === 0 ? (
          <Vazio motivo="Nenhuma proposta registrada no seu escopo. Vazio aqui é ausência de proposta — não é um pipeline de R$ 0,00." />
        ) : (
          <ul className="flex flex-col gap-2">
            {p.colunas.map((c) => (
              <li key={c.situacao} className="rounded-2xl border border-line bg-paper p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <p className="text-[13.5px] font-semibold text-ink">
                    {c.situacao.replace(/_/g, " ").toLowerCase()}
                    {c.terminal ? (
                      <span className="ml-2">
                        <Pilula tom="cinza">terminal</Pilula>
                      </span>
                    ) : null}
                  </p>
                  <p className="text-[15px] font-semibold tabular-nums text-ink">{c.total}</p>
                </div>
                <p className="mt-1 text-[12px] leading-relaxed text-muted">
                  {c.soma.comValor > 0
                    ? `${emReais(c.soma.cents)}/mês somados em ${c.soma.comValor} proposta(s)`
                    : "nenhuma proposta com valor gravado nesta situação"}
                  {c.soma.semValor > 0 ? ` · ${c.soma.semValor} sem valor, fora da soma` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Secao>

      {semValor > 0 ? (
        <p className="rounded-2xl border border-line bg-paper p-3 text-[12px] leading-relaxed text-muted">
          {semValor} proposta(s) sem valor gravado ficaram fora de toda soma desta tela. Contá-las
          como zero encolheria o pipeline com cara de número exato.
        </p>
      ) : null}

      <Secao
        titulo="O relógio das propostas de pé"
        descricao={`Só as que não terminaram e têm validade gravada. A validade padrão é de ${p.validadePadraoEmDias} dias.`}
      >
        {p.vencendo.length === 0 ? (
          <Vazio motivo="Nenhuma proposta de pé com prazo gravado no seu escopo. Pode ser que não haja proposta aberta, ou que as abertas tenham nascido sem validade — e sem validade não há relógio a mostrar." />
        ) : (
          <ul className="flex flex-col gap-1.5">
            {p.vencendo.map((v) => (
              <li
                key={v.id}
                className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 rounded-2xl border border-line bg-paper px-3 py-2"
              >
                <span className="min-w-0 text-[13px] text-ink">
                  {v.lead}
                  {v.plano ? (
                    <span className="ml-1.5 text-[11.5px] text-muted">{v.plano}</span>
                  ) : null}
                </span>
                <span
                  className={
                    v.diasParaVencer < 0
                      ? "text-[12.5px] font-semibold text-amber-800"
                      : "text-[12.5px] text-ink2"
                  }
                >
                  {v.diasParaVencer < 0
                    ? `venceu há ${Math.abs(v.diasParaVencer)} dia(s)`
                    : `vence em ${v.diasParaVencer} dia(s)`}
                  {v.valorMensalCent === null ? (
                    <span className="ml-1.5 text-[11.5px] italic text-muted">
                      valor não gravado
                    </span>
                  ) : (
                    <span className="ml-1.5 text-[11.5px] tabular-nums text-muted">
                      {emReais(v.valorMensalCent)}/mês
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// "SUA PROPOSTA" — a coluna da direita do desenho
// ═════════════════════════════════════════════════════════════════════════════

function SuaProposta({
  item,
  limiteDeDescontoPct,
  aoLimpar,
}: {
  item: ItemDoCatalogo | null;
  limiteDeDescontoPct: number;
  aoLimpar: () => void;
}) {
  const abatimentoCents = item ? item.doCicloCents - item.primeiraCobrancaCents : 0;

  return (
    <div className="rounded-2xl border border-line bg-paper shadow-[0_1px_2px_rgba(11,11,11,.03)]">
      <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3">
        <h2 className="text-[14.5px] font-semibold text-ink">Sua proposta</h2>
        {item ? (
          <button
            type="button"
            onClick={aoLimpar}
            className="text-[11.5px] font-medium text-muted hover:text-ink2"
          >
            Limpar tudo
          </button>
        ) : null}
      </div>

      <div className="px-4 py-3">
        {!item ? (
          <Vazio motivo="Nenhum plano escolhido. Escolha um item do catálogo ao lado para conferir o que sai do cartão na primeira cobrança e nas seguintes." />
        ) : (
          <>
            {/* O item. No desenho seriam três, com − 1 + e lixeira. */}
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
                <Icone nome="dinheiro" className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-ink">Plano {item.nome}</p>
                <p className="text-[11.5px] text-muted">Cobrança {item.nomeDoCiclo.toLowerCase()}</p>
              </div>
              <p className="shrink-0 text-[13.5px] font-semibold tabular-nums text-ink">
                {item.emReais.doCiclo}
              </p>
            </div>

            <p className="mt-2 rounded-xl bg-canvas px-2.5 py-2 text-[11.5px] leading-snug text-muted">
              Uma assinatura por proposta, sem seletor de quantidade: a proposta guarda um plano e
              um ciclo, e não há onde uma segunda unidade ser gravada.
            </p>

            {/* Cupom ou desconto — o cartão fica, o campo não. */}
            <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold text-ink">
                <Icone nome="alerta" className="h-4 w-4 text-amber-600" />
                Cupom ou desconto
              </p>
              <p className="mt-1 text-[11.5px] leading-snug text-muted">
                Alçada de desconto do vendedor: <strong>{limiteDeDescontoPct}%</strong>. Não é
                rigor, é a máquina: o checkout cobra o valor da tabela e não existe campo por onde
                outro número entre. Um campo de cupom aqui daria uma proposta dizendo um valor e um
                cartão cobrando outro.
              </p>
            </div>

            {/* O fecho da conta. */}
            <dl className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3 text-[12.5px]">
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-ink2">Subtotal (1 assinatura)</dt>
                <dd className="tabular-nums text-ink">{item.emReais.doCiclo}</dd>
              </div>

              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-ink2">
                  Abatimento da 1ª cobrança
                  {item.descontoDaPrimeiraPct > 0 ? (
                    <span className="ml-1.5">
                      <Pilula tom="verde">−{item.descontoDaPrimeiraPct}%</Pilula>
                    </span>
                  ) : null}
                </dt>
                <dd className="tabular-nums text-emerald-700">
                  {abatimentoCents > 0 ? `− ${emReais(abatimentoCents)}` : emReais(0)}
                </dd>
              </div>

              {/* No lugar do "Frete" do desenho. */}
              <div className="flex items-baseline justify-between gap-2">
                <dt className="text-muted">Frete</dt>
                <dd className="text-[11.5px] italic text-muted">não existe — é software</dd>
              </div>

              <div className="mt-1.5 flex items-baseline justify-between gap-2 border-t border-line pt-2.5">
                <dt className="text-[13.5px] font-semibold text-ink">Total da 1ª cobrança</dt>
                <dd className="text-[17px] font-semibold tabular-nums text-ink">
                  {item.emReais.primeiraCobranca}
                </dd>
              </div>

              <p className="text-[11.5px] leading-snug text-muted">
                Das renovações em diante sai{" "}
                <span className="tabular-nums">{item.emReais.doCiclo}</span> por cobrança. O total
                acima é só a entrada.
              </p>
            </dl>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Onde moram os dois atos que o desenho põe como botão verde e botão branco.
 *
 * O link de pagamento **existe de verdade** — medido em
 * `checkoutDaProposta.gerarLinkDePagamento`. Dizer "não existe" seria tão falso
 * quanto desenhar um botão morto; por isso a tela nomeia o ato e diz onde ele é
 * alcançável.
 */
function OndeMoramOsAtos() {
  return (
    <div className="rounded-2xl border border-line bg-paper p-4">
      <h3 className="text-[13px] font-semibold text-ink">Gerar link e salvar proposta</h3>
      <p className="mt-1.5 text-[12px] leading-relaxed text-ink2">
        Os dois atos <strong className="text-ink">existem na casa</strong>: gerar o link cria a
        assinatura recorrente com chave idempotente, e o mesmo link gerado duas vezes devolve a
        mesma assinatura em vez de cobrar duas.
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-ink2">
        Eles não são alcançáveis <em>daqui</em>: esta frente de telas é só-leitura, e a regra vale
        para as quatro. Quem monta e gera continua sendo a ficha do lead, onde ficam as travas.
      </p>
      <p className="mt-2 text-[11.5px] leading-snug text-muted">
        Um botão aqui que não fizesse nada ensinaria o vendedor a esperar por ele no meio da
        conversa — que é o momento em que descobrir a ausência custa mais caro.
      </p>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// O RODAPÉ — "Status do Pagamento" em quatro passos
// ═════════════════════════════════════════════════════════════════════════════

/**
 * O desenho desenha quatro passos genéricos (pendente → PIX → cartão → pedido
 * confirmado). Aqui os quatro passos são **a máquina de estados real da
 * proposta**, e cada um carrega quantas propostas estão nele agora. Passo com
 * número inventado seria enfeite; passo com o número do banco é painel.
 *
 * ⚠️ PIX não aparece: a cobrança da Foocci é assinatura recorrente no cartão.
 * Um passo de PIX prometeria um meio de pagamento que a máquina não oferece.
 */
function StatusDoPagamento({ p }: { p: PanoramaDaOferta }) {
  const conta = (situacao: string) => p.colunas.find((c) => c.situacao === situacao)?.total ?? 0;

  const passos = [
    {
      n: 1,
      titulo: "Proposta montada",
      detalhe: "Em rascunho · ainda sem link gerado",
      total: conta("RASCUNHO"),
      quadro: "bg-chip text-muted",
      icone: "agenda" as const,
    },
    {
      n: 2,
      titulo: "Link enviado",
      detalhe: "Proposta com o cliente · aguardando o cartão",
      total: conta("ENVIADA"),
      quadro: "bg-blue-50 text-blue-600",
      icone: "relogio" as const,
    },
    {
      n: 3,
      titulo: "Em negociação",
      detalhe: "O cliente respondeu e a conversa continua",
      total: conta("EM_NEGOCIACAO"),
      quadro: "bg-amber-50 text-amber-600",
      icone: "pessoas" as const,
    },
    {
      n: 4,
      titulo: "Pagamento confirmado",
      detalhe: "A assinatura entrou · a oportunidade virou cliente",
      total: conta("ACEITA"),
      quadro: "bg-emerald-50 text-emerald-600",
      icone: "dinheiro" as const,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)]">
      <Secao
        titulo="Status do pagamento"
        descricao="Os quatro passos são a máquina de estados real da proposta, e o número em cada um é quantas estão nele agora — no seu escopo."
      >
        <ol className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {passos.map((passo) => (
            <li key={passo.n} className="rounded-2xl border border-line bg-paper p-3">
              <div className="flex items-start gap-2.5">
                <span
                  className={cx(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                    passo.quadro,
                  )}
                >
                  <Icone nome={passo.icone} className="h-[17px] w-[17px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-ink">
                    {passo.n}. {passo.titulo}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{passo.detalhe}</p>
                  <p className="mt-1.5 text-[20px] font-semibold leading-none tabular-nums text-ink">
                    {passo.total}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-[11.5px] leading-snug text-muted">
          Sem passo de PIX: a cobrança da Foocci é assinatura recorrente no cartão. Desenhar PIX
          aqui prometeria um meio de pagamento que a máquina não oferece.
        </p>
      </Secao>

      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-emerald-900">
          <Icone nome="grafico" className="h-4 w-4" />
          Da conversa ao faturamento
        </p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-emerald-950">
          O vendedor mostra o plano, confere a primeira cobrança e manda o link. O cliente contrata
          sozinho, e o pagamento confirmado faz a oportunidade virar conta de cliente — sem ninguém
          digitar nada duas vezes.
        </p>
      </div>
    </div>
  );
}
