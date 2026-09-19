"use client";

/**
 * QUALIFICAÇÃO / LEAD SCORE — o termômetro e a conta.
 *
 * ── O QUE ESTA TELA SE RECUSA A DESENHAR ────────────────────────────────────
 *
 * O desenho do CEO mostra quatro degraus: FRIO, MORNO, QUENTE e PRONTO PARA
 * COMPRAR. O banco tem seis valores de temperatura, e um sétimo estado que não
 * é temperatura nenhuma: o lead que ninguém pontuou.
 *
 * Desenhar só os quatro faria a soma da tela ficar menor que a base, sem
 * explicação. Jogar o não pontuado em FRIO seria pior: zero diria "avaliado e
 * não presta", e o lead que ninguém olhou sumiria dentro do monte dos que
 * alguém olhou e descartou. Então os quatro degraus vêm com o nome do desenho
 * ao lado do nome do banco, os extras vêm depois, e o não classificado tem
 * quadro próprio — porque ele não é um resultado, é uma fila de trabalho.
 *
 * ── E A RÉGUA NÃO É DIGITADA AQUI ───────────────────────────────────────────
 *
 * As faixas ("QUENTE é de 60 a 79") chegam prontas do serviço, que as lê de
 * `temperaturaDe` varrendo a régua. Nenhum número desta tela é constante.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ConversaoPorTemperatura,
  PanoramaDaQualificacao,
  TelaDaQualificacao,
} from "@/services/salaDeVendas/telas/qualificacao";
import {
  buscarPainel,
  Carregando,
  Cartao,
  Erro,
  NaoMedido,
  SemAcesso,
  Vazio,
  type Estado,
} from "../_frenteComercial/Moldura";
import {
  Barra,
  CartaoDeIA,
  Celula,
  Corpo,
  FilaDeIndicadores,
  Indicador,
  Linha,
  Pilula,
  Rosca,
  Seletor,
  Tabela,
  TituloDaPagina,
  type FatiaDaRosca,
} from "../_pecas/Pecas";
import { TINTA_DA_TEMPERATURA, tintaDe } from "./tintaDaTemperatura";
import {
  FILTROS_VAZIOS,
  MesaDeLeads,
  rotuloDaEtapa,
  type EstadoDosFiltros,
} from "./MesaDeLeads";

/**
 * ⚠️ `tintaDe` mora em `tintaDaTemperatura.ts` desde que a mesa de trabalho
 * passou a pintar a mesma pílula. Reexportado aqui porque este é o endereço que
 * o resto da casa (e o teste desta tela) já conhece — mudar o endereço junto
 * com a regra esconderia qual das duas coisas mudou.
 */
export { TINTA_DA_TEMPERATURA, tintaDe };

export function QualificacaoClient() {
  const [estado, setEstado] = useState<Estado<TelaDaQualificacao>>({ fase: "carregando" });
  const [tentativa, setTentativa] = useState(0);
  const [filtros, setFiltros] = useState<EstadoDosFiltros>(FILTROS_VAZIOS);
  const [salvandoId, setSalvandoId] = useState<string | null>(null);
  const [recusas, setRecusas] = useState<Record<string, string>>({});

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  const consulta = useMemo(() => {
    const p = new URLSearchParams();
    if (filtros.busca.trim()) p.set("busca", filtros.busca.trim());
    if (filtros.origem) p.set("origem", filtros.origem);
    if (filtros.produto) p.set("produto", filtros.produto);
    if (filtros.temperatura) p.set("temperatura", filtros.temperatura);
    if (filtros.stage) p.set("stage", filtros.stage);
    p.set("pagina", String(filtros.pagina));
    return p.toString();
  }, [filtros]);

  useEffect(() => {
    let vivo = true;
    void buscarPainel<TelaDaQualificacao>(
      `/api/admin/sala-de-vendas/qualificacao?${consulta}`,
    ).then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, [tentativa, consulta]);

  /**
   * ⭐ O SELETOR DE STAGE DA LINHA — o único ato desta tela.
   *
   * Ele fala com `/funil`, que é onde a regra de movimento mora: as recusas
   * (etapa que exige motivo, lead que outra pessoa moveu antes) já estão
   * escritas lá. Reescrevê-las aqui criaria uma segunda régua de funil, e as
   * duas divergiriam no primeiro conserto.
   *
   * ⚠️ A recusa aparece NA LINHA, não num alerta que some. Movimento recusado
   * em silêncio é o defeito que faz o vendedor achar que salvou.
   */
  const mover = useCallback(
    (leadId: string, para: string) => {
      setSalvandoId(leadId);
      setRecusas((r) => {
        const { [leadId]: _fora, ...resto } = r;
        return resto;
      });

      void (async () => {
        try {
          const r = await fetch("/api/admin/sala-de-vendas/funil", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ leadId, para }),
          });
          const j = (await r.json()) as { ok: boolean; error?: string; recusas?: unknown };
          if (!j.ok) {
            setRecusas((x) => ({
              ...x,
              [leadId]: j.error ?? "A etapa não foi aceita, e a rota não disse por quê.",
            }));
          }
        } catch (e) {
          setRecusas((x) => ({
            ...x,
            [leadId]: e instanceof Error ? e.message : "Falha de rede ao mover.",
          }));
        } finally {
          setSalvandoId(null);
          // Recarrega sempre: o movimento mexe no termômetro e na contagem da
          // página, e uma tabela que só muda a própria linha mente no total.
          setTentativa((t) => t + 1);
        }
      })();
    },
    [],
  );

  const mudarFiltro = useCallback((campo: keyof EstadoDosFiltros, valor: string) => {
    // Filtro novo volta para a página 1: manter a página 7 com um filtro que só
    // tem duas páginas devolveria tela em branco sem explicação.
    setFiltros((f) => ({ ...f, [campo]: valor, pagina: 1 }));
  }, []);

  if (estado.fase === "carregando") return <Carregando oQue="Lendo o termômetro da base…" />;
  if (estado.fase === "semAcesso") return <SemAcesso porque={estado.porque} />;
  if (estado.fase === "erro") return <Erro detalhe={estado.detalhe} tentarDeNovo={recarregar} />;

  const p = estado.dados;

  return (
    <div className="min-h-full bg-canvas px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1400px]">
        <TituloDaPagina
          contexto="Leads › Qualificação e Lead Score"
          titulo="Qualificação e Lead Score"
          subtitulo="Analise, priorize e direcione os melhores leads para o time de vendas."
          atualidade="Tempo real"
        />

        <p className="mt-2 max-w-[80ch] text-[12.5px] leading-relaxed text-muted">
          O score não é uma nota opaca: ele é uma <strong className="text-ink2">conta</strong>,
          e esta tela mostra a conta. As faixas abaixo são lidas da régua v
          {p.versaoDaRegua} que está no código — não há tabela digitada aqui.
        </p>

        <NaoMedido frases={p.naoMedido} />

        {/* ── OS CARTÕES DE TEMPERATURA ──────────────────────────────────
            O desenho tem quatro. Nós desenhamos TODOS os degraus que o banco
            tem, mais a fila de quem ninguém pontuou: mostrar só os quatro
            faria a soma da tela ficar menor que a base, sem explicação.

            ⚠️ O desenho traz "↑ 35% vs. última semana" em cada cartão. Nós NÃO
            temos foto da base da semana passada — a temperatura é sobrescrita,
            não versionada — e por isso a variação não aparece. Seta inventada
            ali seria a mentira mais cara desta tela: ela vira meta. */}
        <div className="mb-5 mt-4">
          <FilaDeIndicadores>
            {p.termometro.map((d) => {
              const t = tintaDe(d.temperatura);
              return (
                <Indicador
                  key={d.temperatura}
                  rotulo={d.nomeNoDesenho ?? d.temperatura.replace(/_/g, " ")}
                  valor={d.total}
                  icone={t.icone}
                  tom={t.tom}
                  rodape={
                    d.faixa
                      ? `${d.faixa.de} a ${d.faixa.ate} pontos · no banco: ${d.temperatura}`
                      : `fora da régua v${p.versaoDaRegua} · no banco: ${d.temperatura}`
                  }
                />
              );
            })}
            <Indicador
              rotulo="Ninguém pontuou"
              valor={p.naoClassificados}
              icone="alerta"
              tom="cinza"
              rodape="não é FRIO — é a fila de quem falta qualificar"
            />
          </FilaDeIndicadores>
          <p className="mt-2 max-w-[90ch] text-[11.5px] leading-snug text-muted">
            <strong className="text-ink2">{p.emAberto}</strong> leads em aberto no escopo
            (fora GANHO, PERDIDO e NUTRIÇÃO), medidos na régua v{p.versaoDaRegua}. O desenho
            compara cada cartão com a semana passada; aqui não há essa comparação, porque a
            temperatura é sobrescrita e ninguém guardou a foto de sete dias atrás.
          </p>
        </div>

        {/* ── A MESA DE TRABALHO — busca, filtros e a tabela larga ─────── */}
        <Cartao
          titulo="Os leads, um a um"
          aviso="A mesa de trabalho do desenho. Cada linha abre a ficha do lead, e o seletor de Stage move o lead de etapa de verdade — é o único ato desta tela."
        >
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            <input
              value={filtros.busca}
              onChange={(e) => mudarFiltro("busca", e.target.value)}
              placeholder="Buscar por nome, empresa, produto…"
              aria-label="Buscar por nome, empresa ou produto"
              className="min-w-0 flex-1 basis-56 rounded-full border border-line bg-paper px-3.5 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-muted focus:border-brand-400"
            />
            <Seletor
              rotulo="Origem"
              valor={filtros.origem}
              todos="Todas"
              aoMudar={(v) => mudarFiltro("origem", v)}
              opcoes={p.mesa.opcoes.origens.map((o) => ({ valor: o, rotulo: rotuloDaEtapa(o) }))}
            />
            <Seletor
              rotulo="Produto"
              valor={filtros.produto}
              aoMudar={(v) => mudarFiltro("produto", v)}
              opcoes={p.mesa.opcoes.produtos.map((o) => ({ valor: o, rotulo: o }))}
            />
            <Seletor
              rotulo="Lead Score"
              valor={filtros.temperatura}
              aoMudar={(v) => mudarFiltro("temperatura", v)}
              opcoes={p.mesa.opcoes.temperaturas.map((o) => ({
                valor: o,
                rotulo: o.replace(/_/g, " "),
              }))}
            />
            <Seletor
              rotulo="Stage"
              valor={filtros.stage}
              aoMudar={(v) => mudarFiltro("stage", v)}
              opcoes={p.mesa.opcoes.stages.map((o) => ({ valor: o, rotulo: rotuloDaEtapa(o) }))}
            />
          </div>

          <NaoMedido frases={p.mesa.naoMedido} />

          {p.mesa.total === 0 ? (
            <Vazio
              motivo={
                filtros.busca || filtros.origem || filtros.produto || filtros.temperatura || filtros.stage
                  ? "Nenhum lead em aberto bate com estes filtros. Vazio aqui é o recorte, não a base."
                  : "Não há lead em aberto no seu escopo. Vazio aqui é ausência de lead, não temperatura zero."
              }
            />
          ) : (
            <MesaDeLeads
              mesa={p.mesa}
              aoMover={mover}
              salvandoId={salvandoId}
              recusas={recusas}
              aoPaginar={(pagina) => setFiltros((f) => ({ ...f, pagina }))}
            />
          )}

          <p className="mt-3 max-w-[90ch] text-[11.5px] leading-relaxed text-muted">
            <strong className="text-ink2">Correção do desenho:</strong> a imagem traz{" "}
            <em>duas colunas seguidas chamadas &quot;Stage&quot;</em> — a primeira é o número do
            score. Aqui ela se chama <strong className="text-ink2">Score</strong> e ficou junto
            da pílula de temperatura, como a própria imagem já as desenhava lado a lado.
          </p>
        </Cartao>

        {/* ── O RODAPÉ DO DESENHO: rosca, barras e as sugestões da IA ──── */}
        <Corpo lateral={<SugestoesDePriorizacao p={p} />}>
          <Cartao
            titulo="Distribuição de leads por score"
            aviso="A mesma contagem dos cartões do topo, vista como fatia do aberto. Quem ninguém pontuou entra como fatia própria — some-lo faria o total do anel ficar menor que a base."
          >
            <Rosca
              rotuloDoCentro="Total"
              total={p.emAberto}
              motivo="não há lead em aberto no seu escopo — anel fechado aqui pareceria medição"
              fatias={fatiasDoAnel(p)}
            />
          </Cartao>

          <Cartao
            titulo="Taxa de conversão por score"
            aviso="Ganhos sobre quem JÁ teve desfecho, por degrau. O denominador não é a base inteira: incluir quem ainda negocia faria a conversão cair sozinha a cada lead novo."
          >
            <ConversaoPorScore linhas={p.conversao} />
          </Cartao>

          <Cartao
            titulo="O termômetro"
            aviso="O nome do desenho aparece ao lado do nome que existe no banco. Os degraus sem faixa não são produzidos pela régua de hoje — foram gravados por outro caminho, e some-los seria fazer a tela não bater com a base."
          >
          {p.emAberto === 0 ? (
            <Vazio motivo="Não há lead em aberto no seu escopo. Vazio aqui é ausência de lead, não temperatura zero." />
          ) : (
            <Tabela colunas={["Temperatura", "No banco", "Faixa na régua", "Leads", "Fatia do aberto"]}>
              {p.termometro.map((d) => {
                const fatia = p.emAberto ? Math.round((d.total / p.emAberto) * 100) : 0;
                const t = tintaDe(d.temperatura);
                return (
                  <Linha key={d.temperatura}>
                    <Celula forte>
                      <Pilula tom={t.tom}>
                        {d.nomeNoDesenho ?? d.temperatura.replace(/_/g, " ")}
                      </Pilula>
                    </Celula>
                    <Celula>{d.temperatura}</Celula>
                    <Celula numero>
                      {d.faixa ? (
                        `${d.faixa.de} a ${d.faixa.ate} pontos`
                      ) : (
                        <span className="block max-w-[32ch] text-[11.5px] italic leading-snug text-muted">
                          a régua de hoje não produz esta leitura — ela vem de outro caminho
                          (desqualificação ou nutrição)
                        </span>
                      )}
                    </Celula>
                    <Celula numero forte>
                      {d.total}
                    </Celula>
                    <Celula numero>
                      {fatia}%
                      <span className="mt-1 block h-1.5 w-20 overflow-hidden rounded-full bg-canvas">
                        <span
                          className="block h-full rounded-full bg-ink2"
                          style={{ width: `${fatia}%` }}
                        />
                      </span>
                    </Celula>
                  </Linha>
                );
              })}
            </Tabela>
          )}

          <p className="mt-3 max-w-[72ch] text-[12px] leading-relaxed text-muted">
            <strong className="text-ink2">{p.naoClassificados}</strong> lead(s) em aberto estão fora
            deste termômetro porque não têm score. Eles não valem FRIO: ninguém perguntou nada a eles
            ainda, e essa é a diferença entre uma fila de descarte e uma fila de trabalho.
          </p>
        </Cartao>

        {/* ── O QUE MOVE O SCORE ────────────────────────────────────────── */}
        <Cartao
          titulo="O que move o score, medido"
          aviso={`Cada linha é a soma real gravada em LeadScoreFator na régua v${p.versaoDaRegua}. Não é o peso teórico da régua: é quanto cada fator de fato somou nos leads deste escopo.`}
        >
          {p.fatores.length === 0 ? (
            <Vazio motivo="Nenhum fator de score gravado nesta régua. Isso significa que ninguém foi pontuado ainda — ou que os pontos que existem vêm de uma régua anterior e foram deixados de lado de propósito, para a conta não misturar duas gerações." />
          ) : (
            <ul className="space-y-2">
              {p.fatores.map((f) => (
                <li key={f.fator} className="rounded-xl border border-line bg-canvas p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className="text-[13.5px] font-semibold text-ink">{f.fator}</p>
                    <p className="tabular-nums text-[13px] text-ink2">
                      {f.pontos} pontos em {f.leads} lead(s)
                      <span className="ml-1.5 text-[11.5px] text-muted">
                        ~{f.mediaPorLead}/lead
                      </span>
                    </p>
                  </div>
                  {f.exemplo && (
                    <p className="mt-1 text-[12px] leading-relaxed text-muted">
                      observado, por exemplo: “{f.exemplo}”
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        {/* ── O QUE FALTA PERGUNTAR ─────────────────────────────────────── */}
        <Cartao
          titulo="O que falta perguntar"
          aviso="A mesma lista de lacunas que o cálculo do score devolve, contada na base. É daqui que sai a próxima pergunta da conversa."
        >
          {p.lacunas.every((l) => l.leads === 0) ? (
            <Vazio motivo="Todos os leads em aberto do seu escopo têm ficha de qualificação completa nos campos que pontuam. É raro; vale conferir se a base não está vazia." />
          ) : (
            <ul className="space-y-1.5">
              {p.lacunas.map((l) => (
                <li
                  key={l.lacuna}
                  className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl border border-line bg-canvas px-3 py-2"
                >
                  <span className="text-[13px] text-ink">{l.pergunta}</span>
                  <span className="tabular-nums text-[13px] font-semibold text-ink2">
                    {l.leads} lead(s) sem resposta
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 max-w-[72ch] text-[12px] leading-relaxed text-muted">
            A faixa de orçamento não aparece nesta lista de propósito: perguntar preço cedo demais
            queima a conversa, e por isso o cálculo do score não a cobra — ela conta quando o lead
            informa por conta própria.
          </p>
        </Cartao>
        </Corpo>
      </div>
    </div>
  );
}

/**
 * AS "SUGESTÕES DE PRIORIZAÇÃO" DO DESENHO, COM SELO DE IA E SEM PALPITE.
 *
 * Cada linha sai de um número que já está na tela: a fila de quem ninguém
 * pontuou e a lacuna que mais leads têm em aberto. Nenhuma frase aqui aparece
 * sem o número que a sustenta — sugestão sem número é opinião com cara de
 * sistema, e é exatamente o que faz um painel perder a confiança de quem o lê.
 */
export function SugestoesDePriorizacao({ p }: { p: PanoramaDaQualificacao }) {
  const prontos = p.termometro.find((d) => d.temperatura === "PRIORIDADE_MAXIMA")?.total ?? 0;
  const maiorLacuna = [...p.lacunas].sort((a, b) => b.leads - a.leads)[0];

  return (
    <>
      <CartaoDeIA titulo="Sugestões de priorização">
        <ol className="flex flex-col gap-2">
          {prontos > 0 && (
            <li>
              <strong className="text-ink">{prontos}</strong> lead(s) estão em
              PRIORIDADE_MÁXIMA — o &quot;Pronto para Comprar&quot; do desenho. É a fila que
              paga o dia; qualquer outra ordem de trabalho custa dinheiro hoje.
            </li>
          )}
          {p.naoClassificados > 0 && (
            <li>
              <strong className="text-ink">{p.naoClassificados}</strong> lead(s) em aberto
              não têm score. Eles não valem FRIO: ninguém perguntou nada a eles ainda, e
              essa é a diferença entre uma fila de descarte e uma fila de trabalho.
            </li>
          )}
          {maiorLacuna && maiorLacuna.leads > 0 && (
            <li>
              A pergunta que mais falta é “{maiorLacuna.pergunta}” —{" "}
              <strong className="text-ink">{maiorLacuna.leads}</strong> lead(s) sem
              resposta. É a próxima pergunta da conversa, e a que mais move o score.
            </li>
          )}
          {prontos === 0 && p.naoClassificados === 0 && (!maiorLacuna || maiorLacuna.leads === 0) && (
            <li>
              Nenhuma sugestão com número que a sustente. Esta coluna não recomenda por
              palpite — sugestão sem número é opinião com cara de sistema.
            </li>
          )}
        </ol>
      </CartaoDeIA>

      <CartaoDeIA titulo="O que esta tela não mede" tom="cinza">
        <p>
          O desenho tem <strong className="text-ink">Valor Potencial</strong>,{" "}
          <strong className="text-ink">Probabilidade de Compra</strong> e{" "}
          <strong className="text-ink">Objeções</strong> por lead. Os três existem na base,
          mas na <strong className="text-ink">Oportunidade</strong> da jornada comercial — e
          lead sem negócio aberto não tem nenhum deles. Nessas linhas a célula fica vazia
          com o motivo; os três <strong className="text-ink">não aparecem inventados</strong>{" "}
          em coluna nenhuma, porque a régua v{p.versaoDaRegua} pontua o que foi perguntado, e o
          que ninguém perguntou vira fila de trabalho, não estimativa.
        </p>
        <p className="mt-2">
          E não há comparação <em>vs. última semana</em> nos cartões do topo: a temperatura é
          sobrescrita a cada pontuação, e ninguém guardou a foto de sete dias atrás. Seta
          inventada ali viraria meta.
        </p>
      </CartaoDeIA>
    </>
  );
}


// ═════════════════════════════════════════════════════════════════════════════
// AS DUAS PEÇAS DO RODAPÉ DO DESENHO
// ═════════════════════════════════════════════════════════════════════════════

/**
 * As fatias do anel de distribuição.
 *
 * ⚠️ Quem ninguém pontuou entra como fatia própria, em cinza. Deixá-lo de fora
 * faria o total do anel ficar menor que os leads em aberto do topo da tela — e
 * duas somas diferentes na mesma tela destroem a confiança nas duas.
 */
export function fatiasDoAnel(p: PanoramaDaQualificacao): FatiaDaRosca[] {
  const fatias: FatiaDaRosca[] = p.termometro
    .filter((d) => d.total > 0)
    .map((d) => ({
      rotulo: d.nomeNoDesenho ?? d.temperatura.replace(/_/g, " "),
      valor: d.total,
      tom: tintaDe(d.temperatura).tom,
    }));

  if (p.naoClassificados > 0) {
    fatias.push({ rotulo: "Ninguém pontuou", valor: p.naoClassificados, tom: "cinza" });
  }
  return fatias;
}

/**
 * As barras de conversão por degrau.
 *
 * `taxa: null` NÃO vira barra de largura zero: barra zerada pareceria "tentamos
 * e não vendemos", e a verdade é "ninguém desta faixa chegou ao desfecho ainda".
 */
export function ConversaoPorScore({ linhas }: { linhas: ConversaoPorTemperatura[] }) {
  if (linhas.every((l) => l.decididos === 0)) {
    return (
      <Vazio motivo="Nenhum lead chegou a GANHO ou PERDIDO ainda no seu escopo. Sem desfecho não existe taxa de conversão — e 0% diria que tentamos e não vendemos." />
    );
  }

  return (
    <ul className="space-y-2">
      {linhas.map((l) => (
        <Barra
          key={l.temperatura}
          rotulo={l.nomeNoDesenho ?? l.temperatura.replace(/_/g, " ")}
          /* O número é o que foi contado; a % ao lado é a própria `Barra` quem
             escreve a partir da fração. Repetir "62%" nos dois lugares faria a
             linha parecer duas medições diferentes da mesma coisa. */
          valor={l.taxa === null ? null : `${l.ganhos} de ${l.decididos}`}
          fracao={l.taxa === null ? null : l.taxa / 100}
          motivo={l.porque ?? "sem motivo declarado — e isso também é um defeito"}
          tom={tintaDe(l.temperatura).tom}
          nota={l.decididos > 0 ? "ganhos sobre quem já teve desfecho" : undefined}
        />
      ))}
    </ul>
  );
}
