/**
 * LeadParaSondagem — o dado da PORTA chegando à CONVERSA.
 *
 * ── O defeito que isto fecha ────────────────────────────────────────────────
 * O formulário do site pergunta nome, restaurante, cidade, tipo e principal
 * desafio. O dono do restaurante digita tudo isso, aperta enviar — e nenhuma
 * linha do repositório levava esse conteúdo para o estado da entrevista do SDR.
 * Resultado, se o SDR fosse ligado assim: a primeira coisa que ele faria seria
 * perguntar ao sujeito exatamente o que ele acabou de escrever. É o tipo de erro
 * que não derruba teste nenhum e queima o lead no primeiro minuto.
 *
 * ── A regra que manda aqui: só o que a pessoa escreveu ──────────────────────
 * Campo vazio NÃO vira campo preenchido, e nada é deduzido de nada. Em especial:
 *
 *   `quem_decide` fica em BRANCO de propósito. Quem preencheu o formulário pode
 *   ser o dono, o gerente, o filho do dono ou o estagiário — o formulário não
 *   pergunta isso. Preencher com o nome de quem digitou seria o palpite mais
 *   fácil e o mais caro: proposta aprovada por quem não aprova nada.
 *
 * ── Perguntado × respondido ─────────────────────────────────────────────────
 * Só entra em `perguntadas` a chave que VEIO COM VALOR. O campo "principal
 * desafio" nem sempre aparece no formulário (`includeChallenge` no DemoForm),
 * então declarar que ele foi perguntado quando veio vazio seria afirmar um fato
 * que ninguém pode provar — e essa marca destrava proposta (guardrail 1).
 *
 * Determinístico: sem IA, sem rede. Quem grava é `semearEntrevistaDoLead`.
 */

import type { EstadoDaSondagem } from "../brain/oficina/Sondagem";
import { chaveDaEntrevista, resolverMemoriaDaEntrevista } from "../brain/sdr/MemoriaDaEntrevista";

/**
 * O "dono" das entrevistas de venda do Foocci.
 *
 * NÃO é um restaurante e não pode virar um: quem escreve no número de vendas é
 * um dono de restaurante interessado no produto, não cliente de loja nenhuma. É
 * a mesma separação que o `FoocciSalesInbound` defende ao não tocar em
 * `Customer`/`Conversation`.
 */
export const AGENCIA_VENDAS_FOOCCI = "foocci-vendas";

/** Os campos do lead que a entrevista sabe aproveitar. */
export interface LeadParaEntrevista {
  id: string;
  codigo?: string | null;
  restaurante?: string | null;
  cidade?: string | null;
  tipo?: string | null;
  desafio?: string | null;
}

/** A conversa deste lead. Prefere o `#código`, que é o elo com o "oi" do WhatsApp. */
export function clienteIdDoLead(lead: LeadParaEntrevista): string {
  const codigo = (lead.codigo ?? "").trim();
  return codigo ? `lead-${codigo.toLowerCase()}` : `lead-id-${lead.id}`;
}

export function chaveDaEntrevistaDoLead(lead: LeadParaEntrevista): string {
  return chaveDaEntrevista(AGENCIA_VENDAS_FOOCCI, clienteIdDoLead(lead));
}

function limpo(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  return t.length > 0 ? t : null;
}

/**
 * O estado da sondagem a partir do que o formulário capturou.
 *
 * Cada valor sai com a fonte colada nele ("informado no formulário do site"),
 * pelo mesmo motivo do `BriefingFoocci`: quem lê a ficha depois precisa saber o
 * que é fala do cliente e o que é leitura de alguém.
 */
export function sondagemDoLead(lead: LeadParaEntrevista): EstadoDaSondagem {
  const ficha: Record<string, string> = {};
  const perguntadas: string[] = [];

  const restaurante = limpo(lead.restaurante);
  const tipo        = limpo(lead.tipo);
  const cidade      = limpo(lead.cidade);
  const desafio     = limpo(lead.desafio);

  if (restaurante || tipo) {
    const partes = [
      restaurante ? `Restaurante: ${restaurante}.` : null,
      tipo ? `Tipo: ${tipo}.` : null,
    ].filter(Boolean);
    ficha.o_que_vende = `${partes.join(" ")} (informado no formulário do site)`;
    perguntadas.push("o_que_vende");
  }

  if (cidade) {
    ficha.regiao = `${cidade} (informado no formulário do site)`;
    perguntadas.push("regiao");
  }

  if (desafio) {
    ficha.objetivo = `Principal desafio informado no formulário do site: ${desafio}`;
    perguntadas.push("objetivo");
  }

  return { ficha, perguntadas, servicos: [] };
}

/** O que aconteceu ao tentar semear. Nunca "deu certo" por omissão. */
export type ResultadoDaSemeadura =
  /** A entrevista foi criada com o que o formulário trouxe. */
  | "SEMEADA"
  /** Já havia entrevista guardada — nada foi tocado. */
  | "JA_EXISTIA"
  /** O formulário não trouxe nenhum campo aproveitável. */
  | "SEM_DADO"
  /** Não deu para gravar. Fica declarado, nunca vira silêncio. */
  | "FALHOU";

/**
 * Grava a entrevista inicial do lead — uma vez, e só uma.
 *
 * NUNCA sobrescreve entrevista existente: um reenvio de formulário chega com
 * menos campos do que a conversa já levantou, e sobrescrever apagaria o que o
 * SDR conseguiu apurar. Mesma regra do `SiteLeadService`, que só completa o que
 * estava vazio.
 *
 * Best-effort de propósito: falhar aqui não pode derrubar a captura do contato.
 * Perder o lead é o único resultado inaceitável.
 */
export async function semearEntrevistaDoLead(lead: LeadParaEntrevista): Promise<ResultadoDaSemeadura> {
  const estado = sondagemDoLead(lead);
  if (Object.keys(estado.ficha ?? {}).length === 0) return "SEM_DADO";

  try {
    const chave = chaveDaEntrevistaDoLead(lead);
    const memoria = await resolverMemoriaDaEntrevista();
    if ((await memoria.ler(chave)) !== null) return "JA_EXISTIA";
    await memoria.gravar(chave, estado);
    return "SEMEADA";
  } catch (e) {
    console.error("[foocci-sdr] não consegui semear a entrevista do lead:", e);
    return "FALHOU";
  }
}
