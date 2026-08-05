/**
 * fotos-do-cardapio — traz para o banco local as fotos que a padaria de vitrine
 * JÁ TEM em produção.
 *
 * Por que isto existe: as 40 fotos do cardápio da Foocci Bakery nascem de uma
 * chamada paga à OpenAI (`npm run bakery:imagens`). Numa máquina de captura sem
 * `OPENAI_API_KEY` o cardápio local fica com 40 retângulos cinza — e uma foto de
 * cardápio vazio no site de vendas é pior do que nenhuma foto.
 *
 * A saída honesta não é inventar imagem: é **espelhar a que o produto já serve
 * em produção**. As fotos são públicas (`https://foocci.com.br/api/media/<id>`),
 * são do restaurante fictício de demonstração e foram geradas pelo próprio
 * produto — nada de banco de imagens, nada de foto de cliente real.
 *
 * Casa por NOME do item: o id do MenuItem é diferente em cada banco, o nome não.
 * Item que existe local e não existe em produção fica sem foto — e continua sem
 * foto, porque ausência de correspondência não é autorização para chutar uma
 * imagem qualquer (guardrail 1).
 *
 * ─── Uso ──────────────────────────────────────────────────────────────────────
 *   node scripts/site/fotos-do-cardapio.mjs
 *   node scripts/site/fotos-do-cardapio.mjs --origem=https://foocci.com.br
 *
 * Só escreve em restaurante com `isDemo = true`.
 */

import { PrismaClient } from "@prisma/client";
import sharp from "sharp";

const prisma = new PrismaClient();

const ORIGEM_PADRAO = "https://foocci.com.br";
const SLUG = "foocci-bakery";

/** Largura de armazenamento. O card do cardápio tem 160px; 800px cobre 2x com folga. */
const LARGURA = 800;

/**
 * Lê o cardápio renderizado da loja e devolve `nome → caminho da mídia`.
 * Trabalha sobre o HTML servido (SSR), não sobre uma API interna: é o mesmo
 * que qualquer visitante recebe, sem credencial nenhuma.
 */
export async function lerCatalogoRemoto(origem = ORIGEM_PADRAO) {
  const resp = await fetch(`${origem}/pedido/${SLUG}?modo=loja`, {
    headers: { "user-agent": "foocci-captura-de-produto" },
  });
  if (!resp.ok) throw new Error(`A loja de ${origem} respondeu ${resp.status}.`);
  const html = await resp.text();

  const mapa = new Map();
  const re = /src="(\/api\/media\/[a-z0-9]+)"\s+alt="([^"]*)"/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const nome = m[2].replace(/&amp;/g, "&").replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
    if (nome && !mapa.has(nome)) mapa.set(nome, m[1]);
  }
  return mapa;
}

export async function espelharFotos({ origem = ORIGEM_PADRAO, slug = SLUG } = {}) {
  const r = await prisma.restaurant.findUnique({
    where: { slug },
    select: { id: true, name: true, isDemo: true },
  });
  if (!r) throw new Error(`Restaurante "${slug}" não existe no banco local.`);
  if (!r.isDemo) throw new Error(`RECUSADO: "${slug}" não é restaurante de demonstração.`);

  const catalogo = await lerCatalogoRemoto(origem);
  const itens = await prisma.menuItem.findMany({
    where: { category: { restaurantId: r.id } },
    select: { id: true, name: true, imageUrl: true },
  });

  let copiadas = 0;
  const semPar = [];
  for (const item of itens) {
    const caminho = catalogo.get(item.name);
    if (!caminho) {
      semPar.push(item.name);
      continue;
    }
    const id = caminho.split("/").pop();
    const jaTem = await prisma.mediaUpload.findUnique({ where: { id }, select: { id: true } });
    if (!jaTem) {
      const bin = await fetch(`${origem}${caminho}`, {
        headers: { "user-agent": "foocci-captura-de-produto" },
      });
      if (!bin.ok) {
        semPar.push(`${item.name} (mídia ${bin.status})`);
        continue;
      }
      const original = Buffer.from(await bin.arrayBuffer());
      // Reduzida na entrada: o banco local não precisa carregar o PNG de 1 MB que
      // o gerador cospe, e a página fica rápida na hora de fotografar.
      const menor = await sharp(original).resize(LARGURA, LARGURA, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
      await prisma.mediaUpload.create({
        data: { id, restaurantId: r.id, mimeType: "image/jpeg", data: menor },
      });
    }
    if (item.imageUrl !== caminho) {
      await prisma.menuItem.update({ where: { id: item.id }, data: { imageUrl: caminho } });
    }
    copiadas++;
  }

  return { restaurante: r.name, itens: itens.length, comFoto: copiadas, semPar };
}

export async function desconectar() {
  await prisma.$disconnect();
}

// Execução direta pela linha de comando.
if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = process.argv.find((a) => a.startsWith("--origem="));
  const origem = arg ? arg.split("=")[1] : ORIGEM_PADRAO;
  console.log(`\n🖼   Espelhando as fotos do cardápio de ${origem} …`);
  const r = await espelharFotos({ origem });
  console.log(`    ${r.comFoto} de ${r.itens} itens agora têm foto.`);
  if (r.semPar.length) console.log(`    sem par em produção: ${r.semPar.join(", ")}`);
  await desconectar();
}
