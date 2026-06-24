# Guia: Conectar o Foocci ao Google (Meu Negócio + Analytics)

> Este guia é para a **equipe Foocci** fazer **uma única vez**. Depois disso, qualquer
> lojista conecta sozinho com 1 clique. Tempo estimado: 25-35 minutos.
>
> O que isto desbloqueia: **Google Meu Negócio** (puxa as avaliações/notas) e
> **Google Analytics** (puxa o tráfego das páginas do site).

---

## Antes de começar, tenha em mãos
- Uma conta Google (pode ser a sua — ela só cria o "projeto", não aparece pro cliente).
- Acesso ao **Railway** (configurações do servidor Foocci).
- 25-35 minutos.

---

## PARTE 1 — Criar o projeto no Google Cloud

1. Acesse **https://console.cloud.google.com** e faça login.
2. No topo, ao lado do logo "Google Cloud", clique no seletor de projeto → **Novo projeto**.
3. Nome: `Foocci Integrações` → **Criar**.
4. Aguarde alguns segundos e selecione o projeto recém-criado no seletor do topo.

---

## PARTE 2 — Ativar as APIs necessárias

No menu de busca do topo, procure e ative cada uma destas (clique em **Ativar**):

1. **Business Profile API** (Google Meu Negócio — avaliações)
2. **Google Analytics Data API** (métricas/tráfego)
3. **Google Analytics Admin API** (listar os sites do Analytics)

> Para cada uma: busque o nome → clique no resultado → botão **Ativar**.

---

## PARTE 3 — Configurar a Tela de Consentimento

É a telinha que o lojista vê ao clicar "Conectar Google" ("o app Foocci quer acessar…").

1. Menu lateral → **APIs e serviços** → **Tela de permissão OAuth**.
2. Tipo de usuário: **Externo** → **Criar**.
3. Preencha:
   - Nome do app: `Foocci`
   - E-mail de suporte: seu e-mail
   - Logo (opcional, mas recomendado para passar confiança)
   - Domínio: `foocci.com.br`
   - E-mail do desenvolvedor: seu e-mail
4. **Salvar e continuar**.
5. Em **Escopos**, clique **Adicionar escopos** e inclua:
   - `.../auth/business.manage`
   - `.../auth/analytics.readonly`
   - `openid`, `email`
6. **Salvar e continuar** até o final.

> ⚠️ Enquanto o app estiver "em teste", só e-mails que você adicionar como **usuários de teste**
> conseguem conectar. Para liberar pra todos os clientes, é preciso **publicar** o app (a Google
> pode pedir verificação dos escopos sensíveis — é um processo dela, normal, todos passam).

---

## PARTE 4 — Criar as credenciais (as "chaves")

1. Menu → **APIs e serviços** → **Credenciais**.
2. **Criar credenciais** → **ID do cliente OAuth**.
3. Tipo de aplicativo: **Aplicativo da Web**.
4. Nome: `Foocci Web`.
5. Em **URIs de redirecionamento autorizados**, adicione EXATAMENTE estas duas:
   - `https://foocci.com.br/api/integrations/google/oauth/callback`
   - `https://foocci.com.br/api/auth/callback/google`
6. **Criar**.
7. Aparece uma janela com **ID do cliente** e **Chave secreta do cliente**. Copie os dois.

> - ID do cliente → vai virar `GOOGLE_OAUTH_CLIENT_ID`
> - Chave secreta → vai virar `GOOGLE_OAUTH_CLIENT_SECRET`

---

## PARTE 5 — Colocar os valores no Railway

No Railway → projeto **FOOCCI** → aba **Variables**, adicione:

```
GOOGLE_OAUTH_CLIENT_ID=<o ID do cliente da Parte 4>
GOOGLE_OAUTH_CLIENT_SECRET=<a chave secreta da Parte 4>
GOOGLE_INTEGRATION_ENABLED=true
FOOCCI_BASE_URL=https://foocci.com.br
```

Salve e faça **Redeploy**.

---

## PARTE 6 — Conferir

Depois do redeploy:
1. Entre no Foocci → **Integrações** → card **Google**.
2. O botão **Conectar Google** deve ficar ativo.
3. Clique → deve abrir o login do Google e a tela de permissões.

✅ A partir daqui, **qualquer lojista** conecta sozinho: clica em Conectar Google, faz login,
marca as caixas de permissão, e o Foocci já puxa as avaliações do Meu Negócio e as métricas
do Analytics automaticamente. Sem mais nenhum passo técnico.

---

## Observação sobre as avaliações (Meu Negócio)
A API de avaliações do Google (versão antiga, "v4") exige uma aprovação extra da Google por
projeto. **Conexão, seleção de local e Analytics funcionam sem isso.** As avaliações aparecem
assim que a Google liberar — o Foocci já mostra um aviso amigável nesse meio-tempo e não quebra.
