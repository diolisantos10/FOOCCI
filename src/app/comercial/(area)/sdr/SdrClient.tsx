"use client";

/**
 * A CENTRAL SDR / GATEKEEPER.
 *
 * ── A PERGUNTA DA TELA ──────────────────────────────────────────────────────
 *
 * "Quantas conversas bateram num porteiro, de que tipo era, quantos decisores
 * nós capturamos, de quem já sabemos o nome e ainda não o telefone, e como está
 * a fila do SDR por estado — e, com uma conversa aberta, o que fazer nela."
 *
 * ── ⚠️ CORREÇÃO DE 19/09/2026: AS QUATRO COLUNAS ENTRARAM ───────────────────
 *
 * O cabeçalho anterior dizia que a conversa e o copiloto "não entram: esta
 * frente é SÓ LEITURA". As duas metades dessa frase não se sustentavam juntas:
 * **mostrar uma conversa É leitura.** O que a frase protegia de verdade era o
 * ENVIO, e esse continua fora — ver `MesaDoSdr.tsx`.
 *
 * Então a tela passou a ter as quatro colunas do desenho: a fila, a lista de
 * conversas, a conversa e o copiloto. As três novas são servidas pelas rotas
 * que já eram donas delas, sem uma linha de regra reimplementada.
 *
 * O que continua fora, e agora pelo motivo certo: a caixa de envio (existe, e
 * mora em `/comercial/conversas`, com as travas ao redor) e os quatro botões do
 * desenho (não existem como ato em rota nenhuma).
 *
 * ── E O PONTO MAIS IMPORTANTE ───────────────────────────────────────────────
 *
 * Na base de hoje, a classificação de porteiro e a captura de decisor moram em
 * `Contato`, que pende de `Empresa`, e a maioria dos leads antigos não tem
 * empresa. O raio-X devolve `medido: false` com motivo — e esta tela mostra o
 * MOTIVO, grande, no lugar onde estaria o número. Os nove baldes de tipo
 * continuam desenhados, vazios e explicados: sumir com eles faria parecer que
 * o produto não classifica porteiro, quando ele classifica e a base é que não
 * alcança.
 */

import { useEffect, useState } from "react";
import {
  Aviso,
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
  SemAcesso,
  Secao,
  Tabela,
  TituloDaPagina,
  cx,
  emDia,
  type Fase,
  type Medida,
  type NomeDeIcone,
  type Tom,
} from "../_pecas/Pecas";
import type { ConversaDoSdr } from "@/services/salaDeVendas/telas/conversasDoSdr";
import { AConversa, CopilotoDaConversa, ListaDeConversas } from "./MesaDoSdr";

/**
 * O ícone e a cor de cada balde da fila, na ordem do desenho 12. A fila vem do
 * serviço; esta lista só empresta cor a quem ela trouxer, e quem não estiver
 * aqui sai em cinza — nunca fora da tela.
 */
const TINTA_DA_FILA: Record<string, { icone: NomeDeIcone; tom: Tom }> = {
  NOVO: { icone: "alvo", tom: "azul" },
  PROSPECT: { icone: "alvo", tom: "azul" },
  GATEKEEPER: { icone: "porta", tom: "ambar" },
  PORTEIRO: { icone: "porta", tom: "ambar" },
  ATENDENTE: { icone: "pessoas", tom: "ambar" },
  DECISOR: { icone: "chave", tom: "roxo" },
  ABORDAGEM: { icone: "faisca", tom: "azul" },
  REUNIAO: { icone: "agenda", tom: "verde" },
  SEM_CONTATO: { icone: "alerta", tom: "cinza" },
};

type Taxa =
  | { medido: true; valor: number; base: number }
  | { medido: false; motivo: "amostraPequena"; base: number }
  | { medido: false; motivo: "semDados" };

export interface PistaDeDecisor {
  empresaId: string | null;
  empresa: string | null;
  nome: string;
  cargo: string | null;
  canal: string | null;
  telefone: string | null;
  temTelefone: boolean;
  confianca: string;
  comoFoiDescoberto: string | null;
}

export interface DadosDoSdr {
  periodo: { de: string; ate: string; agora: string };
  fila: Array<{ estado: string; rotulo: string; total: number }>;
  /** A coluna 2 do desenho: as conversas que o SDR de fato trabalha. */
  conversas: { itens: ConversaDoSdr[]; total: number };
  tiposDeGatekeeper: Array<{ tipo: string; rotulo: string; humano: boolean }>;
  gatekeepers: Medida<{
    classificados: number;
    porTipo: Array<{ tipo: string; quantos: number }>;
    naoClassificados: {
      total: number;
      anterioresAoModulo: number;
      posterioresAoModuloSemSinal: number;
      observacao: string;
    };
  }>;
  decisores: Medida<{ comTelefone: number; semTelefone: number; pistasSemTelefone: PistaDeDecisor[] }>;
  abordagem: Medida<{ abordados: number; responderam: number; nuncaResponderam: number; taxaDeResposta: Taxa }>;
  reabordagem: Medida<{ total: number; pagina: number; porPagina: number; criterio: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// AS SEÇÕES
// ─────────────────────────────────────────────────────────────────────────────

export function SecaoFilaDoSdr({ dados }: { dados: DadosDoSdr }) {
  return (
    <Secao
      titulo="Fila e pipeline do SDR"
      descricao="Empresas por estado, agora. Todos os baldes aparecem, inclusive os zerados — balde que some quando zera é balde que ninguém investiga."
    >
      {dados.fila.length === 0 ? (
        <Caixa>
          Nenhuma empresa cadastrada fora de &quot;descartada&quot;. A fila do SDR
          é construída a partir de <code>Empresa</code>: sem empresa, não há fila —
          e isso é cadastro faltando, não operação parada.
        </Caixa>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {dados.fila.map((f) => {
            const t = TINTA_DA_FILA[f.estado] ?? { icone: "alvo" as NomeDeIcone, tom: "cinza" as Tom };
            return (
              <li
                key={f.estado}
                className="flex items-center gap-3 rounded-2xl border border-line bg-paper px-3 py-2"
              >
                <span
                  className={cx(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-xl",
                    t.tom === "azul" && "bg-blue-50 text-blue-600",
                    t.tom === "ambar" && "bg-amber-50 text-amber-600",
                    t.tom === "roxo" && "bg-ia-50 text-ia-600",
                    t.tom === "verde" && "bg-emerald-50 text-emerald-600",
                    t.tom === "cinza" && "bg-chip text-muted",
                  )}
                >
                  <Icone nome={t.icone} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1 text-[13px] text-ink2">{f.rotulo}</span>
                <span className="text-[16px] font-semibold tabular-nums text-ink">{f.total}</span>
                {/* A seta do desenho abre a fila. Enquanto a tela de trabalho
                    daquele balde não existir, ela é só o sinal de direção — e
                    não um botão que não vai a lugar nenhum. */}
                <Icone nome="alvo" className="h-3.5 w-3.5 shrink-0 text-muted" />
              </li>
            );
          })}
        </ul>
      )}
    </Secao>
  );
}

export function SecaoNumerosDoSdr({ dados }: { dados: DadosDoSdr }) {
  const a = dados.abordagem;
  const d = dados.decisores;
  const g = dados.gatekeepers;
  return (
    <Secao titulo="O período em números" descricao="Tudo vem do raio-X das conversas, sobre a janela selecionada.">
      <FilaDeIndicadores>
        <Indicador
          rotulo="Abordados"
          valor={a.medido ? a.valor.abordados : null}
          motivo={a.medido ? undefined : a.motivo}
          icone="alvo"
          tom="azul"
        />
        <Indicador
          rotulo="Responderam"
          valor={a.medido ? a.valor.responderam : null}
          motivo={a.medido ? undefined : a.motivo}
          icone="pessoas"
          tom="verde"
          rodape={
            a.medido && a.valor.taxaDeResposta.medido
              ? `${Math.round(a.valor.taxaDeResposta.valor * 100)}% dos abordados`
              : a.medido
                ? "taxa não medida: amostra pequena demais"
                : undefined
          }
        />
        <Indicador
          rotulo="Caíram em porteiro"
          valor={g.medido ? g.valor.classificados : null}
          motivo={g.medido ? undefined : g.motivo}
          icone="porta"
          tom="ambar"
        />
        <Indicador
          rotulo="Decisores capturados"
          valor={d.medido ? d.valor.comTelefone + d.valor.semTelefone : null}
          motivo={d.medido ? undefined : d.motivo}
          icone="chave"
          tom="roxo"
          rodape={
            d.medido ? `${d.valor.comTelefone} com telefone · ${d.valor.semTelefone} sem` : undefined
          }
        />
        <Indicador
          rotulo="Fila de reabordagem"
          valor={dados.reabordagem.medido ? dados.reabordagem.valor.total : null}
          motivo={dados.reabordagem.medido ? undefined : dados.reabordagem.motivo}
          icone="relogio"
          tom="azul"
          rodape={dados.reabordagem.medido ? dados.reabordagem.valor.criterio : undefined}
        />
      </FilaDeIndicadores>
    </Secao>
  );
}

export function SecaoTiposDeGatekeeper({ dados }: { dados: DadosDoSdr }) {
  const g = dados.gatekeepers;
  const porTipo = g.medido ? new Map(g.valor.porTipo.map((p) => [p.tipo, p.quantos])) : null;

  return (
    <Secao
      titulo="Porteiros por tipo"
      descricao="Os nove tipos que o classificador conhece. Dá para insistir com gente; não dá para insistir com um menu."
    >
      {!g.medido && (
        <Aviso>
          <strong>Isto não é zero porteiro. É porteiro não medido — e o motivo é este:</strong>
          <br />
          <span className="mt-1 inline-block">{g.motivo}</span>
          <br />
          <span className="mt-2 inline-block">
            Os nove baldes continuam desenhados abaixo, vazios de propósito. Apagá-los
            faria parecer que o produto não classifica porteiro; ele classifica, e o
            que falta é o vínculo <code className="rounded bg-amber-100 px-1">Empresa</code> →{" "}
            <code className="rounded bg-amber-100 px-1">Contato</code> na maior parte dos
            leads antigos. Enquanto esse vínculo não existir, esta contagem não tem
            resposta — e um zero no lugar dela seria uma afirmação que ninguém apurou.
          </span>
        </Aviso>
      )}

      <Tabela colunas={["Tipo de porteiro", "Dá para insistir?", "Quantos"]}>
        {dados.tiposDeGatekeeper.map((t) => {
          const quantos = porTipo?.get(t.tipo);
          return (
            <Linha key={t.tipo}>
              <Celula forte>{t.rotulo}</Celula>
              <Celula>
                <Pilula tom={t.humano ? "verde" : "cinza"}>
                  {t.humano ? "dá para insistir" : "máquina"}
                </Pilula>
              </Celula>
              <Celula numero forte>
                {quantos === undefined ? (
                  <span className="text-[12px] font-normal italic text-muted">não medido</span>
                ) : (
                  quantos
                )}
              </Celula>
            </Linha>
          );
        })}
      </Tabela>

      {g.medido && (
        <Caixa>
          <strong className="text-ink">{g.valor.naoClassificados.total}</strong> conversas
          sem carimbo de porteiro — {g.valor.naoClassificados.anterioresAoModulo} anteriores
          ao módulo (não podiam ter sido classificadas) e{" "}
          {g.valor.naoClassificados.posterioresAoModuloSemSinal} posteriores sem sinal no
          texto. {g.valor.naoClassificados.observacao}
        </Caixa>
      )}
    </Secao>
  );
}

export function SecaoPistasSemTelefone({ dados }: { dados: DadosDoSdr }) {
  const d = dados.decisores;
  return (
    <Secao
      titulo="Decisores sem telefone"
      descricao="Sabemos o nome e ainda não o número. É a fila de trabalho mais barata que existe: o difícil (descobrir quem decide) já foi feito."
    >
      {!d.medido ? (
        <Caixa>
          <NaoMedido motivo={d.motivo} />
        </Caixa>
      ) : d.valor.pistasSemTelefone.length === 0 ? (
        <Caixa>
          Nenhum decisor identificado está sem telefone nesta janela. Medido:{" "}
          {d.valor.comTelefone} decisores com número, {d.valor.semTelefone} sem.
        </Caixa>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {d.valor.pistasSemTelefone.map((p, i) => (
            <li key={`${p.empresaId ?? "sem-empresa"}-${p.nome}-${i}`} className="rounded-2xl border border-line bg-paper p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <span className="text-[13.5px] font-semibold text-ink">{p.nome}</span>
                <span className="text-[11.5px] uppercase tracking-[.04em] text-muted">
                  confiança {p.confianca.toLowerCase()}
                </span>
              </div>
              <p className="mt-0.5 text-[12px] text-ink2">
                {p.cargo ?? "cargo não informado"}
                {p.empresa ? ` · ${p.empresa}` : ""}
                {p.canal ? ` · canal: ${p.canal}` : ""}
              </p>
              {p.comoFoiDescoberto ? (
                <p className="mt-0.5 text-[11.5px] leading-snug text-muted">{p.comoFoiDescoberto}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Secao>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// A TELA
// ─────────────────────────────────────────────────────────────────────────────

export function SdrClient() {
  const [estado, setEstado] = useState<Fase<DadosDoSdr>>({ fase: "carregando" });
  /** Qual conversa está aberta nas colunas 3 e 4. `null` = nenhuma ainda. */
  const [leadAberto, setLeadAberto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch("/api/admin/sala-de-vendas/sdr", { cache: "no-store" });
        if (!vivo) return;
        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }
        const j = (await r.json()) as { ok: boolean; data?: DadosDoSdr; error?: string };
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
  }, []);

  return (
    <div className="flex flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <TituloDaPagina
        contexto="Sala de Vendas › Central SDR"
        titulo="Central SDR / Gatekeeper"
        subtitulo="Conquiste o contato certo, atravesse gatekeepers e leve a conversa até o decisor. Só leitura: esta tela não envia mensagem nem agenda abordagem."
        periodo={
          estado.fase === "pronto"
            ? `${emDia(estado.dados.periodo.de)} – ${emDia(estado.dados.periodo.ate)}`
            : undefined
        }
        atualidade={estado.fase === "pronto" ? "Tempo real" : undefined}
      />

      {estado.fase === "carregando" && <Carregando texto="Lendo a fila do SDR e o raio-X das conversas…" />}
      {estado.fase === "semAcesso" && <SemAcesso />}
      {estado.fase === "erro" && <Erro detalhe={estado.detalhe} />}

      {estado.fase === "pronto" && (
        <>
          <SecaoNumerosDoSdr dados={estado.dados} />

          {/* ── AS QUATRO COLUNAS DO DESENHO ────────────────────────────────
              No celular e no tablet elas viram uma pilha, na ordem da leitura:
              a fila, a lista, a conversa e o copiloto. Quatro colunas de 90px
              num aparelho de 375px não seriam o desenho — seriam quatro
              colunas ilegíveis com a forma do desenho. */}
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,.9fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] xl:h-[calc(100vh-19rem)] xl:min-h-[34rem]">
            <div className="min-h-0 overflow-y-auto">
              <SecaoFilaDoSdr dados={estado.dados} />
            </div>

            <div className="min-h-0">
              <ListaDeConversas
                itens={estado.dados.conversas.itens}
                total={estado.dados.conversas.total}
                selecionado={leadAberto}
                aoSelecionar={setLeadAberto}
              />
            </div>

            <div className="min-h-0">
              <AConversa
                leadId={leadAberto}
                titulo={
                  estado.dados.conversas.itens.find((c) => c.leadId === leadAberto)?.titulo ??
                  null
                }
              />
            </div>

            <div className="min-h-0 overflow-y-auto">
              <CopilotoDaConversa leadId={leadAberto} />
            </div>
          </div>

          {/* O agregado do período continua embaixo: ele responde à pergunta de
              gestão ("como está a caça ao decisor"), que é outra da pergunta
              operacional das quatro colunas ("o que faço nesta conversa"). */}
          <Corpo lateral={<CopilotoDoSdr dados={estado.dados} />}>
            <SecaoTiposDeGatekeeper dados={estado.dados} />
            <SecaoPistasSemTelefone dados={estado.dados} />
          </Corpo>
        </>
      )}
    </div>
  );
}

/**
 * O COPILOTO SDR DO DESENHO — o que dá para dizer hoje, e só isso.
 *
 * O desenho tem, nesta coluna: resumo da situação, tipo de gatekeeper detectado,
 * decisor encontrado, próxima melhor ação, respostas sugeridas e um checklist.
 * **As respostas sugeridas e os quatro botões de ação NÃO entram**: esta frente
 * é só leitura, e um botão "Pedir contato do responsável" que não pede nada
 * ensina o SDR a contar com um envio que não existe.
 *
 * O que entra é o que se mede: o resumo do período, o motivo de porteiro e
 * decisor não terem resposta hoje, e a fila de trabalho que sobra dela.
 */
export function CopilotoDoSdr({ dados }: { dados: DadosDoSdr }) {
  const g = dados.gatekeepers;
  const d = dados.decisores;
  const a = dados.abordagem;
  const semTelefone = d.medido ? d.valor.pistasSemTelefone.length : 0;

  return (
    <>
      <CartaoDeIA titulo="Resumo da situação">
        {a.medido ? (
          <p>
            <strong className="text-ink">{a.valor.abordados}</strong> empresas abordadas na
            janela; <strong className="text-ink">{a.valor.responderam}</strong> responderam e{" "}
            <strong className="text-ink">{a.valor.nuncaResponderam}</strong> nunca disseram
            nada. Silêncio não é recusa — é a fila que a reabordagem existe para atacar.
          </p>
        ) : (
          <p>
            <NaoMedido motivo={a.motivo} />
          </p>
        )}
      </CartaoDeIA>

      <CartaoDeIA titulo="Tipo de porteiro detectado" tom={g.medido ? "ambar" : "cinza"}>
        {g.medido ? (
          <p>
            <strong className="text-ink">{g.valor.classificados}</strong> conversas caíram em
            porteiro e foram classificadas. A tabela ao lado reparte por tipo: com gente dá
            para insistir, com menu de bot não dá — e essa diferença decide a próxima
            tentativa.
          </p>
        ) : (
          <p>
            Não medido hoje. {g.motivo} Os nove tipos continuam desenhados ao lado, vazios e
            explicados: o produto classifica porteiro; o que falta é o vínculo entre a empresa
            e o contato na maior parte dos leads antigos.
          </p>
        )}
      </CartaoDeIA>

      <CartaoDeIA titulo="Decisor encontrado" tom={d.medido ? "roxo" : "cinza"}>
        {d.medido ? (
          <p>
            <strong className="text-ink">{d.valor.comTelefone}</strong> decisores com telefone
            e <strong className="text-ink">{d.valor.semTelefone}</strong> sem. A próxima melhor
            ação é a mais barata que existe:{" "}
            {semTelefone > 0
              ? `pegar o número dos ${semTelefone} de quem já sabemos o nome — o difícil, descobrir quem decide, já foi feito.`
              : "nenhum decisor identificado está sem número nesta janela."}
          </p>
        ) : (
          <p>
            Não medido hoje. {d.motivo} Um zero aqui diria &quot;procuramos e não há decisor&quot;,
            e o que existe é outra coisa: ninguém conseguiu perguntar.
          </p>
        )}
      </CartaoDeIA>
    </>
  );
}
