/**
 * A FAMÍLIA de um erro da Graph API — credencial, permissão, parâmetro ou limite.
 *
 * Por que este módulo existe
 * ──────────────────────────
 * Um erro da Meta chegava até a tela do lojista como texto cru mais `(code 100)`, e a
 * faixa vermelha mandava ele **"Reconectar"** em TODOS os casos. Reconectar só resolve
 * uma dessas famílias. Nas outras, é pedir ação humana que não conserta nada — e foi
 * exatamente isso que aconteceu com o Instagram: reconectaram em 25/07, 04/08 e 05/08,
 * e as três conexões nasceram com o mesmo defeito, porque o defeito nunca foi a conexão.
 *
 * A separação já existia no repositório, mas presa a UM caminho só
 * (`MetaAppHealthService.explainGraphError`, que cobre 190/4/17/803 e **não cobre 100**)
 * e nunca aplicada ao Instagram. Aqui ela vira peça compartilhada e testável.
 *
 * Evidência viva que sustenta a tabela (sondas GET puras em 08/08/2026, sem credencial,
 * contra `https://graph.instagram.com/access_token?grant_type=ig_exchange_token`):
 *
 *   sem `client_secret`                → code 190  IGApiException "Invalid OAuth 2.0 Access Token"
 *   sem `access_token`                 → code 190  IGApiException
 *   `access_token` inválido            → code 190  OAuthException "Cannot parse access token"
 *   `grant_type` errado/ausente        → code 190  (o token é validado ANTES)
 *
 * Ou seja: **naquele endpoint, credencial ruim e token morto respondem 190, não 100.**
 * Logo um `code 100` ali NÃO é "o token venceu" nem "a chave secreta está errada" —
 * essas duas leituras estão descartadas por medição, não por opinião.
 *
 * O que este módulo NÃO faz: não decide sozinho o que está errado no pedido. `100` é a
 * família "a Meta recusou o PEDIDO" — e o que fica dito é que **repetir o mesmo pedido
 * não muda a resposta**, que é a única conclusão que a evidência sustenta.
 */

export type MetaErrorFamily =
  /** Token/segredo: expirado, revogado, ou o par appId+appSecret não confere. */
  | "CREDENCIAL"
  /** O app não tem (ou o usuário não concedeu) a permissão exigida. App Review / consentimento. */
  | "PERMISSAO"
  /** A Meta recusou o formato do pedido: parâmetro ausente, inválido ou objeto inexistente. */
  | "PARAMETRO"
  /** Estamos batendo demais. Passa sozinho. */
  | "LIMITE"
  /** A Meta está fora/instável agora. Passa sozinho. */
  | "INDISPONIVEL"
  /** Não reconhecido. Guardrail 1: não vira nenhuma das outras por eliminação. */
  | "DESCONHECIDA";

/** O envelope de erro da Graph, com os campos que a Meta realmente manda. */
export interface MetaGraphErrorShape {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export interface ClassifiedMetaError {
  family: MetaErrorFamily;
  /** O código que a Meta devolveu, quando deu para saber. */
  code: number | null;
  /**
   * Refazer o login pela tela tem chance real de resolver?
   * `false` aqui é o que impede a faixa de mandar o lojista a uma tarefa inútil.
   */
  reconnectCanFix: boolean;
  /** Tentar de novo o MESMO pedido, mais tarde, tem chance de resolver? */
  retryCanFix: boolean;
  /** Quem tem a mão para resolver. */
  ownedBy: "LOJISTA" | "FOOCCI" | "CEO_META" | "META" | "DESCONHECIDO";
  /** Uma frase para o LOJISTA — sem jargão, e que não promete o que não resolve. */
  lojista: string;
  /** Uma frase para quem opera o aplicativo — diz onde mexer. */
  operador: string;
  /** O texto cru da Meta, preservado. Um alerta sem o caso concreto é ruído (guardrail 6). */
  evidence: string;
}

/** Códigos de token/segredo. 190 é o clássico; os 46x são sessão invalidada. */
const CREDENCIAL = new Set([102, 190, 458, 459, 460, 463, 464, 467]);
/** Códigos de permissão/escopo. `10` e `200-299` são a faixa oficial de permissão. */
const PERMISSAO = new Set([3, 10, 200, 201, 202, 203, 204, 210, 230, 294, 298, 299, 803]);
/** Códigos de excesso de chamadas. */
const LIMITE = new Set([4, 17, 32, 341, 613, 80007]);
/** Códigos de indisponibilidade temporária declarada pela própria Meta. */
const INDISPONIVEL = new Set([1, 2]);

/**
 * Extrai o código do texto quando só sobrou a string — é o caso das linhas JÁ gravadas
 * em produção antes desta correção, que guardaram apenas `mensagem (code 100)`.
 * Sem isto, consertar a leitura só valeria para conexões futuras, e o restaurante que
 * está fora do ar AGORA continuaria com a faixa mentindo.
 */
export function extractMetaCode(raw: string): number | null {
  const m =
    /\(code (\d+)\)/.exec(raw) ??      // formato que o nosso código gravava ANTES desta correção
    /\(#(\d+)\)/.exec(raw) ??          // formato nativo da Meta: "(#200) Permissions error"
    /"?code"?\s*[:=]\s*(\d+)/.exec(raw) ??
    // O formato que `classifyMetaGraphError` grava AGORA: "… · code 100 · type …".
    // Sem esta linha o texto que nós mesmos escrevemos no banco voltava como
    // DESCONHECIDA na releitura — a evidência ficava gravada e ilegível, que é o
    // mesmo buraco de antes com outra roupa. Pego pelo teste de sabotagem.
    /\bcode (\d+)\b/.exec(raw);
  return m ? Number(m[1]) : null;
}

function familyOf(code: number | null, raw: string): MetaErrorFamily {
  if (code !== null) {
    if (CREDENCIAL.has(code)) return "CREDENCIAL";
    if (PERMISSAO.has(code)) return "PERMISSAO";
    if (LIMITE.has(code)) return "LIMITE";
    if (INDISPONIVEL.has(code)) return "INDISPONIVEL";
    if (code === 100) return "PARAMETRO";
  }
  // Sem código, só o texto. Padrões que a Meta usa de forma estável.
  if (/expired|session has expired|invalid oauth|access token/i.test(raw)) return "CREDENCIAL";
  if (/permission|not authorized|não autoriz/i.test(raw)) return "PERMISSAO";
  if (/rate limit|too many calls|request limit/i.test(raw)) return "LIMITE";
  if (/temporarily unavailable|please retry|try again later/i.test(raw)) return "INDISPONIVEL";
  return "DESCONHECIDA";
}

/**
 * Classifica um erro da Graph API. Aceita o objeto de erro da Meta OU o texto já
 * gravado no banco — as duas formas existem hoje.
 *
 * `contexto` muda quem é o dono do conserto sem mudar a família: um 190 num token de
 * LOJISTA se resolve com ele refazendo o login; o mesmo 190 num token de APLICATIVO
 * quer dizer que o par ID+chave secreta não confere, e aí reconectar não adianta nada.
 */
export function classifyMetaGraphError(
  input: MetaGraphErrorShape | string | null | undefined,
  contexto: "TOKEN_DO_LOJISTA" | "TOKEN_DO_APLICATIVO" = "TOKEN_DO_LOJISTA",
): ClassifiedMetaError {
  const shape: MetaGraphErrorShape =
    typeof input === "string" ? { message: input } : (input ?? {});
  const rawMessage = (shape.message ?? "").trim();

  const code = shape.code ?? extractMetaCode(rawMessage);
  const family = familyOf(code, rawMessage);

  // A evidência crua, com tudo que a Meta mandou. `fbtrace_id` é o que o suporte da
  // Meta pede primeiro — e era jogado fora.
  const partes = [
    rawMessage || "sem mensagem",
    code !== null ? `code ${code}` : null,
    shape.error_subcode ? `subcode ${shape.error_subcode}` : null,
    shape.type ? `type ${shape.type}` : null,
    shape.fbtrace_id ? `fbtrace ${shape.fbtrace_id}` : null,
  ].filter(Boolean);
  const evidence = partes.join(" · ");

  const base = { code, evidence };

  switch (family) {
    case "CREDENCIAL":
      return contexto === "TOKEN_DO_APLICATIVO"
        ? {
            ...base, family,
            reconnectCanFix: false, retryCanFix: false, ownedBy: "CEO_META",
            lojista: "O acesso do aplicativo Foocci ao Instagram está recusado. Reconectar a sua conta não resolve — quem corrige é a equipe Foocci.",
            operador: "190 em token de APLICATIVO: o ID do app e a Chave Secreta não formam par. Confira META_APP_ID/META_APP_SECRET (ou INSTAGRAM_APP_ID/INSTAGRAM_APP_SECRET) no Railway e em /admin/meta — lembrando que o banco vence o ambiente.",
          }
        : {
            ...base, family,
            reconnectCanFix: true, retryCanFix: false, ownedBy: "LOJISTA",
            lojista: "O acesso ao seu Instagram venceu. Reconectar a conta resolve.",
            operador: "Token do usuário expirado/revogado. Só o dono da conta reconecta pela UI; refresh por API exige token ainda vivo (≥24h e não expirado).",
          };

    case "PERMISSAO":
      return {
        ...base, family,
        reconnectCanFix: false, retryCanFix: false, ownedBy: "CEO_META",
        lojista: "O aplicativo da Foocci ainda não tem a autorização da Meta para esta ação. Reconectar não resolve — a liberação é feita pela equipe Foocci junto à Meta.",
        operador: "Falta permissão/escopo no aplicativo. Verifique a concessão de instagram_business_manage_messages e o estado do App Review. ATENÇÃO: mexer em permissão é ato do CEO na conta pessoal dele e afeta WhatsApp e Instagram ao mesmo tempo — é o MESMO aplicativo.",
      };

    case "PARAMETRO":
      return {
        ...base, family,
        reconnectCanFix: false, retryCanFix: false, ownedBy: "FOOCCI",
        lojista: "A conexão com o Instagram falhou por um defeito do sistema da Foocci, não por algo do seu lado. Reconectar vai dar no mesmo — a equipe Foocci precisa corrigir.",
        operador: "A Meta recusou o PEDIDO (code 100), não a credencial: naquele endpoint credencial ruim e token morto respondem 190. Repetir o mesmo pedido devolve a mesma resposta. Compare o pedido com a documentação vigente do endpoint (parâmetros, versão da Graph e host) antes de tocar em qualquer credencial.",
      };

    case "LIMITE":
      return {
        ...base, family,
        reconnectCanFix: false, retryCanFix: true, ownedBy: "META",
        lojista: "A Meta está limitando as consultas neste momento. Costuma normalizar sozinho em alguns minutos.",
        operador: "Rate limit. Recuar e repetir mais tarde; não é defeito de credencial nem de permissão.",
      };

    case "INDISPONIVEL":
      return {
        ...base, family,
        reconnectCanFix: false, retryCanFix: true, ownedBy: "META",
        lojista: "A Meta está instável neste momento. Costuma normalizar sozinho.",
        operador: "Falha transitória declarada pela Meta. Repetir é o tratamento correto.",
      };

    default:
      // Guardrail 1: não sei não vira nenhuma das outras por eliminação. Mantenho o
      // retry ligado (é o comportamento seguro) e NÃO prometo que reconectar resolve.
      return {
        ...base, family: "DESCONHECIDA",
        reconnectCanFix: false, retryCanFix: true, ownedBy: "DESCONHECIDO",
        lojista: "A conexão com o Instagram falhou e ainda não sabemos o motivo. A equipe Foocci precisa olhar antes de você tentar de novo.",
        operador: "Erro não classificado. NÃO conclua família por eliminação — leve a evidência crua (code, subcode, type, fbtrace) para a documentação da Meta.",
      };
  }
}

/**
 * O texto que vai para a faixa do lojista quando um passo da conexão falha.
 *
 * A regra dura: a palavra "Reconecte" só aparece quando reconectar resolve de verdade.
 * Antes, ela aparecia sempre — inclusive nas três reconexões seguidas que nasceram com
 * o mesmo defeito, porque o defeito não estava na conexão.
 */
export function frasePraLojista(passo: string, c: ClassifiedMetaError): string {
  return `${passo} ${c.lojista} (detalhe técnico: ${c.evidence})`;
}

/**
 * Dado o que já está GRAVADO sobre os problemas em aberto, reconectar resolve algum?
 *
 * Existe para que a correção valha para a conexão que está quebrada AGORA, e não só
 * para as futuras: as linhas em produção guardam o erro da Meta como texto
 * (`… (code 100)`), e `classifyMetaGraphError` sabe ler os dois formatos.
 *
 * `null` quando não há evidência nenhuma — ausência de informação não é informação, e
 * a faixa que consome isto não pode inventar um próximo passo a partir do silêncio.
 */
export function reconnectCanFixAny(raws: (string | null | undefined)[]): boolean | null {
  const presentes = raws.filter((r): r is string => typeof r === "string" && r.trim().length > 0);
  if (presentes.length === 0) return null;
  // Basta UM problema que a reconexão resolva para que oferecer reconectar seja honesto.
  return presentes.some((r) => classifyMetaGraphError(r).reconnectCanFix);
}
