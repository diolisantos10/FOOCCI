# Foocci — Manual Operacional do Piloto
## Guia de Lançamento do Primeiro Restaurante Real

**Versão:** 1.0  
**Data:** Maio 2026  
**Classificação:** Interno — Uso da Equipe Foocci  

---

## Índice

1. [Propósito](#1-propósito)
2. [Filosofia do piloto](#2-filosofia-do-piloto)
3. [Variáveis de ambiente necessárias](#3-variáveis-de-ambiente-necessárias)
4. [Verificações técnicas pré-lançamento](#4-verificações-técnicas-pré-lançamento)
5. [Admin global: criar restaurante](#5-admin-global-criar-restaurante)
6. [Login do owner e primeiro acesso](#6-login-do-owner-e-primeiro-acesso)
7. [Assistente de configuração (Onboarding Wizard)](#7-assistente-de-configuração-onboarding-wizard)
8. [Checklist de dados da loja](#8-checklist-de-dados-da-loja)
9. [Checklist de entrega e retirada](#9-checklist-de-entrega-e-retirada)
10. [Modo seguro de pagamento](#10-modo-seguro-de-pagamento)
11. [Checklist de cardápio](#11-checklist-de-cardápio)
12. [Configuração do menu QR](#12-configuração-do-menu-qr)
13. [Configuração do link de delivery](#13-configuração-do-link-de-delivery)
14. [Configuração segura do WhatsApp receptcionista](#14-configuração-segura-do-whatsapp-recepcionista)
15. [Configuração de tracking de canais](#15-configuração-de-tracking-de-canais)
16. [Verificações iniciais do CRM](#16-verificações-iniciais-do-crm)
17. [Verificações iniciais de Analytics](#17-verificações-iniciais-de-analytics)
18. [Importação de dados históricos](#18-importação-de-dados-históricos)
19. [Pré-piloto (Preflight)](#19-pré-piloto-preflight)
20. [Script do primeiro pedido de teste](#20-script-do-primeiro-pedido-de-teste)
21. [Validação pós-pedido](#21-validação-pós-pedido)
22. [Critérios de go-live](#22-critérios-de-go-live)
23. [Funcionalidades a manter desativadas no piloto](#23-funcionalidades-a-manter-desativadas-no-piloto)
24. [Solução de problemas comuns](#24-solução-de-problemas-comuns)
25. [Assinatura de prontidão para o piloto](#25-assinatura-de-prontidão-para-o-piloto)

---

## 1. Propósito

Este manual existe para garantir que o lançamento do primeiro restaurante real na plataforma Foocci seja seguro, controlado e rastreável.

O Foocci foi projetado para ser ativado de forma progressiva. Na fase de piloto, o objetivo é confirmar que os fluxos essenciais funcionam em produção — recebimento de pedidos, operação pelo owner, coleta de dados — sem expor o restaurante a riscos desnecessários.

**O piloto parte do princípio de modo seguro:**

- Pagamento somente na entrega ou retirada — sem pagamento online até validação do sandbox
- WhatsApp em modo recepcionista apenas — sem IA de pedidos
- Sem envios em massa de CRM até que o WhatsApp esteja testado
- Sem promoções automáticas até revisão completa
- Sem importação de base histórica completa antes de validar com CSV de teste

Qualquer desvio deste modo seguro deve ser documentado e autorizado antes de ser ativado.

---

## 2. Filosofia do Piloto

O objetivo do piloto **não é ativar todos os módulos no dia um.**

O objetivo é:

1. O restaurante consegue receber pedidos pelos canais `/pedido` e `/qr`
2. O owner consegue operar os pedidos pelo painel
3. Os clientes conseguem usar o cardápio digital sem erros
4. O CRM começa a coletar dados de clientes reais
5. O Analytics começa a medir pedidos e receita
6. O WhatsApp consegue receber e triar mensagens sem automação de risco

Cada módulo adicional (campanhas, IA de pedidos, pagamento online, importação) é uma camada que deve ser ativada somente após o núcleo estar estável.

**A pergunta certa no piloto é:**  
*"Esse restaurante consegue funcionar com segurança?"*  
e não  
*"Todos os recursos estão ativos?"*

---

## 3. Variáveis de Ambiente Necessárias

Todas as variáveis devem estar configuradas na plataforma de deploy (Railway ou equivalente) **antes** de qualquer migração ou acesso.

Nunca inclua valores reais de segredos em documentos, repositórios ou mensagens.

### Obrigatórias antes do piloto

| Variável | Finalidade |
|---|---|
| `DATABASE_URL` | Conexão com o banco de dados PostgreSQL |
| `NEXTAUTH_SECRET` | Assinatura de sessões de usuário — gerar valor aleatório longo |
| `ADMIN_SECRET` | Protege a área global de admin — gerar valor aleatório longo |
| `ENCRYPTION_KEY` | Criptografia de credenciais de integração armazenadas no banco |
| `NEXT_PUBLIC_APP_URL` | URL pública da aplicação — ex: `https://seudominio.com` — usado em todos os links gerados |

### Necessárias somente para pagamento online

| Variável | Finalidade |
|---|---|
| `MERCADOPAGO_ACCESS_TOKEN` | Integração com MercadoPago — omitir se não testado |
| `STONE_CLIENT_ID` | Integração com Stone — omitir se não testado |
| `STONE_CLIENT_SECRET` | Integração com Stone — omitir se não testado |

> ⚠️ **Atenção:** se `STONE_CLIENT_ID` estiver ausente, o sistema retorna URLs de teste fictícias em vez de bloquear. Não configure Stone sem credenciais reais de produção validadas.

### Necessárias somente para WhatsApp via Evolution API

| Variável | Finalidade |
|---|---|
| `EVOLUTION_DEFAULT_URL` ou `EVOLUTION_BASE_URL` | URL base do servidor Evolution API |

> A chave de API e o nome da instância são configurados por restaurante no painel, não como variáveis de ambiente globais.

---

## 4. Verificações Técnicas Pré-lançamento

Executar antes de criar qualquer restaurante real.

- [ ] Deploy no Railway (ou equivalente) apontando para o branch correto de produção
- [ ] Build da aplicação concluído sem erros — verificar logs do deploy
- [ ] `prisma migrate deploy` executado com sucesso — verificar logs do deploy
- [ ] Endpoint `/api/health` retorna status 200 (se existir) ou aplicação carrega sem erro
- [ ] Painel admin abre em `/admin` e solicita login — confirmar que `ADMIN_SECRET` funciona
- [ ] `/admin/preflight` carrega e executa checks automaticamente
- [ ] `NEXT_PUBLIC_APP_URL` aponta para a URL real de produção — links de delivery e QR devem estar corretos
- [ ] Banco de dados acessível — Preflight deve mostrar "Conexão OK"
- [ ] Migrações aplicadas — Preflight deve mostrar número de migrações > 0 e "Nenhuma migração com falha"

---

## 5. Admin Global: Criar Restaurante

### Pré-requisito
Ter o `ADMIN_SECRET` configurado. Acesso via `/admin/login`.

### Passo a passo

1. Abrir `/admin/login` e autenticar com o secret de admin
2. Navegar para **Restaurantes** no menu lateral
3. Clicar em **+ Novo restaurante**
4. Preencher o formulário:
   - **Nome do restaurante:** nome comercial completo — ex: "Pizzaria do João"
   - **Slug:** gerado automaticamente — verificar se é amigável e único — ex: `pizzaria-do-joao`
   - **E-mail:** e-mail comercial do restaurante (opcional no cadastro, mas importante para comunicações)
   - **Telefone:** telefone principal — pode ser preenchido depois no Onboarding
   - **Nome do responsável:** nome completo do owner
   - **E-mail de login do owner:** e-mail que será usado para fazer login no painel
   - **Senha temporária:** usar o botão "Gerar" — copiar e guardar com segurança
5. Clicar em **Criar restaurante**

### Após a criação

O painel exibe as credenciais. **Copiar e guardar antes de fechar:**

| Item | Ação |
|---|---|
| E-mail do owner | Guardar para envio ao responsável |
| Senha temporária | Guardar para envio ao responsável |
| Link do painel | `[APP_URL]/login` |
| Link de delivery | `[APP_URL]/pedido/[slug]` |
| Link QR | `[APP_URL]/qr/[slug]` |

O painel exibe também um aviso de **Modo Piloto Seguro** confirmando que os padrões seguros estão ativos:
- WhatsApp em modo recepcionista
- Automações CRM desativadas
- Pagamento online somente se provedor estiver configurado

### Verificar após criação

- Restaurante aparece na lista com status correto
- Badge de Setup mostra "Pendente" (esperado — configuração ainda não preenchida)
- Clicar no ícone de links (🔗) e confirmar que os URLs estão corretos

---

## 6. Login do Owner e Primeiro Acesso

### Passo a passo

1. Enviar ao responsável do restaurante:
   - URL: `[APP_URL]/login`
   - E-mail de login
   - Senha temporária
   - Orientar para trocar a senha no primeiro acesso

2. Owner acessa `/login` e entra com as credenciais

3. **Verificar:** o dashboard deve exibir o card de configuração ("Configure seu restaurante") com o status de prontidão

4. **Não pular o Onboarding.** O card direciona para `/onboarding` — orientar o owner a seguir o fluxo

5. Confirmar que os padrões seguros estão ativos por padrão:
   - WhatsApp: modo Recepcionista (RECEPTIONIST_ONLY)
   - CRM Automações: todas desativadas
   - Pagamento online: bloqueado se sem provedor

---

## 7. Assistente de Configuração (Onboarding Wizard)

Acessado em `/onboarding`. Cada etapa mostra status: **Concluído / Pendente / Atenção / Bloqueado**.

### Etapa 1 — Loja

**O que preencher:**
- Telefone/WhatsApp principal
- CEP, rua, número, bairro, cidade, estado

**Onde configurar:** `/settings/store`

**Status esperado ao concluir:** Concluído (verde)

---

### Etapa 2 — Funcionamento

**O que verificar:**
- Pelo menos um dia da semana com horário de funcionamento ativo
- Horário de abertura e fechamento configurados

**Onde configurar:** `/settings/operation`

**Padrão criado automaticamente:** Segunda a sábado ativos, domingo fechado.  
Ajustar conforme o restaurante real.

**Status esperado ao concluir:** Concluído (verde)

---

### Etapa 3 — Entrega e Retirada

**O que configurar:**
- Delivery habilitado E/OU retirada habilitada
- Se delivery: taxa base, raio ou zonas, tempo estimado
- Se retirada: tempo estimado de preparo/retirada

**Onde configurar:** `/settings/delivery`

**Para o piloto:**  
Se o restaurante só faz retirada, desativar delivery e confirmar que retirada está ativa.  
Não bloquear o piloto por ausência de delivery se retirada for o modelo de negócio.

**Status esperado ao concluir:** Concluído (verde)

---

### Etapa 4 — Pagamentos

**O que verificar:**
- Dinheiro, Pix ou Cartão ativados (pelo menos um)
- Pagamento online: **não ativar no piloto** a menos que sandbox validado

**Onde configurar:** `/settings/payments`

**Padrão criado automaticamente:** Dinheiro, Pix e Cartão todos ativos.  
Confirmar que estão corretos para o modelo do restaurante.

**Status esperado ao concluir:** Concluído (verde)

> ⚠️ Pagamento online (MercadoPago/Stone) só deve ser ativado após teste completo em ambiente de produção com valores reais de sandbox.

---

### Etapa 5 — Cardápio

**O que verificar:**
- Pelo menos 1 categoria ativa
- Pelo menos 1 produto ativo com preço preenchido
- Idealmente: produtos mais pedidos com foto e descrição

**Onde configurar:** `/menu`

**Esta etapa é BLOQUEANTE.** Sem produtos ativos o restaurante não pode receber pedidos.

**Status esperado ao concluir:** Concluído (verde)

---

### Etapa 6 — Canais

**O que verificar:**
- Links de delivery e QR gerados corretamente
- Botões de copiar funcionando
- WhatsApp: telefone configurado (se usar WhatsApp)
- Evolution API: configurada se WhatsApp automático for ativado

**Esta etapa mostra os links públicos.** Ideal para confirmar e copiar antes de enviar ao cliente.

**Status esperado:** Concluído se links OK; Atenção se sem Evolution (aceitável no piloto)

---

### Etapa 7 — Teste Final

**O que fazer:**
- Seguir o checklist de 10 itens (ver Seção 20 deste manual)
- Marcar cada item conforme realiza
- Clicar em "Marcar teste como concluído" após completar todos

**Status após conclusão:** Concluído — restaurante muda para PRONTO_PARA_PILOTO

---

## 8. Checklist de Dados da Loja

Acessar em **Configurações > Loja** (`/settings/store`).

**Campos mínimos obrigatórios:**
- [ ] Nome do restaurante
- [ ] Telefone principal (fixo ou celular)
- [ ] Telefone/WhatsApp de atendimento
- [ ] CEP
- [ ] Rua e número
- [ ] Bairro
- [ ] Cidade e estado

**Campos recomendados para piloto:**
- [ ] Nome do responsável principal
- [ ] E-mail de contato da loja
- [ ] Tipo de cozinha/segmento (ex: Pizza, Hamburguer, Japonesa)

**Campos opcionais — configurar quando disponível:**
- [ ] URL do Google Review (para botão de avaliação no QR)
- [ ] Instagram da loja
- [ ] TikTok da loja
- [ ] Outros canais sociais

**Campos fiscais (não obrigatórios para piloto):**
- CNPJ, razão social, regime tributário — preencher antes de emissão de notas

---

## 9. Checklist de Entrega e Retirada

Acessar em **Configurações > Entrega** (`/settings/delivery`).

**Opções de modo:**

| Modo | Quando usar |
|---|---|
| Simples | Taxa fixa para toda a área de entrega — ideal para piloto |
| Avançado | Múltiplas zonas com taxas diferentes |
| Por distância | Cálculo automático por km — requer coordenadas |

**Para piloto, usar modo Simples:**
- [ ] Delivery habilitado (ou justificar por que está desabilitado)
- [ ] Retirada habilitada (ou justificar)
- [ ] Taxa de entrega preenchida (mesmo que R$0,00)
- [ ] Valor mínimo do pedido (se aplicável)
- [ ] Tempo estimado de entrega em minutos
- [ ] Descrição da área de entrega (bairros atendidos, raio aproximado)
- [ ] Entrega grátis acima de valor X (se o restaurante oferecer)

**Se usar retirada:**
- [ ] Confirmar tempo estimado de preparo

---

## 10. Modo Seguro de Pagamento

### Para o piloto — o que usar

| Método | Recomendado no piloto | Observação |
|---|---|---|
| Dinheiro na entrega/retirada | ✅ Sim | Padrão seguro |
| Pix na entrega/retirada | ✅ Sim | Padrão seguro |
| Cartão na entrega/retirada | ✅ Sim | Padrão seguro |
| Pix automático (link de pagamento) | ⚠️ Somente se testado | Requer MercadoPago ou Stone |
| Cartão online (checkout) | ❌ Não ativar | Somente após sandbox validado |

### Como verificar o modo seguro

1. Abrir `/settings/payments`
2. Confirmar que "Dinheiro", "Pix" e/ou "Cartão" estão marcados como aceitos
3. Se MercadoPago ou Stone aparecer como opção, confirmar que está **desabilitado ou em sandbox**
4. Testar um pedido com "pagamento na entrega" antes de qualquer outra opção

### Aviso crítico

> ⚠️ **Nunca ative pagamento online com clientes reais sem antes realizar ao menos um pedido de teste completo em modo sandbox com confirmação de recebimento real.** O sistema bloqueia `pay_now` automaticamente se não houver credenciais configuradas, mas a configuração incorreta de credenciais pode gerar cobranças indevidas.

---

## 11. Checklist de Cardápio

Acessar em **Cardápio** (`/menu`).

### Mínimo viável para piloto

- [ ] Pelo menos 1 categoria ativa
- [ ] Pelo menos 1 produto ativo com preço preenchido
- [ ] Produtos mais vendidos cadastrados primeiro

### Recomendado para boa experiência

- [ ] Descrição do produto preenchida (o que é, ingredientes principais)
- [ ] Foto do produto (impacta conversão significativamente)
- [ ] Produtos organizados por ordem lógica dentro de cada categoria
- [ ] Categorias com nomes claros (ex: "Lanches", "Bebidas", "Combos")

### Opcional para piloto

- [ ] Variantes (ex: tamanhos P/M/G)
- [ ] Opcionais/adicionais (ex: bordas, molhos)
- [ ] Combos com itens agrupados
- [ ] Etiquetas de destaque

### Verificação final do cardápio

Após cadastrar, abrir `/pedido/[slug]` no celular e confirmar:
- [ ] Categorias aparecem na ordem correta
- [ ] Produtos carregam com foto e preço
- [ ] Fotos não estão quebradas
- [ ] Preços estão corretos

---

## 12. Configuração do Menu QR

O menu QR é acessado em `/qr/[slug]`.

### O que verificar

1. Abrir `/qr/[slug]` no celular (simular cliente)
2. Confirmar que o nome do restaurante aparece no cabeçalho
3. Confirmar que o logo está visível (se configurado em Configurações > Marca)
4. Confirmar que as categorias aparecem corretamente
5. Confirmar que os produtos carregam
6. Confirmar que o botão de avaliação no Google aparece (se `googleReviewUrl` estiver preenchido)
7. Confirmar que os ícones de redes sociais aparecem (se configurados)

### Diferença entre QR e Delivery

| Recurso | `/pedido` (Delivery) | `/qr` (QR Salão) |
|---|---|---|
| Visualizar cardápio | ✅ | ✅ |
| Fazer pedido delivery | ✅ | Depende da configuração |
| Identificação por telefone | ✅ | ✅ |
| Botão de avaliação Google | Não | ✅ (se configurado) |
| Redes sociais | ✅ | ✅ |

### Onde imprimir o QR

Após confirmar que `/qr/[slug]` funciona:
- Gerar QR Code da URL `/qr/[slug]` em qualquer gerador de QR online
- Imprimir em embalagens, mesas, cardápios físicos, banner da loja

---

## 13. Configuração do Link de Delivery

O link de delivery é `/pedido/[slug]`.

### Onde compartilhar

- Bio do Instagram
- Link do WhatsApp Business
- Google Meu Negócio
- iFood / Rappi — campo de site do perfil (não substituir app nativo, mas complementar)
- Sacolinha do Instagram Shopping (se configurada)

### Usar com tracking

Para saber de onde vêm os acessos, usar links rastreáveis (ver Seção 15).  
Não compartilhar o link direto `/pedido/[slug]` sem tracking se quiser medir origem.

### Teste do link

Antes de compartilhar, abrir o link no celular e confirmar:
- [ ] Página carrega sem erro
- [ ] Nome e logo do restaurante aparecem
- [ ] Produtos visíveis com preço
- [ ] É possível identificar por telefone
- [ ] É possível adicionar produto ao carrinho
- [ ] É possível finalizar pedido

---

## 14. Configuração Segura do WhatsApp Recepcionista

### Arquitetura do WhatsApp no Foocci

O WhatsApp no Foocci opera em três camadas:

1. **Recepcionista** (`RECEPTIONIST_ONLY`): saúda o cliente, responde dúvidas básicas, envia link do cardápio. Não vende.
2. **Humano Assistido** (`HUMAN_ASSISTED`): igual ao recepcionista, mas escala para atendente com mais frequência.
3. **IA de Pedidos Experimental** (`AI_ORDERING_EXPERIMENTAL`): agente completo que monta carrinho via WhatsApp. **Não usar no piloto.**

O WhatsApp **não substitui o `/pedido`**. O checkout acontece no link de delivery. O WhatsApp triage e direciona.

### Configuração no piloto

Acessar em **Configurações > WhatsApp** (`/settings/whatsapp`).

- [ ] Modo do agente: **Recepcionista (RECEPTIONIST_ONLY)** — confirmar que está selecionado
- [ ] Mensagem de boas-vindas: revisar e personalizar com o nome do restaurante
- [ ] URL do cardápio: preencher com `[APP_URL]/pedido/[slug]`
- [ ] Mensagem de transferência para atendente: revisar e personalizar

### Configuração da Evolution API (se testar WhatsApp no piloto)

Acessar em **Configurações > Integrações > WhatsApp Business** (ou caminho equivalente).

- [ ] URL do servidor Evolution configurada
- [ ] Chave de API inserida
- [ ] Nome da instância correto
- [ ] Instância conectada (QR Code escaneado pelo WhatsApp do restaurante)
- [ ] Webhook configurado apontando para `[APP_URL]/api/webhooks/evolution`

### Teste de WhatsApp

1. Enviar mensagem de texto para o número do restaurante pelo WhatsApp
2. Confirmar que a mensagem aparece em **Atendimento** (`/atendimento`) no painel
3. Confirmar que a resposta automática é enviada (se agente ativo)
4. Testar transferência para atendente humano
5. Confirmar que atendente humano consegue responder pela plataforma

### Se WhatsApp não for testado no piloto

Deixar Evolution API sem configurar.  
O sistema funciona normalmente sem WhatsApp. O link de delivery não depende do WhatsApp.

---

## 15. Configuração de Tracking de Canais

Acessar em **Canais** (`/canais`).

### Para que serve

Permite saber de qual canal veio cada acesso e pedido:
- "20 pedidos vieram do Instagram esta semana"
- "QR das mesas gerou 15 acessos"
- "Link do WhatsApp teve 8 conversões"

### Criar links rastreáveis para

| Canal | Nome sugerido para o link |
|---|---|
| Instagram Bio | `instagram-bio` |
| WhatsApp Business | `whatsapp` |
| QR Code de Mesa | `qr-mesa` |
| QR Code de Embalagem | `qr-embalagem` |
| Google Meu Negócio | `google` |
| iFood (campo de site) | `ifood` |

### Como criar

1. Acessar `/canais`
2. Clicar em criar novo link
3. Dar um nome descritivo
4. O sistema gera um link rastreável
5. Substituir o link direto `/pedido/[slug]` pelo link rastreável nos canais

---

## 16. Verificações Iniciais do CRM

Acessar em **CRM** (`/crm`).

Após o primeiro pedido de teste, verificar:

- [ ] Cliente aparece na lista de clientes
- [ ] Telefone está normalizado (formato correto)
- [ ] Campo `totalOrders` mostra 1
- [ ] Campo `totalSpend` mostra o valor correto do pedido
- [ ] Histórico de pedidos do cliente mostra o pedido de teste
- [ ] Segmento/tier do cliente foi calculado (ex: Bronze)
- [ ] `hasOptedOut` está como `false` (padrão)

### O que NÃO fazer no CRM do piloto

- **Não enviar campanhas em massa** até que o WhatsApp seja testado
- **Não ativar automações de CRM** até revisar as regras de disparo
- **Não importar base histórica** sem validar primeiro com CSV de teste (ver Seção 18)

---

## 17. Verificações Iniciais de Analytics

Acessar em **Analytics** (`/analytics`).

Após o primeiro pedido de teste, verificar:

- [ ] O pedido aparece nos dados (pode haver delay de processamento — aguardar alguns minutos)
- [ ] Receita do pedido está correta
- [ ] Produto aparece no ranking de produtos
- [ ] Categoria do produto aparece
- [ ] Se o pedido veio de link rastreável: canal aparece na atribuição

### Se Analytics estiver zerado

- Confirmar que o pedido foi concluído (status diferente de rascunho/abandonado)
- Confirmar que o período selecionado no filtro inclui a data do pedido
- Aguardar até 5 minutos para processamento

---

## 18. Importação de Dados Históricos

### Quando importar

Importar dados históricos somente após:

- [ ] Configurações básicas do restaurante completas
- [ ] Cardápio com nomes de produtos revisados (nomes precisam casar com os dados históricos)
- [ ] Um CSV de teste pequeno (10–20 pedidos) validado com sucesso
- [ ] Comportamento de deduplicação verificado (cliente com mesmo telefone não duplica)
- [ ] Datas dos pedidos históricos revisadas e corretas

### Quando NÃO importar

- **Não importar** a base completa antes de testar com CSV pequeno
- **Não importar** se os nomes dos produtos no CSV não batem com o cardápio cadastrado
- **Não importar** se as datas estão incorretas (pode distorcer Analytics)
- **Não importar** no mesmo dia do primeiro pedido real — esperar Analytics estabilizar

### Processo de importação

1. Preparar CSV de teste com 10–20 pedidos históricos representativos
2. Acessar a função de Importação no painel
3. Fazer upload do CSV de teste
4. Revisar preview:
   - Produtos reconhecidos vs. não reconhecidos
   - Clientes que serão criados vs. atualizados
   - `uncategorizedItems` deve ser zero ou justificado
5. Confirmar importação de teste
6. Verificar CRM e Analytics após importação
7. Somente então importar a base completa

---

## 19. Pré-piloto (Preflight)

Acessar em `/admin/preflight` (área de admin global).

### Como executar

1. Entrar no admin global
2. Clicar em **Pré-piloto** no menu lateral
3. A página executa os checks automaticamente
4. Revisar todos os grupos de checks

### Como interpretar

| Status | Significado |
|---|---|
| ✅ PASS | Check passou — tudo OK |
| ⚠️ WARNING | Atenção necessária, mas não bloqueia o piloto |
| ❌ FAIL / BLOQUEADO | Bloqueio crítico — deve ser resolvido antes de ir ao ar |

### Grupos verificados

| Grupo | O que verifica |
|---|---|
| Ambiente | Variáveis de ambiente obrigatórias e opcionais |
| Banco de dados | Conexão, migrações aplicadas, migrações com falha |
| Módulos | Campo LGPD, tabela de campanhas, Evolution, WhatsApp Agent Config |
| Restaurantes | Por restaurante: cardápio, entrega, pagamento, WhatsApp, Google Review |

### Status geral esperado para go-live

- **READY:** todos os checks passaram — go-live liberado
- **READY_WITH_WARNINGS:** sem bloqueios críticos, mas há avisos — revisar cada aviso e decidir se aceita
- **BLOQUEADO:** há falha crítica — resolver antes de avançar

### Exportar relatório

O Preflight tem botão de copiar relatório em texto. Guardar o relatório como evidência antes do go-live.

---

## 20. Script do Primeiro Pedido de Teste

Executar este script completo antes de liberar o link para clientes reais.

Usar um número de telefone de teste — não de um cliente real.

### Roteiro

1. Abrir `/pedido/[slug]` no celular
2. Verificar que o cardápio carrega corretamente
3. Inserir número de telefone de teste na identificação
4. Navegar até uma categoria e abrir um produto
5. Se o produto tiver variantes ou opcionais: testar a seleção
6. Adicionar o produto ao carrinho
7. Adicionar uma observação (campo de texto livre)
8. Ir ao carrinho — verificar item, quantidade, preço, observação
9. Selecionar **Retirada** ou **Entrega** conforme configurado
10. Selecionar **Pagamento na entrega** ou **Pix na entrega** (não usar pagamento online)
11. Confirmar pedido
12. **Verificar:** tela de confirmação com número do pedido aparece
13. Abrir o painel do owner em `/orders`
14. **Verificar:** pedido aparece com status correto
15. Mudar o status do pedido (ex: Em preparo → Pronto)
16. Abrir **CRM** (`/crm`)
17. **Verificar:** cliente de teste aparece com 1 pedido e valor correto
18. Abrir **Analytics** (`/analytics`)
19. **Verificar:** pedido e receita aparecem (aguardar se necessário)
20. Abrir `/qr/[slug]` no celular
21. **Verificar:** menu QR carrega corretamente

### Critério de aprovação

Todos os 21 itens devem ser confirmados sem erro antes de prosseguir.

---

## 21. Validação Pós-pedido

Após o pedido de teste, verificar cada ponto:

**Pedido:**
- [ ] Pedido criado com ID único
- [ ] Total do pedido correto (subtotal + taxa de entrega se aplicável)
- [ ] Itens do pedido corretos (produto, quantidade, preço)
- [ ] Observação registrada se foi inserida
- [ ] Status do pedido atualizado corretamente pelo owner

**Cliente:**
- [ ] Cliente criado no CRM com o telefone de teste
- [ ] `totalOrders` = 1
- [ ] `totalSpend` = valor do pedido
- [ ] `isGuest` = false (cliente identificado, não anônimo)
- [ ] `hasOptedOut` = false

**Analytics:**
- [ ] Pedido aparece no total do período
- [ ] Receita reflete o valor do pedido
- [ ] Produto aparece no ranking

**Tracking (se link rastreável foi usado):**
- [ ] Canal de origem registrado corretamente

**Chat / Atendimento:**
- [ ] Nenhuma conversa gerada indevidamente pelo pedido de teste
- [ ] Inbox limpo ou com conversa de teste identificada

**Owner:**
- [ ] Owner consegue ver e gerenciar o pedido
- [ ] Owner consegue mudar status do pedido

---

## 22. Critérios de Go-live

O restaurante pode ir ao ar para clientes reais somente quando todos os itens obrigatórios abaixo forem confirmados.

### Obrigatórios

- [ ] `/pedido/[slug]` carrega sem erro
- [ ] `/qr/[slug]` carrega sem erro
- [ ] Cardápio com pelo menos 1 produto ativo com preço
- [ ] Dados da loja preenchidos (telefone + endereço)
- [ ] Delivery ou retirada configurados
- [ ] Pelo menos um método de pagamento seguro ativo (dinheiro, Pix ou cartão na entrega)
- [ ] Pedido de teste completo realizado e aprovado
- [ ] Pedido de teste aparece no painel do owner
- [ ] Cliente de teste aparece no CRM
- [ ] Analytics registrou o pedido de teste
- [ ] Preflight sem bloqueadores críticos

### Opcionais (recomendados, não bloqueantes)

- [ ] WhatsApp testado e funcionando
- [ ] Links rastreáveis criados para os canais principais
- [ ] URL do Google Review configurada
- [ ] Importação histórica realizada (somente após validação com CSV de teste)

---

## 23. Funcionalidades a Manter Desativadas no Piloto

Manter desativadas até validação específica de cada item:

| Funcionalidade | Por que manter desativada | Como ativar depois |
|---|---|---|
| Pagamento online (MercadoPago/Stone) | Risco de cobrança indevida sem sandbox validado | Configurar credenciais + realizar pedido de teste com cobrança real em sandbox |
| WhatsApp IA de Pedidos (`AI_ORDERING_EXPERIMENTAL`) | Alta chance de erro de interpretação sem treinamento | Ativar somente após extensa validação manual do fluxo completo |
| Campanhas CRM em massa | Sem base de opt-in validada e sem WhatsApp testado | Ativar após WhatsApp funcionar + confirmar fluxo de opt-in |
| Agendamento de campanhas | Depende de campanha manual testada primeiro | Ativar após pelo menos 1 campanha manual bem-sucedida |
| Programa de fidelidade público | Benefícios precisam ser revisados pelo restaurante | Ativar após acordar regras com o owner |
| Promoções automáticas | Podem gerar preços incorretos sem revisão | Ativar apenas promoções criadas e revisadas manualmente |

---

## 24. Solução de Problemas Comuns

### Links de delivery/QR aparecem vazios ou incorretos

**Causa:** `NEXT_PUBLIC_APP_URL` não configurada ou incorreta.  
**Solução:** Verificar a variável de ambiente no painel do Railway. O valor deve ser a URL completa de produção sem barra no final, ex: `https://seudominio.com`.

---

### Botão de avaliação do Google não aparece no QR

**Causa:** Campo `googleReviewUrl` não preenchido.  
**Solução:** Acessar Configurações > Loja > preencher o campo com a URL do Google Review do restaurante.

---

### WhatsApp não responde mensagens

**Verificar em ordem:**
1. Evolution API está configurada em Configurações > Integrações > WhatsApp Business?
2. A instância está conectada (QR Code escaneado)?
3. O webhook está configurado para `[APP_URL]/api/webhooks/evolution`?
4. O modo do agente em `/settings/whatsapp` está em RECEPTIONIST_ONLY?
5. O número de WhatsApp do restaurante é o mesmo configurado na instância Evolution?

---

### Campanhas CRM não podem ser enviadas

**Verificar em ordem:**
1. Evolution API configurada e instância ativa?
2. O cliente tem telefone preenchido?
3. O cliente tem `hasOptedOut = false`?
4. O modo do agente permite envios (não bloqueado por configuração)?

---

### Analytics aparece zerado

**Verificar em ordem:**
1. O período selecionado no filtro inclui a data do pedido?
2. O pedido foi concluído (não rascunho/abandonado)?
3. Aguardar até 5 minutos para processamento
4. Verificar no banco se o pedido existe com status correto

---

### Importação gera clientes duplicados

**Causa:** Telefone em formato diferente do padrão de normalização.  
**Solução:** Antes de importar, revisar os telefones no CSV. O sistema usa deduplicação por telefone normalizado. Garantir que os telefones estão no mesmo formato.

---

### Pedido online falha com erro de pagamento

**Causa provável:** Credenciais de provedor de pagamento ausentes ou incorretas.  
**Solução imediata:** O sistema retorna 503 automaticamente se não houver provedor configurado. Verificar se o cliente tentou `pay_now` sem provedor. Orientar a usar pagamento na entrega/retirada.

**Para resolver depois:** Configurar e testar credenciais do provedor em sandbox antes de reativar.

---

### Dashboard do owner não mostra o card de configuração

**Causa:** Restaurante já marcado como PRONTO_PARA_PILOTO, ou erro na API de onboarding.  
**Verificar:** Abrir `/onboarding` diretamente para ver o status real de cada etapa.

---

## 25. Assinatura de Prontidão para o Piloto

Preencher e assinar antes de liberar o link para clientes reais.

**Restaurante:** ___________________________________  
**Slug:** ___________________________________  
**Data da verificação:** ___________________________________  
**Responsável pela verificação:** ___________________________________

---

### Checklist final

**Configuração**
- [ ] Restaurante criado no admin
- [ ] Owner fez login e acessou o painel
- [ ] Perfil da loja completo (telefone + endereço)
- [ ] Horários de funcionamento configurados
- [ ] Cardápio com produtos ativos e preços

**Canais**
- [ ] `/pedido/[slug]` testado no celular — carrega e funciona
- [ ] `/qr/[slug]` testado no celular — carrega e funciona
- [ ] Links copiados e compartilhados para canais corretos

**Operação**
- [ ] Delivery e/ou retirada configurados
- [ ] Método de pagamento seguro ativo
- [ ] Pedido de teste realizado com sucesso
- [ ] Owner conseguiu ver e gerenciar o pedido no painel

**Dados**
- [ ] CRM registrou o cliente de teste
- [ ] Analytics registrou o pedido de teste
- [ ] Preflight executado sem bloqueadores críticos

**Segurança**
- [ ] Pagamento online desativado (sem credenciais testadas)
- [ ] WhatsApp IA de pedidos desativado (`RECEPTIONIST_ONLY`)
- [ ] Campanhas em massa desativadas
- [ ] Promoções automáticas não ativadas

---

**Resultado:** ☐ Aprovado para piloto  ☐ Pendências — ver abaixo

**Pendências registradas:**

```
_________________________________________________________________
_________________________________________________________________
_________________________________________________________________
```

**Assinatura:** ___________________________________  
**Data:** ___________________________________

---

*Foocci — Manual Operacional do Piloto v1.0 — Maio 2026*  
*Documento interno. Não compartilhar externamente.*
