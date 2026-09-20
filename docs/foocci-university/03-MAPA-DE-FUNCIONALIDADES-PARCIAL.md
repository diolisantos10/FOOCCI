# 03 — Mapa de funcionalidades — Parcial verificado

**Data da validação:** 20/09/2026  
**Status:** PARCIAL. Este arquivo contém somente itens já reabertos no código atual nesta retomada.  
**Regra:** ausência daqui não significa ausência no produto; significa “ainda não promovido a CONFIRMADO pela University”.

> Este mapa separa quatro coisas que o vendedor não pode misturar: **o recurso existe**, **está disponível por padrão**, **é ofertado em determinado plano** e **está tecnicamente bloqueado pelo plano**. São afirmações diferentes.

---

## F-001 — Loja própria de pedidos

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO, condicionado à configuração do restaurante  
**Evidência principal:** `src/app/pedido/[slug]/page.tsx`

### O que faz
Entrega uma experiência pública de cardápio e pedido pelo endereço próprio do restaurante. A página resolve o restaurante pelo slug, carrega cardápio, regras de entrega, marca, promoções e dados do cliente quando existe identidade comprovada.

Existe também `?modo=loja`, que força catálogo + checkout **sem conversa com IA**, mesmo quando o plano inclui Garçom IA.

### Problema do restaurante
Dependência de canais em que a relação com o cliente e a experiência de compra não são controladas pelo restaurante.

### Impacto possível
Mais vendas podem ser direcionadas para um canal direto, com identificação e histórico do cliente dentro da operação do restaurante. **Não prometer percentual de migração ou economia como resultado garantido.**

### Argumento comercial
“Você passa a ter um endereço de pedido da sua própria operação, com a sua marca e as suas regras. O Foocci não precisa colocar uma IA na frente do cliente para a loja funcionar.”

### Como explicar
“É sua loja digital. O cliente entra, escolhe, fecha o pedido e o restaurante recebe a operação. A IA é uma camada possível, não a condição para existir canal próprio.”

### Como demonstrar
Abrir uma loja oficial de demonstração e percorrer entrada → produto → carrinho → checkout. Repetir com `modo=loja` quando o objetivo for provar a experiência sem IA.

### Pergunta de descoberta
“Hoje, quando um cliente quer pedir direto com você, ele vai para onde?”

### Limites / não dizer
- não afirmar que qualquer restaurante começa a operar completamente “na hora” sem configuração;
- não confundir criação imediata de conta/loja no checkout com implantação completa;
- não dizer que a IA é obrigatória para o canal próprio.

---

## F-002 — Garçom IA no cardápio e trava por plano

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO com gate por plano/override  
**Evidência:** `src/lib/plan-features.ts`, `src/app/pedido/[slug]/page.tsx`

### O que faz
O código decide se o Garçom IA pode ser usado na loja pública. O override explícito por restaurante vence o plano. Sem override:
- Essencial / STARTER: não inclui;
- Crescimento / GROWTH: inclui;
- Performance / PRO: inclui.

### Problema
Cardápio passivo depende do cliente saber o que quer e não ajuda a construir a compra.

### Argumento comercial
“Nos planos com Garçom IA, o cardápio pode conduzir a escolha em vez de ser só uma lista de produtos.”

### Como explicar
“A IA conversa e ajuda a vender, mas produto, preço, restrição e checkout continuam vindo do sistema real.”

### Como demonstrar
Usar ambiente oficial com IA liberada e provocar: pedido vago, adicional, combo/sugestão e restrição alimentar.

### Pergunta de descoberta
“Quando o cliente está em dúvida ou pede uma recomendação hoje, quem conduz essa venda no digital?”

### Guardrails
O runtime reforça:
- catálogo/UI são a fonte da verdade;
- não inventar produto ou preço;
- não ignorar alergia/restrição;
- não pular checkout.

A ativação de versões assistidas por biblioteca é bloqueada se o auditor do Waiter encontrar P0.

**Evidência adicional:** `src/services/waiterRuntime/promptAssembler.ts`, `src/services/waiterRuntime/qualityGate.ts`.

---

## F-003 — Cardápio de mesa por QR

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO  
**Evidência:** `src/app/qr/[slug]/page.tsx`

### O que faz
Expõe cardápio público de salão, filtrando itens/categorias disponíveis e configurados para dine-in. Usa preço específico de salão quando existe. Suporta variantes, adicionais, informações de porção, ingredientes, imagens adicionais, carrossel, promoções e mais vendidos.

### Problema
O mesmo cardápio/preço nem sempre serve para delivery e salão; cardápio físico envelhece rápido.

### Argumento
“O salão pode ter seu próprio cardápio digital, disponibilidade e preço, sem você duplicar o produto.”

### Demonstração
Abrir QR oficial e comparar um item com preço/configuração por canal.

### Pergunta
“Você pratica o mesmo preço no salão e no delivery hoje?”

### Limite
O cabeçalho atual da rota chama a experiência de **read-only dine-in menu**. Não ensinar “o QR fecha pedido” até validar outro fluxo que prove isso.

---

## F-004 — Preço e visibilidade por canal

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO  
**Evidência:** `src/app/qr/[slug]/page.tsx`, `src/app/site/(gated)/precos/page.tsx`

### O que faz
O modelo e as telas usam preços específicos de delivery, salão e iFood, além de flags de visibilidade por canal.

### Problema
Custo e estratégia comercial variam por canal, mas muitos restaurantes mantêm uma tabela única.

### Argumento
“O mesmo prato pode ter estratégia de preço diferente por canal sem criar três cardápios independentes.”

### Pergunta
“Quanto custa para você vender o mesmo prato no salão, direto e no marketplace?”

### Limite
Não aconselhar preço específico sem conhecer CMV, canal e estratégia do restaurante.

---

## F-005 — Importação de cardápio por planilha

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO  
**Evidência:** `src/app/(dashboard)/menu/upload/page.tsx`

### O que faz
Aceita XLSX, XLS e CSV, com fluxo de análise/importação de categorias e itens. A interface atual informa limite de arquivo de 100 MB.

### Problema
Cadastrar cardápio grande manualmente aumenta tempo de configuração e erro.

### Argumento
“Você não precisa reconstruir item por item se já tem o cardápio organizado em planilha.”

### Demonstração
Mostrar o upload e o preview, sem executar importação em conta real durante demo.

### Pergunta
“Seu cardápio hoje está em planilha, PDV, PDF ou só no aplicativo?”

---

## F-006 — Melhoria de fotos por IA com aprovação

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO, dependente do provider configurado  
**Evidência:** `src/app/(dashboard)/menu-enhancement/EnhancementClient.tsx`

### O que faz
Cria jobs de melhoria/upscale, preserva o original e exige aprovação humana. A própria tela declara como invariantes: nunca autoaprovar e nunca apagar o original.

### Problema
Foto ruim reduz apresentação do produto, mas edição automática sem revisão pode distorcer prato.

### Argumento
“A IA ajuda a melhorar a apresentação, mas a publicação continua sob seu controle.”

### Pergunta
“Hoje você deixa de cadastrar ou divulgar item porque a foto não está boa?”

### Limite
Não prometer fidelidade visual perfeita; a existência de estados FAILED/LOW_SOURCE_QUALITY/NEEDS_NEW_PHOTO prova que o sistema reconhece falhas e baixa qualidade.

---

## F-007 — CMV, ficha técnica e precificação

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO  
**Evidência:** `src/app/(dashboard)/precificacao/PrecificacaoClient.tsx`

### O que faz
O painel de precificação contém:
- premissas do negócio;
- markup;
- CMV do período;
- custo por item;
- ficha/receita com ingredientes e unidades;
- preço ideal;
- aplicação individual ou em massa;
- modos de reprecificação OFF / SUGGEST / AUTO;
- arredondamento;
- trava de variação;
- histórico auditado de preço/custo.

### Problema
Preço é frequentemente definido olhando concorrente ou “sensação”, sem saber margem real.

### Argumento
“Você consegue ligar preço ao custo real do prato e decidir se quer só enxergar, receber sugestão ou automatizar dentro de um teto.”

### Demonstração
Usar item de demonstração com ficha técnica e alterar um custo em ambiente seguro para mostrar a consequência calculada.

### Pergunta
“Se o salmão subir 12% amanhã, quanto tempo leva para você saber quais pratos deixaram de fechar a conta?”

### Limite
Automação não significa “Foocci escolhe qualquer preço”. Existe configuração, teto/guardrail e histórico.

---

## F-008 — Entrega configurável

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO; algumas capacidades dependem de geocodificação/configuração  
**Evidência:** `src/app/(dashboard)/settings/delivery/page.tsx`

### O que faz
Configura retirada e entrega em modos simple, advanced, distance e manual. Há pedido mínimo, frete grátis acima de valor, prazo estimado, zonas e cálculo por distância.

### Problema
Frete manual no WhatsApp gera inconsistência, atraso e perda de margem.

### Argumento
“As regras de entrega deixam de ficar na cabeça do atendente e passam para o checkout.”

### Pergunta
“Hoje duas pessoas da equipe dariam exatamente o mesmo valor de frete para o mesmo endereço?”

---

## F-009 — Métodos de pagamento do pedido

**Estado:** CONFIRMADO como configuração de aceitação  
**Maturidade:** MISTA; link depende de integração  
**Evidência:** `src/app/(dashboard)/settings/payments/page.tsx`

### O que faz
O restaurante pode configurar aceitação de:
- Pix;
- dinheiro;
- cartão na maquininha;
- link de pagamento.

Link é explicitamente marcado como dependente de integração.

### Problema
Atendente precisa perguntar/explicar pagamento repetidamente e pode oferecer método que o restaurante não usa.

### Argumento
“O checkout respeita o que você realmente aceita.”

### Atenção crítica
**Não confundir com pagamento da assinatura Foocci.** A assinatura Foocci fecha por cartão recorrente no Mercado Pago; esta funcionalidade trata do pagamento do **pedido do cliente do restaurante**.

---

## F-010 — NFC-e opcional

**Estado:** CONFIRMADO  
**Maturidade:** DEPENDE DE TERCEIRO e configuração fiscal  
**Evidência:** `src/app/(dashboard)/settings/notas-fiscais/page.tsx`, `src/lib/site/servicosAParte.ts`

### O que faz
Permite emissão de NFC-e via gateway fiscal, atualmente com opção Focus NFe na configuração. Exige dados fiscais, tokens/certificado e validação; produção emite documento real.

### Comercial
A integração Foocci não é cobrada à parte. Certificado digital e custo por documento são do restaurante diretamente com o emissor.

### Problema
Operação pode precisar conectar pedido à emissão sem novo fluxo manual.

### Argumento
“A emissão pode ficar dentro do fluxo, mas a responsabilidade fiscal e os custos do emissor continuam sendo do restaurante.”

### Limite
Foocci não presta consultoria contábil/fiscal.

---

## F-011 — WhatsApp oficial pela Meta Cloud API

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO quando conta/número Meta estão configurados  
**Evidência:** `src/services/whatsapp/activeProvider.ts`, `src/services/whatsapp/WhatsAppMessagingService.ts`

### O que faz
Todo envio atual passa pela Meta Cloud API. Evolution foi removida; não há fallback por provedor alternativo.

### Problema
Operação informal/ferramenta não homologada expõe o número e fragmenta atendimento.

### Argumento
“O Foocci trabalha pela infraestrutura oficial da Meta; quando a Meta não permite enviar, o sistema não contorna por um caminho paralelo.”

### Limites
- texto livre respeita a janela de 24h;
- fora dela, o caminho é template aprovado;
- falha Meta/credencial não vira envio por provedor alternativo.

### Pergunta
“O WhatsApp do seu restaurante hoje está ligado oficialmente à Meta ou depende de uma ferramenta que espelha o aparelho?”

---

## F-012 — Onboarding Meta

**Estado:** CONFIRMADO  
**Maturidade:** DEPENDE DE TERCEIRO  
**Evidência:** `src/services/whatsapp/MetaOnboardingService.ts`

### O que faz
Há suporte para Embedded Signup, troca de código por token, verificação de validade, assinatura do app ao WABA, registro/liberação de número e fluxos de verificação.

### Problema
Conectar WhatsApp oficial envolve etapas da Meta que não devem depender de procedimento improvisado.

### Argumento
“Existe fluxo de conexão com a estrutura oficial da Meta.”

### Limite
A aprovação, política, disponibilidade e limites da Meta não são controlados pela Foocci.

---

## F-013 — Pedido completo por texto no WhatsApp

**Estado:** CONFIRMADO COMO CAPACIDADE GOVERNADA  
**Maturidade:** DESLIGADO/PARCIAL POR PADRÃO; disponibilidade real depende da configuração de cada restaurante  
**Evidência:** `src/services/whatsapp/ordering/WhatsAppTextOrderingConfigService.ts`, `src/services/whatsapp/ordering/productionGovernance.ts`

### O que faz
Existe runtime de pedido por texto com modos de segurança e escopos:
- DRY_RUN_ONLY;
- ALLOWLIST_REPLY_ONLY;
- ALLOWLIST_FULL_TEST;
- PHONE_ALLOWLIST;
- RESTAURANT_WIDE.

A configuração nova nasce, por padrão, com `enabled=false`, DRY_RUN_ONLY e PHONE_ALLOWLIST. Existe mecanismo explícito e auditado para promover teste e, depois, abrir a clientes finais, com gates, confirmações e rollback.

### Problema
Cliente quer pedir no próprio WhatsApp sem ser obrigado a navegar para outro canal.

### Argumento permitido
“O Foocci tem capacidade de pedido conversacional completo pelo WhatsApp, mas a liberação é governada por restaurante e por estágio.”

### Não dizer
❌ “Todo cliente do Foocci já pode fazer o pedido inteiro por texto.”  
❌ “Está sempre ligado.”  
❌ “A IA cria pedido/Pix sem confirmação.”

### Demonstração
Somente em número/restaurante oficialmente liberado para teste.

---

## F-014 — CRM com 16 campanhas prontas

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO sob regras de segurança/canal conectado  
**Evidência:** `src/services/crm/readyMadeCampaigns.ts`

### O que faz
Catálogo canônico com **16** campanhas:
1. pedir avaliação;
2. aniversário;
3. segunda compra;
4. cadastro sem compra;
5. cliente quente esfriando;
6. reativar mornos;
7. recuperar frios;
8. recuperar perdidos;
9. clientes VIP;
10. subiu de nível;
11. quase no próximo nível;
12. mimo mensal por nível;
13. cupom vencendo;
14. carrinho abandonado;
15. indique um amigo;
16. siga as redes.

O desenho é “pronto para ativar e editar”, em vez de obrigar o dono a criar tudo do zero.

### Problema
Restaurante tem base, mas relacionamento depende da memória do gerente e de disparos esporádicos.

### Argumento
“O CRM já chega com jornadas de restaurante pensadas para o ciclo do cliente; você ajusta e ativa, em vez de começar numa tela vazia.”

### Pergunta
“Quem da sua base está prestes a esfriar hoje — e como você sabe?”

### Limite
Não prometer que campanha ativa significa envio irrestrito. Cada contato ainda passa pelos gates.

---

## F-015 — Segurança de contato do CRM

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO  
**Evidência:** `src/services/crm/ContactSafetyService.ts`, `src/services/crm/activeOrderGuard.ts`

### O que faz
Portão central antes de outbound CRM. Entre os bloqueios:
- opt-out;
- telefone/contatabilidade;
- WhatsApp conectado;
- horário silencioso/janela;
- teto global;
- orçamento/teto de contatos;
- cooldown;
- teto semanal;
- outra mensagem CRM nas últimas 24h;
- duplicidade;
- restaurante fechado, quando configurado;
- pedido em andamento;
- pedido recente;
- histórico desconhecido.

“Não sei” não vira permissão: falha na apuração reprova.

### Problema
Campanhas desconectadas podem bombardear cliente, falar durante pedido em andamento e queimar canal.

### Argumento
“O CRM não trata campanha como uma fila cega. Antes de falar, ele olha regras de contato e o momento daquele cliente.”

### Demonstração
Mostrar um contato bloqueado e o motivo, não apenas um disparo bem-sucedido.

---

## F-016 — Segmentação e níveis de relacionamento

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO; programa de níveis possui chave de ativação  
**Evidência:** `src/services/crm/CustomerSegmentService.ts`, `src/services/crm/RelationshipProgramService.ts`

### O que faz
Segmenta por recência e mantém níveis Bronze, Prata, Ouro e Diamante. O programa de níveis tem master switch e pode usar janela vitalícia, 3, 6 ou 12 meses. Critérios podem considerar gasto ou número de pedidos.

### Problema
Cliente fiel, cliente novo e cliente quase perdido recebem tratamento igual quando a base não tem leitura de relacionamento.

### Argumento
“O Foocci transforma histórico em grupos de ação, para o restaurante não tratar toda a base como uma lista única.”

### Limite
Nível não é garantia de fidelidade; é classificação baseada nos dados e regras configuradas.

---

## F-017 — Indicação com recompensa para os dois lados

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO dentro das regras do CRM  
**Evidência:** `src/services/crm/ReferralService.ts`

### O que faz
Gera link pessoal `?ref=<customerId>`. Na primeira compra válida do indicado, cria a indicação e concede recompensa ao indicador e ao indicado, respeitando regras e orçamento de cupom.

### Problema
Indicação acontece organicamente, mas não é rastreada nem recompensada.

### Argumento
“O boca a boca passa a ter um mecanismo rastreável.”

### Limite
Não vale autoindicação; só primeira compra; falha de recompensa não quebra checkout.

---

## F-018 — Analytics de vendas, produto, cliente e upsell

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO quando há dados Foocci suficientes  
**Evidência:** `src/services/analytics/AnalyticsService.ts`

### O que faz
Mede, entre outros:
- receita;
- pedidos;
- ticket médio;
- novos clientes;
- cancelamento;
- pagamento pendente;
- vendas por dia;
- produtos/categorias;
- attach rate;
- melhores clientes;
- segmentos/níveis;
- canais;
- produtos sem venda;
- receita/ordens com upsell.

Os agregados do restaurante excluem pedidos históricos importados: analytics de performance usa venda Foocci real.

### Problema
Dono recebe relatório bruto, mas não consegue responder “o que vende”, “quem volta” e “onde tenho oportunidade”.

### Argumento
“Você mede o que aconteceu dentro da operação, não uma soma de histórico importado com venda atual.”

### Limite
Dado insuficiente continua sendo dado insuficiente; não transformar amostra pequena em conclusão forte.

---

## F-019 — Diagnóstico e retenção

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO com limitações explícitas  
**Evidência:** `src/services/analytics/AnalyticsDiagnosisService.ts`, `src/services/analytics/AnalyticsRetentionService.ts`, `src/services/analytics/AnalyticsOperationalEfficiencyService.ts`

### O que faz
O diagnóstico compara períodos com regras determinísticas, mostra achados/anomalias e recomendações sem afirmar causalidade que os dados não provam. Há análise de retenção por cohort e eficiência operacional pedido criado → concluído.

### Problema
Painel que só mostra número obriga o dono a interpretar sozinho.

### Argumento
“O Foocci tenta transformar o número em pergunta de gestão: o que mudou, onde existe indício de problema e o que vale investigar.”

### Limites comerciais importantes
- causa é tratada como hipótese/indício, não certeza;
- retenção recente pode não ter maturado;
- eficiência operacional não tem timestamps de cada etapa; mede criação → conclusão quando há `completedAt`;
- amostra pequena reduz confiabilidade.

---

## F-020 — Contratação self-service e preço único

**Estado:** CONFIRMADO  
**Maturidade:** PRONTO  
**Evidência:** `src/lib/billing/pricing.ts`, `src/app/contratar/novo/page.tsx`, `src/app/contratar/novo/CheckoutClient.tsx`

### O que faz
O cliente escolhe plano/ciclo, aceita termo e segue para pagamento hospedado. A mesma fonte de centavos alimenta anúncio e cobrança.

Tabela atual:

| Plano | Mensal | Trimestral | Anual |
|---|---:|---:|---:|
| Essencial | R$ 179 | R$ 483 | R$ 1.790 |
| Crescimento | R$ 429 | R$ 1.158 | R$ 4.290 |
| Performance | R$ 899 | R$ 2.427 | R$ 8.990 |

Trimestral já incorpora 10%; anual já incorpora dois meses grátis. Único abatimento adicional: 50% do primeiro mês, já aplicado na primeira cobrança.

### Comercial
O vendedor informa; não “concede”.

### Assinatura
Cartão de crédito em recorrência Mercado Pago no fluxo atual.

### Limite
Não criar preço, cupom, desconto, boleto/Pix recorrente ou condição especial que o checkout não sabe executar.

---

## F-021 — Planos públicos: oferta comercial x enforcement técnico

**Estado:** CONFIRMADO COMO OFERTA; ENFORCEMENT PARCIALMENTE VALIDADO  
**Evidência:** `src/app/site/(gated)/precos/page.tsx`, `src/lib/plan-features.ts`

### Oferta pública atual
**Essencial**
- até 300 pedidos/mês;
- canal próprio, operação, cardápio e recursos-base.

**Crescimento**
- até 1.200 pedidos/mês;
- página publica “3.000 mensagens”;
- tudo do Essencial + IA/CRM/relacionamento.

**Performance**
- até 4.000 pedidos/mês;
- página publica “10.000 mensagens”;
- tudo do Crescimento + CMV/precificação avançada, fidelização avançada, IA de CRM, foto e integrações.

### O que já está tecnicamente provado
A trava central de feature por plano atualmente cobre explicitamente o **Garçom IA**: Essencial não inclui por padrão, GROWTH/PRO incluem, com override por restaurante.

### O que ainda NÃO foi provado
Que todos os limites e todas as linhas da página de preço possuem enforcement correspondente no runtime.

### Regra da University
O vendedor pode apresentar **o que o plano comercial oferece**, mas não dizer “o sistema bloqueia automaticamente em X” sem evidência do enforcement.

---

## F-022 — Configuração e serviços fora da mensalidade

**Estado:** CONFIRMADO  
**Maturidade:** POLÍTICA COMERCIAL ATUAL  
**Evidência:** `src/lib/site/servicosAParte.ts`

### Configuração
Sob consulta quando a Foocci faz o trabalho de subir cardápio/importar clientes. Se o próprio restaurante configura pelo painel/manual, não existe cobrança de setup nessa política.

### Gestão pela agência
Sob consulta; é hora humana.

### NFC-e
Integração incluída; certificado e custo por documento são contratados com emissor.

### Mais de uma loja
Não existe “taxa de unidade adicional”: cada loja contrata/paga o plano dela.

### Regra
Preço sem motor e sem decisão formal não vira número no treinamento.

---

## F-023 — Termo de contratação, cancelamento e dados

**Estado:** CONFIRMADO NA FONTE CANÔNICA DO CHECKOUT  
**Maturidade:** VIGENTE NO CHECKOUT, com revisão jurídica final ainda indicada no repositório  
**Evidência:** `src/lib/billing/terms.ts`

### Pontos comerciais
- renovação automática por ciclo;
- cancelamento a qualquer momento com efeito ao fim do ciclo pago, sem multa;
- preços ficam travados durante o ciclo pago;
- reajuste anual por IPCA ou na renovação, o que ocorrer depois;
- inadimplência: tentativas até 7 dias; 15 dias pode suspender painel; 30 dias pode suspender total;
- dados exportáveis por 30 dias após término e exclusão após 60 dias, ressalvadas obrigações legais;
- não há SLA percentual de uptime prometido em contrato.

### Regra
Quando site, memória de vendedor e contrato divergirem, o treinamento de contratação usa a fonte canônica do checkout e abre uma divergência para correção do site — não escolhe a frase mais conveniente.

---

## F-024 — LGPD e papéis de dados

**Estado:** CONFIRMADO EM TERMOS/POLÍTICA, implementação técnica a auditar por domínio  
**Maturidade:** POLÍTICA PUBLICADA  
**Evidência:** `src/app/termos/page.tsx`, `src/app/privacidade/page.tsx`

### Modelo declarado
Para dados de clientes finais:
- restaurante = controlador;
- Foocci = operador.

A política declara que Foocci não vende dados pessoais, usa integrações oficiais conforme necessidade, criptografa credenciais/certificados sensíveis e mantém isolamento de dados por restaurante.

### Comercial
Privacidade é parte da venda, mas não autoriza vendedor a dar garantia absoluta de segurança.

### Não dizer
❌ “É impossível vazar.”  
✅ “Há controles de acesso, isolamento e criptografia de segredos; nenhum sistema é totalmente seguro.”

---

## F-025 — Comercial Foocci como ambiente de trabalho do vendedor

**Estado:** CONFIRMADO  
**Maturidade:** EM EVOLUÇÃO ATIVA  
**Evidência:** `src/lib/sala/rotas.ts`, `src/app/comercial/(area)/...`

### O que existe
A área `/comercial` é explicitamente separada da área do lojista e contém ferramentas para a operação comercial Foocci. Em 18/09/2026 o menu foi reorganizado em 10 grupos, preservando telas já existentes.

O código atual inclui, entre outras:
- Painel/Torre/Meta;
- Prospecção/Base Fria/Importações;
- Hunter;
- SDR;
- Conversas/Central de Atendimento;
- Carteira/Funil/Ficha/Qualificação;
- CRM/CRM IA/Follow-up/Relacionamento;
- Oferta/Preços;
- Supervisora/Agentes;
- cadastro manual de lead (adicionado em 19/09 como fallback).

### Consequência pedagógica
A University precisa formar duas competências separadas:
1. **vender Foocci para o restaurante**;
2. **operar corretamente o Comercial Foocci para executar essa venda**.

Uma não substitui a outra.

---

# Divergências e cautelas já encontradas

## D-001 — “Pronto na hora” não significa “implantado na hora”
O checkout afirma que loja e acesso ficam prontos na hora após contratação/pagamento. A política comercial não possui SLA aprovado para configuração de cardápio, base, integrações e operação completa.

**Regra:** provisionamento imediato ≠ implantação completa.

## D-002 — limites de plano publicados não equivalem, por si, a bloqueio técnico
A página publica 300 / 1.200 / 4.000 pedidos e referências a mensagens. Até agora, o gate técnico central validado explicitamente é o do Garçom IA.

**Regra:** não afirmar bloqueio automático até a investigação provar.

## D-003 — WhatsApp pedido por texto avançou desde o handoff
O handoff antigo o tratava como piloto/allowlist sem abertura geral. O código atual já contém caminho governado para `RESTAURANT_WIDE`.

**Regra:** capacidade existe, mas disponibilidade ao vivo deve ser verificada por restaurante; não dizer “ligado para todos”.

## D-004 — pagamento do pedido ≠ pagamento da assinatura
Pedido do cliente pode aceitar Pix/dinheiro/maquininha/link conforme configuração. Assinatura Foocci atual fecha por cartão recorrente.

---

# Próximos domínios a promover

Ainda faltam, antes de chamar o mapa de final:
- impressão/Carteiro e coordenação entre dispositivos;
- todos os detalhes de cardápio/variantes/limites;
- gateways e pagamento online do pedido ponta a ponta;
- fiscal ponta a ponta;
- integrações externas e API;
- onboarding/manual/ajuda;
- segurança técnica e isolamento;
- mapeamento completo do Agent/Waiter;
- enforcement real de cada plano;
- demonstração oficial por ambiente.

Só depois dessas validações este arquivo perde o sufixo “Parcial”.
