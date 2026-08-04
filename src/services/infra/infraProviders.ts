/**
 * Catálogo de serviços de infraestrutura do cofre — e o teste "quem sou eu" de cada um.
 *
 * O cofre é genérico de propósito (serviço + token), mas NÃO é um gerenciador universal:
 * um serviço só entra aqui quando alguém escreve o que ele é, em português, e — quando dá —
 * como perguntar a ele se o token presta.
 *
 * A validação tem TRÊS respostas, e a diferença entre duas delas é a regra do produto:
 *
 *   • "valid"   → o serviço respondeu e reconheceu o token. Pode guardar.
 *   • "invalid" → o serviço respondeu e RECUSOU o token. NÃO guarda. Guardar lixo em
 *                 silêncio é o pior dos mundos: o CEO acha que resolveu e descobre no
 *                 dia em que precisar.
 *   • "unknown" → não deu para perguntar (sem rede, serviço fora do ar, ou serviço sem
 *                 validador). Guarda, mas a tela DIZ que não foi validado. Silêncio da
 *                 rede não é prova de nada — guardrail 1.
 *
 * Nada aqui pode devolver o token dentro de mensagem de erro. `sanitize()` remove
 * qualquer eco do segredo antes de a mensagem sair desta camada.
 */

export type ValidationStatus = "valid" | "invalid" | "unknown";

export interface ValidationResult {
  status: ValidationStatus;
  /** Frase curta para a tela. Nunca contém o token. */
  detail: string;
}

export interface InfraServiceDef {
  slug: string;
  /** Nome na tela. */
  label: string;
  /** Uma frase: o que é isso e por que o CEO está colando aqui. */
  whatItIs: string;
  /** Onde achar o token, em passos que não exigem ser técnico. */
  whereToGet: string;
  /** Alcance do estrago se vazar — a tela mostra isso sem meia palavra. */
  blastRadius: string;
  /** Ausente = este serviço não sabe se testar; salvar registra "não validado". */
  validate?: (token: string) => Promise<ValidationResult>;
}

/** Remove qualquer eco do token (e de pedaços grandes dele) de uma mensagem. */
export function sanitize(message: string, token: string): string {
  let out = message;
  if (token.length >= 6) {
    out = out.split(token).join("[token omitido]");
    // Alguns serviços ecoam só o começo do que receberam.
    out = out.split(token.slice(0, 12)).join("[token omitido]");
  }
  return out.slice(0, 300);
}

const RAILWAY_GRAPHQL = "https://backboard.railway.com/graphql/v2";
const TIMEOUT_MS = 8000;

/**
 * Railway aceita DOIS tipos de token, com cabeçalhos diferentes, e o CEO não tem como
 * saber qual gerou. Testamos os dois e dizemos qual é:
 *
 *   • token de conta   → `Authorization: Bearer …`, responde `me { email }`
 *   • token de projeto → `Project-Access-Token: …`, responde `projectToken { projectId }`
 *
 * Só concluímos "invalid" quando o Railway RESPONDEU recusando. Falha de rede vira
 * "unknown": um `fetch` que estourou não prova que o token é ruim.
 */
async function validateRailway(token: string): Promise<ValidationResult> {
  const ask = async (headers: Record<string, string>, query: string) => {
    const res = await fetch(RAILWAY_GRAPHQL, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ query }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* resposta não-JSON: tratada como falha do serviço, não do token */
    }
    return { httpOk: res.ok, status: res.status, json, text };
  };

  let networkFailure: string | null = null;

  // 1) Token de conta
  try {
    const r = await ask(
      { Authorization: `Bearer ${token}` },
      "query { me { id email name } }",
    );
    const me = (r.json as { data?: { me?: { email?: string; name?: string } } } | null)?.data?.me;
    if (r.httpOk && me) {
      const who = me.email ?? me.name ?? "conta sem nome";
      return { status: "valid", detail: `Token de conta do Railway — ${who}.` };
    }
  } catch (err) {
    networkFailure = err instanceof Error ? err.message : String(err);
  }

  // 2) Token de projeto
  try {
    const r = await ask(
      { "Project-Access-Token": token },
      "query { projectToken { projectId environmentId } }",
    );
    const pt = (r.json as { data?: { projectToken?: { projectId?: string } } } | null)?.data
      ?.projectToken;
    if (r.httpOk && pt?.projectId) {
      return {
        status: "valid",
        detail: `Token de projeto do Railway — projeto ${pt.projectId}.`,
      };
    }
    // Chegamos aqui com o `fetch` RESOLVIDO nas duas formas e sem identidade nenhuma:
    // o Railway respondeu e não reconheceu o token. Isso é recusa, não falha de rede.
    void r.status;
    return {
      status: "invalid",
      detail:
        "O Railway respondeu que não reconhece este token. Confira se copiou o código inteiro e se ele ainda não foi revogado.",
    };
  } catch (err) {
    networkFailure = err instanceof Error ? err.message : String(err);
  }

  return {
    status: "unknown",
    detail: networkFailure
      ? sanitize(`Não consegui falar com o Railway agora (${networkFailure}). Guardei sem testar.`, token)
      : "Não consegui falar com o Railway agora. Guardei sem testar.",
  };
}

export const INFRA_SERVICES: InfraServiceDef[] = [
  {
    slug: "railway",
    label: "Railway",
    whatItIs:
      "É onde o Foocci fica hospedado. Com este token o sistema consegue ver e mudar as configurações do servidor sem você precisar entrar lá e gerar um token novo toda vez.",
    whereToGet:
      "Entre no railway.app → clique na sua foto (canto superior direito) → Account Settings → Tokens → Create Token. Copie o código que aparecer — ele só é mostrado uma vez.",
    blastRadius:
      "Quem tiver este código consegue ler e trocar TODAS as senhas do sistema. Ele fica guardado em cofre e nunca mais aparece nesta tela.",
    validate: validateRailway,
  },
];

export function findService(slug: string): InfraServiceDef | undefined {
  return INFRA_SERVICES.find((s) => s.slug === slug);
}

/**
 * Slug aceitável para um serviço adicionado à mão ("amanhã outra"). Letras minúsculas,
 * número e hífen — nada que possa virar caminho, injeção ou nome com espaço escondido.
 */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}$/;
