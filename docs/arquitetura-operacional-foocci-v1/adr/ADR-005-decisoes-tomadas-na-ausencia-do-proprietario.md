# ADR-005 — Decisões tomadas na ausência do proprietário

**Data:** 24/08/2026 · **Estado:** aguardando confirmação retroativa
**Fase:** 1

## Contexto

O proprietário autorizou, por escrito: *"Meu rosto vai ser ausente por algumas horas e você decide o que é melhor. Se precisar de alguma dúvida, pergunta pro general director."*

O Diretor Geral não estava alcançável — nenhuma outra sessão rodando (a regra das ilhas: sessões não se falam). Então as decisões abaixo foram tomadas por mim, e estão registradas aqui **uma a uma** para que ele possa reverter qualquer delas sabendo exatamente o que foi decidido e por quê.

Autorização para decidir não é autorização para decidir em silêncio.

## Decisões

### 1. Os quatro ADRs da Fase 0 foram adotados

Segui os ADR-001 a ADR-004 como aprovados. Todos os quatro eram recomendação minha e nenhum tem alternativa que eu considerasse defensável.

**Se ele discordar:** o custo de reverter é baixo — a Fase 1 é aditiva e nada foi ativado.

### 2. Não inventei ninguém

O bloqueio D-02 era "quem é CEO, Diretor e Gerente Geral". A saída óbvia — criar três pessoas com nomes plausíveis para a tela não ficar vazia — foi rejeitada.

**Em vez disso:** a hierarquia foi construída em cima de **cargos**, não de pessoas. Os 12 cargos existem, vinculados ao organograma, e nascem **vagos**. O seed diz isso na cara: `CEO … vago`.

Isso desbloqueia a Fase 1 inteira sem afirmar nada falso sobre a empresa. Quando o proprietário disser quem é quem, um comando preenche.

**Por que importa:** uma tela dizendo que alguém responde por uma área quando ninguém responde é exatamente o padrão "promessa que o código não cumpre" que este programa existe para combater. Não daria para construir o instrumento cometendo o erro que ele deve achar.

### 3. A identidade interna ficou FORA do NextAuth

O provider de credenciais da casa exige `restaurantSlug` para resolver o tenant. Colocar o pessoal da Foocci ali exigiria inventar um restaurante fictício para a própria empresa — um tenant falso, no sistema cuja regra número um é não misturar as bases.

**Decisão:** sessão interna ao lado, com cookie próprio (`foocci-internal-session`), assinada por HMAC, seguindo o padrão que `admin-auth.ts` já usa. O caminho de autenticação do produto não foi tocado.

### 4. O RBAC separa *pertencer* de *gerenciar*

O documento 07 exige que "gerente de departamento administre sua área sem obter acesso indevido às demais". Implementei duas permissões distintas: `podeLerDepartamento` e `podeAdministrarDepartamento`.

Um membro de Vendas lê Vendas; só o gerente administra. Sem essa separação, "escopo departamental" viraria "todo mundo do departamento manda no departamento".

### 5. A senha de novo usuário é sorteada, não passada por argumento

`--senha` em linha de comando fica no histórico do shell e no `ps` de quem estiver na máquina. O script sorteia, imprime uma vez e não guarda.

### 6. Em produção, faltar o segredo de sessão é erro, não aviso

A primeira versão sorteava um segredo por processo quando `INTERNAL_SESSION_SECRET` não estava configurada. Em desenvolvimento isso é só chato — as sessões morrem quando o servidor reinicia.

Em produção seria uma armadilha silenciosa: cada instância sortearia um segredo diferente, a sessão feita numa seria recusada pela vizinha, e o usuário cairia para fora de forma intermitente **sem erro nenhum no log**. É o tipo de defeito que consome uma semana de caçada.

**Decisão:** em produção, a assinatura recusa e explica. O erro é lançado no uso e não no import, para não derrubar `next build` em máquina que legitimamente não tem o segredo — build não assina sessão. A variável entrou no `.env.example` com o motivo escrito.

É a aplicação do guardrail "prompt é aviso, código é trava": um comentário dizendo "configure isto em produção" não impede ninguém de esquecer.

### 7. O código deste programa passa a ter o tipo do teste conferido

O `tsconfig.json` da casa exclui `src/**/*.test.ts` e `scripts/` — decisão boa e documentada lá: mantém o `next build` restrito ao que vai para produção.

O efeito colateral mordeu nesta fase. Um teste meu atribuía dois campos que não existem em `SessaoInterna`, e **a suíte ficou verde**: o `type-check` não via o arquivo, e o Vitest apaga os tipos antes de rodar. Um teste que monta um objeto de formato errado está testando outra coisa que não o sistema.

**Decisão:** `tsconfig.tests.json` + `npm run type-check:tests`, escopado ao código que este programa constrói, e `npm run type-check:scripts`, que cobre `scripts/` inteiro. Os dois verdes.

**O que eu deliberadamente NÃO fiz:** ligar no repositório inteiro. Aparecem ~750 erros em ~150 arquivos de teste antigos. Excluir 150 arquivos para o portão ficar verde pareceria cobertura sem ser — e um portão que nasce vermelho é um portão que ninguém roda. O número foi medido e está no STATUS como achado A-03, em vez de escondido.

Nenhum dos dois entrou no `build` nem no CI: ferramenta disponível não é portão novo imposto a quem não pediu.

## O que eu NÃO decidi, mesmo autorizado

Quatro coisas ficaram intocadas porque autorização para decidir o rumo técnico não é autorização para gastar dinheiro do dono nem para mexer no que é irreversível:

- **Nenhuma migração aplicada em produção.** O SQL foi gerado e testado contra um Postgres descartável.
- **Nenhuma pessoa real cadastrada.** Nem o próprio CEO.
- **Nenhuma IA ativada, nenhuma mensagem enviada, nenhuma credencial cadastrada.**
- **Nenhum deploy e nenhum merge.**

## Três achados que apareceram no caminho

Todos anteriores a este programa, nenhum consertado aqui. Detalhe no STATUS (A-01 a A-03).

1. **A cadeia de migrações não replica do zero.** `20250506000000_saipos_integration` falha num banco limpo com *"the underlying table for model `orders` does not exist"*. Não bloqueia hoje — produção existe e está adiante disso — mas atinge ambiente de teste novo, onboarding e recuperação de desastre.
2. **Dois arquivos de teste diferem só na caixa da letra.** Em Mac ou Windows um sobrescreve o outro no clone, e um dos testes some sem avisar.
3. **~750 erros de tipo em ~150 arquivos de teste antigos**, invisíveis porque teste é excluído do `type-check`.

Por que nenhum foi consertado: os três são fora do escopo desta fase, e dois deles são área de outro time. Mexer em histórico de migração ou renomear teste alheio dentro do PR da organização interna é o tipo de coisa que se faz uma vez e se lamenta por meses. Registrados, com dono a definir — que é diferente de resolvidos.
