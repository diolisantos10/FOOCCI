# Oficina — agência (append-only)

## 2026-08-08 · Passeio de esteira no repo `diolidigital` (só leitura)

**Pedido:** produzir um post de verdade no Dioli Digital e dizer onde morre.
Repositório alvo `/workspace/diolidigital` — **nada foi escrito lá**; trabalhei
sobre uma cópia em scratchpad com SQLite local (`npx prisma db push` + seed).

**Como andei:** três sondas chamando as funções na ordem das rotas —
(A) esteira inteira sem chave de IA; (B) esteira inteira com `@/lib/ai/generate`
fingido; (C) o caminho do portal (cliente aprova a proposta) isolado.
Mais o servidor de verdade (`next dev`) com login master e `curl` nas rotas.

**Achados que valem como lei:**

1. **220 testes verdes, 25 arquivos, e nenhum post sai.** A repetição exata da
   lição do piloto Dioli no Foocci: teste de peça não substitui passeio de
   esteira. Nenhum dos 25 arquivos de teste chama a corrente inteira contra um
   banco real.

2. **Parada real: `lib/agency/execution/run-execution.ts:268-280`** — `generate()`
   devolve `{ok:false, error:"Nenhuma IA conectada"}` e o departamento é apenas
   empurrado para `skipped`. Sem chave, zero entregáveis.

3. **A falha de IA é mascarada por outra fase.** `lib/agency/esteira/fases.ts:196`
   (pedido de material aberto) é testado ANTES de `fases.ts:224`
   (`execucao === "failed"`). Resultado observado: 3 departamentos morreram por
   falta de IA e a tela da equipe dizia *"Parado esperando o cliente"*.
   **Regra:** numa máquina de fases, a ordem dos `if` é política de diagnóstico.
   Falha da casa nunca pode ser lida depois de espera do cliente.

4. **"Chave conectada" na tela não é chave utilizável.**
   `app/api/ai-keys/route.ts:33` reporta `configured` = "existe ciphertext", não
   "decifra". `lib/security/crypto.ts:18-30` deriva a chave de
   `CREDENTIALS_SECRET` → senão `DATABASE_URL`. Mudar qualquer um dos dois mata
   todas as chaves guardadas **em silêncio**. Reproduzido ao vivo: tela dizendo
   `configured:true, hint:"sk-…0000"` e a rota dizendo
   `"Nenhuma IA conectada"`. **Regra:** status de credencial se prova
   decifrando/usando, nunca pela existência da linha.

5. **Portão silencioso + rede de segurança que não pega.** O portão de direção
   (`run-execution.ts:171-180`) devolve `ok:true, status:"skipped_running"` e
   grava `executionStatus:"idle"`. Quem chama no caminho do portal
   (`app/api/portal/approvals/route.ts:125`) faz
   `void runProjectExecution(...).catch(() => {})` — descarta o motivo. E
   `app/api/cron/execute/route.ts:33-41` só recolhe `running` velho ou `failed`;
   **`idle` nunca é candidato**. Projeto fica invisível para os dois lados.
   **Regra:** portão que segura tem de deixar rastro que a rede de segurança
   enxergue, senão o estado "esperando" é indistinguível de "esquecido".

6. **O portão de direção não pede a direção no caminho do portal.**
   `pedirDirecao` só é chamado em `app/api/brain/auto-scope/[id]/review/route.ts:136`
   e `app/api/brain/orchestrate/apply/route.ts:142`. No caminho "cliente aprova a
   proposta", zero mensagens ao cliente (medido: `mensagens ao cliente: 0`).

7. **O portão que diz que verificou, verificou nada.** 28 de 31 checagens em
   `lib/dioli-brain/quality-gates.ts` são `autoCheckable: false` (conferido:
   `grep -c` → 28 false / 3 true / 31 ids). Pior que o número: os artefatos do
   auto-scope gravam `{"overall":"PASS", ... "no_hallucination" ... blocking:true,
   "detail":"Nenhuma alucinação detectada."}` **antes de existir qualquer
   conteúdo produzido**. Portão que aprova o que ainda não foi escrito é pior que
   portão ausente.

8. **A última milha não existe.** Com IA fingida a esteira chega a
   `fase: "ciclo"` dizendo ao cliente *"Seu conteúdo está no ar"* — e
   `SocialPost` no banco: **0**. Nada liga `Deliverable` → `SocialPost`, e nada
   consome `SocialPost.status="scheduled"` para publicar: `publishPost`
   (`lib/integrations/meta/client.ts:114`) só é alcançável por
   `POST /api/meta/publish`, que nenhuma tela chama. **Parei aqui por segurança
   — não publiquei nada.**

**Hipóteses derrubadas com evidência:** o SDR NÃO trava sem IA (cai para o motor
de regras em `components/agency/briefing/PublicBriefingRoom.tsx:717`); o
auto-scope NÃO usa IA; o motor de fases, o PM e os marcos funcionam; os botões
existem e estão montados nas duas telas. O "nada aciona" só é verdade da
publicação para frente.

**Não verificado:** se há chave válida em produção; se o cron tem agendador de
fato; uma chamada real a LLM pago (não havia chave de API disponível no
ambiente — a prova do caminho de IA foi com dublê).
