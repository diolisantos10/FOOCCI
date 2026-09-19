"use client";

/**
 * FOLLOW-UP AUTOMÁTICO E PÓS-VENDA.
 *
 * ── DUAS ABAS, UMA PERGUNTA ─────────────────────────────────────────────────
 *
 * Antes do GANHO chama-se follow-up e o relógio é o silêncio. Depois chama-se
 * pós-venda e o relógio é a ativação. É a mesma pergunta — “o que está parado, e
 * quando alguém toca de novo?” — dos dois lados da venda.
 *
 * ── ⚠️ O NÃO MEDIDO FICA FORA DA SOMA ───────────────────────────────────────
 *
 * `NÃO MEDIDO` é um dos catorze estados e ele NÃO entra no total que pede ação.
 * Somar “não sei” dentro de um número é como um painel passa a mentir sem ter
 * uma única linha errada: o total fica maior, parece trabalho, e ninguém
 * consegue apontar onde está o erro.
 *
 * ── E NADA É DISPARADO DAQUI ────────────────────────────────────────────────
 *
 * Sem botão de inscrever em cadência, sem botão de enviar. A classificação é
 * calculada na leitura e não é gravada — gravar a cada F5 encheria a linha do
 * tempo de cada lead com uma nota por visita.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ClienteNaFicha,
  PanoramaDoRelacionamento,
} from "@/services/salaDeVendas/telas/relacionamento";
import {
  Abas,
  buscarPainel,
  Carregando,
  Cartao,
  emReais,
  Erro,
  NaoMedido,
  Numero,
  SemAcesso,
  Vazio,
  type Estado,
} from "../_frenteComercial/Moldura";
import {
  cx,
  FilaDeIndicadores,
  Icone,
  Indicador,
  Numero as NumeroDoDesenho,
  Pilula,
  Rosca,
  Secao,
  TituloDaPagina,
  type Tom,
} from "../_pecas/Pecas";

type Aba = "followup" | "posvenda";

const ABAS = [
  { chave: "followup" as const, rotulo: "Follow-up automático" },
  { chave: "posvenda" as const, rotulo: "Pós-venda e relacionamento" },
];

function emPalavras(chave: string): string {
  return chave.replace(/_/g, " ").toLowerCase();
}

export function RelacionamentoClient() {
  const [estado, setEstado] = useState<Estado<PanoramaDoRelacionamento>>({ fase: "carregando" });
  const [aba, setAba] = useState<Aba>("followup");
  const [tentativa, setTentativa] = useState(0);
  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    let vivo = true;
    void buscarPainel<PanoramaDoRelacionamento>("/api/admin/sala-de-vendas/relacionamento").then(
      (e) => {
        if (vivo) setEstado(e);
      },
    );
    return () => {
      vivo = false;
    };
  }, [tentativa]);

  if (estado.fase === "carregando") return <Carregando oQue="Classificando a base e lendo as contas…" />;
  if (estado.fase === "semAcesso") return <SemAcesso porque={estado.porque} />;
  if (estado.fase === "erro") return <Erro detalhe={estado.detalhe} tentarDeNovo={recarregar} />;

  const p = estado.dados;

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1180px]">
        <TituloDaPagina
          titulo={aba === "posvenda" ? "Pós-venda e Relacionamento" : "Follow-up e pós-venda"}
          subtitulo={
            aba === "posvenda"
              ? "Clientes que já compraram. Mais valor, mais satisfação, mais crescimento."
              : "Os catorze estados em que um contato pode estar. A classificação é recalculada a cada abertura desta tela e não é gravada."
          }
        />

        <div className="mt-4" />
        <Abas abas={ABAS} atual={aba} aoTrocar={setAba} />
        <NaoMedido frases={p.naoMedido} />

        {aba === "followup" ? (
          <>
            <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Numero rotulo="Contatos analisados" valor={p.contatosAnalisados} detalhe="o que foi lido, não a base inteira" />
              <Numero rotulo="Pedindo ação" valor={p.pedindoAcao} detalhe="sem contar o não medido" />
              <Numero rotulo="Esfriando" valor={p.esfriando} detalhe="pensando, e já na metade da janela" />
              <Numero rotulo="Pediram silêncio" valor={p.emSilencio} detalhe="fora da análise, e intocáveis" />
            </div>

            <Cartao
              titulo="Os catorze estados"
              aviso="Na ordem normativa das regras: é de cima para baixo que elas valem, e o primeiro que casar decide. A ordem desta lista é lida do código, não digitada aqui."
            >
              {p.contatosAnalisados === 0 ? (
                <Vazio motivo="Nenhum contato para classificar no seu escopo. As contagens ficam vazias, e vazio aqui é ausência de contato — não é 'tudo em dia'." />
              ) : (
                <ol className="space-y-2">
                  {p.estados.map((e) => (
                    <li
                      key={e.estado}
                      className={
                        e.medido
                          ? "rounded-xl border border-line bg-canvas p-3"
                          : "rounded-xl border border-amber-200 bg-amber-50 p-3"
                      }
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-[13.5px] font-semibold text-ink">
                          {emPalavras(e.estado)}
                          {e.pedeAcao && (
                            <span className="ml-2 text-[11px] font-semibold uppercase tracking-[.04em] text-emerald-700">
                              pede ação
                            </span>
                          )}
                          {!e.medido && (
                            <span className="ml-2 text-[11px] font-semibold uppercase tracking-[.04em] text-amber-800">
                              fora da soma
                            </span>
                          )}
                        </p>
                        <p className="tabular-nums text-[13.5px] font-semibold text-ink">{e.total}</p>
                      </div>
                      {e.exemplo && (
                        <p className="mt-1 max-w-[72ch] text-[12px] leading-relaxed text-muted">
                          por exemplo: {e.exemplo}
                        </p>
                      )}
                      <p className="mt-1 text-[11.5px] text-muted">
                        {e.cadencia
                          ? `aciona a cadência “${e.cadencia}”`
                          : "não aciona cadência nenhuma — este estado classifica e para aí"}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </Cartao>

            <Cartao
              titulo="A régua do tempo"
              aviso="Os prazos que separam um estado do seguinte. Mudá-los é mudar a doutrina de follow-up da casa, não um ajuste de tela."
            >
              <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {Object.entries(p.regua).map(([chave, valor]) => (
                  <div
                    key={chave}
                    className="flex items-baseline justify-between gap-3 rounded-xl border border-line bg-canvas px-3 py-2"
                  >
                    <dt className="text-[12.5px] text-ink2">{emPalavras(chave)}</dt>
                    <dd className="tabular-nums text-[13px] font-semibold text-ink">{String(valor)}</dd>
                  </div>
                ))}
              </dl>
            </Cartao>

            <Cartao
              titulo="As cadências e as condições de cada passo"
              aviso="Um passo com condição só dispara se o contato AINDA estiver no estado que o justifica. É o que impede a cobrança de carrinho chegar a quem já fechou."
            >
              {p.cadencias.length === 0 ? (
                <Vazio motivo="Nenhuma cadência cadastrada no banco. Os estados acima continuam classificando e nada é acionado — o motor de follow-up está desligado, não vazio." />
              ) : (
                <ul className="space-y-2">
                  {p.cadencias.map((c) => (
                    <li key={c.slug} className="rounded-xl border border-line bg-canvas p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                        <p className="text-[13.5px] font-semibold text-ink">{c.nome}</p>
                        <p
                          className={
                            c.ativa
                              ? "text-[12px] font-semibold text-emerald-700"
                              : "text-[12px] font-semibold text-amber-800"
                          }
                        >
                          {c.ativa ? "ativa" : "desligada"}
                        </p>
                      </div>
                      <p className="mt-1 text-[12px] text-muted">
                        {c.passos} passo(s) · {c.inscritosAtivos} contato(s) em curso
                        {c.acionadaPor.length > 0 &&
                          ` · acionada por: ${c.acionadaPor.map(emPalavras).join(", ")}`}
                      </p>
                      {c.condicoes.length > 0 && (
                        <ul className="mt-1.5 space-y-0.5">
                          {c.condicoes.map((cond) => (
                            <li key={cond.passo} className="text-[11.5px] leading-relaxed text-ink2">
                              <span className="font-mono text-muted">{cond.passo}</span> —{" "}
                              {cond.descricao}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </Cartao>

            <Cartao
              titulo="O que faz a cadência parar"
              aviso="A parada vale antes de qualquer passo. Sem ela, quem respondeu continuaria recebendo a cobrança de quem não respondeu."
            >
              <ul className="space-y-1.5">
                {p.paradas.map((parada) => (
                  <li key={parada.motivo} className="rounded-xl border border-line bg-canvas px-3 py-2">
                    <p className="text-[13px] font-semibold text-ink">{parada.motivo}</p>
                    <p className="mt-0.5 max-w-[72ch] text-[12px] leading-relaxed text-ink2">
                      {parada.explicacao}
                    </p>
                  </li>
                ))}
              </ul>
            </Cartao>
          </>
        ) : (
          <PosVenda p={p} />
        )}
      </div>
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// A PEÇA 10 DO DESENHO — PÓS-VENDA E RELACIONAMENTO
//
// ── A TRADUÇÃO: O DESENHO É DE UMA LOJA DE VAREJO ───────────────────────────
//
// A imagem mostra "Empresa Alpha", CNPJ, tickets de suporte, pesquisa de NPS e
// "Produtos Complementares" (Suporte Premium, Módulo Analytics). Nós vendemos
// PLANO para restaurante, e a conta que nasce da venda é `Cliente`:
//
// | No desenho                    | Aqui                                       |
// |-------------------------------|--------------------------------------------|
// | Cliente empresa + CNPJ        | A **conta** (empresa + decisor), sem CNPJ  |
// | Saúde do Cliente 0–100        | `Cliente.saude` — **é campo, não invenção**|
// | Satisfação (NPS)              | `Cliente.nps` — existe, **quase sempre vazio** |
// | Tickets (3)                   | **NÃO EXISTE** — ver a aba Tickets         |
// | Total de compras              | 1ª venda + `recompras`                     |
// | Linha do Tempo do Cliente     | `EventoDaJornada` com `clienteId`          |
// | Produtos complementares       | **Não há recomendador** — ver o rodapé     |
//
// ── ⛔ O QUE NÃO SE INVENTOU ────────────────────────────────────────────────
//
// O CNPJ não é mostrado porque a conta não guarda um. O NPS do topo só aparece
// se alguém respondeu — e ele é o NPS de verdade (promotores menos detratores),
// não uma média disfarçada. As variações "vs. mês anterior" do desenho não
// existem: nada nesta casa fotografa a base todo mês, então no lugar da seta
// verde vai a frase que diz isso.
// ═════════════════════════════════════════════════════════════════════════════

type AbaDaFicha = "visao" | "historico" | "tickets" | "oportunidades" | "campanhas";

const ABAS_DA_FICHA: { chave: AbaDaFicha; rotulo: string }[] = [
  { chave: "visao", rotulo: "Visão geral" },
  { chave: "historico", rotulo: "Histórico" },
  { chave: "tickets", rotulo: "Tickets" },
  { chave: "oportunidades", rotulo: "Oportunidades" },
  { chave: "campanhas", rotulo: "Campanhas" },
];

/** A pílula de estado da conta, com o tom que o desenho dá a cada um. */
function tomDaSituacao(situacao: string): Tom {
  switch (situacao) {
    case "ATIVO":
      return "verde";
    case "EM_ATIVACAO":
      return "azul";
    case "EM_RISCO":
      return "ambar";
    case "INATIVO":
    case "CANCELADO":
      return "vermelho";
    default:
      return "cinza";
  }
}

function emDiaCurto(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function emDiaEHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function PosVenda({ p }: { p: PanoramaDoRelacionamento }) {
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(
    p.listaDeClientes[0]?.id ?? null,
  );
  const [abaDaFicha, setAbaDaFicha] = useState<AbaDaFicha>("visao");

  const naLista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return p.listaDeClientes;
    return p.listaDeClientes.filter((c) =>
      `${c.empresa} ${c.pessoa ?? ""}`.toLowerCase().includes(termo),
    );
  }, [p.listaDeClientes, busca]);

  const cliente = useMemo(
    () => p.listaDeClientes.find((c) => c.id === selecionado) ?? null,
    [p.listaDeClientes, selecionado],
  );

  const i = p.indicadores;

  return (
    <div className="flex flex-col gap-5">
      {/* ── OS CINCO INDICADORES ─────────────────────────────────────── */}
      <FilaDeIndicadores colunas={5}>
        <Indicador
          rotulo="Clientes ativos"
          valor={i.clientesAtivos}
          icone="pessoas"
          tom="azul"
          variacao={i.comparacao}
        />
        <Indicador
          rotulo="Recompras"
          valor={i.recompras}
          icone="grafico"
          tom="verde"
          variacao={i.comparacao}
        />
        <Indicador
          rotulo="Ticket médio"
          valor={i.ticketMedioCents === null ? null : emReais(i.ticketMedioCents)}
          motivo={i.ticketMedioMotivo ?? undefined}
          icone="dinheiro"
          tom="verde"
        />
        <Indicador
          rotulo="Satisfação (NPS)"
          valor={i.nps}
          motivo={i.npsMotivo ?? undefined}
          icone="coracao"
          tom="roxo"
          rodape={
            i.nps !== null ? `sobre ${i.npsRespostas} resposta(s) — só quem respondeu` : undefined
          }
        />
        <Indicador
          rotulo="Clientes para reativar"
          valor={i.paraReativar}
          icone="alerta"
          tom="vermelho"
          rodape="contas inativas ou já marcadas em risco"
        />
      </FilaDeIndicadores>

      {p.clientes === 0 ? (
        <Vazio motivo="Nenhum cliente registrado ainda. A jornada de pós-venda só começa no primeiro GANHO — e nenhum número desta tela pode ser preenchido antes disso." />
      ) : (
        <>
          {/* ── O CORPO DE TRÊS COLUNAS DO DESENHO ───────────────────── */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,.95fr)_minmax(0,1.7fr)_minmax(0,1fr)]">
            <ListaDeClientes
              clientes={naLista}
              total={p.clientes}
              cortada={p.listaCortada}
              busca={busca}
              aoBuscar={setBusca}
              selecionado={selecionado}
              aoSelecionar={(id) => {
                setSelecionado(id);
                setAbaDaFicha("visao");
              }}
            />

            <FichaDoClienteNaTela
              cliente={cliente}
              aba={abaDaFicha}
              aoTrocarAba={setAbaDaFicha}
              limiarDeRisco={p.reguaDeChurn.limiarDeRisco}
            />

            <ColunaDaSaude cliente={cliente} p={p} />
          </div>

          <RodapeDeSugestoes />
        </>
      )}
    </div>
  );
}

// ── 1. A LISTA DE CLIENTES ──────────────────────────────────────────────────

function ListaDeClientes({
  clientes,
  total,
  cortada,
  busca,
  aoBuscar,
  selecionado,
  aoSelecionar,
}: {
  clientes: ClienteNaFicha[];
  total: number;
  cortada: boolean;
  busca: string;
  aoBuscar: (v: string) => void;
  selecionado: string | null;
  aoSelecionar: (id: string) => void;
}) {
  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-line bg-paper">
      <div className="border-b border-line px-3 py-3">
        <h2 className="text-[14px] font-semibold text-ink">
          Clientes <span className="tabular-nums text-muted">({total})</span>
        </h2>
        <label className="relative mt-2 block">
          <span className="sr-only">Buscar cliente</span>
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icone nome="alvo" className="h-4 w-4" />
          </span>
          <input
            type="search"
            value={busca}
            onChange={(e) => aoBuscar(e.target.value)}
            placeholder="Buscar cliente…"
            className="w-full rounded-xl border border-line2 bg-paper py-2 pl-9 pr-3 text-[12.5px] text-ink placeholder:text-muted focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
          />
        </label>
      </div>

      {clientes.length === 0 ? (
        <div className="p-3">
          <Vazio motivo="Nenhuma conta casa com esta busca. A busca olha o nome da empresa e o da pessoa decisora, e nada mais." />
        </div>
      ) : (
        <ul className="max-h-[640px] min-h-0 flex-1 divide-y divide-line overflow-y-auto">
          {clientes.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => aoSelecionar(c.id)}
                aria-current={selecionado === c.id ? "true" : undefined}
                className={cx(
                  "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors",
                  selecionado === c.id
                    ? "border-l-2 border-blue-500 bg-blue-50"
                    : "border-l-2 border-transparent hover:bg-canvas",
                )}
              >
                {/* O desenho usa foto; a conta não guarda foto. Inicial, então. */}
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-chip text-[12px] font-semibold uppercase text-ink2">
                  {c.empresa.slice(0, 1)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span className="min-w-0 truncate text-[13px] font-semibold text-ink">
                      {c.empresa}
                    </span>
                    <Pilula tom={tomDaSituacao(c.situacao)}>{emPalavras(c.situacao)}</Pilula>
                  </span>
                  <span className="mt-0.5 block truncate text-[11.5px] text-muted">
                    {c.pessoa ?? "decisor não registrado na oportunidade"}
                  </span>
                  <span className="mt-0.5 flex items-baseline justify-between gap-2">
                    <span className="text-[11px] text-muted">
                      Última compra: {emDiaCurto(c.ultimaCompraEm)}
                    </span>
                    <span className="text-[11.5px] font-semibold tabular-nums text-ink">
                      {c.receitaTotalCents !== null && c.receitaTotalCents > 0
                        ? emReais(c.receitaTotalCents)
                        : "—"}
                    </span>
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {cortada ? (
        <p className="border-t border-line px-3 py-2 text-[11px] leading-snug text-muted">
          A lista parou no teto de leitura. Os cinco indicadores do topo são da base inteira; esta
          lista, não.
        </p>
      ) : null}
    </div>
  );
}

// ── 2. A FICHA, COM AS CINCO ABAS ───────────────────────────────────────────

function FichaDoClienteNaTela({
  cliente,
  aba,
  aoTrocarAba,
  limiarDeRisco,
}: {
  cliente: ClienteNaFicha | null;
  aba: AbaDaFicha;
  aoTrocarAba: (a: AbaDaFicha) => void;
  limiarDeRisco: number;
}) {
  if (!cliente) {
    return (
      <div className="rounded-2xl border border-line bg-paper p-4">
        <Vazio motivo="Nenhuma conta selecionada. Escolha um cliente na lista ao lado para abrir a ficha." />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col rounded-2xl border border-line bg-paper">
      {/* O cabeçalho da ficha. O desenho põe CNPJ aqui; a conta não guarda um. */}
      <div className="border-b border-line px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 text-blue-600">
              <Icone nome="pessoas" className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 className="truncate text-[16px] font-semibold text-ink">{cliente.empresa}</h2>
              <p className="text-[11.5px] text-muted">
                Cliente desde {emDiaCurto(cliente.ganhoEm)}
                {cliente.pessoa ? ` · ${cliente.pessoa}` : ""}
              </p>
            </div>
          </div>
          <Pilula tom={tomDaSituacao(cliente.situacao)}>{emPalavras(cliente.situacao)}</Pilula>
        </div>
        <p className="mt-1.5 text-[11px] italic leading-snug text-muted">
          Sem CNPJ na ficha: a conta não guarda documento. O desenho traz um porque foi feito com
          uma carteira de empresas já cadastradas com CNPJ.
        </p>
      </div>

      {/* As cinco abas. */}
      <div className="flex flex-wrap gap-1 border-b border-line px-2">
        {ABAS_DA_FICHA.map((a) => (
          <button
            key={a.chave}
            type="button"
            onClick={() => aoTrocarAba(a.chave)}
            aria-current={aba === a.chave ? "page" : undefined}
            className={cx(
              "-mb-px rounded-t-lg border-b-2 px-2.5 py-2 text-[12px] font-medium transition-colors",
              aba === a.chave
                ? "border-blue-500 text-blue-700"
                : "border-transparent text-muted hover:text-ink2",
            )}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-4 px-4 py-4">
        {aba === "visao" ? <VisaoGeral cliente={cliente} /> : null}
        {aba === "historico" ? <LinhaDoTempo cliente={cliente} completo /> : null}
        {aba === "tickets" ? <AbaDeTickets /> : null}
        {aba === "oportunidades" ? (
          <AbaDeOportunidades cliente={cliente} limiarDeRisco={limiarDeRisco} />
        ) : null}
        {aba === "campanhas" ? <AbaDeCampanhas /> : null}
      </div>
    </div>
  );
}

/** Os três cartões do desenho, mais a linha do tempo abaixo. */
function VisaoGeral({ cliente }: { cliente: ClienteNaFicha }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <NumeroDoDesenho
          rotulo="Total de compras"
          valor={cliente.compras}
          rodape={`a primeira venda mais ${cliente.recompras} recompra(s)`}
        />
        <NumeroDoDesenho
          rotulo="Valor total"
          valor={
            cliente.receitaTotalCents !== null && cliente.receitaTotalCents > 0
              ? emReais(cliente.receitaTotalCents)
              : null
          }
          motivo="Nada foi registrado nesta conta. A receita só é preenchida quando a cobrança entra — um R$ 0,00 aqui diria que a conta não paga nada, e o que há é que ninguém lançou."
        />
        <NumeroDoDesenho
          rotulo="Última compra"
          valor={cliente.ultimaCompraEm ? emDiaCurto(cliente.ultimaCompraEm) : null}
          motivo="Nenhuma compra registrada com data nesta conta."
          rodape={
            cliente.diasDesdeAUltimaCompra !== null
              ? `há ${cliente.diasDesdeAUltimaCompra} dia(s)`
              : undefined
          }
        />
      </div>

      <LinhaDoTempo cliente={cliente} />
    </>
  );
}

/** A Linha do Tempo do Cliente — a trilha real, não um roteiro desenhado. */
function LinhaDoTempo({ cliente, completo }: { cliente: ClienteNaFicha; completo?: boolean }) {
  return (
    <Secao
      titulo="Linha do tempo do cliente"
      descricao={
        completo
          ? "Os eventos da trilha desta conta, do mais novo para o mais antigo."
          : undefined
      }
    >
      {cliente.linhaDoTempo.length === 0 ? (
        <Vazio motivo="Nenhum evento gravado na trilha desta conta. A trilha só registra o que de fato aconteceu — uma linha do tempo com marcos genéricos seria roteiro, não história." />
      ) : (
        <ol className="flex flex-col gap-2.5">
          {cliente.linhaDoTempo.map((e) => (
            <li key={e.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
                <Icone nome="agenda" className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <p className="text-[12.5px] font-semibold text-ink">{e.titulo}</p>
                  <p className="text-[11px] tabular-nums text-muted">{emDiaEHora(e.quando)}</p>
                </div>
                {e.detalhe ? (
                  <p className="mt-0.5 text-[11.5px] leading-snug text-ink2">{e.detalhe}</p>
                ) : null}
                <p className="mt-0.5 text-[11px] text-muted">por {e.autor.toLowerCase()}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Secao>
  );
}

/**
 * A aba "Tickets (3)" do desenho.
 *
 * ⛔ Não existe ticket de suporte desta conta. `SupportTicket` existe no schema,
 * mas é da OUTRA casa — o suporte que o RESTAURANTE dá ao cliente final dele,
 * escopado por `restaurantId`. Contar aquilo aqui juntaria as duas casas que a
 * doutrina manda não juntar, e o número apareceria certo e significando outra
 * coisa. Um "(0)" no rótulo da aba seria a mesma mentira, mais discreta.
 */
function AbaDeTickets() {
  return (
    <Secao titulo="Tickets de suporte">
      <Vazio motivo="Não há ticket de suporte para contas da sala comercial: o suporte que existe no sistema é o do restaurante para o cliente final dele, e é escopado por restaurante. Mostrar aquele número aqui juntaria duas casas que não se tocam — e zero seria igualmente falso, porque não é que não houve chamado: é que não existe canal de chamado desta conta." />
    </Secao>
  );
}

/** Oportunidades: o que o pós-venda cobra desta conta, com o porquê de cada uma. */
function AbaDeOportunidades({
  cliente,
  limiarDeRisco,
}: {
  cliente: ClienteNaFicha;
  limiarDeRisco: number;
}) {
  return (
    <Secao
      titulo="Oportunidades"
      descricao="O desenho lista Recompra, Cross-sell e Upsell com um selo de probabilidade. Aqui a lista é a dos marcos que a régua do pós-venda de fato cobra desta conta — sem selo de probabilidade, que ninguém calcula."
    >
      {cliente.proximosPassos.length === 0 ? (
        <Vazio motivo="Nenhum marco pendente nesta conta agora: ela não está sem ativar, sem acompanhamento nem na janela de recompra. Isso é uma medição, não uma ausência de dado." />
      ) : (
        <ul className="flex flex-col gap-2">
          {cliente.proximosPassos.map((passo) => (
            <li key={passo.marco} className="rounded-xl border border-line bg-canvas p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[12.5px] font-semibold text-ink">{emPalavras(passo.marco)}</p>
                <p className="text-[11px] text-muted">vence em {emDiaCurto(passo.venceEm)}</p>
              </div>
              <p className="mt-1 text-[11.5px] leading-snug text-ink2">{passo.porque}</p>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 rounded-xl border border-line bg-canvas p-3">
        <p className="text-[12.5px] font-semibold text-ink">Risco de churn desta conta</p>
        {cliente.riscoDeChurn === null ? (
          <p className="mt-1 text-[11.5px] leading-snug text-muted">
            Não medido — sem ativação, sem saúde e sem NPS não há sinal a observar. Isso não é
            risco zero.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[12px] text-ink2">
              <span className="text-[17px] font-semibold tabular-nums text-ink">
                {cliente.riscoDeChurn}
              </span>{" "}
              pontos · entra em risco a partir de {limiarDeRisco}
            </p>
            {cliente.motivoDoRisco ? (
              <p className="mt-1 text-[11.5px] leading-snug text-muted">{cliente.motivoDoRisco}</p>
            ) : null}
            {cliente.sinaisObservados.length > 0 ? (
              <ul className="mt-1.5 flex flex-wrap gap-1.5">
                {cliente.sinaisObservados.map((s) => (
                  <li key={s}>
                    <Pilula tom="ambar">{s}</Pilula>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </div>
    </Secao>
  );
}

/**
 * A aba "Campanhas" do desenho.
 *
 * As cadências desta casa são inscritas por LEAD, não por conta de cliente. Não
 * há de onde ler "em que campanha esta conta entrou" sem inventar a junção.
 */
function AbaDeCampanhas() {
  return (
    <Secao titulo="Campanhas">
      <Vazio motivo="As cadências da casa são inscritas por lead, não por conta de cliente — não existe vínculo gravado entre uma conta e as campanhas que a alcançaram. A aba de follow-up mostra as cadências que existem e quantos contatos estão em cada uma; atribuí-las a esta conta exigiria uma junção que ninguém escreveu." />
    </Secao>
  );
}

// ── 3. A COLUNA DA DIREITA: SAÚDE, SATISFAÇÃO E OPORTUNIDADES ───────────────

function ColunaDaSaude({
  cliente,
  p,
}: {
  cliente: ClienteNaFicha | null;
  p: PanoramaDoRelacionamento;
}) {
  return (
    <aside className="flex min-w-0 flex-col gap-3">
      {/* A rosca de Saúde do Cliente 0–100, com as faixas do desenho. */}
      <div className="rounded-2xl border border-line bg-paper p-4">
        <h3 className="text-[14px] font-semibold text-ink">Saúde do cliente</h3>

        {cliente && cliente.saude !== null ? (
          <div className="mt-3">
            <Rosca
              fatias={[
                { rotulo: "Saúde", valor: cliente.saude, tom: tomDaFaixa(cliente.saude) },
                { rotulo: "Falta", valor: 100 - cliente.saude, tom: "cinza" },
              ]}
              total={100}
              centro={cliente.saude}
              sobCentro="Saúde"
              semLegenda
            />
            <ul className="mt-3 flex flex-col gap-1">
              {p.faixasDeSaude.map((f) => (
                <li key={f.rotulo} className="flex items-baseline gap-2">
                  <span
                    className={cx(
                      "mt-1 h-2 w-2 shrink-0 rounded-full",
                      f.rotulo === "Excelente"
                        ? "bg-emerald-500"
                        : f.rotulo === "Boa"
                          ? "bg-blue-500"
                          : f.rotulo === "Atenção"
                            ? "bg-amber-500"
                            : "bg-red-500",
                    )}
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1 text-[12px] text-ink2">{f.rotulo}</span>
                  <span className="text-[11.5px] tabular-nums text-muted">
                    {f.de}–{f.ate}
                  </span>
                  <span className="w-8 text-right text-[11.5px] font-semibold tabular-nums text-ink">
                    {f.contas}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] leading-snug text-muted">
              A contagem à direita é de toda a lista lida, não só desta conta.
              {p.saudeNaoMedida > 0
                ? ` ${p.saudeNaoMedida} conta(s) sem saúde gravada ficam fora da rosca.`
                : ""}
            </p>
          </div>
        ) : (
          <div className="mt-2">
            <Vazio motivo="Saúde não medida nesta conta. O campo nasce vazio e só é preenchido por quem mede — e 0 ali significaria conta morta, mandando o time atrás de quem ninguém olhou." />
          </div>
        )}
      </div>

      {/* Satisfação e suporte. */}
      <div className="rounded-2xl border border-line bg-paper p-4">
        <h3 className="text-[14px] font-semibold text-ink">Satisfação e suporte</h3>
        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-1">
          <NumeroDoDesenho
            rotulo="NPS desta conta"
            valor={cliente?.nps ?? null}
            motivo="Este cliente não respondeu pesquisa. `Cliente.nps` nasce vazio e não há pesquisa de NPS rodando na sala comercial — um 0 aqui diria nota zero, que é o oposto de 'não perguntamos'."
            rodape={cliente?.nps !== null && cliente?.nps !== undefined ? "nota de 0 a 10" : undefined}
          />
          <NumeroDoDesenho
            rotulo="Tickets de suporte"
            valor={null}
            motivo="Não existe canal de chamado para contas da sala comercial. O suporte do sistema é o do restaurante para o cliente final dele, e é de outra casa."
          />
        </div>
      </div>

      {/* Oportunidades, resumidas. */}
      <div className="rounded-2xl border border-line bg-paper p-4">
        <h3 className="text-[14px] font-semibold text-ink">Oportunidades</h3>
        {!cliente || cliente.proximosPassos.length === 0 ? (
          <div className="mt-2">
            <Vazio motivo="Nenhum marco pendente nesta conta agora. Sem selo de probabilidade: ninguém calcula probabilidade de recompra nesta casa, e um selo de 'alta' seria chute com cara de modelo." />
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-1.5">
            {cliente.proximosPassos.map((passo) => (
              <li key={passo.marco} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 text-[12px] text-ink2">{emPalavras(passo.marco)}</span>
                <Pilula tom="azul">até {emDiaCurto(passo.venceEm)}</Pilula>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}

/** A cor da rosca segue a faixa em que a nota caiu — a mesma do desenho. */
function tomDaFaixa(saude: number): Tom {
  if (saude >= 85) return "verde";
  if (saude >= 70) return "azul";
  if (saude >= 50) return "ambar";
  return "vermelho";
}

// ── 4. O RODAPÉ: produtos complementares e próximas ofertas ─────────────────

/**
 * O desenho fecha com "Produtos Complementares" (Suporte Premium, Módulo
 * Analytics, Treinamento Avançado, com preço e botão Adicionar) e "Próximas
 * Ofertas Recomendadas" com selo de aderência.
 *
 * ⛔ Nenhum dos dois existe. Não há add-on no catálogo — o que a Foocci vende
 * são três planos em três ciclos — e não há recomendador que diga qual plano
 * cabe a qual conta. Os três cartões do desenho seriam produtos inventados com
 * preço inventado, que é exatamente o que a régua proíbe.
 */
function RodapeDeSugestoes() {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Secao titulo="Produtos complementares">
        <Vazio motivo="Não há produto complementar a sugerir: o catálogo da Foocci são três planos em três ciclos, sem add-on. Os cartões do desenho (Suporte Premium, Módulo Analytics, Treinamento) são de um catálogo de varejo — desenhá-los aqui criaria produto e preço que não existem." />
      </Secao>

      <Secao titulo="Próximas ofertas recomendadas">
        <Vazio motivo="Não há recomendador de oferta nesta casa. O que existe é a régua do pós-venda, que diz quando uma conta entra na janela de recompra ou de upsell — e ela já está na aba Oportunidades, com o motivo de cada marco. Um selo de 'alta aderência' aqui seria chute com cara de modelo." />
      </Secao>
    </div>
  );
}
