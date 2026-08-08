/**
 * PORTAS FECHADAS — trava contra o retorno dos padrões que abriram esta casa.
 *
 * Por que este arquivo existe, e por que ele NÃO é um relatório.
 *
 * O Raio-X (src/services/raiox/collect/SourceScanner.ts) já procura "porta aberta
 * para a internet" e "id aceito sem conferir de quem é". Ele é bom e continua
 * valendo — mas ele produz uma LISTA PARA ALGUÉM LER. Os quatro furos que criaram
 * o cargo de segurança em 07/08/2026 estavam todos escritos em algum lugar e
 * ninguém tropeçou neles por meses. Relatório que depende de leitura é aviso;
 * aviso não protege nada. Isto aqui reprova.
 *
 * E ele cobre exatamente os TRÊS padrões que o Raio-X não cobre — que são,
 * justamente, os que produziram a lista inteira:
 *
 *   A. SEGREDO OPCIONAL  — `if (secret) { ...confere... }`. Quem esquecer de
 *      configurar o segredo não deixa a rota mal protegida: deixa aberta, em
 *      silêncio. Foi o defeito de /api/cron/expire-wa-ordering-sessions.
 *
 *   B. AUSÊNCIA QUE LIBERA — `if (!secret) { console.warn(...) }` sem `return`.
 *      O código até percebe que o segredo sumiu, escreve um log e SEGUE ACEITANDO.
 *      É o defeito do webhook da Stone, e é pior que o A porque parece cuidado.
 *
 *   C. WEBHOOK SEM VERIFICAÇÃO — rota de webhook que confia no corpo da
 *      requisição. Foi o defeito do webhook da Saipos.
 *
 * REGRA DE OURO DESTE ARQUIVO: ausência de segredo tem que REPROVAR, nunca liberar.
 *
 * Sobre a lista de exceções: ela não é para silenciar achado. Ela é a lista do que
 * está aberto AGORA, com dono e motivo, e cada entrada é uma dívida visível. Achado
 * novo que não esteja nela reprova sozinho — que é o ponto.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const API_ROOT = join(process.cwd(), "src", "app", "api");
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "dist", "build", "coverage"]);
const TEST_FILE = /\.(test|spec)\.tsx?$/;

function allRouteFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) allRouteFiles(full, out);
    else if (entry === "route.ts" && !TEST_FILE.test(entry)) out.push(full);
  }
  return out;
}

const ROUTES = allRouteFiles(API_ROOT).map((f) => ({
  path: relative(process.cwd(), f),
  src: readFileSync(f, "utf8"),
}));

/**
 * Remove comentários, para que a DOCUMENTAÇÃO de um defeito não conte como o defeito
 * — este repositório explica os furos nos cabeçalhos, e detector ingênuo acusaria o
 * texto que avisa sobre o problema.
 *
 * Preserva a contagem de linhas trocando cada linha removida por uma linha vazia.
 * Sem isso o número informado é o da versão sem comentários, e mandar alguém olhar
 * uma linha que não existe queima a confiança no detector inteiro.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/^(\s*)\/\/.*$/gm, "$1");
}

// ─────────────────────────────────────────────────────────────────────────────
// EXCEÇÕES CONHECIDAS — o que está aberto agora, com motivo. Isto é dívida, não
// absolvição. Tirar uma linha daqui sem consertar a rota faz o teste reprovar.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Webhooks que hoje NÃO verificam assinatura, e por quê.
 *
 * As duas primeiras entradas tocam PAGAMENTO e PARCEIRO — o agente de segurança
 * é proibido de mexer nelas sozinho (constituição, SEGURANÇA §3: "com autorização
 * humana: qualquer correção que toque pagamento ou integração com parceiro").
 * Estão registradas aqui, com data, esperando decisão do Diretor.
 */
const WEBHOOKS_SEM_ASSINATURA_CONHECIDOS: Record<string, string> = {
  "src/app/api/integrations/saipos/webhook/route.ts":
    "ABERTO — nenhuma autenticação. Levantado em 08/08/2026 pelo agente de segurança. " +
    "Toca integração de parceiro: conserto depende de decisão do Diretor (a Saipos precisa " +
    "passar a enviar um segredo, ou a rota precisa validar por outro meio).",

  "src/app/api/payments/stone/webhook/route.ts":
    "ABERTO quando STONE_WEBHOOK_SECRET não está configurado — e em 08/08/2026 ele NÃO está " +
    "em produção (verificado por sonda: assinatura inválida foi ACEITA). Toca pagamento: " +
    "conserto depende de decisão do Diretor, porque ligar a trava antes de configurar o " +
    "segredo derruba a confirmação de pagamento se a Stone estiver em uso.",

  "src/app/api/payments/sumup/webhook/route.ts":
    "ACEITO por desenho: o webhook só diz QUAL checkout mudou; confirmSumUpPayment reconsulta " +
    "a API da SumUp e só marca pago se a própria SumUp disser PAID " +
    "(src/services/payment/confirmCardPayment.ts). O provedor é a fonte, não o corpo recebido.",

  "src/app/api/billing/mp-webhook/route.ts":
    "ACEITO por desenho: reconsulta o Mercado Pago com o nosso token " +
    "(MercadoPagoPlatformBilling.fetchPreapproval / fetchPayment) antes de agir.",
};

/**
 * Rotas que hoje entram em `if (!segredo)` e SEGUEM aceitando o pedido.
 *
 * Só há uma, e é a da Stone. Ela está aqui — e não consertada — porque toca
 * pagamento, e o agente de segurança não altera pagamento sozinho. A trava certa
 * é uma linha (`return 401`), mas ligá-la com STONE_WEBHOOK_SECRET ausente em
 * produção para a confirmação de pagamento. Decisão do Diretor, com o estrago na mão.
 */
const AUSENCIA_QUE_LIBERA_CONHECIDA: Record<string, string> = {
  "src/app/api/payments/stone/webhook/route.ts":
    "ABERTO — quando STONE_WEBHOOK_SECRET não existe, o webhook registra 'CRITICAL' no log " +
    "e aceita o evento assim mesmo. Sonda de 08/08/2026: em produção o segredo NÃO está " +
    "configurado e uma assinatura inválida foi aceita. Aguarda decisão do Diretor.",
};

/** Provas de verificação aceitas num webhook. */
const VERIFICACAO_RE =
  /createHmac|timingSafeEqual|verify\w*Signature|validateMetaSignature|x-hub-signature|X-Hub-Signature|verifyMpWebhookSignature|CRON_SECRET|ADMIN_SECRET|ApiKeyService/i;

// ─────────────────────────────────────────────────────────────────────────────

describe("PADRÃO A — segredo opcional: `if (secret)` nunca pode ser o portão", () => {
  it("nenhuma rota condiciona a conferência à EXISTÊNCIA do segredo", () => {
    const ofensores: string[] = [];

    for (const { path, src } of ROUTES) {
      const code = stripComments(src);
      // `if (algumSegredo) {` onde o corpo faz a conferência — o portão só existe
      // quando o segredo existe, logo some junto com ele.
      const re = /if\s*\(\s*(\w*(?:secret|Secret|token|Token))\s*\)\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) !== null) {
        const trecho = code.slice(m.index, m.index + 400);
        // Só acusa quando o corpo do if realmente autentica (compara ou devolve 401).
        if (/401|Unauthorized|!==|!=/.test(trecho)) {
          const linha = code.slice(0, m.index).split("\n").length;
          ofensores.push(`${path}:${linha} — if (${m[1]}) guardando a autenticação`);
        }
      }
    }

    expect(
      ofensores,
      "Segredo ausente vira passe livre. Inverta: sem segredo → 503/401, nunca seguir.\n" +
        ofensores.join("\n"),
    ).toEqual([]);
  });
});

describe("PADRÃO B — ausência que libera: perceber que o segredo sumiu e continuar", () => {
  it("nenhuma rota entra em `if (!secret)` sem interromper o pedido", () => {
    const ofensores: string[] = [];

    for (const { path, src } of ROUTES) {
      const code = stripComments(src);
      const re = /if\s*\(\s*!\s*(\w*(?:secret|Secret))\s*\)\s*\{/g;
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) !== null) {
        // Recorta o corpo do if, equilibrando chaves.
        const abre = code.indexOf("{", m.index);
        let nivel = 0;
        let fim = abre;
        for (let i = abre; i < code.length; i++) {
          if (code[i] === "{") nivel++;
          else if (code[i] === "}") {
            nivel--;
            if (nivel === 0) { fim = i; break; }
          }
        }
        const corpo = code.slice(abre, fim + 1);
        // Interromper = devolver resposta, lançar erro, ou sair da função.
        const interrompe = /\breturn\b|\bthrow\b/.test(corpo);
        if (!interrompe) {
          const linha = code.slice(0, m.index).split("\n").length;
          const chave = path.split("\\").join("/");
          if (chave in AUSENCIA_QUE_LIBERA_CONHECIDA) continue;
          ofensores.push(
            `${path}:${linha} — if (!${m[1]}) apenas registra e segue aceitando`,
          );
        }
      }
    }

    expect(
      ofensores,
      "Notar que o segredo sumiu e seguir em frente é pior que não notar: parece cuidado.\n" +
        ofensores.join("\n"),
    ).toEqual([]);
  });

  it("a dívida conhecida do padrão B ainda corresponde a um defeito real", () => {
    // Se a rota for consertada, a entrada tem que sair da lista. Exceção que
    // sobrevive ao conserto silencia a regressão seguinte.
    const aindaDefeituosas = ROUTES.filter(({ path, src }) => {
      if (!(path.split("\\").join("/") in AUSENCIA_QUE_LIBERA_CONHECIDA)) return false;
      const code = stripComments(src);
      const m = /if\s*\(\s*!\s*\w*(?:secret|Secret)\s*\)\s*\{([\s\S]{0,600}?)\n\s*\}/.exec(code);
      return !!m && !/\breturn\b|\bthrow\b/.test(m[1]);
    }).map((r) => r.path.split("\\").join("/"));

    const mortas = Object.keys(AUSENCIA_QUE_LIBERA_CONHECIDA).filter(
      (p) => !aindaDefeituosas.includes(p),
    );
    expect(
      mortas,
      `Entrada de dívida que não corresponde mais ao defeito — remova-a:\n${mortas.join("\n")}`,
    ).toEqual([]);
  });
});

describe("PADRÃO C — webhook que confia no corpo da requisição", () => {
  const webhooks = ROUTES.filter((r) => /webhook/i.test(r.path));

  it("existem rotas de webhook para conferir (o detector não é vazio)", () => {
    // Detector que não acha nada por estar quebrado passa em silêncio; este caso
    // é o que garante que os demais estão realmente olhando para alguma coisa.
    expect(webhooks.length).toBeGreaterThanOrEqual(5);
  });

  it("todo webhook verifica a origem, ou está na lista de dívida conhecida", () => {
    const naoVerificam = webhooks
      .filter((w) => !VERIFICACAO_RE.test(stripComments(w.src)))
      .map((w) => w.path.split("\\").join("/"));

    const novos = naoVerificam.filter((p) => !(p in WEBHOOKS_SEM_ASSINATURA_CONHECIDOS));

    expect(
      novos,
      "Webhook novo sem verificação de origem. Verifique a assinatura, ou reconsulte o " +
        "provedor antes de agir — e registre a decisão na lista deste arquivo.\n" +
        novos.join("\n"),
    ).toEqual([]);
  });

  it("a lista de dívida não guarda entrada morta (rota que já foi consertada ou removida)", () => {
    // Impede que a lista vire cemitério: exceção que não corresponde mais a um
    // defeito real tem que sair, senão ela silencia uma regressão futura.
    const caminhos = new Set(webhooks.map((w) => w.path.split("\\").join("/")));
    const orfas = Object.keys(WEBHOOKS_SEM_ASSINATURA_CONHECIDOS).filter((p) => !caminhos.has(p));
    expect(orfas, `Entrada de exceção sem rota correspondente:\n${orfas.join("\n")}`).toEqual([]);
  });
});

describe("PADRÃO D — segredo em texto puro no código", () => {
  it("nenhuma rota traz credencial literal embutida", () => {
    const ofensores: string[] = [];
    // Atribuição de um literal longo a algo chamado secret/token/apiKey/password.
    const re =
      /\b(?:const|let|var)\s+\w*(?:secret|token|apiKey|password|senha)\w*\s*(?::\s*string\s*)?=\s*["'`]([^"'`\n]{16,})["'`]/gi;

    for (const { path, src } of ROUTES) {
      const code = stripComments(src);
      let m: RegExpExecArray | null;
      while ((m = re.exec(code)) !== null) {
        const valor = m[1];
        // Nome de variável de ambiente, cabeçalho ou URL não é credencial.
        if (/^https?:\/\//.test(valor)) continue;
        if (/^[A-Z0-9_]+$/.test(valor)) continue;
        if (/^x-[a-z-]+$/.test(valor)) continue;
        const linha = code.slice(0, m.index).split("\n").length;
        // O VALOR nunca é impresso — só o arquivo, a linha e o tamanho.
        ofensores.push(`${path}:${linha} — literal de ${valor.length} caracteres`);
      }
    }

    expect(
      ofensores,
      `Credencial pertence ao cofre/ambiente, nunca ao código.\n${ofensores.join("\n")}`,
    ).toEqual([]);
  });
});
