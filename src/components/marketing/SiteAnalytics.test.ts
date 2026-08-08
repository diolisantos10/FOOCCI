/**
 * O Pixel da Meta — as duas metades do portão.
 *
 * METADE 1 (a que vale mais que todo o resto): o Pixel NÃO pode existir em nenhuma
 * página da loja do cliente final (`/pedido/[slug]`, `/qr/[slug]`). A loja é do
 * restaurante e quem navega ali é o cliente DELE. Mandar o comportamento de compra
 * desse cliente para a conta de anúncios da Foocci é problema de LGPD e de confiança,
 * e não se desfaz depois de acontecer.
 *
 * ⚠️ POR QUE ESTE TESTE NÃO É UM `grep` EM `src/app/pedido`: a loja NÃO tem layout
 * próprio. Ela herda apenas o layout raiz. Ou seja, o jeito mais provável de o Pixel
 * vazar para a loja não é alguém escrever `fbq` dentro de `/pedido` — é alguém
 * "melhorar a medição" movendo o `SiteAnalytics` para `src/app/layout.tsx`. Um grep
 * na pasta da loja passaria verde enquanto o Pixel dispara em todo pedido do país.
 *
 * Então o teste percorre a CADEIA DE LAYOUTS que de fato embrulha cada rota, e de
 * cada layout segue os imports locais transitivamente — porque montar via um
 * componente intermediário vaza igual.
 *
 * METADE 2: sem a metade de baixo, apagar o componente inteiro satisfaria a de cima.
 * Com id → o script aparece. Sem id → NADA é renderizado (bloco de medição vazio é
 * pior que nenhum: parece instalado e não reporta). E nenhum dado pessoal no evento.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SiteAnalytics } from "./SiteAnalytics";

const SRC = path.resolve(__dirname, "..", "..");
const APP = path.join(SRC, "app");

/**
 * O que caracteriza "tem Pixel aqui". `connect.facebook.net/.../sdk.js` (o SDK do
 * cadastro embutido do WhatsApp, no painel) é outra coisa e de propósito NÃO casa:
 * só `fbevents` conta.
 */
const PIXEL_MARKER = /\bfbq\s*\(|connect\.facebook\.net\/[^"'`]*fbevents|facebook\.com\/tr\?/;
const MOUNTS_SITE_ANALYTICS = /<\s*SiteAnalytics\b/;

function resolveLocal(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = path.join(SRC, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(fromFile), spec);
  else return null; // pacote de node_modules — fora do grafo do produto

  for (const cand of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    path.join(base, "index.tsx"),
    path.join(base, "index.ts"),
  ]) {
    if (existsSync(cand) && statSync(cand).isFile()) return cand;
  }
  return null;
}

/** Todo arquivo de código alcançável a partir de `entries`, seguindo imports locais. */
function reachableFrom(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries.filter((f) => existsSync(f))];

  while (queue.length) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);

    const code = readFileSync(file, "utf8");
    const specs = [
      ...code.matchAll(/from\s+["']([^"']+)["']/g),
      ...code.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g),
    ].map((m) => m[1]);

    for (const spec of specs) {
      const resolved = resolveLocal(spec, file);
      if (resolved && !seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen];
}

/**
 * A cadeia de layouts que o App Router aplica a uma rota: todo `layout.tsx` de
 * `src/app` até a pasta da rota, inclusive os de route group (`(gated)`).
 */
function layoutChain(routeDir: string): string[] {
  const chain: string[] = [];
  let dir = path.join(APP, routeDir);
  const stop = path.dirname(APP);

  while (dir.startsWith(APP) || dir === APP) {
    const layout = path.join(dir, "layout.tsx");
    if (existsSync(layout)) chain.push(layout);
    if (dir === APP) break;
    dir = path.dirname(dir);
    if (dir === stop) break;
  }
  return chain;
}

/** Todos os arquivos de uma subárvore de rota (as próprias páginas da loja). */
function filesUnder(dir: string): string[] {
  const abs = path.join(APP, dir);
  if (!existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(abs)) {
    const full = path.join(abs, entry);
    if (statSync(full).isDirectory()) out.push(...filesUnder(path.join(dir, entry)));
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

const STORE_ROUTES = ["pedido/[slug]", "qr/[slug]"];

// ---------------------------------------------------------------------------
// METADE 1 — a fronteira. A regressão do bloco.
// ---------------------------------------------------------------------------

describe("fronteira: o Pixel não entra na loja do cliente final", () => {
  it("as rotas da loja existem e não têm layout próprio — quem as embrulha é a raiz", () => {
    // Se isto mudar, o teste abaixo continua correto, mas esta asserção documenta
    // POR QUE o layout raiz é o ponto de vazamento a vigiar.
    for (const route of STORE_ROUTES) {
      expect(existsSync(path.join(APP, route, "page.tsx"))).toBe(true);
    }
    const chains = STORE_ROUTES.map(layoutChain);
    for (const chain of chains) {
      expect(chain).toContain(path.join(APP, "layout.tsx"));
    }
  });

  it.each(STORE_ROUTES)(
    "nenhum layout que embrulha /%s monta o Pixel — nem direto, nem via componente",
    (route) => {
      const chain = layoutChain(route);
      expect(chain.length).toBeGreaterThan(0);

      const offenders = reachableFrom(chain).filter((file) => {
        const code = readFileSync(file, "utf8");
        return PIXEL_MARKER.test(code) || MOUNTS_SITE_ANALYTICS.test(code);
      });

      expect(
        offenders.map((f) => path.relative(SRC, f)),
        `O Pixel da Meta chegaria na loja do cliente final por /${route}. ` +
          `A loja é do restaurante: o comportamento de compra do cliente dele não ` +
          `pode ir para a conta de anúncios da Foocci.`,
      ).toEqual([]);
    },
  );

  it.each(STORE_ROUTES)("nenhuma página da loja (/%s) contém código de Pixel", (route) => {
    const offenders = filesUnder(route).filter((file) =>
      PIXEL_MARKER.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((f) => path.relative(SRC, f))).toEqual([]);
  });

  it("controle positivo: o Pixel ESTÁ na cadeia do site comercial (/site)", () => {
    // Sem esta asserção, apagar o SiteAnalytics inteiro deixaria os testes acima
    // verdes — e o portão viraria enfeite.
    const chain = layoutChain("site");
    const mounts = reachableFrom(chain).filter((file) =>
      PIXEL_MARKER.test(readFileSync(file, "utf8")),
    );
    expect(mounts.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// METADE 2 — o componente. Sem ela, apagar tudo passaria na metade 1.
// ---------------------------------------------------------------------------

const NO_IDS = { gaMeasurementId: null, metaPixelId: null, googleSiteVerification: null };
const PIXEL_ID = "000000000000000"; // valor de teste; nenhum id real vive no código

function render(settings: Parameters<typeof SiteAnalytics>[0]["settings"]) {
  return renderToStaticMarkup(React.createElement(SiteAnalytics, { settings }));
}

describe("SiteAnalytics — o Pixel no site comercial", () => {
  it("sem id configurado, NADA é renderizado", () => {
    expect(render(NO_IDS)).toBe("");
  });

  it("sem id de Pixel (mas com GA), nenhum vestígio de Pixel na página", () => {
    const html = render({ ...NO_IDS, gaMeasurementId: "G-TEST12345" });
    expect(PIXEL_MARKER.test(html)).toBe(false);
    expect(html).not.toContain("facebook");
  });

  it("com id configurado, o script do Pixel aparece com o id", () => {
    const html = render({ ...NO_IDS, metaPixelId: PIXEL_ID });
    expect(html).toContain("connect.facebook.net");
    expect(html).toContain("fbevents.js");
    expect(html).toContain(`fbq('init', '${PIXEL_ID}')`);
    expect(html).toContain("fbq('track', 'PageView')");
  });

  it("o noscript de imagem da Meta aparece, com a mesma regra do id", () => {
    const html = render({ ...NO_IDS, metaPixelId: PIXEL_ID });
    expect(html).toContain(
      `https://www.facebook.com/tr?id=${PIXEL_ID}&amp;ev=PageView&amp;noscript=1`,
    );
    expect(html).toMatch(/<noscript>.*<img[^>]*facebook\.com\/tr/s);

    // e sem id, o noscript some junto — não fica pedindo pixel sem destino
    expect(render(NO_IDS)).not.toContain("noscript");
  });

  it("o noscript NÃO é um <img> de React — senão o Float pré-carrega e conta PageView 2x", () => {
    /*
      A causa, medida no HTML servido: escrito como elemento React, o Float do React
      (ligado pelo Next 14 no App Router) hasteia
      `<link rel="preload" as="image" href="…facebook.com/tr?…">` para dentro do
      <head>. O preload vale para TODO navegador — inclusive com JS ligado — e a Meta
      conta o acesso como PageView. Quem tem JS disparava duas vezes.

      O `renderToStaticMarkup` NÃO reproduz o Float (ele não monta o documento), então
      asserir sobre a string renderizada não pegaria isto. A asserção precisa ser sobre
      a ÁRVORE de elementos: nenhum elemento React do tipo "img" pode existir aqui.
    */
    const tree = SiteAnalytics({ settings: { ...NO_IDS, metaPixelId: PIXEL_ID } });

    const found: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (!node || typeof node !== "object") return;
      const el = node as { type?: unknown; props?: { children?: unknown } };
      if (typeof el.type === "string") found.push(el.type);
      if (el.props && "children" in el.props) walk(el.props.children);
    };
    walk(tree);

    expect(
      found,
      "O <img> do noscript virou elemento React: o Float vai pré-carregar a URL do " +
        "Pixel no <head> e todo visitante com JS contará PageView duas vezes.",
    ).not.toContain("img");

    // e o noscript continua existindo, como HTML cru
    expect(found).toContain("noscript");
    expect(render({ ...NO_IDS, metaPixelId: PIXEL_ID })).toMatch(
      /<noscript><img[^>]*facebook\.com\/tr/,
    );
  });

  it("nenhum dado pessoal vai no evento — só navegação de página", () => {
    const html = render({ ...NO_IDS, metaPixelId: PIXEL_ID });

    // O único evento rastreado é PageView.
    const tracked = [...html.matchAll(/fbq\('track',\s*'([^']+)'/g)].map((m) => m[1]);
    expect(tracked).toEqual(["PageView"]);

    // `fbq('init', id)` sem terceiro argumento: é ali que entraria o Advanced
    // Matching (e-mail, telefone, nome do lead). Ele não existe.
    expect(html).toMatch(new RegExp(`fbq\\('init', '${PIXEL_ID}'\\);`));
    expect(html).not.toMatch(/fbq\('init',[^)]*\{/);

    for (const key of ["em:", "ph:", "fn:", "ln:", "email", "telefone", "phone", "cpf"]) {
      expect(html.toLowerCase()).not.toContain(key);
    }
  });
});

describe("nenhum evento do Pixel carrega dado pessoal, em lugar nenhum do produto", () => {
  it("o formulário de demonstração não manda e-mail/telefone/nome para a Meta", () => {
    // Varre todo o site comercial atrás de qualquer chamada de fbq com dado pessoal.
    const files = reachableFrom(layoutChain("site"));
    const offenders: string[] = [];

    for (const file of files) {
      const code = readFileSync(file, "utf8");
      for (const call of code.matchAll(/fbq\s*\(([^)]*)\)/g)) {
        const args = call[1];
        if (/\b(em|ph|fn|ln|external_id)\b\s*:/.test(args) || /email|phone|telefone|nome|cpf/i.test(args)) {
          offenders.push(`${path.relative(SRC, file)}: fbq(${args})`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });
});
