/**
 * foocci-bakery-images — gera as fotos do cardápio da padaria de demonstração.
 *
 * Passo SEPARADO do seed, de propósito: cada foto é uma chamada paga à OpenAI e
 * um seed que gasta dinheiro sem avisar é uma armadilha. Aqui nada acontece sem
 * `--yes` explícito.
 *
 * Reaproveita o que já existe no repositório — nenhuma dependência nova:
 *   • o cliente OpenAI de `src/lib/openai.ts` (mesmo SDK do realce de fotos);
 *   • o modelo `gpt-image-1`, o mesmo que `src/services/imageEnhancement`;
 *   • o armazenamento de `src/services/imageEnhancement/storage.ts`
 *     (S3 quando configurado, senão binário no Postgres via `/api/media/[id]`).
 *
 * Nada é baixado da internet: as fotos NASCEM aqui. Não há foto de terceiro, não
 * há link externo que possa quebrar, não há direito de imagem duvidoso.
 *
 * ─── Uso ──────────────────────────────────────────────────────────────────────
 *   npx ts-node ... scripts/foocci-bakery-images.ts                # só lista e estima
 *   npx ts-node ... scripts/foocci-bakery-images.ts --yes          # gera de verdade
 *   npx ts-node ... scripts/foocci-bakery-images.ts --yes --limit=5
 *   npx ts-node ... scripts/foocci-bakery-images.ts --yes --force  # refaz quem já tem foto
 *
 *   (ou, pelo npm: `npm run bakery:imagens -- --yes`)
 *
 * ─── Travas ───────────────────────────────────────────────────────────────────
 *   • Só roda contra restaurante com `isDemo = true`. Foto gerada por IA num
 *     cardápio de cliente real seria propaganda enganosa: ele venderia uma foto
 *     de um prato que nunca fez.
 *   • Sem OPENAI_API_KEY, para e diz. Não escreve URL nenhuma.
 *   • Falhou uma foto? Registra o item e segue. Item sem foto continua sem foto —
 *     a loja já tem estado vazio para isso. URL quebrada seria pior.
 */

import { PrismaClient } from "@prisma/client";
import { storeEnhancedImage } from "../src/services/imageEnhancement/storage";
import { BAKERY_STORE } from "./foocci-bakery.data";

const prisma = new PrismaClient();

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const force = args.includes("--force");
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
const limit = limitArg ? Number(limitArg) : Infinity;

const MODEL = process.env.OPENAI_IMAGE_MODEL ?? "gpt-image-1";
/** Estimativa grosseira, só para o operador saber a ordem de grandeza antes de gastar. */
const APPROX_USD_PER_IMAGE = 0.04;

/**
 * O molde da foto. É o mesmo enquadramento para todos os itens porque cardápio
 * bonito é cardápio CONSISTENTE — 40 fotos com luz e ângulo diferentes ficam
 * piores do que 40 fotos iguais e medianas.
 */
function buildPrompt(name: string, description: string, ingredients: string | null): string {
  const linhaIngredientes = ingredients ? [`INGREDIENTES VISÍVEIS: ${ingredients}`] : [];
  return [
    `Fotografia profissional de comida para cardápio digital de uma padaria artesanal brasileira.`,
    ``,
    `PRODUTO: ${name}`,
    `DESCRIÇÃO: ${description}`,
    ...linhaIngredientes,
    ``,
    `ENQUADRAMENTO: um único produto, centralizado, ocupando cerca de 80% do quadro.`,
    `Ângulo de 45 graus. Fundo de mármore claro levemente desfocado, com uma tábua de`,
    `madeira clara ou prato de cerâmica branca. Luz natural lateral, suave e quente,`,
    `como de manhã perto de uma janela. Sombras macias.`,
    ``,
    `ESTILO: realista, apetitoso e honesto — o produto como ele realmente é servido,`,
    `sem exagero de porção. Cores naturais. Textura visível (casca, farelo, creme).`,
    ``,
    `PROIBIDO: texto, letras, números, logotipos, marca d'água, mãos, pessoas,`,
    `talheres em uso, colagem, moldura, mais de um produto no quadro.`,
  ].join("\n");
}

async function main(): Promise<void> {
  console.log("\n🖼   Foocci Bakery — fotos do cardápio");

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: BAKERY_STORE.slug },
    select: { id: true, name: true, isDemo: true },
  });

  if (!restaurant) {
    console.error(`✗ Restaurante "${BAKERY_STORE.slug}" não existe. Rode o seed primeiro.`);
    process.exit(1);
  }

  // Trava: geração de foto por IA só em vitrine. Ver cabeçalho.
  if (!restaurant.isDemo) {
    console.error(
      `✗ "${restaurant.name}" NÃO está marcado como demonstração (isDemo=false). ` +
        `Este script só gera foto para vitrine — foto de IA em cardápio de cliente é venda de prato que não existe.`,
    );
    process.exit(1);
  }

  const items = await prisma.menuItem.findMany({
    where: {
      category: { restaurantId: restaurant.id },
      ...(force ? {} : { OR: [{ imageUrl: null }, { imageUrl: "" }] }),
    },
    orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    select: { id: true, name: true, description: true, ingredients: true, imageUrl: true },
  });

  const alvo = items.slice(0, Number.isFinite(limit) ? limit : items.length);

  console.log(`    itens sem foto : ${items.length}${force ? " (--force: inclui quem já tem)" : ""}`);
  console.log(`    serão gerados  : ${alvo.length}`);
  console.log(`    modelo         : ${MODEL}`);
  console.log(`    custo estimado : ~US$ ${(alvo.length * APPROX_USD_PER_IMAGE).toFixed(2)}\n`);

  const hasKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "not-configured";

  // O ensaio é de graça e não precisa de chave: quem vai autorizar o gasto tem o
  // direito de ver antes o que exatamente vai ser pedido ao modelo.
  if (!confirmed) {
    console.log("Nada foi gerado — isto é um ensaio. Rode de novo com --yes para gastar de verdade.");
    if (!hasKey) console.log("Atenção: OPENAI_API_KEY não está configurada — com --yes isto pararia aqui.");
    console.log("\nExemplo do comando que iria para o modelo:\n");
    const first = alvo[0];
    if (first) console.log(buildPrompt(first.name, first.description ?? "", first.ingredients));
    return;
  }

  if (!hasKey) {
    console.error("✗ OPENAI_API_KEY não configurada. Nenhuma foto foi gerada e nenhum campo foi escrito.");
    process.exit(1);
  }

  const { openai } = await import("../src/lib/openai");

  let feitas = 0;
  const falhas: string[] = [];

  for (let i = 0; i < alvo.length; i++) {
    const item = alvo[i]!;
    process.stdout.write(`  [${i + 1}/${alvo.length}] ${item.name} … `);
    try {
      const raw = (await (openai.images.generate as (p: unknown) => Promise<unknown>)({
        model: MODEL,
        prompt: buildPrompt(item.name, item.description ?? "", item.ingredients),
        size: "1024x1024",
        n: 1,
      })) as { data?: Array<{ b64_json?: string }> };

      const b64 = raw.data?.[0]?.b64_json;
      if (!b64) throw new Error("resposta sem b64_json");

      const url = await storeEnhancedImage(Buffer.from(b64, "base64"), "image/png", restaurant.id, item.id);
      await prisma.menuItem.update({ where: { id: item.id }, data: { imageUrl: url } });

      feitas++;
      console.log(`ok → ${url}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // Guardrail 6: a falha carrega o caso concreto, não só "deu erro".
      console.log(`FALHOU (${msg})`);
      falhas.push(`${item.name}: ${msg}`);
    }
  }

  console.log(`\n━━━ Resumo ━━━`);
  console.log(`  geradas : ${feitas}`);
  console.log(`  falhas  : ${falhas.length}`);
  for (const f of falhas) console.log(`    ✗ ${f}`);
  if (falhas.length > 0) {
    console.log(`\n  Os itens acima continuam SEM foto (a loja mostra o estado vazio). Rode de novo para tentar só eles.`);
  }
}

main()
  .catch((err) => {
    console.error("\n✗ geração de imagens falhou:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
