/**
 * O MAPA DA PURGA — que tabelas somem quando um restaurante é apagado, e em que ordem.
 *
 * Este arquivo é DADO, não lógica: ele existe para ser lido por um humano antes de
 * um caminho sem volta. A lógica que o consome vive em `RestaurantPurgeService.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE A ORDEM EXISTE (e por que `prisma.restaurant.delete()` sozinho NÃO serve)
 *
 * O banco é Postgres com chaves estrangeiras reais (`datasource db` sem
 * `relationMode`). A cascata do `restaurants` alcança 75 modelos — mas DENTRO desse
 * conjunto existem seis arestas `ON DELETE RESTRICT`, emitidas pela migração
 * inicial (`prisma/migrations/20260314000000_initial_schema/migration.sql:449`):
 *
 *     orders.customerId          -> customers   ON DELETE RESTRICT
 *     order_drafts.customerId    -> customers   ON DELETE RESTRICT
 *     conversations.customerId   -> customers   ON DELETE RESTRICT
 *     orders.orderDraftId        -> order_drafts ON DELETE RESTRICT
 *     orders/order_drafts.deliveryAddressId -> addresses (cascata de customers)
 *     campaigns.segmentId        -> customer_segments ON DELETE RESTRICT
 *
 * `RESTRICT` no Postgres é verificado NA HORA, sem esperar o fim da instrução. Se a
 * cascata do restaurante alcançar `customers` antes de `orders`, o banco recusa a
 * exclusão inteira com violação de chave estrangeira. Ou seja: apagar o restaurante
 * direto ou funciona por sorte de ordenação, ou explode no meio.
 *
 * Falhar é o comportamento CORRETO aqui — o perigo é o passo seguinte, quando
 * alguém, diante do erro, parte para SQL cru e apaga na mão sem rede. Por isso a
 * ordem é explícita, versionada e testada.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POR QUE A VARREDURA EXISTE (o buraco do órfão)
 *
 * 23 tabelas carregam `restaurantId` SEM chave estrangeira nenhuma — referência
 * "mole", escolhida de propósito em cada caso (log, ledger, evidência). A cascata
 * do banco não as enxerga. Apagar só o `restaurants` deixaria, entre outras:
 *
 *     crm_contact_ledger · crm_base_exclusions · referrals · menu_events
 *     media_uploads · support_tickets · brain_shadow_logs · restaurant_experiences
 *     customer_channel_identities · instagram_channel_configs · meta_oauth_states
 *
 * apontando para um restaurante que não existe mais. Linha órfã é pior que a linha
 * inteira: ela sobrevive a toda consulta por `restaurantId`, some de toda consulta
 * por `join`, e ninguém encontra de novo.
 *
 * O teste `restaurantPurgeMap.test.ts` relê o `schema.prisma` e reprova se aparecer
 * uma tabela nova com `restaurantId` que não esteja aqui. É guardrail 4 aplicado:
 * a regra não é "lembre de atualizar este arquivo", é um portão que trava.
 */

/**
 * OS DOIS QUE NÃO SE APAGAM. Trava de código, não de cuidado de quem roda.
 *
 * Decisão do CEO (06/08/2026): o admin fica só com estes dois. Eles são o alvo da
 * proteção justamente porque um comando de purga em massa erraria neles primeiro.
 */
export const SLUGS_PROTEGIDOS: readonly string[] = ["foocci-bakery", "sushi-cazza"];

/**
 * VARREDURA — tabelas com `restaurantId` que podem sair em qualquer ordem entre si.
 * Inclui as 23 sem chave estrangeira (as órfãs) e as de cascata que não participam
 * de nenhuma aresta RESTRICT.
 */
export const TABELAS_VARREDURA: readonly string[] = [
  "agency_projects",
  "agent_brain_versions",
  "agent_improvement_proposals",
  "agent_simulation_examples",
  "agent_simulation_runs",
  "agent_training_runs",
  "agent_training_scenarios",
  "ai_interaction_logs",
  "api_keys",
  "auto_simulator_configs",
  "brain_freeform_configs",
  "brain_shadow_logs",
  "business_hours",
  "campaign_executions",
  "crm_action_logs",
  "crm_agent_pilot_configs",
  "crm_automations",
  "crm_base_exclusions",
  "crm_contact_ledger",
  "crm_custom_actions",
  "customer_channel_identities",
  "customer_coupons",
  "customer_data_signals",
  "delivery_configs",
  "delivery_zones",
  "fiscal_configs",
  "fiscal_documents",
  "google_integration_configs",
  "google_oauth_states",
  "help_attachments",
  "help_threads",
  "import_jobs",
  "import_mapping_templates",
  "instagram_channel_configs",
  "integration_configs",
  "media_uploads",
  "menu_events",
  "menu_item_image_enhancements",
  "meta_message_templates",
  "meta_oauth_states",
  "meta_whatsapp_configs",
  "offers",
  "order_edit_logs",
  "payment_settings",
  "price_change_logs",
  "print_agents",
  "print_jobs",
  "print_stations",
  "product_sales_aggregates",
  "referrals",
  "restaurant_agent_profile_overrides",
  "restaurant_brand_configs",
  "restaurant_crm_profiles",
  "restaurant_experiences",
  "restaurant_knowledge_items",
  "restaurant_onboarding_statuses",
  "restaurant_pricing_configs",
  "restaurant_sound_settings",
  "simulation_runs",
  "store_policies",
  "store_profiles",
  "support_tickets",
  "tier_benefits",
  "tier_settings",
  "tracking_links",
  "users",
  "wa_menu_links",
  "waiter_result_evidence",
  "waiter_runtime_versions",
  "waiter_training_suggestions",
  "whatsapp_agent_configs",
  "whatsapp_ordering_sessions",
  "whatsapp_text_ordering_configs",
];

/**
 * CAUDA ORDENADA — aqui a ordem é obrigatória. Cada linha desta lista existe porque
 * uma aresta RESTRICT do banco reprovaria se ela viesse depois da seguinte.
 * Mexer nesta ordem sem mexer no `restaurantPurgeMap.test.ts` é quebrar a purga.
 */
export const TABELAS_ORDENADAS: readonly string[] = [
  "orders", //            antes de customers, order_drafts e addresses (3 arestas RESTRICT)
  "order_drafts", //      antes de customers e addresses
  "conversations", //     antes de customers
  "campaigns", //         antes de customer_segments (campaigns.segmentId RESTRICT)
  "customer_segments",
  "customers", //         cascata: addresses, customer_preferences, memberships
  "menu_categories", //   cascata: menu_items > variantes, extras, grupos de opção
  "ingredients", //       cascata: recipe_lines
  "promotions",
];

/** A ordem completa da purga, da primeira à última tabela. */
export const ORDEM_DE_PURGA: readonly string[] = [...TABELAS_VARREDURA, ...TABELAS_ORDENADAS];

/**
 * O ALCANCE PADRÃO DE CADA TABELA — e as duas em que ele mente.
 *
 * A purga varre por `WHERE "restaurantId" = $1`. Isso basta em 81 das 82 tabelas.
 * Em `campaign_executions` não basta, e o motivo é sutil o bastante para merecer
 * estar escrito: a coluna `restaurantId` ali é NULÁVEL e DESNORMALIZADA (existe
 * para consulta rápida por tenant, não como vínculo). Quem manda de verdade é
 * `campaignId`, obrigatório e em cascata.
 *
 * Consequência prática, e ela tem dois lados:
 *   · a EXCLUSÃO está certa mesmo assim — a linha com `restaurantId` nulo cai
 *     quando `campaigns` cai, pela cascata do banco;
 *   · a CONTAGEM e a EXPORTAÇÃO estariam ERRADAS — a simulação mostraria menos
 *     linhas do que somem, e a rede de segurança não guardaria o que vai sumir.
 *
 * Uma rede que não guarda tudo é pior que nenhuma rede: ela dá a sensação de
 * reversível para uma exclusão que não é. Por isso o alcance é corrigido aqui.
 */
export const ALCANCE_ESPECIAL: Readonly<Record<string, string>> = {
  campaign_executions: `"restaurantId" = $1 OR "campaignId" IN (SELECT "id" FROM "campaigns" WHERE "restaurantId" = $1)`,
};

/** Cláusula WHERE de uma tabela da ordem de purga — com a correção acima quando houver. */
export const ondeDaTabela = (tabela: string): string =>
  ALCANCE_ESPECIAL[tabela] ?? `"restaurantId" = $1`;

/**
 * O QUE **NÃO** SE APAGA, e por quê. Deixar de fora sem dizer é o mesmo erro do
 * órfão, ao contrário: some da purga e ninguém sabe que sobrou.
 */
export const TABELAS_PRESERVADAS: Readonly<Record<string, string>> = {
  plan_subscriptions:
    "Assinatura e cobrança. A chave é `onDelete: SetNull` (prisma/schema.prisma) — " +
    "apagar o restaurante NÃO apaga a assinatura, só desliga o vínculo. A linha " +
    "guarda `mpPreapprovalId`, que é uma recorrência viva no Mercado Pago: sem " +
    "cancelar lá, o cartão do lojista continua sendo debitado depois do restaurante " +
    "deixar de existir. Dinheiro não se apaga por cascata — quem decide é humano.",
};

/**
 * CONTAGENS PROFUNDAS — tabelas que somem por cascata e NÃO têm `restaurantId`.
 * Não entram na ordem de exclusão (o banco as leva junto do pai), mas entram na
 * simulação: sem elas o número que o CEO vê é menor do que o estrago real.
 *
 * O SQL é constante de código, nunca montado com entrada de usuário; o id do
 * restaurante viaja como parâmetro `$1`.
 */
export interface TabelaProfunda {
  /** Nome da tabela, como aparece no relatório. */
  tabela: string;
  /** Apelido do alvo dentro do `de` — é dele que a exportação puxa as colunas. */
  alias: string;
  /** Caminho até o restaurante, incluindo `WHERE ... = $1`. */
  de: string;
  /** Como se chega no restaurante, em português, para quem lê o relatório. */
  via: string;
}

export const TABELAS_PROFUNDAS: readonly TabelaProfunda[] = [
  {
    tabela: "order_items",
    alias: "oi",
    via: "orders",
    de: `FROM "order_items" oi JOIN "orders" o ON o."id" = oi."orderId" WHERE o."restaurantId" = $1`,
  },
  {
    tabela: "payments",
    alias: "p",
    via: "orders",
    de: `FROM "payments" p JOIN "orders" o ON o."id" = p."orderId" WHERE o."restaurantId" = $1`,
  },
  {
    tabela: "order_draft_items",
    alias: "i",
    via: "order_drafts",
    de: `FROM "order_draft_items" i JOIN "order_drafts" d ON d."id" = i."orderDraftId" WHERE d."restaurantId" = $1`,
  },
  {
    tabela: "messages",
    alias: "m",
    via: "conversations",
    de: `FROM "messages" m JOIN "conversations" c ON c."id" = m."conversationId" WHERE c."restaurantId" = $1`,
  },
  {
    tabela: "addresses",
    alias: "a",
    via: "customers",
    de: `FROM "addresses" a JOIN "customers" c ON c."id" = a."customerId" WHERE c."restaurantId" = $1`,
  },
  {
    tabela: "customer_preferences",
    alias: "p",
    via: "customers",
    de: `FROM "customer_preferences" p JOIN "customers" c ON c."id" = p."customerId" WHERE c."restaurantId" = $1`,
  },
  {
    tabela: "customer_segment_memberships",
    alias: "m",
    via: "customers",
    de: `FROM "customer_segment_memberships" m JOIN "customers" c ON c."id" = m."customerId" WHERE c."restaurantId" = $1`,
  },
  {
    tabela: "menu_items",
    alias: "i",
    via: "menu_categories",
    de: `FROM "menu_items" i JOIN "menu_categories" k ON k."id" = i."categoryId" WHERE k."restaurantId" = $1`,
  },
  {
    tabela: "menu_item_placements",
    alias: "p",
    via: "menu_categories",
    de: `FROM "menu_item_placements" p JOIN "menu_categories" k ON k."id" = p."categoryId" WHERE k."restaurantId" = $1`,
  },
  {
    tabela: "menu_item_variants",
    alias: "v",
    via: "menu_categories > menu_items",
    de: `FROM "menu_item_variants" v JOIN "menu_items" i ON i."id" = v."menuItemId" JOIN "menu_categories" k ON k."id" = i."categoryId" WHERE k."restaurantId" = $1`,
  },
  {
    tabela: "menu_item_extras",
    alias: "e",
    via: "menu_categories > menu_items",
    de: `FROM "menu_item_extras" e JOIN "menu_items" i ON i."id" = e."menuItemId" JOIN "menu_categories" k ON k."id" = i."categoryId" WHERE k."restaurantId" = $1`,
  },
  {
    tabela: "option_groups",
    alias: "g",
    via: "menu_categories > menu_items",
    de: `FROM "option_groups" g JOIN "menu_items" i ON i."id" = g."menuItemId" JOIN "menu_categories" k ON k."id" = i."categoryId" WHERE k."restaurantId" = $1`,
  },
  {
    tabela: "option_group_items",
    alias: "gi",
    via: "menu_categories > menu_items > option_groups",
    de: `FROM "option_group_items" gi JOIN "option_groups" g ON g."id" = gi."groupId" JOIN "menu_items" i ON i."id" = g."menuItemId" JOIN "menu_categories" k ON k."id" = i."categoryId" WHERE k."restaurantId" = $1`,
  },
  {
    tabela: "recipe_lines",
    alias: "r",
    via: "ingredients",
    de: `FROM "recipe_lines" r JOIN "ingredients" g ON g."id" = r."ingredientId" WHERE g."restaurantId" = $1`,
  },
  {
    tabela: "help_messages",
    alias: "m",
    via: "help_threads",
    de: `FROM "help_messages" m JOIN "help_threads" t ON t."id" = m."threadId" WHERE t."restaurantId" = $1`,
  },
  {
    tabela: "strategy_room_sessions",
    alias: "s",
    via: "agency_projects",
    de: `FROM "strategy_room_sessions" s JOIN "agency_projects" p ON p."id" = s."projectId" WHERE p."restaurantId" = $1`,
  },
];

/** COUNT da tabela profunda — usado só pela simulação. */
export const sqlContagemProfunda = (t: TabelaProfunda): string =>
  `SELECT COUNT(*)::bigint AS n ${t.de}`;

/**
 * SELECT da tabela profunda — usado só pela exportação. Puxa as colunas do ALVO
 * (`alias.*`), nunca `*`: `SELECT *` num JOIN traria as colunas do pai coladas nas
 * do filho e a exportação deixaria de ser fiel à tabela que ela diz representar.
 */
export const sqlExportProfundo = (t: TabelaProfunda): string => `SELECT ${t.alias}.* ${t.de}`;
