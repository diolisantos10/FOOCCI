# Build OS / Prompt Relay — Bootstrap & Verificação por Script

> **Sem Railway, sem cliques repetitivos.** Toda a configuração de desenvolvimento
> do Build OS pode ser feita por scripts internos seguros. As variáveis de
> ambiente continuam existindo apenas como **bootstrap/emergência** — a config
> normal vive no banco e pode ser inicializada por CLI.

Escopo atual (Priority 1.1–1.4.1): captação de comando via WhatsApp, registro de
projetos, classificação determinística, rascunho de prompt + loop de
confirmação, e configuração no admin/banco. **Não há** relay para Claude/GitHub,
**não há** geração por LLM e **nada é executado**.

---

## 1. Bootstrap (configurar sem UI/Railway)

Habilita o Build OS no banco, garante o projeto **Foocci** (ativo + default) e
cria/atualiza **um operador autorizado**. Idempotente e aditivo — nunca apaga dados.

```bash
# Aplicar (grava no banco)
BUILD_OS_BOOTSTRAP_PHONE="+5511999999999" \
BUILD_OS_BOOTSTRAP_NAME="Diego" \
npm run buildos:bootstrap

# Pré-visualizar sem gravar
npm run buildos:bootstrap -- --dry-run
```

Entradas (env ou `--flag=valor`):

| Variável | CLI | Obrigatório | Default |
|---|---|---|---|
| `BUILD_OS_BOOTSTRAP_PHONE` | `--phone=` | **Sim** | — |
| `BUILD_OS_BOOTSTRAP_NAME`  | `--name=`  | Não | `Diego` |
| `BUILD_OS_BOOTSTRAP_ROLE`  | `--role=`  | Não | `OWNER` |

Se o telefone faltar, o script **falha com mensagem clara** (não adivinha). O
número é normalizado com a **mesma lógica do runtime** (`+55` + DDD + 9); as
variações do 9º dígito são reconhecidas na autorização.

**Saída (dry-run):**

```
🛠️  Build OS bootstrap
   Operador:   Diego (OWNER)
   Telefone:   +5511999999999  →  +5511999999999 (normalizado)
   Modo:       DRY-RUN (não grava nada)
   Ações planejadas:
     • Garantir BuildOSConfig com isEnabled=true (cria se não existir; preserva o resto).
     • Semear/atualizar o projeto Foocci (ativo + default) — idempotente.
     • Criar/atualizar operador autorizado "Diego" (+5511999999999), ativo.
✅ DRY-RUN concluído — nenhuma escrita no banco.
```

---

## 2. Verificar

Confere config + operador + projeto + classificador + geração de prompt. Apenas
leitura no banco; **não chama relay**. Sai com código ≠ 0 se algum check falhar.

```bash
npm run buildos:verify
```

Checks:

1. `BuildOSConfig` existe e está habilitado.
2. ≥ 1 operador autorizado **ativo**.
3. Projeto **Foocci** existe, ativo e default.
4. Classificador funciona em `"/build Faz um RAIO-X do checkout Pix. Não implemente nada ainda."` → `AUDIT / AUDIT_ONLY / payment / HIGH`.
5. Geração de rascunho de prompt funciona para o comando simulado **e não chama relay**.

---

## 3. Simular um comando (sem WhatsApp real)

Exercita o fluxo 1.1–1.4 inteiro **sem mensagem real e sem enviar nada**
(no-send por padrão): cria `BuildCommand` → resolve projeto → classifica → gera
rascunho de prompt → `AWAITING_CONFIRMATION`. **Não** envia a Claude/GitHub e
**não** executa nada.

```bash
npm run buildos:test-command -- \
  --phone="+5511999999999" \
  --message="/build Faz um RAIO-X do checkout Pix. Não implemente nada ainda."
```

Saída (exemplo, com banco configurado):

```
✅ Comando simulado criado:
   ID:        <cuid> (#ABC123)
   Projeto:   (resolvido)
   Status:    AWAITING_CONFIRMATION
   Prompt:    versão 1
   Classif.:  task=AUDIT, intent=AUDIT_ONLY, area=payment, risk=HIGH
   (Nenhuma mensagem enviada · nenhum relay para Claude/GitHub · nada executado.)
```

> Pré-requisito: o telefone precisa estar autorizado (rode o bootstrap antes).

---

## 4. Testar com WhatsApp real (mais tarde)

Quando quiser validar o canal real:

1. Garanta `BUILDOS_HARD_DISABLED` **não** está `true`.
2. Rode o **bootstrap** (ou ative pela UI em `/admin/build-os → Configuração`).
3. Do celular autorizado, envie ao WhatsApp do restaurante:
   `\/build Teste de comando interno do Build OS.`
4. Espere a confirmação no WhatsApp e veja o comando na aba **Comandos**.
5. Responda `ENVIAR` / `CANCELAR` / `AJUSTAR: [correção]` / `STATUS`.

---

## 5. Precedência (resumo)

- **Ativação:** `BUILDOS_HARD_DISABLED=true` (sempre OFF) → **config do banco** → `BUILDOS_ENABLED` (bootstrap).
- **Operador:** operador **ativo no banco** → fallback `BUILD_OS_AUTHORIZED_PHONES` (quando não há operadores ativos no banco **ou** a config permite).

> **Railway / UI manual não são necessários** para o bootstrap normal de
> desenvolvimento — use os scripts acima.

---

## Segurança

- Scripts são idempotentes, aditivos e **nunca apagam** dados.
- **Nunca** imprimem segredos nem strings de conexão.
- A lista de telefones nunca é exposta publicamente (rotas são admin-only).
- Sem relay para Claude/GitHub, sem LLM, sem execução de código.
- Runtime do Waiter, `/pedido`, checkout, pagamentos e CRM **não são tocados**.
