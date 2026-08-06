/**
 * Portão da capa do cardápio — e das duas camadas que já mataram o carrossel em
 * silêncio antes de qualquer pixel ser desenhado.
 *
 * Cada prova tem as DUAS metades: o caso em que o defeito existe (e ela reprova)
 * e o vizinho em que não existe (e ela passa).
 *
 * Parte é teste de código-fonte porque o vitest deste projeto roda em
 * `environment: "node"`, sem DOM — mesma escolha (e mesmo motivo) de
 * `identificacaoObrigatoria.test.ts`.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CAPA_DEGRADE_DA_MARCA, capaMostraFoto } from "./cover";

const raiz = process.cwd();
const ler = (p: string) => readFileSync(path.join(raiz, p), "utf8");

describe("capa — o caminho vazio é o normal, e ele tem de ficar bonito", () => {
  it("sem capa nenhuma, a faixa NÃO mostra foto — mas continua pintada com a marca", () => {
    expect(capaMostraFoto(null, false)).toBe(false);
    expect(capaMostraFoto(undefined, false)).toBe(false);
    expect(capaMostraFoto("", false)).toBe(false);
    expect(capaMostraFoto("   ", false)).toBe(false);

    // O que salva o estado vazio: o degradê é do CONTÊINER, e as duas pontas
    // saem da marca do restaurante. Se alguém trocar por um cinza literal, o
    // cardápio de todo mundo ganha um retângulo morto no topo.
    expect(CAPA_DEGRADE_DA_MARCA).toContain("var(--brand-primary)");
    expect(CAPA_DEGRADE_DA_MARCA).toContain("var(--brand-secondary)");
    expect(CAPA_DEGRADE_DA_MARCA).not.toMatch(/#[0-9a-f]{3,8}\b/i);
  });

  it("com capa, mostra a foto — a metade que passa quando não há defeito", () => {
    expect(capaMostraFoto("/api/media/abc", false)).toBe(true);
  });

  it("foto que quebra cai no degradê, nunca no ícone de imagem quebrada", () => {
    expect(capaMostraFoto("/api/media/abc", true)).toBe(false);
  });

  it("a foto da capa NÃO depende de `onLoad` — a corrida da hidratação já a apagou", () => {
    // Defeito medido nesta branch, no celular: `img.complete === true` e
    // `opacity: "0"`. Numa página renderizada no servidor, a imagem em cache
    // dispara `load` ANTES de o React pendurar o handler; o estado nunca vira e a
    // capa some sem erro nenhum. Como a faixa continua bonita (o degradê está
    // atrás), o sintoma é mudo — só `getComputedStyle` denuncia.
    const cover = ler("src/components/menu/MenuCover.tsx");
    const jsx = cover.slice(cover.indexOf("export function MenuCover"));
    expect(jsx).not.toContain("onLoad");
    expect(jsx).not.toContain("opacity-0");
    // ... e a metade que passa: o `onError` CONTINUA (esse é seguro — se a
    // imagem já falhou antes da hidratação, ela não ocupa espaço de qualquer jeito
    // e o degradê de trás segue sendo a capa).
    expect(jsx).toContain("onError={() => setFalhou(true)}");
  });

  it("a loja do QR define as DUAS variáveis de marca — sem a secundária o degradê morre", () => {
    // Defeito real e mudo: `--brand-secondary` só existia na Loja. No cardápio da
    // mesa a segunda parada do degradê ficaria vazia e a faixa sairia preta.
    const cliente = ler("src/app/qr/[slug]/QRMenuClient.tsx");
    expect(cliente).toContain("'--brand-primary': pc");
    expect(cliente).toContain("'--brand-secondary': sc");
    // ... e a queda combinada: sem cor secundária, a primária vale para as duas
    // pontas. Degradê de uma cor só ainda é a marca; preto não é.
    expect(cliente).toMatch(/brandSecondaryColor\s*\|\|\s*pc/);
  });

  it("a página do QR busca e entrega a capa — campo lido no banco e prop passada", () => {
    const page = ler("src/app/qr/[slug]/page.tsx");
    expect(page).toContain("coverImageUrl: true");
    expect(page).toContain("coverImageUrl={brandConfig?.coverImageUrl ?? null}");
  });
});

describe("carrossel — a camada de dados que já matou o recurso em silêncio", () => {
  /**
   * O defeito que isto tranca: `images` e `carouselEnabled` existiam no schema e
   * no painel, mas o `select` do cardápio da mesa não pedia os dois campos. O
   * lojista subia três fotos, o banco guardava as três, e a ficha mostrava uma.
   * Nenhum erro, nenhum log — o recurso simplesmente não existia naquela tela.
   */
  it("o cardápio da mesa PEDE images e carouselEnabled ao banco", () => {
    const page = ler("src/app/qr/[slug]/page.tsx");
    const selects = page.match(/images: true, carouselEnabled: true/g) ?? [];
    // Duas consultas de item na mesma página (itens da categoria e placements).
    // Trancar só uma deixa metade do cardápio sem carrossel.
    expect(selects.length).toBe(2);
  });

  it("... e MAPEIA os dois para o cliente — pedir ao banco e não repassar é o mesmo buraco", () => {
    const page = ler("src/app/qr/[slug]/page.tsx");
    expect(page).toContain("images: i.images ?? []");
    expect(page).toContain("carouselEnabled: i.carouselEnabled === true");
  });

  it("a ficha compartilhada usa o carrossel, e usa a regra única de fotos", () => {
    const modal = ler("src/components/menu/ProductModal.tsx");
    expect(modal).toContain("menuItemPhotos");
    expect(modal).toContain("<ImageCarousel");
    // A metade que reprova o retrocesso: voltar a desenhar `item.imageUrl` cru
    // na área da foto é como a ficha ficou sem carrossel por meses.
    expect(modal).not.toContain("src={item.imageUrl}");
  });

  it("existe UMA implementação de carrossel no produto, não uma por tela", () => {
    // Havia duas fichas de produto e só uma tinha carrossel. Peça duplicada é
    // como as três se separam de novo na primeira correção.
    const pedido = ler("src/app/pedido/[slug]/PedidoClient.tsx");
    expect(pedido).not.toMatch(/function ImageCarousel\s*\(/);
    expect(pedido).toContain('from "@/components/menu"');
  });
});

describe("padaria de vitrine — a identidade não depende de rodada paga", () => {
  it("logo e capa são arquivos do repositório, e as redes são fictícias", () => {
    const dados = ler("src/services/demo/foocci-bakery.data.ts");
    expect(dados).toContain('logoUrl: "/demo/foocci-bakery-logo.svg"');
    expect(dados).toContain('coverImageUrl: "/demo/foocci-bakery-capa.svg"');

    // Nenhum ícone do cardápio pode levar à conta real de um terceiro. O critério
    // é o mesmo já usado nos e-mails desta loja: domínio reservado (RFC 2606).
    const identidade = dados.slice(dados.indexOf("BAKERY_IDENTITY"));
    const redes = identidade.match(/https?:\/\/[^"']+/g) ?? [];
    expect(redes.length).toBeGreaterThanOrEqual(2);
    for (const url of redes) expect(url).toContain("example.com");
    expect(redes.some((u) => u.includes("instagram"))).toBe(true);
    expect(redes.some((u) => u.includes("tiktok"))).toBe(true);
  });

  it("os arquivos de logo e capa existem de fato — caminho no dado sem arquivo é 404", () => {
    expect(() => ler("public/demo/foocci-bakery-logo.svg")).not.toThrow();
    expect(() => ler("public/demo/foocci-bakery-capa.svg")).not.toThrow();
  });

  it("o seed grava a identidade — dado no arquivo sem gravação no banco não vira tela", () => {
    const svc = ler("src/services/demo/FoocciBakeryService.ts");
    expect(svc).toContain("logoUrl: BAKERY_IDENTITY.logoUrl");
    expect(svc).toContain("coverImageUrl: BAKERY_IDENTITY.coverImageUrl");
    expect(svc).toContain("instagramUrl: BAKERY_IDENTITY.instagramUrl");
    expect(svc).toContain("tiktokUrl: BAKERY_IDENTITY.tiktokUrl");
  });
});
