/**
 * foocci-bakery-images — gera as fotos do cardápio da padaria de demonstração.
 *
 * Este arquivo é só a BOCA DE LINHA DE COMANDO. A lógica vive em
 * `src/services/demo/FoocciBakeryService.ts` — o mesmo serviço por trás do botão
 * "Gerar as 40 fotos" do admin (`/api/admin/demo-bakery/imagens`).
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
 * Cada item recebe TRÊS fotos: a capa (imageUrl, a que aparece no card) e mais
 * duas do carrossel da ficha (images[], com carouselEnabled ligado). O `--limit`
 * é em ITENS, não em fotos — `--limit=1` fotografa um produto INTEIRO, que é o
 * que serve para conferir a ficha antes de soltar o lote.
 *
 * ─── Uso ──────────────────────────────────────────────────────────────────────
 *   npm run bakery:imagens                    # só lista e estima (ensaio, de graça)
 *   npm run bakery:imagens -- --yes           # gera de verdade
 *   npm run bakery:imagens -- --yes --limit=1 # UM produto inteiro (capa + 2 extras)
 *   npm run bakery:imagens -- --yes --force   # refaz quem já tem foto
 *
 * ─── Travas ───────────────────────────────────────────────────────────────────
 *   • Só roda contra restaurante com `isDemo = true`. Foto gerada por IA num
 *     cardápio de cliente real seria propaganda enganosa.
 *   • Sem OPENAI_API_KEY, para e diz. Não escreve URL nenhuma.
 *   • Quem já tem foto não é refeito sem `--force` — e a checagem é refeita
 *     imediatamente antes de cada chamada paga, para que o admin e o terminal
 *     rodando juntos não paguem duas vezes pela mesma foto.
 *   • Falhou uma foto? Registra o item e segue. Item sem foto continua sem foto —
 *     a loja já tem estado vazio para isso. URL quebrada seria pior.
 */

import { prisma } from "@/lib/prisma";
import {
  BakeryOperationError,
  generateBakeryImages,
  planBakeryImages,
} from "@/services/demo/FoocciBakeryService";

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const force = args.includes("--force");
const limitArg = args.find((a) => a.startsWith("--limit="))?.split("=")[1];
const limite = limitArg ? Number(limitArg) : undefined;

async function main(): Promise<void> {
  console.log("\n🖼   Foocci Bakery — fotos do cardápio");

  // O ensaio já recebe o `limite` — o número impresso aqui é EXATAMENTE o que a
  // geração vai cobrar. Duas contas separadas foi como o botão do admin já
  // conseguiu anunciar um total e cobrar outro.
  const plano = await planBakeryImages({ regerar: force, limite });

  if (!plano.padariaExiste) {
    console.error(`✗ A padaria não existe no banco. Rode \`npm run bakery:seed\` primeiro.`);
    process.exitCode = 1;
    return;
  }

  console.log(`    itens no cardápio  : ${plano.totalItens}`);
  console.log(`    sem capa           : ${plano.semFoto}${force ? " (--force: inclui quem já tem)" : ""}`);
  console.log(`    sem as ${plano.fotosExtrasPorItem} extras    : ${plano.semCarrossel}`);
  console.log(`    itens nesta rodada : ${plano.itensNestaRodada}${limite ? ` (--limit=${limite})` : ""}`);
  console.log(`    fotos a gerar      : ${plano.aGerar}  (${plano.capasAGerar} capa(s) + ${plano.extrasAGerar} extra(s))`);
  console.log(`    modelo             : ${plano.modelo}`);
  console.log(`    custo estimado     : ~US$ ${plano.custoEstimadoUsd.toFixed(2)}\n`);

  // O ensaio é de graça e não precisa de chave: quem vai autorizar o gasto tem o
  // direito de ver antes o que exatamente vai ser pedido ao modelo.
  if (!confirmed) {
    console.log("Nada foi gerado — isto é um ensaio. Rode de novo com --yes para gastar de verdade.");
    if (!plano.temChaveOpenAi) {
      console.log("Atenção: OPENAI_API_KEY não está configurada — com --yes isto pararia aqui.");
    }
    if (plano.exemploDePrompt) {
      console.log("\nExemplo do comando da CAPA:\n");
      console.log(plano.exemploDePrompt);
    }
    if (plano.exemploDePromptExtra) {
      console.log("\nExemplo do comando de uma FOTO EXTRA (carrossel):\n");
      console.log(plano.exemploDePromptExtra);
    }
    return;
  }

  const r = await generateBakeryImages({
    confirmar: true,
    regerar: force,
    limite,
    onProgress: ({ indice, total, item, tipo }) => {
      process.stdout.write(`  [${indice}/${total}] ${item} — ${tipo === "capa" ? "capa" : "foto extra"} …\n`);
    },
  });

  console.log(`\n━━━ Resumo ━━━`);
  console.log(`  geradas : ${r.geradas}`);
  console.log(`  puladas : ${r.puladas} (a foto já existia quando chegou a vez — nada gasto)`);
  console.log(`  falhas  : ${r.falhas.length}`);
  for (const f of r.falhas) console.log(`    ✗ ${f.item}: ${f.motivo}`);
  console.log(`  custo   : ~US$ ${r.custoRealEstimadoUsd.toFixed(2)}`);
  if (r.falhas.length > 0) {
    console.log(`\n  Os itens acima continuam SEM foto (a loja mostra o estado vazio). Rode de novo para tentar só eles.`);
  }
}

main()
  .catch((err) => {
    if (err instanceof BakeryOperationError) {
      console.error(`\n✗ ${err.message}`);
      if (err.evidence) console.error("  detalhe:", err.evidence);
    } else {
      console.error("\n✗ geração de imagens falhou:", err);
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
