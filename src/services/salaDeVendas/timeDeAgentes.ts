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
 * Ou seja: o time de agentes **não é uma demonstração**, é o turno da noite.
 *
 * ── ⚠️ MAS AGENTE NÃO FAZ LOGIN ─────────────────────────────────────────────
 *
 * Esta é a segunda correção do CEO no mesmo dia, e ela desfaz metade do que eu
 * tinha escrito: *"os agentes de IA, eles não têm login, eles estão lá no
 * sistema"*.
 *
 * Então o agente tem **presença**, não credencial. Ele tem nome, tem fila, tem
 * cliente e aparece na trilha como quem atendeu — mas não existe senha dele,
 * porque não existe ninguém para digitá-la. Quem o aciona é o serviço, quando
 * uma mensagem chega.
 *
 * A diferença entre "presença" e "credencial" é o que separa um ator de um
 * buraco: uma senha que ninguém usa é uma senha que qualquer um pode usar.
 *
 * ⚠️ O revezamento em si — agente sai quando humano entra — **não está
 * construído**, e não é afirmado aqui como se estivesse. O que existe hoje é o
 * time no sistema e a trava que já governa isso lead a lead: quando um humano
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
 * ── O E-MAIL, SE NINGUÉM ENTRA COM ELE ──────────────────────────────────────
 *
 * Continua existindo, e não é enfeite: `InternalUser.email` é a chave única da
 * tabela, e é por ela que a criação é idempotente — clicar duas vezes no mesmo
 * agente encontra o mesmo registro em vez de criar um sósia.
 *
 * O domínio `agentes.` é o que impede a colisão com gente de verdade: no dia em
 * que um endereço de agente batesse com o de um funcionário, a criação do agente
 * cairia em cima do registro da pessoa — e a pessoa perderia o acesso dela.
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
 * O papel de todo agente do time — e a correção de um erro meu.
 *
 * ── O QUE EU TINHA ESCRITO AQUI, E POR QUE ESTAVA ERRADO ────────────────────
 *
 * A primeira versão usava `AGENTE_HUMANO`, com este argumento: "o papel governa
 * o que a conta alcança na Sala, e o que estes agentes fazem é o trabalho do
 * vendedor — abrir conversa, assumir lead, mover no funil".
 *
 * A premissa estava errada. Eu supus que o agente **usa a tela**, e por isso lhe
 * dei senha, login e um botão que mostrava a senha na hora. O CEO corrigiu em
 * 26/08/2026, com estas letras: *"os agentes de IA, eles não têm login, eles
 * estão lá no sistema"*.
 *
 * E ele está certo por um motivo que o próprio schema já dizia: agente não senta
 * na frente de um navegador. Ele não "abre a conversa" — ele **é chamado pelo
 * serviço** quando uma mensagem chega, e o que ele faz fica na trilha com o nome
 * dele. Dar-lhe senha criava uma credencial que ninguém usa e que qualquer um
 * pode usar: o pior tipo de conta.
 *
 * ── POR QUE `AGENTE_IA` É TRAVA, E NÃO ETIQUETA ─────────────────────────────
 *
 * `autenticarInterno` recusa este papel **mesmo com hash gravado no banco**
 * (`internal-auth.ts`). Não é comentário pedindo boa vontade: é a linha que faz
 * o login falhar. Guardrail 4 — prompt é aviso, código é trava.
 *
 * O efeito colateral é a razão de existir: como não há como este papel entrar,
 * não há senha a vazar, a rodar por WhatsApp, ou a ficar anotada num papel.
 */
export const PAPEL_DO_TIME = "AGENTE_IA" as const;

/** Onde eles trabalham. Um só departamento — a Sala é uma sala. */
export const DEPARTAMENTOS_DO_TIME = ["vendas"] as const;

export function agentePorSlug(slug: string): AgenteDoTime | null {
  return TIME_DE_AGENTES.find((a) => a.slug === slug) ?? null;
}
