# Raio-X do WhatsApp — 04/08/2026

> Pedido do CEO: *"ter certeza que não temos mais nenhum resquício da Evolution, e
> que o único aplicativo de WhatsApp que temos hoje é o da Meta"*.
>
> Auditoria feita pelo Diretor com verificação direta no código. O que **não** foi
> possível provar daqui está dito como não provado — não como aprovado.

---

## Veredito

| Pergunta do CEO | Resposta | Como sei |
|---|---|---|
| Sobrou resquício da Evolution que **executa**? | **NÃO** | zero imports, zero módulos, zero rotas, zero tabelas, zero variáveis lidas |
| O WhatsApp sai por um **único** aplicativo Meta? | **SIM** | existe uma única implementação de envio e um único webhook de entrada |
| Existe biblioteca de WhatsApp **não oficial** instalada? | **NÃO** | `package.json` não tem baileys, whatsapp-web.js, venom nem wppconnect |

**Verificação:** `npx tsc --noEmit` limpo · 4.755 de 4.756 testes verdes (a única
falha é o timeout de 5s em `quality/noSideEffects`, confirmado idêntico na base,
anterior a este trabalho e registrado em `docs/pendencias.md`).

---

## Todo caminho de WhatsApp que existe hoje

**Sai por aqui, e só por aqui:**

| Caminho | Arquivo |
|---|---|
| Envio (texto, template, mídia) | `src/services/whatsapp/providers/MetaWhatsAppCloudProvider.ts` |
| Porta única de saída | `src/services/whatsapp/WhatsAppMessagingService.ts` |
| Roteador (existe por compatibilidade; devolve sempre a Meta) | `src/services/whatsapp/activeProvider.ts` |
| Canal do Build OS (número dedicado, mesmo aplicativo) | `src/services/buildos/BuildOsMetaChannel.ts` |
| Canal de suporte | `src/services/support/SupportWhatsAppService.ts` |

**Entra por aqui, e só por aqui:**

| Caminho | Arquivo |
|---|---|
| Webhook de WhatsApp | `src/app/api/webhooks/meta/whatsapp/route.ts` |
| Webhook de Instagram (mesmo aplicativo) | `src/app/api/webhooks/instagram/route.ts` |

`src/services/whatsapp/providers/` contém **uma única** implementação de provedor.
Não há segunda para escolher — nem por configuração, nem por variável de
ambiente, nem por campo de banco, nem por reserva em caso de erro.

---

## O aplicativo é um só

As credenciais resolvem por `MetaAppCredentialsService`, que lê o banco e cai para
o ambiente (`META_APP_ID` / `META_APP_SECRET`, com `FACEBOOK_APP_*` como nome
alternativo do **mesmo** par). O OAuth do Instagram
(`src/services/instagram/metaOAuth.ts`) usa **exatamente essas variáveis** — não
existe um segundo App ID em lugar nenhum do código.

Isso confirma o que já estava registrado em `docs/decisoes.md`: **um aplicativo,
dois canais.** E carrega a consequência que o CEO precisa ter em mente — o que
derruba um, derruba o outro. É o caso vivo hoje: o token do Instagram expirou em
03/08 e a Página do Facebook não está vinculada; o WhatsApp segue de pé porque usa
credencial de número própria, mas **qualquer problema no nível do aplicativo**
(permissão negada, revisão reprovada, segredo rotacionado) derruba os dois juntos.

### A chave que poderia emudecer tudo — e por que não emudece

`META_WHATSAPP_ENABLED` (`src/services/whatsapp/metaFlag.ts`) era o interruptor da
época em que a Meta era a novidade opcional. Com canal único, uma flag capaz de
desligá-lo seria um botão de mudez.

**Verificado: ela não alcança o envio nem o recebimento.** Hoje ela gateia apenas
telas e rotas de configuração — conectar, gerenciar modelos, simular, status. Se
alguém a desligar, o sistema **continua enviando e recebendo**; o que quebra é o
lojista conseguir conectar um número novo ou mexer em modelos. É degradação
visível, não silêncio.

---

## O que sobrou com o nome "Evolution", e por que pode ficar

Nem toda menção é resquício. Separando:

| Tipo | Fica? | Por quê |
|---|---|---|
| Comentário explicando **o que saiu e por quê** | **fica** | é a memória que impede alguém reintroduzir por engano |
| `"evolution"` na lista de imports **proibidos** (`quality/noSideEffects.test.ts`) | **fica** | é proteção: barra reintrodução |
| Categorias `EVOLUTION_*` em classificação de erro | **fica** | linhas antigas no banco carregam esses códigos; parar de lê-las esconderia histórico |
| Rótulo `NO_EVOLUTION_CONFIG` no mapa de mensagens da tela | **fica** | execuções antigas usam esse motivo; sem ele a tela mostraria código cru |
| Nome de migração `20260804220000_remove_evolution` | **fica** | é o registro da própria remoção |

**Código que executava e foi removido nesta auditoria:**

- `src/app/api/admin/preflight/route.ts` lia `EVOLUTION_DEFAULT_URL` /
  `EVOLUTION_BASE_URL` e dava **PASS** ao achar uma URL órfã no ambiente — o
  preflight aprovava com base num provedor que não existe. Trocado por checagem
  das credenciais do aplicativo Meta.
- `scripts/evolution-railway-health-check.sh` — script de saúde de um serviço
  aposentado. Apagado.
- `HANDOFF-painel-e-evolution.md` — documento órfão na raiz. Apagado.
- **O manual do lojista** (`scripts/manual-v01-content.mjs` e
  `src/services/manual/manualV01Content.ts`) mandava o restaurante *"usar Evolution
  API v2.3.7+"*, apontava o webhook para `/api/webhooks/evolution` e prometia tela
  de QR. Isso é conteúdo que chega no cliente. Reescrito para a Meta.
- Três workflows de CI descreviam o teto antigo ("Evolution Web: 5/run"). Corrigidos.

---

## O que este raio-x NÃO prova

Honestidade sobre os limites, para ninguém ler certeza onde não há:

1. **O estado de produção.** Tudo aqui é verificação de código. Quantos
   restaurantes estão de fato `CONNECTED` na Meta, e se algum ficou sem canal, só
   uma consulta ao banco responde.
2. **O serviço `evolution-api` no Railway ainda está de pé.** Está marcado para
   remoção, mas o Railway exige verificação em duas etapas — que não funciona por
   API. Depende de um clique do CEO no painel. Enquanto isso ele consome memória
   sem tráfego nenhum.
3. **Duas variáveis órfãs** (`EVOLUTION_DEFAULT_API_KEY`, `EVOLUTION_DEFAULT_URL`)
   seguem no ambiente do serviço FOOCCI no Railway. **Nenhum código as lê** — mas
   credencial de serviço aposentado parada no ambiente é superfície de ataque sem
   dono, e devem sair.
4. **A migração que apaga o banco ainda não rodou.** `EvolutionConfig` e
   `EvolutionWebhookEventLog` continuam existindo em produção até o merge. A
   migração é irreversível e está comentada dizendo exatamente o que destrói.

---

## Aprendizado que vale além deste caso

**Varredura de extração precisa incluir os diretórios que o type-check ignora.**
`tsconfig.json` exclui `scripts/`, e `.github/workflows/` nunca passou por
compilador nenhum. Foi exatamente ali que sobreviveram: dois scripts chamando uma
tabela apagada, sete workflows lendo um campo renomeado, e o manual do lojista
ensinando a instalar o provedor que acabara de ser eliminado. `tsc` limpo e testes
verdes **não** provam extração completa — provam que o que o compilador enxerga
está de pé.
