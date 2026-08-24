"use client";

/**
 * Sala dos Agentes — a tela (doutrina 20 do kit, adotada pelo CEO em 07/08/2026).
 *
 * Duas abas, e elas são duas por ordem do CEO: "quem está no time" é gestão de
 * elenco; "quanto a OpenAI me custou" é conta a pagar. Numa tela só, a segunda
 * vira rodapé da primeira e ninguém olha.
 *
 * ── O que esta tela NÃO faz, e por quê ──
 * Não tem "+ Novo agente" nem "Salvar". Nesta primeira versão a Sala é LEITURA,
 * e botão que não salva é controle que mente — o pior defeito desta casa não é
 * feiura, é o controle que finge. Quando o serviço de escrita existir, o botão
 * nasce junto.
 */

import { useMemo } from "react";
import Link from "next/link";
import type { CartaoAgente, CartaoMotor, Medida } from "@/services/agents/salaDosAgentes.types";
import { CartaoDeAgente } from "./_cartao";
import { useSalaDosAgentes } from "./_dados";
import { estaEmOperacao } from "./_estados";
import {
  Carregando,
  Erro,
  LegendaDeEstados,
  NotaColapsavel,
  Resumo,
  TituloSecao,
  ValorMedida,
  Vazio,
  cx,
  formatarValor,
  temNaoMedido,
} from "./_ui";

export type Aba = "agentes" | "configuracoes";

/**
 * ── ONDE FOI PARAR A ABA "A EMPRESA" ──
 *
 * Ela existiu aqui por um dia, na estrutura de 9 departamentos. Com a v3, a
 * estrutura da empresa ganhou área própria: `/admin/departamentos`.
 *
 * A aba não sobreviveu de propósito. Manter as duas deixaria dois lugares para
 * responder "quem responde por quê?" — e a pergunta "qual dos dois está
 * atualizado?" passaria a ter duas respostas. Esta Sala volta a ser o que era:
 * os agentes do PRODUTO e as IAs contratadas.
 */
export function SalaDosAgentesClient({ aba }: { aba: Aba }) {
  const { estado, recarregar } = useSalaDosAgentes();

  const cabecalho =
    aba === "configuracoes"
      ? "As inteligências artificiais contratadas, quem usa cada uma e quanto custam."
      : "Quem trabalha neste projeto, o que cada um faz, e desde quando.";

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header>
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">Sala dos Agentes</h1>
          <p className="mt-1 max-w-[70ch] text-[13.5px] leading-relaxed text-muted">{cabecalho}</p>
        </header>

        {estado.fase === "pronto" && (
          <Resumo
            itens={
              aba === "configuracoes"
                ? resumoDeMotores(estado.sala.motores)
                : resumoDeAgentes(estado.sala.agentes)
            }
          />
        )}

        <Abas atual={aba} />

        {estado.fase === "carregando" && <Carregando />}

        {estado.fase === "erro" && <Erro detalhe={estado.detalhe} onTentarDeNovo={recarregar} />}

        {estado.fase === "pronto" && (
          <>
            {estado.sala.lacunas.length > 0 && (
              <div className="mt-5">
                <NotaColapsavel
                  resumo={
                    <>
                      {estado.sala.lacunas.length === 1
                        ? "1 coisa esta Sala ainda não consegue medir"
                        : `${estado.sala.lacunas.length} coisas esta Sala ainda não consegue medir`}
                      <span className="font-normal"> — e por isso escreve “não medido”, não zero.</span>
                    </>
                  }
                >
                  <ul className="list-disc space-y-1 pl-4">
                    {estado.sala.lacunas.map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                </NotaColapsavel>
              </div>
            )}

            {aba === "agentes" ? (
              <AbaAgentes agentes={estado.sala.agentes} />
            ) : (
              <AbaConfiguracoes motores={estado.sala.motores} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Abas ─────────────────────────────────────────────────────────────────────

function Abas({ atual }: { atual: Aba }) {
  const itens: Array<{ id: Aba; texto: string; href: string }> = [
    { id: "agentes", texto: "Agentes", href: "/admin/sala-dos-agentes" },
    { id: "configuracoes", texto: "Configurações", href: "/admin/sala-dos-agentes?aba=configuracoes" },
  ];

  return (
    <nav className="mt-6 flex gap-5 border-b border-line" aria-label="Seções da Sala dos Agentes">
      {itens.map((i) => (
        <Link
          key={i.id}
          href={i.href}
          aria-current={atual === i.id ? "page" : undefined}
          className={cx(
            "-mb-px border-b-2 px-0.5 pb-2.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100",
            atual === i.id
              ? "border-brand-500 text-ink"
              : "border-transparent text-muted hover:text-ink2",
          )}
        >
          {i.texto}
        </Link>
      ))}
    </nav>
  );
}

// ── Aba 1: Agentes ───────────────────────────────────────────────────────────

function AbaAgentes({ agentes }: { agentes: CartaoAgente[] }) {
  const { produto, desenvolvimento } = useMemo(
    () => ({
      produto: agentes.filter((a) => a.populacao === "produto"),
      desenvolvimento: agentes.filter((a) => a.populacao === "desenvolvimento"),
    }),
    [agentes],
  );

  if (agentes.length === 0) {
    return (
      <Vazio
        titulo="Nenhum agente registrado ainda"
        descricao="Quando este projeto tiver agentes — os que falam com o cliente e os que constroem o produto — eles aparecem aqui, com o que fazem e desde quando."
      />
    );
  }

  return (
    <>
      <LegendaDeEstados />
      <Grupo
        titulo="Falam com o cliente"
        sub="Rodam em produção, consomem IA paga e respondem por dinheiro. São estes que precisam de medidor de custo."
        agentes={produto}
        vazio="Nenhum agente de produto registrado neste projeto."
      />
      <Grupo
        titulo="Constroem o produto"
        sub="Os especialistas do Cérebro. Não falam com cliente nenhum — escrevem código, revisam e registram. O trabalho deles se mede em bloco entregue, não em token."
        agentes={desenvolvimento}
        vazio="Nenhum agente de desenvolvimento registrado neste projeto."
      />
    </>
  );
}

/**
 * Um grupo de população — em duas camadas, e a segunda é o motivo do conserto.
 *
 * A grade principal mostra SÓ quem roda, porque é esse o número que o contador
 * do topo declara. Enquanto o contador dizia 4 e a grade abaixo despejava 12
 * cartões, um dos dois estava mentindo — e não adianta consertar o número e
 * deixar a lista contradizendo.
 *
 * Quem não roda não some: vai para uma gaveta dobrada, com a contagem no
 * rótulo. É a "Ver desligados" da maquete, feita com `<details>` nativo —
 * abre no toque, funciona sem JS, e deixa explícito que aqueles cartões estão
 * FORA da conta de cima.
 */
function Grupo({
  titulo,
  sub,
  agentes,
  vazio,
}: {
  titulo: string;
  sub: string;
  agentes: CartaoAgente[];
  vazio: string;
}) {
  const emOperacao = agentes.filter(estaEmOperacao);
  const fora = agentes.filter((a) => !estaEmOperacao(a));

  return (
    <section>
      <TituloSecao titulo={titulo} sub={sub} />
      {emOperacao.length === 0 ? (
        <p className="mt-3 rounded-2xl border border-dashed border-line2 bg-paper px-4 py-6 text-center text-[13px] text-muted">
          {vazio}
        </p>
      ) : (
        <Grade agentes={emOperacao} className="mt-3.5" />
      )}

      {fora.length > 0 && (
        <details className="group/fora mt-3">
          <summary className="flex w-full cursor-pointer list-none items-baseline gap-2 rounded-xl border border-dashed border-line2 bg-paper px-4 py-2.5 hover:border-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100">
            <span
              aria-hidden="true"
              className="text-[13px] text-muted transition-transform group-open/fora:rotate-90"
            >
              ›
            </span>
            <span className="text-[13px] font-semibold text-ink2">
              Fora de operação ({fora.length})
            </span>
            <span className="text-[12px] text-muted">
              perfis cadastrados que não rodam hoje — não entram na conta acima
            </span>
          </summary>
          <Grade agentes={fora} className="mt-3" />
        </details>
      )}
    </section>
  );
}

function Grade({ agentes, className }: { agentes: CartaoAgente[]; className?: string }) {
  return (
    <div className={cx("grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3", className)}>
      {agentes.map((a) => (
        <CartaoDeAgente key={`${a.populacao}:${a.slug}`} agente={a} />
      ))}
    </div>
  );
}

// ── Aba 2: Configurações ─────────────────────────────────────────────────────

function AbaConfiguracoes({ motores }: { motores: CartaoMotor[] }) {
  if (motores.length === 0) {
    return (
      <Vazio
        titulo="Nenhuma IA conectada"
        descricao="Quando este projeto contratar uma inteligência artificial, ela aparece aqui: se está ligada, para que serve, quanto custou nos últimos 30 dias e quem usa."
      />
    );
  }

  return (
    <section>
      <TituloSecao
        titulo="Inteligências conectadas"
        sub="Um cartão por IA: se está ligada, para que serve, quanto custou nos últimos 30 dias e quem usa."
      />
      <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {motores.map((m) => (
          <article
            key={m.provedor}
            className="flex flex-col rounded-2xl border border-line2 bg-paper p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-[14px] font-semibold tracking-[-.01em] text-ink">{m.provedor}</h3>
              <span
                className={cx(
                  "shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[.05em]",
                  m.ligada ? "bg-green-50 text-green-700" : "bg-[#F4F4F2] text-muted",
                )}
              >
                {m.ligada ? "Ligada" : "Desligada"}
              </span>
            </div>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink2">{m.paraQueServe}</p>

            <div className="mt-3.5 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3">
              <div className="min-w-0">
                {/* Altura fixa nas duas células: sem ela, "não medido" (12px) e
                    o valor (14px) empurram os rótulos para alturas diferentes e
                    a linha de baixo fica torta. */}
                <div className="flex min-h-[19px] items-end leading-tight">
                  <ValorMedida medida={m.custo30Dias} />
                </div>
                <div className="text-[10px] uppercase tracking-[.06em] text-muted">30 dias</div>
              </div>
              <div className="min-w-0">
                <div className="flex min-h-[19px] items-end text-[13px] font-semibold leading-tight text-ink">
                  {m.usadaPor.length > 0 ? (
                    m.usadaPor.join(", ")
                  ) : (
                    <em
                      className="text-[12px] font-normal italic text-muted"
                      title="O registro de uso não atribui esta IA a nenhum agente."
                    >
                      sem atribuição no registro
                    </em>
                  )}
                </div>
                <div className="text-[10px] uppercase tracking-[.06em] text-muted">Quem usa</div>
              </div>
            </div>

            {m.custo30Dias.estado === "naoMedido" && (
              <p className="mt-2.5 text-[11.5px] leading-snug text-muted">
                <span className="font-semibold text-ink2">Custo não medido:</span>{" "}
                {m.custo30Dias.motivo}
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

// ── Os contadores do topo ────────────────────────────────────────────────────

/**
 * Os contadores do topo — e o critério que eles NÃO podem afrouxar.
 *
 * O número grande conta quem **roda**. Perfil cadastrado que não está no ar tem
 * contador próprio, porque "quem não está sendo usado" é metade da pergunta que
 * o CEO faz a esta tela — mas não pode entrar no mesmo número de quem atende.
 *
 * O total de perfis cadastrados foi REMOVIDO de propósito: era ele que somava
 * rascunho com agente vivo. Quem quiser o total soma as três parcelas, que
 * fecham exatamente.
 */
function resumoDeAgentes(agentes: CartaoAgente[]) {
  const daPopulacao = (p: CartaoAgente["populacao"]) =>
    agentes.filter((a) => a.populacao === p);

  const produtoAtivo = daPopulacao("produto").filter(estaEmOperacao).length;
  const desenvolvimentoAtivo = daPopulacao("desenvolvimento").filter(estaEmOperacao).length;
  const foraDeOperacao = agentes.filter((a) => !estaEmOperacao(a)).length;
  const semMedida = agentes.filter((a) => temNaoMedido(a.metricas)).length;

  return [
    { rotulo: "Falam com o cliente", valor: produtoAtivo, sub: "em operação hoje" },
    { rotulo: "Constroem o produto", valor: desenvolvimentoAtivo, sub: "em operação hoje" },
    {
      rotulo: "Fora de operação",
      valor: foraDeOperacao,
      alerta: foraDeOperacao > 0,
      sub: foraDeOperacao > 0 ? "cadastrados, não contados acima" : undefined,
    },
    {
      rotulo: "Com medida faltando",
      valor: semMedida,
      alerta: semMedida > 0,
      sub: semMedida > 0 ? "ao menos uma medida sem instrumentação" : undefined,
    },
  ];
}

/**
 * A soma honesta — e a distinção que ela existe para não perder.
 *
 * `zeroProvado` ENTRA na conta: é medição, e o valor dela é zero. Só fica de
 * fora o que ninguém mediu (`naoMedido`) e o que está em outra unidade —
 * transcrição cobrada por minuto não se soma a token por mais que ambos virem
 * dólar no fim do mês.
 *
 * Contar `zeroProvado` como "fora da conta" seria o mesmo defeito de sinal
 * trocado que esta tela existe para não cometer, só na direção contrária: um
 * alarme que não corresponde a buraco nenhum.
 */
function resumoDeMotores(motores: CartaoMotor[]) {
  const medidos = motores
    .map((m) => m.custo30Dias)
    .filter((c): c is Extract<Medida, { estado: "medido" }> => c.estado === "medido");

  const unidade = medidos[0]?.unidade;
  const naUnidade = medidos.filter((c) => c.unidade === unidade);
  const total = naUnidade.reduce((s, c) => s + c.valor, 0);

  const zeros = motores.filter((m) => m.custo30Dias.estado === "zeroProvado").length;
  const outraUnidade = medidos.length - naUnidade.length;
  const naoMedidos = motores.filter((m) => m.custo30Dias.estado === "naoMedido").length;
  const naConta = naUnidade.length + zeros;
  const foraDaConta = naoMedidos + outraUnidade;
  const ligadas = motores.filter((m) => m.ligada).length;

  /**
   * Três desenhos possíveis, e a diferença entre eles é o que separa esta tela
   * do "Total hoje" que mentia:
   *
   * 1. conta fechada       → o total, sem ressalva
   * 2. conta parcial       → "≥ X", porque é PISO e não total
   * 3. nada em dinheiro    → "não medido"
   *
   * O caso 3 é o que os dados reais devolvem hoje: três das quatro IAs sem
   * custo atribuído e uma provada em zero. Somar isso daria um "0" grande e
   * confiante — o número mais errado que esta tela poderia imprimir.
   */
  let valorDoTotal: React.ReactNode;
  let subDoTotal: string;

  if (medidos.length === 0) {
    valorDoTotal = <em className="text-[15px] font-normal italic text-muted">não medido</em>;
    subDoTotal = `nenhuma das ${motores.length} IAs tem custo em dinheiro provado`;
  } else if (foraDaConta > 0) {
    valorDoTotal = `≥ ${formatarValor(total, unidade)}`;
    subDoTotal = `piso: ${naConta} de ${motores.length} IAs medidas`;
  } else {
    valorDoTotal = formatarValor(total, unidade);
    subDoTotal = `todas as ${motores.length} IAs medidas`;
  }

  return [
    { rotulo: "IAs conectadas", valor: motores.length },
    { rotulo: "Ligadas", valor: ligadas },
    { rotulo: "Custo em 30 dias", valor: valorDoTotal, sub: subDoTotal },
    {
      rotulo: "Fora da conta",
      valor: foraDaConta,
      alerta: foraDaConta > 0,
      sub: foraDaConta > 0 ? "sem custo que se possa somar" : undefined,
    },
  ];
}
