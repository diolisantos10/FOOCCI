# Plataforma SDR, leads do Foocci e controle de acesso

## Decisão canônica

A plataforma de SDR será uma **área interna dentro do admin do Foocci**, dedicada ao atendimento de pessoas e empresas interessadas em contratar o Foocci.

Neste contexto:

- **lead/prospect:** pessoa ou restaurante interessado em aderir ao Foocci;
- **cliente Foocci:** restaurante que contratou o Foocci;
- **cliente do restaurante:** consumidor final que compra do restaurante.

Esses três públicos não podem compartilhar tabelas, filas, conversas ou permissões indevidamente.

## Interface SDR

Rota-base sugerida: `/admin/vendas`, ajustável às convenções existentes após auditoria.

A interface inclui:

- fila de leads;
- conversas de WhatsApp;
- atendimento SDR IA e humano na mesma conversa;
- dossiê do lead;
- funil;
- tarefas e follow-ups;
- agenda/demonstrações;
- propostas e fechamento;
- métricas permitidas;
- equipe/configurações somente para gestor.

Todos os leads comerciais capturados por campanhas, site, formulários, QR codes, indicações ou contato direto devem convergir para o mesmo CRM. O canal principal de conversa é o **WhatsApp oficial comercial do Foocci**. A origem real do lead deve permanecer registrada.

## IA e humano

- O SDR IA é um ator de sistema, não possui login interativo.
- O SDR humano possui login individual.
- Ambos operam sobre o mesmo lead, conversa, funil, tarefas e histórico.
- A IA pode iniciar/continuar atendimento quando habilitada.
- O humano pode assumir a qualquer momento.
- Ao assumir, a IA fica silenciosa atomicamente.
- O humano pode devolver explicitamente à IA com contexto e objetivo.
- Toda troca de modo e responsável é auditada.
- O lead nunca precisa trocar de número ou reiniciar a conversa.

## Perfis de acesso

| Perfil | Acesso |
|---|---|
| MASTER | todo o admin, todos os departamentos, usuários, permissões, configurações e auditoria |
| DIRETOR / GERENTE GERAL | áreas autorizadas pela hierarquia, visão consolidada e gestão |
| SALES_MANAGER | somente área comercial e recursos de gestão de Vendas/SDR |
| SDR | somente plataforma SDR; leads/filas autorizados, conversa, funil, tarefas e agenda |
| SALES_VIEWER | leitura comercial permitida, sem enviar ou alterar |
| SYSTEM_AI / SDR_AI | ator técnico limitado às capacidades autorizadas; sem login humano |
| OUTROS DEPARTAMENTOS | somente seus módulos e handoffs explicitamente compartilhados |

O nome final dos enums pode seguir o padrão existente, mas os comportamentos acima são obrigatórios.

## Isolamento da interface

Para um login SDR:

- após autenticar, redirecionar diretamente para `/admin/vendas`;
- mostrar apenas navegação e ações comerciais permitidas;
- negar no servidor qualquer rota/API de outros departamentos;
- retornar 403 ou redirecionamento seguro em tentativa de acesso não autorizado;
- filtrar dados por fila, atribuição e escopo definidos;
- impedir administração de usuários, permissões, configurações globais, restaurantes e finanças.

O MASTER enxerga toda a navegação e pode entrar na plataforma SDR sem trocar de login.

Ocultar menu é apenas UX. A segurança real deve existir em middleware compatível, route handlers, services e queries.

## Gestão de login e autorização

- conta individual; credencial compartilhada é proibida;
- usuário ativo/inativo e revogação imediata;
- papel global + memberships por departamento + permissões específicas;
- menor privilégio como padrão;
- sessões expiram e podem ser revogadas;
- mudanças de papel/permissão ficam auditadas;
- criação de MASTER exige regra restrita;
- proteção contra escalada horizontal e vertical;
- testes devem tentar acessar diretamente cada rota/API proibida.

## Regra de dados

Conversas comerciais de prospects usam entidades comerciais próprias vinculadas a `SiteLead`. Não reutilizar:

- conversas de consumidores dos restaurantes;
- atendimento operacional de restaurantes ativos;
- usuários/credenciais dos restaurantes como identidade de SDR.

Quando o lead vira cliente Foocci, o fechamento gera um dossiê de handoff para Implantação. A conversão não apaga nem mistura o histórico comercial.

## Critérios de aceite específicos

1. MASTER entra em qualquer módulo autorizado.
2. SDR entra diretamente na plataforma SDR e não vê o restante do admin.
3. URL direta/API de outro módulo é negada ao SDR no servidor.
4. SDR IA não consegue autenticar como humano.
5. SDR humano e IA compartilham a mesma conversa sem respostas simultâneas.
6. Todos os leads comerciais convergem ao CRM preservando origem.
7. Prospect, cliente Foocci e consumidor do restaurante permanecem isolados.
8. Alteração de perfil revoga/libera acesso conforme política e gera auditoria.
