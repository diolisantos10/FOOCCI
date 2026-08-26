/**
 * O TIME DE AGENTES — quem trabalha na Sala, já nomeado e pronto.
 *
 * ⚠️ **AGENTE, nunca "bot".** A palavra é decisão do CEO, dita com essas
 * letras em 26/08/2026: *"de bots não, de agentes, desculpa, não quero bot,
 * quero agente"*. E não é preciosismo — "bot" descreve um script que dispara
 * mensagem; "agente" descreve quem ocupa uma função, tem fila, tem cliente e
 * responde pelo que faz. O segundo é o que estas contas são.
 *
 * ── PARA QUE O TIME EXISTE ──────────────────────────────────────────────────
 *
 * O desenho do CEO, na mesma conversa:
 *
 *   *"O nosso atendimento vai funcionar vinte e quatro horas. Vamos supor que a
 *   gente tem cinco agentes e cinco humanos. Quando os cinco humanos forem pra
 *   casa dormir vão ficar os cinco agentes, vinte e quatro horas. Quando tiver
 *   humanos, os agentes saem."*
 *
 * Ou seja: o time de agentes **não é uma demonstração**, é o turno da noite. Por
 * isso eles têm cadastro próprio, entram com o próprio login, assumem lead e
 * aparecem na trilha com nome — do mesmo jeito que a pessoa que chega de manhã.
 *
 * ⚠️ O revezamento em si — agente sai quando humano entra — **não está
 * construído**, e não é afirmado aqui como se estivesse. O que existe hoje é o
 * time cadastrado e a trava que já governa isso lead a lead: quando um humano
 * assume, a IA silencia (`responsavel.ts`). O turno automático é trabalho
 * separado, e vive no backlog com esse nome.
 *
 * ── A CRÍTICA QUE ORIGINOU O ARQUIVO ────────────────────────────────────────
 *
 * A tela de acesso pedia nome e e-mail num formulário. O CEO abriu e disse:
 * *"isso aqui vai parecendo como se fosse humano. Pra fazer um cadastro? Já tem
 * que ter os botões prontos, com nomes."*
 *
 * Está certo, e o erro era de leitura do produto: **formulário é coisa de
 * gente**. Uma pessoa tem nome próprio, e-mail próprio e entra uma vez na vida —
 * vale digitar. O time de agentes a operação já conhece: quantos são e como se
 * chamam. Pedir ao dono que invente o nome de cada um é trabalho de digitação
 * disfarçado de decisão.
 *
 * ── POR QUE OS NOMES SÃO NUMERADOS ──────────────────────────────────────────
 *
 * A tentação é batizá-los de Ana, Bruno, Carla. Seria um erro caro: o nome
 * aparece na conversa e na trilha de "quem assumiu". Um lead que lê "Ana assumiu
 * seu atendimento" e depois descobre que Ana é um programa tem motivo para
 * desconfiar de tudo que Ana disse antes — e desconfiança em venda não se
 * recupera com explicação.
 *
 * `Agente 1` trata o agente como profissional sem prometer gente. Quem tem nome
 * de gente aqui é gente.
 *
 * ── CINCO PRONTOS, E COMEÇAR COM DOIS ───────────────────────────────────────
 *
 * O CEO pediu para começar testando com dois. Por isso a lista tem cinco e a
 * tela cria **um por clique**: quem decide quantos entram é quem está olhando a
 * fila, não este arquivo. Criar os cinco de uma vez encheria a Sala de agentes
 * ociosos disputando a mesma fila — e fila dividida entre quem não trabalha é
 * fila parada com aparência de organizada.
 */

/** Um agente do time, pronto para ser criado com um clique. */
export interface AgenteDoTime {
  /** Chave estável. É o que a tela usa e o que o teste ancora. */
  slug: string;
  nome: string;
  email: string;
  /**
   * O que ele faz na Sala, em uma linha — o que o botão mostra embaixo do nome.
   * Sem isto, cinco botões iguais viram cinco botões que ninguém sabe escolher.
   */
  funcao: string;
}

/** O domínio dos agentes. Um só, para o e-mail não virar decisão de quem clica. */
const DOMINIO = "agentes.foocci.com.br";

export const TIME_DE_AGENTES: readonly AgenteDoTime[] = [
  {
    slug: "agente-1",
    nome: "Agente 1",
    email: `agente1@${DOMINIO}`,
    funcao: "Primeiro atendimento — pega quem acabou de escrever",
  },
  {
    slug: "agente-2",
    nome: "Agente 2",
    email: `agente2@${DOMINIO}`,
    funcao: "Primeiro atendimento — segunda mão na fila",
  },
  {
    slug: "agente-3",
    nome: "Agente 3",
    email: `agente3@${DOMINIO}`,
    funcao: "Qualificação — entende a operação do restaurante",
  },
  {
    slug: "agente-4",
    nome: "Agente 4",
    email: `agente4@${DOMINIO}`,
    funcao: "Retomada — volta em quem parou de responder",
  },
  {
    slug: "agente-5",
    nome: "Agente 5",
    email: `agente5@${DOMINIO}`,
    funcao: "Reserva — entra quando a fila aperta",
  },
] as const;

/**
 * O papel de todo agente do time.
 *
 * `AGENTE_HUMANO` e não `AGENTE_IA`, e a escolha merece explicação porque parece
 * errada: o papel governa **o que a conta alcança na Sala**, e o que estes
 * agentes fazem é o trabalho do vendedor — abrir conversa, assumir lead, mover
 * no funil. `AGENTE_IA` existe para o TA, que não usa tela nenhuma.
 *
 * Trocar por `AGENTE_IA` não os tornaria "mais bots": tiraria deles o acesso às
 * telas que eles precisam usar, e o sintoma seria "o agente não consegue abrir a
 * conversa".
 */
export const PAPEL_DO_TIME = "AGENTE_HUMANO" as const;

/** Onde eles trabalham. Um só departamento — a Sala é uma sala. */
export const DEPARTAMENTOS_DO_TIME = ["vendas"] as const;

export function agentePorSlug(slug: string): AgenteDoTime | null {
  return TIME_DE_AGENTES.find((a) => a.slug === slug) ?? null;
}
