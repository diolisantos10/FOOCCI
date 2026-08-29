"use client";

/**
 * A ponta de leitura da tela de atendimento.
 *
 * Mesma doutrina de `../_dados.ts`: quatro fases, e "sem acesso" é caso normal
 * enquanto ninguém tiver login interno — tratá-lo como erro faria a tela gritar
 * vermelho num estado esperado.
 */

import { useCallback, useEffect, useState } from "react";
import type { MensagemNaTela, JanelaDe24h } from "@/services/salaDeVendas/conversa";
import type { FatorDoScore } from "@/services/salaDeVendas/score";

export const ROTA_CONVERSA = "/api/admin/sala-de-vendas/conversa";
export const ROTA_FICHA = "/api/admin/sala-de-vendas/ficha";
export const ROTA_FUNIL = "/api/admin/sala-de-vendas/funil";
export const ROTA_TAREFAS = "/api/admin/sala-de-vendas/tarefas";
export const ROTA_AGENDA = "/api/admin/sala-de-vendas/agenda";
export const ROTA_CONTATO_MANUAL = "/api/admin/sala-de-vendas/contato-manual";
export const ROTA_APAGAR_DADOS = "/api/admin/sala-de-vendas/apagar-dados";

export interface Qualificacao {
  segmento: string | null;
  unidades: number | null;
  volumeMensal: number | null;
  canaisAtuais: string[];
  sistemaAtual: string | null;
  dorPrincipal: string | null;
  objetivo: string | null;
  planoDeInteresse: string | null;
  urgencia: string | null;
  poderDeDecisao: string | null;
  faixaDeOrcamento: string | null;
  observacoes: string | null;
}

export interface LeadNaConversa {
  id: string;
  nome: string;
  whatsapp: string;
  email: string | null;
  restaurante: string | null;
  cidade: string | null;
  tipo: string | null;
  /** A dor que a pessoa escreveu no formulário do site. */
  desafio: string | null;
  stage: string;
  score: number | null;
  temperatura: string | null;
  atendidoPor: string;
  atendenteUserId: string | null;
  atendenteDesde: string | null;
  motivoDoPedido: string | null;
  tags: string[];
  prioritario: boolean;
  utmSource: string | null;
  utmCampaign: string | null;
  origem: string | null;
  codigo: string | null;
  optOutAt: string | null;
  consentAt: string | null;
  /** A QUÊ a pessoa consentiu. `null` = versão não registrada, nunca "não consentiu". */
  consentPolicyVersion: string | null;
  proximaAcaoEm: string | null;
  proximaAcaoNota: string | null;
  qualificacao: Qualificacao | null;
  atendente: { nome: string } | null;
}

/**
 * Um contato registrado à mão, já com o NOME de quem registrou.
 *
 * O servidor resolve o nome antes de mandar. Se viesse o id, a tela teria de
 * buscar as pessoas por conta própria — e uma tela que não consegue traduzir o
 * id acaba mostrando o id, que não diz nada a quem está atendendo.
 */
export interface ContatoManualNaTela {
  id: string;
  tipo: string;
  rotulo: string;
  quem: string;
  quando: string;
  nota: string | null;
}

/** A origem, já montada pelo servidor. `rotulo` NUNCA vem vazio. */
export interface OrigemNaTela {
  rotulo: string;
  canal: string;
  canalRotulo: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  clickId: string | null;
  landingPath: string | null;
  referrer: string | null;
  legado: string | null;
  temSinalDeCampanha: boolean;
}

export interface DadosDaConversa {
  lead: LeadNaConversa;
  mensagens: MensagemNaTela[];
  fatoresDoScore: FatorDoScore[];
  janela: JanelaDe24h;
  podeEscrever: boolean;
  /** O que a pessoa preencheu no site. Vazio quando só deu nome e WhatsApp. */
  respostas: Array<{ pergunta: string; resposta: string }>;
  origem: OrigemNaTela;
  contatosManuais: ContatoManualNaTela[];
  /**
   * Se a tela deve DESENHAR o botão de apagar. Não é a autorização — quem
   * recusa é a rota `apagar-dados`, no servidor, para quem chamar direto.
   */
  podeApagarDados: boolean;
  /**
   * As escolhas que a tela pode oferecer, vindas de quem as valida.
   *
   * A tela NÃO importa as listas dos serviços: `contatoManual.ts` e `lgpd.ts`
   * falam com o Prisma, e importá-los aqui levaria o serviço de apagamento para
   * dentro do navegador. Vêm pela rota, que é a mesma que valida.
   */
  opcoes: {
    contatoManual: Array<{ valor: string; rotulo: string }>;
    origemDoPedidoDeApagamento: Array<{ valor: string; rotulo: string }>;
  };
  /**
   * Por que o cartão está vazio — `null` quando há conversa.
   *
   * Montado no servidor (`anterioresASala`), e não aqui: "ninguém falou com
   * ele" e "chegou antes de a Sala existir" produzem o mesmo branco na tela, e
   * a regra que separa os dois precisa viver perto do teste.
   */
  avisoDoSilencio: { titulo: string; texto: string; tom: "historico" | "alerta" } | null;
}

export type EstadoDaConversa =
  | { fase: "vazio" }
  | { fase: "carregando" }
  | { fase: "pronto"; dados: DadosDaConversa }
  | { fase: "semAcesso" }
  | { fase: "erro"; detalhe: string | null };

export function useConversa(leadId: string | null) {
  const [estado, setEstado] = useState<EstadoDaConversa>({ fase: "vazio" });
  const [tentativa, setTentativa] = useState(0);

  const recarregar = useCallback(() => setTentativa((t) => t + 1), []);

  useEffect(() => {
    if (!leadId) {
      setEstado({ fase: "vazio" });
      return;
    }

    let vivo = true;
    setEstado({ fase: "carregando" });

    (async () => {
      try {
        const r = await fetch(`${ROTA_CONVERSA}?leadId=${encodeURIComponent(leadId)}`, {
          cache: "no-store",
        });

        if (!vivo) return;

        if (r.status === 401 || r.status === 403) {
          setEstado({ fase: "semAcesso" });
          return;
        }

        // 404 aqui é o isolamento funcionando: o lead não é seu. A tela diz
        // isso sem inventar um erro de sistema.
        if (r.status === 404) {
          setEstado({ fase: "erro", detalhe: "Esta conversa não está disponível para você." });
          return;
        }

        const j = (await r.json()) as { ok: boolean; data?: DadosDaConversa; error?: string };
        if (!vivo) return;

        if (!j.ok || !j.data) {
          setEstado({ fase: "erro", detalhe: j.error ?? null });
          return;
        }

        setEstado({ fase: "pronto", dados: j.data });
      } catch (e) {
        if (vivo) {
          setEstado({ fase: "erro", detalhe: e instanceof Error ? e.message : null });
        }
      }
    })();

    return () => { vivo = false; };
  }, [leadId, tentativa]);

  return { estado, recarregar };
}

export type Resultado =
  | { ok: true; aviso?: string }
  | { ok: false; mensagem: string; conflito?: boolean };

async function enviar(rota: string, metodo: string, corpo: unknown): Promise<Resultado> {
  try {
    const r = await fetch(rota, {
      method: metodo,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });

    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      data?: { aviso?: string };
      recusas?: Array<{ campo: string; motivo: string }>;
    };

    if (r.ok && j.ok) return { ok: true, aviso: j.data?.aviso };

    // A recusa de validação vira uma frase legível, e não um objeto cru: quem
    // está atendendo precisa saber o que corrigir, não depurar a API.
    if (j.recusas?.length) {
      return { ok: false, mensagem: j.recusas.map((x) => x.motivo).join(" · ") };
    }

    return {
      ok: false,
      mensagem: j.error ?? `Não foi possível concluir (HTTP ${r.status}).`,
      conflito: r.status === 409,
    };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : "Falha de rede." };
  }
}

export const escrever = (leadId: string, texto: string, acao?: "notaInterna") =>
  enviar(ROTA_CONVERSA, "POST", { leadId, texto, acao: acao ?? "enviar" });

export const marcarLidas = (leadId: string) =>
  enviar(ROTA_CONVERSA, "POST", { leadId, acao: "marcarLidas" });

export const salvarFicha = (corpo: Record<string, unknown>) =>
  enviar(ROTA_FICHA, "PATCH", corpo);

export const moverEtapa = (corpo: {
  leadId: string;
  para: string;
  motivoPerdaId?: string | null;
  nota?: string | null;
}) => enviar(ROTA_FUNIL, "POST", corpo);

export const criarTarefa = (corpo: {
  leadId: string;
  titulo: string;
  venceEm: string;
  tipo?: string;
}) => enviar(ROTA_TAREFAS, "POST", corpo);

/**
 * Como `enviar`, mas devolve o que a rota respondeu.
 *
 * Existe porque duas ações precisam do RESULTADO para dizer a verdade na tela:
 * o registro manual precisa saber se contou como abordagem, e o apagamento
 * precisa dizer quanto foi destruído. Um `{ ok: true }` mudo obrigaria a tela a
 * inventar a frase seguinte.
 */
async function enviarEsperandoDados<T>(
  rota: string,
  corpo: unknown,
): Promise<{ ok: true; dados: T } | { ok: false; mensagem: string }> {
  try {
    const r = await fetch(rota, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });

    const j = (await r.json().catch(() => ({}))) as {
      ok?: boolean;
      error?: string;
      data?: T;
    };

    if (r.ok && j.ok && j.data !== undefined) return { ok: true, dados: j.data };

    return {
      ok: false,
      mensagem: j.error ?? `Não foi possível concluir (HTTP ${r.status}).`,
    };
  } catch (e) {
    return { ok: false, mensagem: e instanceof Error ? e.message : "Falha de rede." };
  }
}

/**
 * Registra um contato que aconteceu fora do sistema.
 *
 * `ocorridoEm` viaja sempre, e é a tela que preenche com "agora" — a rota não
 * tem valor padrão de propósito, porque registro manual costuma ser lançado
 * depois do fato.
 */
export const registrarContatoManual = (corpo: {
  leadId: string;
  tipo: string;
  ocorridoEm: string;
  nota?: string | null;
}) =>
  enviarEsperandoDados<{ interacaoId: string; ocorridoEm: string; contouComoAbordagem: boolean }>(
    ROTA_CONTATO_MANUAL,
    corpo,
  );

/**
 * Apaga os dados do contato. Sem volta.
 *
 * `confirmacaoNome` é o nome digitado por quem está apagando, e a rota o compara
 * com o que está gravado. Não existe versão desta chamada sem ele.
 */
export const apagarDadosDoLead = (corpo: {
  leadId: string;
  confirmacaoNome: string;
  origemDoPedido: string;
}) =>
  enviarEsperandoDados<{
    apagadoEm: string;
    apagados: { interacoes: number; mensagens: number };
  }>(ROTA_APAGAR_DADOS, corpo);

/** "há 3 min", "há 2 h". Relógio do navegador — é a tela de quem está olhando. */
export function desde(iso: string | Date | null): string | null {
  if (!iso) return null;
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return null;

  const min = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  return `há ${Math.floor(h / 24)} d`;
}

/** Hora curta para a bolha da conversa. */
export function hora(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Dia e hora, para a linha do tempo do que foi registrado à mão. */
export function dataEHora(iso: string | Date | null): string {
  if (!iso) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("pt-BR", {
    day: "2-digit", month: "2-digit", year: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

/**
 * O valor de um `<input type="datetime-local">`.
 *
 * O campo exige `AAAA-MM-DDTHH:MM` **na hora local**, e `toISOString()` devolve
 * UTC — usá-lo faria o campo abrir três horas atrasado no Brasil, e o vendedor
 * registraria toda ligação com o horário errado sem perceber.
 */
export function paraCampoDeDataHora(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
    `T${p(d.getHours())}:${p(d.getMinutes())}`
  );
}
