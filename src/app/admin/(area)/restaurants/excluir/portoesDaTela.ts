/**
 * OS PORTÕES DA TELA — a metade da frente da trava, escrita em função pura.
 *
 * A trava de verdade vive no servidor (`RestaurantPurgeService`), e continua lá:
 * esta função NÃO é a segurança, é a **resposta**. Ela existe para que a tela
 * consiga dizer, antes do clique, POR QUE a exclusão não vai acontecer — em vez
 * de deixar o botão cinza e mudo, ou de mandar um pedido que o servidor recusa
 * com uma frase técnica.
 *
 * Duas regras da casa moldaram este arquivo:
 *
 *  · "Botão desabilitado é uma resposta que ninguém consegue ouvir" (vitrine,
 *    05/08). Por isso o retorno é uma LISTA DE PENDÊNCIAS com campo e frase, não
 *    um booleano. Quem chama mostra a lista, foca o primeiro campo pendente e
 *    mantém o botão clicável.
 *
 *  · Guardrail 4 — prompt é aviso, código é trava. Nada aqui afrouxa o servidor:
 *    todo portão daqui existe TAMBÉM lá, e o mais rigoroso dos dois vence. Se
 *    esta função tivesse um bug e liberasse tudo, o servidor ainda recusaria.
 *
 * Não importa nada de `@/services/**` de propósito: este módulo é consumido por
 * componente de cliente e não pode arrastar o Prisma para o pacote do navegador.
 */

/** Espelho local dos motivos do serviço — sem importar o serviço (Prisma). */
export type MotivoDeBloqueio =
  | "SLUG_PROTEGIDO"
  | "PURGA_DESLIGADA"
  | "NAO_ENCONTRADO"
  | "CONFIRMACAO_NAO_CONFERE"
  | "SEM_REDE"
  | "REDE_DIVERGENTE"
  | "ASSINATURA_VIVA"
  | "NOTA_FISCAL_NAO_RECONHECIDA";

export type CampoPendente =
  | "protegido"
  | "interruptor"
  | "simulacao"
  | "backup"
  | "slug"
  | "sha256"
  | "notaFiscal"
  | "assinatura";

export interface Pendencia {
  campo: CampoPendente;
  /** A frase que aparece na tela. Português de gente, sem jargão de banco. */
  mensagem: string;
  /**
   * `true` = não existe caminho por esta tela, faça o que fizer. Serve para a UI
   * escolher entre "falta fazer X" e "isto não vai acontecer aqui".
   */
  definitiva: boolean;
}

export interface EstadoDaExclusao {
  /** Slug escolhido na lista do passo 1. `null` = ninguém escolhido ainda. */
  slugAlvo: string | null;
  /** O que a pessoa digitou à mão no passo 4. */
  slugDigitado: string;
  /** sha256 informado no passo 4 (vem do backup do passo 3, e é editável). */
  sha256Informado: string;
  /** `true` depois de o arquivo ter sido baixado E conferido byte a byte. */
  backupConferido: boolean;
  /** `true` = a simulação do passo 2 já rodou para o slug escolhido. */
  simulou: boolean;
  /** Lista de protegidos, vinda do servidor (SLUGS_PROTEGIDOS). */
  protegidos: readonly string[];
  /** `PURGA_RESTAURANTE_HABILITADA === "sim"`, lido no servidor. */
  interruptorLigado: boolean;
  /** Os bloqueios que a simulação devolveu para este slug. */
  bloqueios: readonly { motivo: MotivoDeBloqueio; detalhe: string }[];
  /** Quantas notas fiscais sairiam junto (0 = não há o que reconhecer). */
  notasFiscais: number;
  /** O reconhecimento explícito da perda das notas. */
  aceitoPerderNotaFiscal: boolean;
}

export interface VeredictoDaTela {
  liberado: boolean;
  pendencias: Pendencia[];
}

/**
 * A MESMA COMPARAÇÃO DO SERVIÇO, e de propósito.
 *
 * Compara a forma exata e a forma normalizada porque a proteção falha para o lado
 * de PROTEGER: " Foocci-Bakery " não é slug válido no banco, mas também não pode
 * virar um jeito de escapar da lista digitando diferente.
 */
export function ehProtegidoNaTela(slug: string, protegidos: readonly string[]): boolean {
  const normalizado = String(slug ?? "").trim().toLowerCase();
  return protegidos.some((p) => p === slug || p === normalizado);
}

/**
 * Diz se o passo 4 pode ser enviado e, quando não pode, o que falta — na ordem em
 * que a pessoa consegue resolver.
 *
 * A ordem importa: a proteção vem primeiro porque é a única que nenhuma ação
 * resolve, e mostrar "falta baixar o backup" para um restaurante que jamais será
 * apagado seria mandar alguém trabalhar à toa.
 */
export function conferirPedidoDeExclusao(estado: EstadoDaExclusao): VeredictoDaTela {
  const pendencias: Pendencia[] = [];
  const alvo = estado.slugAlvo ?? "";

  // 1. A trava dos dois. Vale para o alvo E para o que foi digitado — digitar o
  //    slug certo de um protegido não é um caminho, é a tentativa que o portão
  //    existe para recusar.
  const alvoProtegido = alvo !== "" && ehProtegidoNaTela(alvo, estado.protegidos);
  const digitadoProtegido =
    estado.slugDigitado.trim() !== "" && ehProtegidoNaTela(estado.slugDigitado, estado.protegidos);

  if (alvoProtegido || digitadoProtegido) {
    const nome = alvoProtegido ? alvo : estado.slugDigitado.trim();
    return {
      liberado: false,
      pendencias: [
        {
          campo: "protegido",
          definitiva: true,
          mensagem:
            `"${nome}" está na lista dos restaurantes protegidos. Esta tela não apaga ` +
            `nenhum dos dois, nem digitando o nome exato — a lista é código, não ` +
            `preferência, e mudá-la é decisão de gente, fora daqui.`,
        },
      ],
    };
  }

  if (!estado.slugAlvo) {
    return {
      liberado: false,
      pendencias: [
        {
          campo: "simulacao",
          definitiva: false,
          mensagem: "Escolha um restaurante na lista do passo 1 antes de qualquer coisa.",
        },
      ],
    };
  }

  // 2. Bloqueio que o servidor já anunciou e que NENHUM campo desta tela resolve.
  //    Assinatura viva é o caso real: o cartão continua sendo debitado depois de o
  //    restaurante sumir, e o cancelamento acontece no Mercado Pago, não aqui.
  const assinatura = estado.bloqueios.find((b) => b.motivo === "ASSINATURA_VIVA");
  if (assinatura) {
    pendencias.push({
      campo: "assinatura",
      definitiva: true,
      mensagem:
        "Existe assinatura em cobrança apontando para este restaurante. Apagar aqui " +
        "NÃO cancela a recorrência no Mercado Pago: o cartão do lojista continuaria " +
        "sendo debitado sem restaurante do outro lado. Cancele a assinatura lá primeiro.",
    });
  }

  // 3. O interruptor de ambiente.
  if (!estado.interruptorLigado) {
    pendencias.push({
      campo: "interruptor",
      definitiva: false,
      mensagem:
        "O interruptor da exclusão está desligado. No Railway, defina " +
        "PURGA_RESTAURANTE_HABILITADA = sim e espere o serviço reiniciar. " +
        "Simular e baixar o backup continuam funcionando com ele desligado.",
    });
  }

  // 4. A simulação. Apagar sem ter visto a contagem é apagar às cegas.
  if (!estado.simulou) {
    pendencias.push({
      campo: "simulacao",
      definitiva: false,
      mensagem: "Rode a simulação do passo 2 e leia quantas linhas sairiam.",
    });
  }

  // 5. A rede.
  if (!estado.backupConferido || !estado.sha256Informado.trim()) {
    pendencias.push({
      campo: "backup",
      definitiva: false,
      mensagem:
        "Baixe o backup no passo 3. Ele é a única volta atrás — sem o arquivo no seu " +
        "computador, esta exclusão não tem desfazer.",
    });
  }

  // 6. O slug digitado à mão.
  const digitado = estado.slugDigitado.trim();
  if (!digitado) {
    pendencias.push({
      campo: "slug",
      definitiva: false,
      mensagem: "Digite o endereço do restaurante à mão, no campo abaixo.",
    });
  } else if (digitado !== estado.slugAlvo) {
    pendencias.push({
      campo: "slug",
      definitiva: false,
      mensagem: `Você digitou "${digitado}", mas o restaurante escolhido é "${estado.slugAlvo}". Os dois têm que ser idênticos.`,
    });
  }

  // 7. O sha256.
  if (!estado.sha256Informado.trim()) {
    pendencias.push({
      campo: "sha256",
      definitiva: false,
      mensagem: "Falta o código do backup. Ele aparece sozinho depois do passo 3.",
    });
  }

  // 8. A nota fiscal — guarda legal não se perde em silêncio.
  if (estado.notasFiscais > 0 && !estado.aceitoPerderNotaFiscal) {
    pendencias.push({
      campo: "notaFiscal",
      definitiva: false,
      mensagem: `${estado.notasFiscais} nota(s) fiscal(is) emitida(s) sairiam junto. Marque o reconhecimento abaixo.`,
    });
  }

  return { liberado: pendencias.length === 0, pendencias };
}
