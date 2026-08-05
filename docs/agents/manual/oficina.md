# Oficina — manual, treinamentos e onboarding

> Append-only. O agente escreve aqui; **quem promove para a vitrine é o Diretor**.

---

## 2026-08-05 · P0 do microfone do suporte + anexos no chat

**Pedido:** o CEO mandou print do Assistente Foocci (aba Diagnóstico, 19:47) com
**"Não consegui ler o áudio."** em vermelho, e apontou que o lojista também não
tem como anexar foto, print nem PDF.

### Onde a frase nascia — evidência, não palpite

Um único ponto no repositório inteiro montava aquele texto:
`src/app/api/help/transcribe/route.ts:30` (versão anterior) — o `catch` do
`req.formData()`. O cliente (`useVoiceInput.transcribeErrorMessage`) repassava a
frase do servidor sem alterar, então o que o CEO viu veio literalmente de lá.

Reproduzi as seis saídas possíveis da rota chamando o handler direto:

| cenário | antes |
|---|---|
| multipart bem formado | 200 |
| chave ausente | 422 "Não consegui entender o áudio. Pode digitar?" |
| provedor lança | 500 "Falhou ao transcrever." |
| **corpo não-multipart** | **400 "Não consegui ler o áudio."** |
| **multipart quebrado** | **400 "Não consegui ler o áudio."** |
| blob de 0 byte | 400 "Nenhum áudio recebido." |

**O que a produção respondeu (só leitura):** `/api/health` devolveu
`commitSha 104ece92…` — o mesmo commit da branch padrão — e
`checks.openaiKey: true`. Isso **descarta com evidência** a hipótese de chave
ausente, que era a mais provável à primeira vista. Não precisei de nenhuma
variável do Railway.

### As duas causas reais encontradas

1. **O iPhone.** `useVoiceInput` carimbava `new Blob(chunks, {type:"audio/webm"})`
   e o nome `.webm` em **toda** gravação. O Safari do iPhone grava **MPEG-4**, e
   o Whisper decide o formato **pela extensão do nome**. Todo ditado feito de
   iPhone chegava rotulado errado e voltava recusado. Isso é reprodutível por
   inspeção e está preso em teste (`useVoiceInput.test.ts`).
2. **O erro sem evidência.** A frase não dizia o próximo passo, não deixava
   rastro no log (nenhum `console` naquele caminho) e **a gravação sumia junto**.
   Três defeitos num aviso de sete palavras.

### O que mudou

- `TranscriptionAdapter` deixou de devolver string vazia para toda falha —
  `transcribeAudioResult` classifica em 9 códigos e guarda o recado do provedor.
  `transcribeAudio` foi mantido com o contrato antigo para não quebrar os três
  chamadores que já existiam.
- A rota passou a: resgatar corpo `audio/*` fora do multipart; travar tamanho e
  extensão **no servidor**; devolver `{error, code, retriable}`; e logar a causa
  com tamanho/tipo/extensão/duração — **nunca o texto transcrito**.
- O gancho do microfone escolhe o formato por `MediaRecorder.isTypeSupported` e
  nomeia pelo `rec.mimeType` real; e **guarda o blob** em `pendingAudio` até a
  transcrição dar certo. O `VoiceStatus` ganhou "Tentar de novo", "Mandar o
  áudio assim mesmo" e um player para ouvir o que foi gravado.

### Anexos

Modelo `HelpAttachment` novo, com o binário **no Postgres**. A razão é
verificável: `src/lib/s3.ts` grava com `ACL: "public-read"` e `/api/media/[id]`
não pede sessão nenhuma — servem foto de cardápio. Print de suporte tem dado de
cliente final. A validação de tipo lê os **primeiros bytes** (`sniffKind`), não o
`file.type` do navegador; HEIC de iPhone entra, executável disfarçado de PNG não.

### O que NÃO fiz, e por quê

- **A aba Diagnóstico (`SupportTechChat`) não ganhou anexo.** Ela herdou a
  correção do microfone inteira (usa o mesmo gancho), mas não tem conversa
  própria para segurar um arquivo — o anexo ficaria órfão. O chat de suporte com
  anexo é a aba Assistente. É decisão de produto, para o Diretor.
- **Não mexi no texto do fallback do assistente.** `GAP_MARKERS` procura
  *"não tenho essa informação"*, *"falar com a food"* e *"não consegui acessar o
  assistente"* — nenhuma dessas frases foi tocada. As frases que mudei são só do
  ditado por voz e não entram na métrica de lacuna.
- **Não confirmei o gatilho exato do `BODY_UNREADABLE` em produção.** Reproduzi
  a saída, não a causa da rede. O caminho agora é repetível e logado com
  evidência, então a próxima ocorrência se explica sozinha.

### Conferido

`npx tsc --noEmit` limpo · `npx vitest run` 439 arquivos / 5658 testes verdes ·
375/768/1280 com captura, sem rolagem lateral e sem erro de página.
