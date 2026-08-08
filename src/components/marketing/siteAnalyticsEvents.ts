/**
 * Eventos de medição do SITE COMERCIAL — a única porta legítima para o Pixel.
 *
 * ─── Por que este arquivo existe, e por que ele é o ÚNICO ────────────────────
 * `SiteAnalytics.tsx` INSTALA o Pixel; este arquivo DISPARA os eventos. São os
 * dois únicos lugares do produto onde a palavra `fbq` pode aparecer, e isso é
 * verificado por teste (`SiteAnalytics.test.ts`). A regra não é burocracia: o
 * Pixel com dois donos foi exatamente como esta casa produziu contagem dobrada
 * de PageView, e o número inflado não quebra nada — só mente.
 *
 * ─── O problema que ele resolve ──────────────────────────────────────────────
 * O formulário de demonstração confirma o envio **na mesma página**: a URL não
 * muda e não existe página de obrigado. Logo, uma "conversão personalizada" da
 * Meta com a regra *URL contém …* não tem como funcionar — ela casaria com quem
 * só visitou, ou com ninguém. O caminho certo é o evento PADRÃO `Lead`, que o
 * Gerenciador de Anúncios já reconhece sem configuração nenhuma.
 *
 * ─── As quatro regras deste módulo ───────────────────────────────────────────
 *
 *  1. **Só no sucesso.** Quem chama é o formulário, DEPOIS da resposta boa do
 *     servidor. Envio recusado pela validação, ou que nem chegou, não é lead.
 *     Medir intenção como conversão faz o anúncio otimizar para a coisa errada e
 *     vira dinheiro gasto em quem não converte.
 *  2. **Uma vez por envio.** `jaDisparados` guarda a chave do envio. Dois toques,
 *     um re-render ou um StrictMode do React não viram duas conversões.
 *  3. **Zero dado pessoal.** Nenhum argumento com nome, e-mail ou telefone — nem
 *     no `track`, nem em Advanced Matching. O que sai é "aconteceu um lead".
 *  4. **Sem Pixel, nada acontece.** Se `window.fbq` não existe (site sem Pixel
 *     configurado, ou bloqueador de anúncio ligado), a função devolve `false` e
 *     segue a vida. Medição NUNCA pode derrubar a captura do lead — e por isso
 *     tudo aqui está dentro de `try`.
 */

/** Assinatura mínima do `fbq` que o script da Meta instala em `window`. */
type Fbq = (comando: string, evento: string, parametros?: Record<string, unknown>) => void;

/**
 * As chaves já disparadas nesta aba. Módulo, não componente: sobrevive a
 * re-render e a desmontagem do formulário, que é justamente o que precisa
 * sobreviver para a contagem não dobrar.
 */
const jaDisparados = new Set<string>();

function pegaFbq(): Fbq | null {
  if (typeof window === "undefined") return null;
  const candidato = (window as unknown as { fbq?: unknown }).fbq;
  return typeof candidato === "function" ? (candidato as Fbq) : null;
}

/**
 * Registra na Meta que um lead foi capturado — o evento padrão `Lead`.
 *
 * @param chaveDoEnvio identificador do envio, para não contar duas vezes. O
 *   código do lead (`#A7K2M`) serve e é o que o formulário passa; quando não há
 *   código, qualquer string estável do mesmo envio resolve.
 * @returns `true` se o evento saiu agora; `false` se não havia Pixel, se já
 *   tinha saído para esta chave, ou se algo falhou. Quem chama pode ignorar —
 *   nada do produto depende desta resposta.
 */
export function registrarLeadCapturado(chaveDoEnvio: string): boolean {
  try {
    if (jaDisparados.has(chaveDoEnvio)) return false;

    const fbq = pegaFbq();
    // Marca ANTES de disparar: se o Pixel não existe, marcar não custa nada; se
    // existe e o disparo lançar, marcar evitou a segunda tentativa cega.
    jaDisparados.add(chaveDoEnvio);
    if (!fbq) return false;

    // `Lead` puro, sem segundo argumento. É aqui que entraria valor, moeda ou
    // (pior) dado da pessoa — e nada disso vai.
    fbq("track", "Lead");
    return true;
  } catch {
    // Medição jamais derruba a captura. O visitante já entregou o dado.
    return false;
  }
}

/** Só para teste: devolve o módulo ao estado de aba recém-aberta. */
export function __resetEventosDeSite(): void {
  jaDisparados.clear();
}
