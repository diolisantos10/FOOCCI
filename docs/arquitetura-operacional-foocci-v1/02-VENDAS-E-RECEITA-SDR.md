# Departamento de Vendas e Receita

> ⛔ **SUPERADA em 25/08/2026.** A arquitetura oficial da Foocci é a de 6 departamentos, em `docs/arquitetura-operacional-foocci-v3/`. Este arquivo fica para auditoria — não é fonte para construir nada.

## Estrutura

### 1. Pré-vendas

- **SDR IA:** responde rápido, identifica intenção, coleta dados, realiza sondagem, registra fatos, qualifica e pede handoff quando necessário.
- **SDR humano:** assume qualquer conversa, conduz diagnóstico, trata exceções, agenda demonstração e devolve para a IA quando apropriado.
- **Coordenador de SDR / Sales Manager:** governa fila, SLA, distribuição, qualidade, capacidade e playbooks.

### 2. Fechamento

- **Consultor comercial:** demonstra a solução no contexto do restaurante.
- **Closer:** conduz proposta, negociação, objeções e fechamento.
- Em time pequeno, a mesma pessoa pode executar consultor + closer, mas as funções permanecem separadas no processo.

### 3. Operações comerciais (RevOps)

- Higiene do CRM, definição de etapas, relatórios, atribuição, produtividade, perdas, previsões e integrações.
- Não conversa em nome do lead; garante que o sistema represente a realidade.

## Onde o SDR fica

`Foocci → Vendas e Receita → Pré-vendas → SDR IA / SDR humano`.

O SDR não é um departamento independente. É a porta operacional entre Marketing e Fechamento.

## Responsabilidades do SDR

**Entrada:** lead com telefone, consentimento/base legal aplicável, origem, campanha e contexto disponível.  
**Saída qualificada:** dor, cenário atual, porte, autoridade, urgência, aderência, objeções, próximo passo, responsável e data.  
**Saída desqualificada/perdida:** motivo padronizado, evidência, permissão de nutrição e próxima ação quando houver.

## Regras IA + humano

1. A conversa é única e pertence ao lead, não ao atendente.
2. Por padrão, a IA atende se o canal e o agente estiverem habilitados.
3. “Assumir” deve ser atômico: ao confirmar, o humano vira responsável e a IA fica silenciosa antes do próximo envio.
4. O humano lê todo o histórico, dossiê, origem, estágio e tarefas.
5. “Devolver para IA” é explícito, auditado e inclui contexto/objetivo.
6. Handoff automático ocorre por pedido do lead, baixa confiança, tema sensível, falha repetida, intenção de negociar ou regra de segurança.
7. A IA nunca inventa preço, desconto, prazo, integração ou funcionalidade.
8. O responsável humano continua visível mesmo quando a IA executa follow-up delegado.

## Papéis e acesso

| Papel | Capacidades |
|---|---|
| ADMIN | acesso completo e auditoria |
| SALES_MANAGER | todas as filas, distribuição, equipe, relatórios e configuração comercial |
| SALES_CONSULTANT | assumir/atender, atualizar lead, criar tarefas e mover etapas conforme política |
| SALES_VIEWER | somente leitura de dados comerciais permitidos |
| SYSTEM_AI | ator de sistema, nunca uma credencial humana |

Autorização deve ser aplicada nas rotas e serviços. Esconder botões não constitui segurança.

## Métricas

- tempo até primeira resposta;
- taxa de contato, qualificação, agendamento, comparecimento, proposta e fechamento;
- conversão por origem/campanha;
- tempo por etapa;
- conversas por IA, humano e híbridas;
- taxa e motivo de handoff;
- tarefas vencidas e leads sem próximo passo;
- perdas por motivo;
- receita ganha quando existir fonte financeira confiável.

Não mostrar taxa falsa como zero quando o denominador não permite cálculo.
