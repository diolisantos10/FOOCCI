"use client";

/**
 * O HUNTER IA / INTELIGÊNCIA COMERCIAL — a peça 14 do desenho do CEO.
 *
 * ── A PERGUNTA DA TELA ──────────────────────────────────────────────────────
 *
 * "Quais restaurantes nós já descobrimos, o que sabemos de cada um, quais têm
 * ICP alto e quais já estão prontos para o SDR."
 *
 * ── ⛔ O FATO QUE MANDA NESTA TELA INTEIRA ──────────────────────────────────
 *
 * O Hunter de verdade — o que sai varrendo a internet atrás de restaurante
 * novo — **depende de uma fonte de dados paga que a empresa ainda não
 * contratou**. Decidido, e o CEO sabe.
 *
 * O desenho mostra 12.482 empresas encontradas, 8.321 enriquecidas e dez
 * restaurantes de exemplo com ICP de 60 a 92. **Nada disso entra.** O que entra
 * é a contagem real de `Empresa`, que hoje é pequena — e provavelmente zero.
 *
 * E aqui está a distinção que essa tela existe para não borrar:
 *
 *   · **zero medido** — a consulta rodou e não achou empresa nenhuma. É um
 *     número verdadeiro, e ele aparece como número, com o motivo ao lado.
 *   · **não medido** — não há como apurar. Aparece como "não medido" + motivo,
 *     nunca como zero.
 *
 * Os seis indicadores do desenho são todos do primeiro tipo: eles contam de
 * verdade. O que é do segundo tipo é uma coisa só — as **Sugestões da IA** —,
 * porque não existe motor de recomendação de prospecção nenhum, e escrever as
 * três frases do desenho no código seria vender conselho nosso com cara de
 * conselho de máquina.
 *
 * ── A BASE FRIA APARECE, E APARECE SEPARADA ─────────────────────────────────
 *
 * O que a casa TEM de verdade hoje é a base fria (`SiteLead`, dezenas de
 * milhares de contatos). Ela entra na tela — seria absurdo uma tela de
 * prospecção não dizer que existe — mas **fora da tabela de restaurantes
 * prospectados e fora dos seis indicadores**, num cartão que diz o que ela é.
 * Somar contato frio com restaurante descoberto faria a descoberta parecer
 * feita; é a mesma confusão que `frioOuLead.ts` existe para impedir.
 *
 * ── O QUE NÃO VIROU BOTÃO ───────────────────────────────────────────────────
 *
 * O desenho tem seis filtros, "Mais filtros", uma coluna "Ações" com menu por
 * linha, e "Ver mais sugestões". Nenhum deles existe: esta rota é só leitura e
 * não recorta nada. Filtro que não filtra e menu de ações sem ação ensinam a
 * operação a contar com o que não há — regra 3 de `00-MOLDURA-COMUM.md`.
 * A paginação, essa sim, é real: a rota pagina de verdade.
 */

import { useCallback, useEffect, useState } from "react";
import {
  Barra,
  Caixa,
  Carregando,
  CartaoDeIA,
  Celula,
  Corpo,
  Erro,
  FilaDeIndicadores,
  Icone,
  Indicador,
  Linha,
  NaoMedido,
  Pilula,
  Secao,
  SemAcesso,
  Tabela,
  TituloDaPagina,
  cx,
  emDia,
  textoDaVariacao,
  type Fase,
  type Tom,
} from "../_pecas/Pecas";
import type {
  CategoriaComIcp,
  DadosDoHunter,
  RestauranteProspectado,
} from "@/services/salaDeVendas/telas/hunter";
import { ICP_ALTO, MOTIVO_DA_FONTE_NAO_CONTRATADA } from "@/services/salaDeVendas/telas/hunter";

/** O tom de cada estágio do pipeline, na régua de cor do desenho. */
const TOM_DO_ESTAGIO: Record<string, Tom> = {
  DESCOBERTA: "azul",
  ENRIQUECENDO: "azul",
  PRONTA_PARA_SDR: "verde",
  GATEKEEPER: "ambar",
  DECISOR_ENCONTRADO: "roxo",
  QUALIFICADA: "verde",
  DESCARTADA: "cinza",
};

const ROTULO_CURTO_DO_ESTAGIO: Record<string, string> = {
  DESCOBERTA: "Descoberta",
  ENRIQUECENDO: "Enriquecendo",
  PRONTA_PARA_SDR: "Pronto SDR",
  GATEKEEPER: "Gatekeeper",
  DECISOR_ENCONTRADO: "Decisor encontrado",
  QUALIFICADA: "Qualificada",
  DESCARTADA: "Descartada",
};

const TOM_DA_PRIORIDADE: Record<string, Tom> = {
  ALTA: "vermelho",
  MEDIA: "ambar",
  BAIXA: "azul",
};

const ROTULO_DA_PRIORIDADE: Record<string, string> = {
  ALTA: "Alta",
  MEDIA: "Média",
  BAIXA: "Baixa",
};

/** O ICP ganha cor pela faixa — é o número que decide a ordem do trabalho. */
function tomDoIcp(icp: number): Tom {
  if (icp >= ICP_ALTO) return "verde";
  if (icp >= 60) return "ambar";
  return "cinza";
}

/**
 * Sim / Não / não apurado — os três estados, e o terceiro é o que o desenho
 * não tem.
 *
 * O desenho só desenha "Sim" e "Não". Na nossa base a maioria das empresas
 * nunca foi apurada, e `null` ali significa exatamente isso. Pintar `null` de
 * "Não" criaria uma fila de enriquecimento invisível: ninguém iria atrás de um
 * "Não" que na verdade era um "ninguém olhou".
 */
function SimNaoOuNaoApurado({ valor }: { valor: boolean | null }) {
  if (valor === null) {
    return <span className="text-[11.5px] italic text-muted">não apurado</span>;
  }
  return <Pilula tom={valor ? "verde" : "cinza"}>{valor ? "Sim" : "Não"}</Pilula>;
}

/** Os três ícones de fonte do desenho: site, Instagram e Maps. */
function Fontes({ r }: { r: RestauranteProspectado }) {
  const itens: Array<{ tem: boolean; rotulo: string; desenho: React.ReactNode }> = [
    {
      tem: r.temSite,
      rotulo: "site",
      desenho: (
        <>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5z" />
        </>
      ),
    },
    {
      tem: r.temInstagram,
      rotulo: "Instagram",
      desenho: (
        <>
          <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17" cy="7" r="1" />
        </>
      ),
    },
    {
      tem: r.temMaps,
      rotulo: "Google Maps",
      desenho: (
        <>
          <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </>
      ),
    },
  ];

  return (
    <span className="flex items-center gap-1">
      {itens.map((i) => (
        <span
          key={i.rotulo}
          title={i.tem ? `${i.rotulo}: encontrado` : `${i.rotulo}: não encontrado`}
          className={cx(i.tem ? "text-emerald-600" : "text-line2")}
        >
          <svg
            viewBox="0 0 24 24"
            className="h-[15px] w-[15px]"
            role="img"
            aria-label={i.tem ? `${i.rotulo}: encontrado` : `${i.rotulo}: não encontrado`}
            fill="none"
            stroke="currentColor"
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {i.desenho}
          </svg>
        </span>
      ))}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OS SEIS INDICADORES
// ─────────────────────────────────────────────────────────────────────────────

function SecaoNumeros({ dados }: { dados: DadosDoHunter }) {
  const n = dados.numeros;
  const vazio = n.encontradas === 0;

  return (
    <Secao
      titulo="O que o Hunter encontrou"
      descricao={
        vazio
          ? `Todos os seis números abaixo foram contados de verdade, e todos deram zero: ${MOTIVO_DA_FONTE_NAO_CONTRATADA}. Zero aqui é uma medição, não uma lacuna — a estrutura está de pé e enche sozinha no dia em que a fonte entrar.`
          : "Contagem direta da base de empresas descobertas. Nenhum número desta faixa é estimado."
      }
    >
      <FilaDeIndicadores>
        <Indicador
          rotulo="Empresas encontradas"
          valor={n.encontradas}
          icone="alvo"
          tom="azul"
          rodape={vazio ? MOTIVO_DA_FONTE_NAO_CONTRATADA : undefined}
        />
        <Indicador
          rotulo="Enriquecidas"
          valor={n.enriquecidas}
          icone="grafico"
          tom="azul"
          rodape="com ICP medido ou marketplace apurado"
        />
        <Indicador
          rotulo={`ICP alto (${ICP_ALTO}+)`}
          valor={n.icpAlto}
          icone="alvo"
          tom="verde"
          rodape="quem não tem ICP medido não entra nesta conta"
        />
        <Indicador
          rotulo="Decisores encontrados"
          valor={n.decisoresEncontrados}
          icone="chave"
          tom="roxo"
          rodape="empresas com ao menos um contato marcado como decisor"
        />
        <Indicador
          rotulo="Prontas para SDR"
          valor={n.prontasParaSdr}
          icone="porta"
          tom="verde"
          rodape="o teto da descoberta automática — daqui não sai disparo sozinho"
        />
        <Indicador
          rotulo="Novas hoje"
          valor={n.novasHoje}
          icone="agenda"
          tom="ambar"
          variacao={textoDaVariacao(n.novasOntem, n.novasHoje)}
        />
      </FilaDeIndicadores>
    </Secao>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A TABELA DE RESTAURANTES PROSPECTADOS
// ─────────────────────────────────────────────────────────────────────────────

const COLUNAS = [
  "Restaurante / Empresa",
  "Cidade",
  "Categoria",
  "Fontes",
  "Delivery próprio",
  "iFood",
  "Unidades",
  "Contato geral",
  "Decisor",
  "ICP",
  "Prioridade",
  "Status",
];

function SecaoRestaurantes({
  dados,
  pagina,
  irPara,
}: {
  dados: DadosDoHunter;
  pagina: number;
  irPara: (p: number) => void;
}) {
  const { itens, total, porPagina } = dados.restaurantes;
  const paginas = Math.max(1, Math.ceil(total / porPagina));

  return (
    <Secao
      titulo={`Restaurantes prospectados (${total})`}
      descricao="A ficha de cada empresa descoberta. Vazio em branco quer dizer que ninguém apurou aquele campo ainda — e é diferente de apurado e não tem."
    >
      {itens.length === 0 ? (
        <Caixa>
          <p className="font-semibold text-ink">Nenhum restaurante prospectado ainda.</p>
          <p className="mt-1.5">
            A tabela, o ICP e o pipeline estão construídos e funcionando — o que falta é
            de onde tirar os restaurantes: {MOTIVO_DA_FONTE_NAO_CONTRATADA}.
          </p>
          <p className="mt-1.5">
            Enquanto ela não entra, o que a casa tem é a <strong>base fria</strong>:{" "}
            {dados.baseFria.total.toLocaleString("pt-BR")} contatos vindos do formulário
            do site e de planilhas. Ela <strong>não</strong> aparece nesta tabela de
            propósito — contato frio é uma pessoa que chegou até nós, e restaurante
            prospectado é uma empresa que nós fomos procurar. São duas listas, e
            misturá-las faria a descoberta parecer feita.
          </p>
          <p className="mt-1.5 text-muted">
            A base fria abre em <strong>Prospecção › Base fria</strong>.
          </p>
        </Caixa>
      ) : (
        <>
          <Tabela colunas={COLUNAS}>
            {itens.map((r) => (
              <Linha key={r.id}>
                <Celula forte>{r.nome}</Celula>
                <Celula>
                  {r.cidade ?? <span className="italic text-muted">—</span>}
                  {r.cidade && r.estado ? ` - ${r.estado}` : ""}
                </Celula>
                <Celula>{r.categoria ?? <span className="italic text-muted">—</span>}</Celula>
                <Celula>
                  <Fontes r={r} />
                </Celula>
                <Celula>
                  <SimNaoOuNaoApurado valor={r.deliveryProprio} />
                </Celula>
                <Celula>
                  <SimNaoOuNaoApurado valor={r.ifood} />
                </Celula>
                <Celula numero>
                  {r.numeroDeUnidades ?? <span className="italic text-muted">—</span>}
                </Celula>
                <Celula numero>
                  {r.contatoGeral ?? <span className="italic text-muted">—</span>}
                </Celula>
                <Celula>
                  {r.decisor ? (
                    <>
                      <span className="font-medium text-ink">{r.decisor.nome}</span>
                      {r.decisor.cargo ? (
                        <span className="block text-[11px] text-muted">{r.decisor.cargo}</span>
                      ) : null}
                    </>
                  ) : (
                    <span className="italic text-muted">Não encontrado</span>
                  )}
                </Celula>
                <Celula>
                  {r.scoreIcp === null ? (
                    <span className="text-[11.5px] italic text-muted">não medido</span>
                  ) : (
                    <Pilula tom={tomDoIcp(r.scoreIcp)}>{r.scoreIcp}</Pilula>
                  )}
                </Celula>
                <Celula>
                  {r.prioridade === null ? (
                    <span className="text-[11.5px] italic text-muted">não priorizada</span>
                  ) : (
                    <Pilula tom={TOM_DA_PRIORIDADE[r.prioridade] ?? "cinza"}>
                      {ROTULO_DA_PRIORIDADE[r.prioridade] ?? r.prioridade}
                    </Pilula>
                  )}
                </Celula>
                <Celula>
                  <Pilula tom={TOM_DO_ESTAGIO[r.estagio] ?? "cinza"}>
                    {ROTULO_CURTO_DO_ESTAGIO[r.estagio] ?? r.estagio}
                  </Pilula>
                </Celula>
              </Linha>
            ))}
          </Tabela>

          {/* A paginação do desenho. Ela é real: a rota pagina de verdade. */}
          <nav
            className="flex flex-wrap items-center justify-between gap-2"
            aria-label="Páginas dos restaurantes prospectados"
          >
            <p className="text-[11.5px] text-muted">
              Página {pagina} de {paginas} · {porPagina} por página
            </p>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => irPara(pagina - 1)}
                disabled={pagina <= 1}
                className="rounded-full border border-line bg-paper px-3 py-1 text-[12px] text-ink2 transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:text-muted disabled:opacity-50"
              >
                Anterior
              </button>
              <button
                type="button"
                onClick={() => irPara(pagina + 1)}
                disabled={pagina >= paginas}
                className="rounded-full border border-line bg-paper px-3 py-1 text-[12px] text-ink2 transition-colors hover:bg-canvas disabled:cursor-not-allowed disabled:text-muted disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </nav>
        </>
      )}
    </Secao>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// O RODAPÉ DO DESENHO: CATEGORIAS COM MAIOR ICP E FILA DE ENRIQUECIMENTO
// ─────────────────────────────────────────────────────────────────────────────

function SecaoCategorias({ categorias }: { categorias: CategoriaComIcp[] }) {
  const teto = categorias.reduce((m, c) => Math.max(m, c.icpMedio), 0);

  return (
    <Secao
      titulo="Categorias com maior ICP"
      descricao="A média do ICP por categoria. Só entra categoria que tem ICP medido — categoria sem medição não é uma barra no chão, é uma barra que não existe."
    >
      {categorias.length === 0 ? (
        <Caixa>
          <NaoMedido motivo="nenhuma empresa com ICP medido e categoria preenchida — sem isso, uma média por categoria seria a média de nada" />
        </Caixa>
      ) : (
        <ul className="flex flex-col gap-2">
          {categorias.map((c) => (
            <Barra
              key={c.categoria}
              rotulo={c.categoria}
              valor={c.icpMedio}
              fracao={teto > 0 ? c.icpMedio / teto : null}
              tom={tomDoIcp(c.icpMedio)}
              nota={`média de ${c.base} ${c.base === 1 ? "empresa" : "empresas"}`}
            />
          ))}
        </ul>
      )}
    </Secao>
  );
}

function SecaoFilaDeEnriquecimento({ dados }: { dados: DadosDoHunter }) {
  const fila = dados.filaDeEnriquecimento;

  return (
    <Secao
      titulo={`Fila de enriquecimento (${fila.length})`}
      descricao="As empresas paradas em ENRIQUECENDO e o que falta apurar em cada uma. A tarefa é a PRIMEIRA lacuna da ficha — uma lista de seis pendências não é tarefa, é relatório."
    >
      {fila.length === 0 ? (
        <Caixa>
          <p>
            Nenhuma empresa em enriquecimento.{" "}
            {dados.numeros.encontradas === 0
              ? `Não há o que enriquecer porque não há empresa descoberta: ${MOTIVO_DA_FONTE_NAO_CONTRATADA}.`
              : "Nenhuma das empresas descobertas está parada nesse estágio."}
          </p>
        </Caixa>
      ) : (
        <Tabela colunas={["Tarefa", "Restaurante / Empresa", "Prioridade", "Parada há"]}>
          {fila.map((t) => (
            <Linha key={t.empresaId}>
              <Celula forte>{t.tarefa}</Celula>
              <Celula>{t.empresa}</Celula>
              <Celula>
                {t.prioridade === null ? (
                  <span className="text-[11.5px] italic text-muted">não priorizada</span>
                ) : (
                  <Pilula tom={TOM_DA_PRIORIDADE[t.prioridade] ?? "cinza"}>
                    {ROTULO_DA_PRIORIDADE[t.prioridade] ?? t.prioridade}
                  </Pilula>
                )}
              </Celula>
              <Celula numero>
                {t.diasNoEstagio === 0 ? "hoje" : `${t.diasNoEstagio} d`}
              </Celula>
            </Linha>
          ))}
        </Tabela>
      )}
    </Secao>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A COLUNA DA DIREITA
// ─────────────────────────────────────────────────────────────────────────────

function ColunaDaDireita({ dados }: { dados: DadosDoHunter }) {
  const totalDoPipeline = dados.pipeline.reduce((s, l) => s + l.total, 0);
  const totalDeFontes = dados.fontes.reduce((s, f) => s + f.total, 0);

  return (
    <>
      <section className="rounded-2xl border border-line bg-paper p-3">
        <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-blue-50 text-blue-600">
            <Icone nome="funil" className="h-[14px] w-[14px]" />
          </span>
          Pipeline Hunter
        </h3>
        {totalDoPipeline === 0 ? (
          <div className="mt-2">
            <NaoMedido
              motivo={`nenhuma empresa em estágio nenhum — ${MOTIVO_DA_FONTE_NAO_CONTRATADA}`}
            />
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {dados.pipeline.map((l) => (
              <Barra
                key={l.estagio}
                rotulo={l.rotulo}
                valor={l.total}
                fracao={totalDoPipeline > 0 ? l.total / totalDoPipeline : null}
                tom={TOM_DO_ESTAGIO[l.estagio] ?? "cinza"}
              />
            ))}
          </ul>
        )}
      </section>

      <CartaoDeIA titulo="Sugestões da IA">
        {dados.sugestoesDaIa.medido ? (
          <ul className="flex flex-col gap-1.5">
            {dados.sugestoesDaIa.valor.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        ) : (
          <NaoMedido motivo={dados.sugestoesDaIa.motivo} />
        )}
      </CartaoDeIA>

      <section className="rounded-2xl border border-line bg-paper p-3">
        <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
            <Icone nome="grafico" className="h-[14px] w-[14px]" />
          </span>
          Fontes monitoradas
        </h3>
        <p className="mt-1 text-[11.5px] leading-snug text-muted">
          De onde veio cada empresa já descoberta. É a fonte registrada na
          descoberta — não uma varredura ativa: nenhuma destas fontes está sendo
          monitorada agora.
        </p>
        {dados.fontes.length === 0 ? (
          <div className="mt-2">
            <NaoMedido
              motivo={`nenhuma empresa descoberta por fonte nenhuma — ${MOTIVO_DA_FONTE_NAO_CONTRATADA}`}
            />
          </div>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {dados.fontes.map((f) => (
              <Barra
                key={f.fonte}
                rotulo={f.fonte}
                valor={f.total}
                fracao={totalDeFontes > 0 ? f.total / totalDeFontes : null}
                tom="azul"
              />
            ))}
          </ul>
        )}
      </section>

      {/* A base fria — o que existe de verdade, dito onde não se confunde com
          a descoberta. Ver o cabeçalho deste arquivo. */}
      <section className="rounded-2xl border border-line bg-paper p-3">
        <h3 className="flex items-center gap-2 text-[12px] font-semibold text-ink">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-chip text-muted">
            <Icone nome="floco" className="h-[14px] w-[14px]" />
          </span>
          Base fria (não é descoberta)
        </h3>
        <p className="mt-2 text-[24px] font-semibold leading-none tabular-nums text-ink">
          {dados.baseFria.total.toLocaleString("pt-BR")}
        </p>
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
          contatos que chegaram pelo formulário do site e por planilha. Destes,{" "}
          <strong className="text-ink2">
            {dados.baseFria.comEmpresa.toLocaleString("pt-BR")}
          </strong>{" "}
          já estão ligados a uma empresa da jornada.
        </p>
        <p className="mt-1.5 text-[11.5px] leading-snug text-muted">
          Ela não entra nos números acima de propósito: contato frio é quem chegou
          até nós, restaurante prospectado é quem nós fomos procurar.
        </p>
      </section>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A TELA
// ─────────────────────────────────────────────────────────────────────────────

export function HunterClient() {
  const [estado, setEstado] = useState<Fase<DadosDoHunter>>({ fase: "carregando" });
  const [pagina, setPagina] = useState(1);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setEstado({ fase: "carregando" });
      try {
        const r = await fetch(`/api/admin/sala-de-vendas/hunter?pagina=${pagina}`, {
          cache: "no-store",
        });
        if (!vivo) return;
        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }
        const j = (await r.json()) as { ok: boolean; data?: DadosDoHunter; error?: string };
        if (!vivo) return;
        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? null });
          return;
        }
        setEstado({ fase: "pronto", dados: j.data });
      } catch (e) {
        if (vivo) setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
      }
    })();
    return () => {
      vivo = false;
    };
  }, [pagina]);

  const irPara = useCallback((p: number) => {
    setPagina(Math.max(1, p));
  }, []);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <TituloDaPagina
        contexto="Sala de Vendas › Prospecção"
        titulo="Hunter IA / Inteligência Comercial"
        subtitulo="Descubra restaurantes, enriqueça dados e priorize prospects com maior potencial de venda. Só leitura: esta tela mostra o Hunter, não dispara descoberta nem abordagem."
        periodo={estado.fase === "pronto" ? emDia(estado.dados.agora) : undefined}
      />

      {estado.fase === "carregando" && (
        <Carregando texto="Lendo as empresas descobertas e o pipeline do Hunter…" />
      )}
      {estado.fase === "semAcesso" && <SemAcesso />}
      {estado.fase === "erro" && <Erro detalhe={estado.detalhe} />}

      {estado.fase === "pronto" && (
        <>
          <SecaoNumeros dados={estado.dados} />

          <Corpo lateral={<ColunaDaDireita dados={estado.dados} />}>
            <SecaoRestaurantes dados={estado.dados} pagina={pagina} irPara={irPara} />
            <SecaoCategorias categorias={estado.dados.categorias} />
            <SecaoFilaDeEnriquecimento dados={estado.dados} />
          </Corpo>
        </>
      )}
    </div>
  );
}
