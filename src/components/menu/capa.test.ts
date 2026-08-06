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
import { CAPA_DEGRADE_DA_MARCA, COR_PADRAO_DA_LOJA, capaMostraFoto, escurecerCor, iniciaisDoNome } from "./cover";

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

  it("sem cor secundária, a segunda ponta é DERIVADA — capa vazia não pode ser bloco chapado", () => {
    // A metade que reprova: devolver a mesma cor nas duas pontas (era o que a
    // primeira versão fazia). Um restaurante sem cor secundária — a maioria —
    // ganhava 128px de tinta lisa no topo do cardápio.
    expect(escurecerCor("#f97316")).not.toBe("#f97316");
    expect(escurecerCor("#f97316")).toBe("#90430d");
    expect(escurecerCor("#fff")).toBe("#949494");
    expect(escurecerCor("#8A4B1E")).toBe("#502c11");

    // ... e a metade que passa: entrada inválida não derruba o cardápio. Capa é
    // enfeite; campo de cor mal preenchido no painel não pode virar tela branca.
    expect(escurecerCor("não é cor")).toBe("não é cor");
    expect(escurecerCor("")).toBe("");
    expect(escurecerCor("var(--x)")).toBe("var(--x)");
  });

  it("no desktop, a faixa SÓ cresce quando há foto — degradê não ganha meia tela", () => {
    const cover = ler("src/components/menu/MenuCover.tsx");
    // A metade que reprova: `lg:h-56` incondicional. Restaurante sem capa (a
    // maioria) abriria o cardápio com 224px de cor lisa no monitor.
    expect(cover).toMatch(/temFoto \? "lg:h-56" : ""/);
    expect(cover).toContain('className={`relative h-32 w-full overflow-hidden sm:h-40 ');
  });

  it("sem logo, a capa mostra o monograma — faixa colorida com nada em cima não é capa", () => {
    expect(iniciaisDoNome("Foocci Bakery")).toBe("FB");
    expect(iniciaisDoNome("Pizzaria")).toBe("P");
    expect(iniciaisDoNome("  Cantina  da  Nona  ")).toBe("CD");
    // Nome vazio não vira string vazia (círculo em branco): vira um ponto.
    expect(iniciaisDoNome("   ")).toBe("•");

    const cover = ler("src/components/menu/MenuCover.tsx");
    expect(cover).toContain("iniciaisDoNome(restaurantName)");
  });

  it("a loja do QR define as DUAS variáveis de marca — sem a secundária o degradê morre", () => {
    // Defeito real e mudo: `--brand-secondary` só existia na Loja. No cardápio da
    // mesa a segunda parada do degradê ficaria vazia e a faixa sairia preta.
    const cliente = ler("src/app/qr/[slug]/QRMenuClient.tsx");
    expect(cliente).toContain("'--brand-primary': pc");
    expect(cliente).toContain("'--brand-secondary': sc");
    // ... e a queda combinada: sem cor secundária, ela é derivada da primária.
    // Degradê da própria marca ainda é a marca; preto não é.
    expect(cliente).toMatch(/brandSecondaryColor\s*\|\|\s*escurecerCor\(pc\)/);
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

describe("prévia da capa no painel — prévia que mente é pior que prévia nenhuma", () => {
  it("a prévia usa a MESMA conta do cardápio, não uma fórmula própria", () => {
    const marca = ler("src/app/(dashboard)/marca/page.tsx");
    expect(marca).toContain("escurecerCor(corDaCapa)");
    // A cor de reserva da prévia é a MESMA do /qr/[slug] — e agora isso é lido de
    // uma constante, não conferido entre duas cópias. Enquanto eram dois literais,
    // a versão "sincronizada" estava sincronizada na cor ERRADA: as duas traziam
    // o laranja da Foocci numa superfície white-label.
    expect(marca).toMatch(/const corDaCapa = form\.brandPrimaryColor \|\| COR_PADRAO_DA_LOJA/);
  });

  it("o formulário NÃO inventa cor de marca — vazio salva vazio", () => {
    // Defeito que isto tranca: a tela preenchia sozinha `#6366f1`/`#8b5cf6`
    // (indigo/violeta) quando o restaurante não tinha cor. Quem abrisse a Marca e
    // clicasse em Salvar gravava indigo como cor da loja sem ter escolhido nada —
    // e indigo é exatamente a cor que o DESIGN.md proíbe como cor de ação.
    const marca = ler("src/app/(dashboard)/marca/page.tsx");
    expect(marca).toContain('brandPrimaryColor:     data.brandPrimaryColor ?? ""');
    expect(marca).toContain('brandSecondaryColor:   data.brandSecondaryColor ?? ""');
    // ... e a metade que passa: o <input type="color"> continua com um hex
    // válido para EXIBIR (o elemento não aceita string vazia).
    expect(marca).toContain('value={form.brandPrimaryColor || "#6366f1"}');
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

describe("a cor de reserva da loja — uma constante, três telas", () => {
  /*
    O DEFEITO QUE ISTO TRANCA, e ele passou despercebido por ser pequeno demais:

    a reserva estava escrita à mão em três lugares e DISCORDAVA. O `/pedido` usava
    o verde que o DESIGN.md §1 declara; o cardápio da mesa (`/qr`) e a prévia da
    tela Marca usavam `#f97316` — o laranja da Foocci, que é a marca do PAINEL DO
    LOJISTA e não tem o que fazer numa loja white-label.

    Enquanto a reserva pintava só um botão, ninguém via. A capa do cardápio a
    transformou numa faixa larga no topo, e o desvio virou a primeira coisa que o
    cliente do restaurante enxerga — com a marca errada.

    Estes testes vão no LITERAL, não no valor calculado, porque o defeito era um
    literal digitado: um teste que só comparasse `pc === COR_PADRAO_DA_LOJA` passaria
    feliz com as três telas trazendo hex diferentes de volta.
  */
  const TELAS = [
    "src/app/qr/[slug]/QRMenuClient.tsx",
    "src/app/pedido/[slug]/PedidoClient.tsx",
    "src/app/(dashboard)/marca/page.tsx",
  ];

  it("é o verde do DESIGN.md, não o laranja da Foocci", () => {
    expect(COR_PADRAO_DA_LOJA).toBe("#25d366");
  });

  it("nenhuma das três telas digita a cor de reserva à mão", () => {
    for (const tela of TELAS) {
      const src = ler(tela);
      // O laranja da marca da Foocci não pode voltar como reserva de loja.
      expect(src).not.toMatch(/brandPrimaryColor\s*\|\|\s*["']#f97316["']/);
      expect(src).not.toMatch(/brandPrimaryColor\s*\|\|\s*["']#25d366["']/);
      expect(src).toContain("COR_PADRAO_DA_LOJA");
    }
  });
});
