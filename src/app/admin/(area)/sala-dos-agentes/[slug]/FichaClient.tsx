"use client";

/**
 * A ficha do agente — a anatomia da maquete aprovada pelo CEO.
 *
 * ── Duas decisões que valem mais que o pixel ──
 *
 * 1. **A ficha é leitura.** Nenhum campo salva, então nenhum campo finge que
 *    salva. Onde a maquete tinha input, aqui tem texto; onde tinha rádio de
 *    modelo, aqui tem o modelo em que o agente roda hoje.
 *
 * 2. **O chão aparece com cadeado.** As travas não são configuração: são código
 *    e doutrina. A ficha as MOSTRA para que ninguém precise adivinhar o limite,
 *    e não as edita — "está escrito no perfil do agente" já falhou em produção
 *    nesta casa e custou um incidente (guardrail 4).
 *
 * O que a ficha ainda NÃO mostra está declarado na própria tela, em bloco
 * próprio. Órgão sem dado não vira caixa vazia bonita: vira lacuna assumida.
 */

import Link from "next/link";
import type { CartaoAgente } from "@/services/agents/salaDosAgentes.types";
import { MotorDoCartao } from "../_cartao";
import { formatarData, useSalaDosAgentes } from "../_dados";
import {
  Carregando,
  Erro,
  EtiquetaArea,
  Nota,
  PontoEstado,
  SeloEssencial,
  ValorMedida,
  agruparMotivos,
  cx,
  nomeDoEstado,
} from "../_ui";

const NOME_POPULACAO: Record<string, string> = {
  produto: "Fala com o cliente",
  desenvolvimento: "Constrói o produto",
};

/**
 * O chão da casa — o que NENHUM agente daqui pode fazer, com ou sem ficha.
 *
 * Não é opinião desta tela nem dado de banco: é a citação dos guardrails
 * inegociáveis do `CLAUDE.md`, que vivem em prompt E em trava de código. Ficam
 * aqui porque a ficha precisa mostrar o limite; mudá-los é ato humano em outro
 * arquivo, nunca clique nesta página.
 */
const CHAO_DA_CASA: Array<{ regra: string; origem: string }> = [
  {
    regra: "Concluir uma negação a partir do silêncio da base",
    origem: "guardrail 1 — ausência de informação não é informação",
  },
  {
    regra: "Tratar verificação sem resultado registrado como aprovada",
    origem: "guardrail 2 — sem portão = reprovado",
  },
  {
    regra: "Mudar as próprias regras ou ampliar a própria autonomia",
    origem: "guardrail 3 — mudança estrutural é ato humano",
  },
  {
    regra: "Vender como pronto o que ainda está em piloto",
    origem: "guardrail 7 — maturidade é conservadora de propósito",
  },
];

/** Os órgãos da anatomia que o contrato desta versão ainda não alimenta. */
const ORGAOS_SEM_DADO: Array<{ orgao: string; pergunta: string }> = [
  { orgao: "Olhos", pergunta: "de onde ele tira a verdade — quais fontes estão ligadas e quais estão vazias" },
  { orgao: "Boca", pergunta: "como ele fala — tom, tamanho e os exemplos que ensinam" },
  { orgao: "Mãos", pergunta: "o que ele faz sozinho, o que pede autorização e o que não pode" },
  { orgao: "Coleira", pergunta: "em que degrau de autonomia ele está hoje" },
  { orgao: "Consciência", pergunta: "quais portões conferem a resposta antes de ela sair" },
  { orgao: "Aprendizado", pergunta: "o que ele aprendeu e foi aprovado por gente" },
];

export function FichaClient({ slug }: { slug: string }) {
  const { estado, recarregar } = useSalaDosAgentes();

  const agente =
    estado.fase === "pronto" ? estado.sala.agentes.find((a) => a.slug === slug) : undefined;

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <Link
          href="/admin/sala-dos-agentes"
          className="inline-flex items-center gap-1.5 rounded-lg text-[12.5px] font-semibold text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-100"
        >
          ← Sala dos Agentes
        </Link>

        {estado.fase === "carregando" && (
          <div className="mt-4">
            <Carregando cartoes={4} />
          </div>
        )}

        {estado.fase === "erro" && (
          <div className="mt-4">
            <Erro detalhe={estado.detalhe} onTentarDeNovo={recarregar} />
          </div>
        )}

        {estado.fase === "pronto" && !agente && <NaoEncontrado slug={slug} />}

        {agente && <Ficha agente={agente} />}
      </div>
    </div>
  );
}

function NaoEncontrado({ slug }: { slug: string }) {
  return (
    <div className="mt-6 rounded-2xl border border-dashed border-line2 bg-paper px-6 py-12 text-center">
      <p className="text-[15px] font-semibold text-ink">Não existe agente com este slug</p>
      <p className="mx-auto mt-1.5 max-w-md text-[13px] leading-relaxed text-ink2">
        Procurei por <span className="font-mono text-ink">{slug}</span> na lista da Sala e não
        encontrei. Ou o endereço veio digitado errado, ou o agente saiu do elenco.
      </p>
      <Link
        href="/admin/sala-dos-agentes"
        className="mt-4 inline-flex items-center justify-center rounded-xl border border-brand-500 bg-brand-500 px-4 py-2.5 text-[13.5px] font-semibold text-white shadow-[0_6px_16px_-6px_rgba(249,115,22,.55)] transition-colors hover:bg-brand-600"
      >
        Ver quem está na Sala
      </Link>
    </div>
  );
}

function Ficha({ agente }: { agente: CartaoAgente }) {
  const desde = formatarData(agente.noArDesde);

  return (
    <>
      <header className="mt-4 flex items-start gap-3">
        <PontoEstado estado={agente.estado} className="mt-[13px]" />
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-[-.02em] text-ink">{agente.nome}</h1>
          {/* Duas linhas, não uma lista que quebra: a 375px a lista inline
              deixava um "·" órfão no fim da linha. Identificação em cima,
              tempo de casa embaixo. */}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
            <span className="font-mono text-[12.5px]">{agente.slug}</span>
            <span aria-hidden="true">·</span>
            <span>{agente.area}</span>
            <span aria-hidden="true">·</span>
            <span>{nomeDoEstado(agente.estado)}</span>
          </p>
          <p className="mt-0.5 text-[13px] text-muted">
            No ar desde{" "}
            {desde ? (
              desde
            ) : (
              <em
                className="italic"
                title="Nada no sistema registra a data de criação de um agente."
              >
                não registrado
              </em>
            )}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <EtiquetaArea>{NOME_POPULACAO[agente.populacao] ?? agente.populacao}</EtiquetaArea>
            {agente.essencial && <SeloEssencial />}
          </div>
        </div>
      </header>

      {/* Uma frase, não três parágrafos: a 375px o aviso tomava a primeira
          tela inteira e o agente só aparecia depois de uma rolagem. */}
      <div className="mt-5">
        <Nota marca="A regra">
          <p>
            <strong className="font-semibold">Nesta versão a ficha é leitura</strong> — ela mostra o
            que a Sala consegue provar e não oferece campo que não salva. As partes com cadeado{" "}
            <span aria-hidden="true">🔒</span> nunca serão editáveis aqui: são trava de código e
            doutrina, não configuração.
          </p>
        </Nota>
      </div>

      <div className="mt-4 grid grid-cols-1 items-start gap-3.5 lg:grid-cols-2">
        <div className="flex flex-col gap-3.5">
          <Bloco orgao="Identidade" titulo="Quem ele é">
            <Campo rotulo="Função">
              <p className="text-[13px] leading-relaxed text-ink2">{agente.funcao}</p>
            </Campo>
            <dl className="mt-3 grid gap-2.5">
              <Linha termo="Área">{agente.area}</Linha>
              <Linha termo="População">
                {NOME_POPULACAO[agente.populacao] ?? agente.populacao}
              </Linha>
              <Linha termo="No ar desde">
                {desde ?? (
                  <em className="font-normal italic text-muted">não registrado</em>
                )}
              </Linha>
              <Linha termo="Estado">{nomeDoEstado(agente.estado)}</Linha>
              <Linha termo="Pode ser apagado">
                {agente.essencial ? (
                  <span className="text-brand-700">não — é um dos cinco Essenciais</span>
                ) : (
                  "sim, por decisão humana"
                )}
              </Linha>
            </dl>
          </Bloco>

          <Bloco orgao="Sinais vitais" titulo="Quanto ele trabalhou">
            {agente.metricas.length === 0 ? (
              <p className="text-[13px] italic text-muted">
                Este agente não expõe nenhuma medida nesta versão da Sala.
              </p>
            ) : (
              <>
                <dl className="grid gap-2.5">
                  {agente.metricas.map((m) => (
                    <div key={m.rotulo} className="flex items-baseline justify-between gap-4">
                      <dt className="text-[13px] text-muted">{m.rotulo}</dt>
                      <dd className="m-0 text-right">
                        <ValorMedida medida={m.medida} tamanho="linha" />
                      </dd>
                    </div>
                  ))}
                </dl>
                {/* A evidência UMA vez, com os rótulos que ela explica. Com
                    dados reais as três métricas deste bloco compartilham o
                    mesmo motivo de cinco linhas — impresso três vezes, ninguém
                    lê nenhuma. */}
                {agruparMotivos(agente.metricas).map((g) => (
                  <p
                    key={g.motivo}
                    className="mt-3 rounded-xl border border-line bg-canvas px-3 py-2 text-[11.5px] leading-snug text-ink2"
                  >
                    <span className="font-semibold text-ink">{g.rotulos.join(" · ")}:</span>{" "}
                    {g.motivo}
                  </p>
                ))}
              </>
            )}
            <Rodape>
              “Não medido” some quando o registro passar a guardar qual agente gastou — e só vale a
              partir daquela data. Até lá, o campo assume que não sabe.
            </Rodape>
          </Bloco>
        </div>

        <div className="flex flex-col gap-3.5">
          <Bloco orgao="Cabeça" titulo="Em qual IA ele pensa">
            <MotorDoCartao motor={agente.motor} />
            <Rodape>
              {agente.motor.tipo === "configurado"
                ? "Trocar de modelo é decisão de custo e de risco — não se faz por clique nesta tela nesta versão."
                : "Não há seletor aqui porque não há o que selecionar: este agente roda na sessão do Diretor, e um seletor sem efeito seria controle que mente."}
            </Rodape>
          </Bloco>

          <BlocoTravado orgao="Espinha" titulo="O que ele nunca pode — e ninguém destrava aqui">
            <ul className="grid gap-1.5">
              {CHAO_DA_CASA.map((r) => (
                <li
                  key={r.regra}
                  className="flex items-baseline gap-2.5 rounded-xl border border-line2 bg-paper px-3 py-2"
                >
                  <span className="shrink-0 rounded-md bg-red-50 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.07em] text-red-600">
                    nunca
                  </span>
                  <span className="min-w-0 text-[12.5px] leading-snug text-ink2">
                    {r.regra}
                    <span className="block text-[11px] text-muted">{r.origem}</span>
                  </span>
                </li>
              ))}
              {agente.essencial && (
                <li className="flex items-baseline gap-2.5 rounded-xl border border-brand-200 bg-brand-50 px-3 py-2">
                  <span className="shrink-0 rounded-md bg-brand-100 px-1.5 py-0.5 text-[9.5px] font-semibold uppercase tracking-[.07em] text-brand-700">
                    nunca
                  </span>
                  <span className="min-w-0 text-[12.5px] leading-snug text-ink2">
                    Ser apagado deste projeto
                    <span className="block text-[11px] text-muted">
                      doutrina 23 — os cinco Essenciais vêm com todo projeto da casa
                    </span>
                  </span>
                </li>
              )}
            </ul>
            <Rodape>
              Estas regras vivem em <span className="font-mono text-[11.5px]">CLAUDE.md</span> e em
              trava de código, não no banco. A ficha as <strong className="font-semibold">mostra</strong>{" "}
              para que ninguém precise adivinhar o limite — e não as edita.
            </Rodape>
          </BlocoTravado>
        </div>
      </div>

      <div className="mt-3.5">
        <Bloco orgao="O buraco assumido" titulo="O que esta ficha ainda não mostra">
          <p className="text-[13px] leading-relaxed text-ink2">
            A anatomia completa tem mais órgãos do que esta versão consegue provar. Em vez de
            desenhar caixa vazia com cara de resposta, a ficha declara o que falta:
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {ORGAOS_SEM_DADO.map((o) => (
              <li
                key={o.orgao}
                className="rounded-xl border border-dashed border-line2 bg-canvas px-3 py-2 text-[12.5px] leading-snug text-ink2"
              >
                <span className="font-semibold text-ink">{o.orgao}</span> — {o.pergunta}
              </li>
            ))}
          </ul>
          <Rodape>
            Cada um destes depende de dado que o contrato da Sala ainda não carrega. Eles entram
            quando o dado existir — não antes.
          </Rodape>
        </Bloco>
      </div>
    </>
  );
}

// ── Peças da anatomia ────────────────────────────────────────────────────────

function Bloco({
  orgao,
  titulo,
  children,
}: {
  orgao: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-line2 bg-paper p-4 sm:p-[17px]">
      <p className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-brand-600">
        {orgao}
      </p>
      <h2 className="mb-3 mt-0.5 text-[15px] font-semibold tracking-[-.01em] text-ink">{titulo}</h2>
      {children}
    </section>
  );
}

function BlocoTravado({
  orgao,
  titulo,
  children,
}: {
  orgao: string;
  titulo: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-dashed border-line2 bg-[#FAFAF8] p-4 sm:p-[17px]">
      <p className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[.12em] text-ink2">
        {orgao}
        <span aria-hidden="true" className="text-[11px] tracking-normal">
          🔒
        </span>
        <span className="sr-only">(travado — não editável)</span>
      </p>
      <h2 className="mb-3 mt-0.5 text-[15px] font-semibold tracking-[-.01em] text-ink">{titulo}</h2>
      {children}
    </section>
  );
}

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[11px] uppercase tracking-[.06em] text-muted">{rotulo}</p>
      {children}
    </div>
  );
}

function Linha({ termo, children }: { termo: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-[13px] text-muted">{termo}</dt>
      <dd className="m-0 text-right text-[13px] font-semibold tabular-nums text-ink">{children}</dd>
    </div>
  );
}

function Rodape({ children }: { children: React.ReactNode }) {
  return (
    <p className={cx("mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-muted")}>
      {children}
    </p>
  );
}
