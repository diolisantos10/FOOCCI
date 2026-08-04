/**
 * bakerySelfSeed — a padaria de vitrine nascendo sozinha a cada deploy.
 *
 * O problema que isto resolve: a "Foocci Bakery" existia como código e como botão
 * no admin, mas NÃO existia no banco de produção — porque ninguém tinha clicado.
 * Vitrine que depende de alguém lembrar de clicar é vitrine que fica vazia.
 *
 * Este módulo é o passo automático. Ele é chamado por
 * `/api/admin/demo-bakery/self-seed`, que o `scripts/start-production.sh` dispara
 * em segundo plano depois que o servidor sobe — exatamente o mesmo padrão do
 * passo que já sincroniza os guias do lojista.
 *
 * ─── As três leis deste arquivo ───────────────────────────────────────────────
 *
 * 1. **NUNCA lança.** Um site fora do ar por causa de uma padaria de demonstração
 *    seria muito pior que a padaria faltando. Toda falha vira registro com a
 *    evidência concreta (guardrail 6) e o boot segue.
 * 2. **Não gera foto que já existe.** `regerar` é sempre `false` aqui. Regerar é
 *    ato consciente, e só pelo botão do admin.
 * 3. **Não segura o boot.** A geração de fotos é disparada e o controle volta na
 *    hora — quem espera é o `BakeryImageJob`, que já nasce com prazo e com quem
 *    o resgata quando vence (a lei do domínio).
 *
 * A lógica de verdade mora em `FoocciBakeryService`. Aqui só existe a ORQUESTRAÇÃO
 * de deploy: o mesmo serviço que o botão do admin chama, sem uma segunda cópia
 * para divergir em silêncio.
 */

import {
  BakeryOperationError,
  getBakeryOverview,
  hasOpenAiKey,
  seedBakery,
  startBakeryImageJob,
} from "./FoocciBakeryService";

/** Como terminou o seed do cardápio. */
export type SelfSeedEstado = "OK" | "FALHOU" | "DESLIGADO";

/**
 * Como terminou o DISPARO das fotos. É o disparo, não o resultado: as fotos
 * continuam saindo em segundo plano depois que isto responde.
 */
export type SelfSeedFotosEstado =
  | "INICIADA"
  | "NADA_A_FAZER"
  | "SEM_CHAVE"
  | "NAO_TENTADA"
  | "FALHOU";

export interface BakerySelfSeedResult {
  seed: {
    estado: SelfSeedEstado;
    /** Frase legível. Em caso de falha, é o motivo — nunca um "erro" anônimo. */
    mensagem: string;
    restaurantCreated: boolean;
    categorias: number;
    itens: number;
    /** Itens ainda sem foto ao fim do seed. */
    semFoto: number | null;
  };
  fotos: {
    estado: SelfSeedFotosEstado;
    mensagem: string;
    /** Quantas fotos este disparo vai tentar gerar. 0 quando não há o que fazer. */
    aGerar: number;
    jobId: string | null;
    custoEstimadoUsd: number;
  };
  duracaoMs: number;
}

/**
 * Chave de desligamento. Existe porque um efeito colateral que roda em todo boot
 * precisa de um jeito de parar sem precisar de deploy novo. Só desliga com o
 * valor explícito `off`; qualquer outra coisa (inclusive variável ausente) é
 * "ligado" — ausência de informação não é informação.
 */
export function selfSeedDesligado(): boolean {
  return (process.env.FOOCCI_BAKERY_SELF_SEED ?? "").trim().toLowerCase() === "off";
}

/**
 * Roda o passo inteiro de deploy: cria/atualiza a padaria e, em seguida, dispara
 * as fotos que faltam. **Esta função não lança em nenhum caminho.**
 */
export async function runBakerySelfSeed(): Promise<BakerySelfSeedResult> {
  const inicio = Date.now();

  if (selfSeedDesligado()) {
    console.log("[bakery-self-seed] desligado por FOOCCI_BAKERY_SELF_SEED=off — nada foi tocado.");
    return {
      seed: {
        estado: "DESLIGADO",
        mensagem: "Desligado por FOOCCI_BAKERY_SELF_SEED=off. Nada foi tocado.",
        restaurantCreated: false,
        categorias: 0,
        itens: 0,
        semFoto: null,
      },
      fotos: {
        estado: "NAO_TENTADA",
        mensagem: "O seed automático está desligado, então nenhuma foto foi disparada.",
        aGerar: 0,
        jobId: null,
        custoEstimadoUsd: 0,
      },
      duracaoMs: Date.now() - inicio,
    };
  }

  const seed = await rodarSeed();

  // Sem cardápio no banco não há o que fotografar — e insistir só produziria um
  // erro por deploy. O passo das fotos só acontece depois de um seed que deu certo.
  const fotos =
    seed.estado === "OK"
      ? await dispararFotos()
      : {
          estado: "NAO_TENTADA" as const,
          mensagem: "O cardápio não ficou pronto, então nenhuma foto foi disparada.",
          aGerar: 0,
          jobId: null,
          custoEstimadoUsd: 0,
        };

  return { seed, fotos, duracaoMs: Date.now() - inicio };
}

/** O seed do cardápio. Idempotente por construção — rodar todo deploy é o objetivo. */
async function rodarSeed(): Promise<BakerySelfSeedResult["seed"]> {
  try {
    // Sem `prune`: apagar item de vitrine automaticamente num boot é destruição
    // silenciosa, e proteção que dispara não pode ser pior que o problema
    // (guardrail 5). Podar continua sendo escolha do botão do admin.
    const r = await seedBakery({});
    const categorias = r.categoriesCreated + r.categoriesUpdated;
    const itens = r.itemsCreated + r.itemsUpdated;

    console.log("[bakery-self-seed] cardápio em dia", {
      restaurantCreated: r.restaurantCreated,
      categorias,
      itens,
      semFoto: r.itemsWithoutImage,
    });

    return {
      estado: "OK",
      mensagem: r.restaurantCreated
        ? `Padaria criada agora: ${categorias} categorias e ${itens} itens.`
        : `Padaria já existia e foi atualizada: ${categorias} categorias e ${itens} itens.`,
      restaurantCreated: r.restaurantCreated,
      categorias,
      itens,
      semFoto: r.itemsWithoutImage,
    };
  } catch (err) {
    // Guardrail 6: o registro carrega o caso concreto. E o boot segue.
    const mensagem =
      err instanceof BakeryOperationError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[bakery-self-seed] o cardápio NÃO foi semeado — o site subiu assim mesmo.", {
      mensagem,
      evidencia: err instanceof BakeryOperationError ? err.evidence : err,
    });
    return {
      estado: "FALHOU",
      mensagem,
      restaurantCreated: false,
      categorias: 0,
      itens: 0,
      semFoto: null,
    };
  }
}

/**
 * Dispara as fotos que faltam. Volta imediatamente: o trabalho segue em segundo
 * plano dentro do processo, sob o empréstimo com prazo do `BakeryImageJob`.
 *
 * `regerar` é `false` — e é `false` por escrito, não por omissão, porque este é
 * o caminho que roda sem ninguém olhando. Quem já tem foto não é refeito nem
 * cobrado de novo.
 */
async function dispararFotos(): Promise<BakerySelfSeedResult["fotos"]> {
  try {
    if (!hasOpenAiKey()) {
      // Não é erro: é um ambiente sem chave. Registra e segue (item "c" da tarefa).
      const semFoto = await contarSemFoto();
      console.log(
        "[bakery-self-seed] sem OPENAI_API_KEY neste ambiente — nenhuma foto foi gerada.",
        { itensSemFoto: semFoto },
      );
      return {
        estado: "SEM_CHAVE",
        mensagem:
          "OPENAI_API_KEY não está configurada neste ambiente. Nenhuma foto foi gerada e " +
          "nenhum campo foi alterado.",
        aGerar: 0,
        jobId: null,
        custoEstimadoUsd: 0,
      };
    }

    const trabalho = await startBakeryImageJob({
      confirmar: true,
      regerar: false, // trava (a): só quem ainda não tem foto
      // O registro do TOTAL sai quando o trabalho acabar — é o item "d" da tarefa.
      // Sem isto, o número de fotos geradas só existiria na tela do admin, e um
      // deploy noturno não tem ninguém olhando a tela.
      onSettled: (j) =>
        console.log("[bakery-self-seed] geração de fotos encerrada", {
          jobId: j.id,
          status: j.status,
          geradas: j.geradas,
          puladas: j.puladas,
          falhas: j.falhas.length,
          primeirasFalhas: j.falhas.slice(0, 3),
          custoEstimadoUsd: j.custoEstimadoUsd,
          erroFatal: j.erroFatal,
        }),
    });

    console.log("[bakery-self-seed] geração de fotos iniciada em segundo plano", {
      jobId: trabalho.id,
      aGerar: trabalho.total,
      custoEstimadoUsd: trabalho.custoEstimadoUsd,
    });

    return {
      estado: "INICIADA",
      mensagem: `${trabalho.total} foto(s) sendo geradas em segundo plano (~US$ ${trabalho.custoEstimadoUsd}).`,
      aGerar: trabalho.total,
      jobId: trabalho.id,
      custoEstimadoUsd: trabalho.custoEstimadoUsd,
    };
  } catch (err) {
    // "Todo mundo já tem foto" é o caminho FELIZ a partir do segundo deploy —
    // o serviço o expressa como recusa, mas aqui ele não é falha nenhuma.
    if (err instanceof BakeryOperationError && err.code === "NADA_A_FAZER") {
      console.log("[bakery-self-seed] todos os itens já têm foto — nada a gerar, nada a gastar.");
      return {
        estado: "NADA_A_FAZER",
        mensagem: "Todos os itens do cardápio já têm foto. Nada a gerar e nada a gastar.",
        aGerar: 0,
        jobId: null,
        custoEstimadoUsd: 0,
      };
    }

    const mensagem =
      err instanceof BakeryOperationError
        ? `${err.code}: ${err.message}`
        : err instanceof Error
          ? err.message
          : String(err);
    console.error("[bakery-self-seed] as fotos NÃO foram disparadas — o site subiu assim mesmo.", {
      mensagem,
      evidencia: err instanceof BakeryOperationError ? err.evidence : err,
    });
    return { estado: "FALHOU", mensagem, aGerar: 0, jobId: null, custoEstimadoUsd: 0 };
  }
}

/** Só para o registro do caso "sem chave". Nem isto pode derrubar o passo. */
async function contarSemFoto(): Promise<number | null> {
  try {
    return (await getBakeryOverview()).semFoto;
  } catch {
    return null;
  }
}
