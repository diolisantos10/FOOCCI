/**
 * Cofre de credenciais de infraestrutura — guardar uma vez, parar de regerar.
 *
 * Pedido do CEO: "não aguento mais gerar token". O token do Railway passa a morar aqui,
 * criptografado, em vez de ser gerado, usado e perdido.
 *
 * As quatro travas desta camada — todas por código, nenhuma por comentário:
 *
 * 1. CRIPTOGRAFADO EM REPOUSO com o mesmo `encrypt()/decrypt()` de `@/lib/crypto`
 *    (AES-256-GCM, `ENCRYPTION_KEY`) que já guarda o segredo do app da Meta. Não se
 *    inventa esquema de cripto novo para o mesmo problema.
 *
 * 2. ESCRITA-SÓ. Nenhuma função pública devolve o valor ao navegador. `list()` monta a
 *    vista da tela a partir de `last4`/`tokenLength` gravados no save — LISTAR NÃO
 *    DESCRIPTOGRAFA. Quem quer o valor precisa chamar `useToken()`, que é servidor-só e
 *    deixa rastro.
 *
 * 3. VALIDAÇÃO NA HORA DE SALVAR. Token que o serviço RECUSOU não entra no cofre
 *    (`InvalidCredentialError`). Token que não deu para testar entra marcado
 *    `validationStatus: "unknown"` e a tela diz isso — silêncio da rede não é aprovação.
 *
 * 4. TRILHA DE USO. Toda leitura grava `InfraCredentialAccess` + `auditLog`, inclusive
 *    quando falha. Chave-mestra sem trilha é risco cego.
 */

import { prisma } from "@/lib/prisma";
import { encrypt, decrypt } from "@/lib/crypto";
import { auditLog } from "@/lib/audit";
import {
  INFRA_SERVICES,
  findService,
  SLUG_RE,
  type ValidationStatus,
} from "./infraProviders";

/** O serviço respondeu recusando o token. Não guardamos lixo em silêncio. */
export class InvalidCredentialError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidCredentialError";
  }
}

/** Entrada inválida vinda da tela (slug fora do padrão, token vazio, etc.). */
export class CredentialInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialInputError";
  }
}

/** O que a tela recebe. Repare no que NÃO tem aqui: o token. */
export interface CredentialView {
  service: string;
  label: string;
  /** Descrições do catálogo, quando o serviço é conhecido. */
  whatItIs: string | null;
  whereToGet: string | null;
  blastRadius: string | null;
  /** Este serviço sabe se testar? Se não, o "não validado" não é culpa de ninguém. */
  canValidate: boolean;
  /** false = ainda não tem token guardado. */
  stored: boolean;
  /** Só os 4 últimos caracteres. Nunca mais que isso. */
  last4: string | null;
  tokenLength: number | null;
  savedBy: string | null;
  savedAt: string | null;
  validationStatus: ValidationStatus | null;
  validationDetail: string | null;
  validatedAt: string | null;
  /** Quantas vezes o token já foi lido para uso. */
  useCount: number;
  lastUsedAt: string | null;
}

export interface AccessEntry {
  service: string;
  actor: string;
  purpose: string;
  outcome: string;
  at: string;
}

export interface SaveResult {
  view: CredentialView;
  validationStatus: ValidationStatus;
  validationDetail: string;
}

/** Resultado de uma leitura para uso. Só circula no servidor. */
export type UseTokenResult =
  | { ok: true; token: string }
  | { ok: false; reason: "missing" | "decrypt_failed"; message: string };

function last4Of(token: string): string {
  return token.length <= 4 ? "*".repeat(token.length) : token.slice(-4);
}

function iso(d: Date | null | undefined): string | null {
  return d ? d.toISOString() : null;
}

type Row = {
  service: string;
  label: string;
  last4: string;
  tokenLength: number;
  savedBy: string | null;
  validationStatus: string;
  validationDetail: string | null;
  validatedAt: Date | null;
  updatedAt: Date;
};

function viewOf(row: Row | null, slug: string, fallbackLabel: string, usage: { count: number; lastAt: Date | null }): CredentialView {
  const def = findService(slug);
  return {
    service: slug,
    label: row?.label ?? def?.label ?? fallbackLabel,
    whatItIs: def?.whatItIs ?? null,
    whereToGet: def?.whereToGet ?? null,
    blastRadius: def?.blastRadius ?? null,
    canValidate: !!def?.validate,
    stored: !!row,
    last4: row?.last4 ?? null,
    tokenLength: row?.tokenLength ?? null,
    savedBy: row?.savedBy ?? null,
    savedAt: iso(row?.updatedAt),
    validationStatus: (row?.validationStatus as ValidationStatus | undefined) ?? null,
    validationDetail: row?.validationDetail ?? null,
    validatedAt: iso(row?.validatedAt),
    useCount: usage.count,
    lastUsedAt: iso(usage.lastAt),
  };
}

export const InfraCredentialService = {
  /**
   * A vista da tela: um item por serviço do catálogo (mesmo sem token guardado, para o
   * CEO ver o que PODE guardar) mais os serviços avulsos já cadastrados.
   *
   * Não descriptografa nada. Abrir a tela não toca no segredo.
   */
  async list(): Promise<CredentialView[]> {
    let rows: Row[] = [];
    try {
      rows = (await prisma.infraCredential.findMany({ orderBy: { service: "asc" } })) as Row[];
    } catch (err) {
      // Tabela ainda não migrada: a tela mostra o catálogo vazio em vez de quebrar.
      console.error("[InfraCredential] leitura falhou — mostrando catálogo vazio", err);
    }

    const usage = await this.usageBySlug(rows.map((r) => r.service));

    const bySlug = new Map(rows.map((r) => [r.service, r]));
    const slugs = [
      ...INFRA_SERVICES.map((s) => s.slug),
      ...rows.map((r) => r.service).filter((s) => !findService(s)),
    ];

    return slugs.map((slug) =>
      viewOf(bySlug.get(slug) ?? null, slug, slug, usage.get(slug) ?? { count: 0, lastAt: null }),
    );
  },

  /** Contagem e data do último uso por serviço, para a tela. */
  async usageBySlug(extraSlugs: string[] = []): Promise<Map<string, { count: number; lastAt: Date | null }>> {
    const out = new Map<string, { count: number; lastAt: Date | null }>();
    void extraSlugs;
    try {
      const grouped = await prisma.infraCredentialAccess.groupBy({
        by: ["service"],
        where: { outcome: "ok" },
        _count: { _all: true },
        _max: { createdAt: true },
      });
      for (const g of grouped) {
        out.set(g.service, { count: g._count._all, lastAt: g._max.createdAt ?? null });
      }
    } catch (err) {
      console.error("[InfraCredential] trilha indisponível", err);
    }
    return out;
  },

  /** Últimas leituras registradas — é isto que prova que a trilha existe. */
  async recentAccess(limit = 20): Promise<AccessEntry[]> {
    try {
      const rows = await prisma.infraCredentialAccess.findMany({
        orderBy: { createdAt: "desc" },
        take: limit,
      });
      return rows.map((r) => ({
        service: r.service,
        actor: r.actor,
        purpose: r.purpose,
        outcome: r.outcome,
        at: r.createdAt.toISOString(),
      }));
    } catch (err) {
      console.error("[InfraCredential] trilha indisponível", err);
      return [];
    }
  },

  /**
   * Guarda (ou troca) o token de um serviço.
   *
   * Ordem deliberada: VALIDA primeiro, grava depois. Um token recusado nunca chega ao
   * banco — nem por um instante, nem "para corrigir depois".
   */
  async save(input: {
    service: string;
    label?: string;
    token: string;
    savedBy?: string;
  }): Promise<SaveResult> {
    const slug = input.service.trim().toLowerCase();
    if (!SLUG_RE.test(slug)) {
      throw new CredentialInputError(
        'O nome do serviço aceita só letras minúsculas, números e hífen (ex.: "railway").',
      );
    }

    const token = input.token.trim();
    if (token.length < 8) {
      throw new CredentialInputError(
        "Isso não parece um token — está curto demais. Copie o código inteiro do serviço.",
      );
    }

    const def = findService(slug);
    const label = (input.label ?? "").trim() || def?.label || slug;

    let status: ValidationStatus = "unknown";
    let detail = def
      ? "Guardei sem testar — ainda não sei como perguntar a este serviço se o código está certo."
      : "Serviço adicionado à mão: guardei sem testar, porque não sei como perguntar a ele se o código está certo.";

    if (def?.validate) {
      const result = await def.validate(token);
      if (result.status === "invalid") {
        // Não gravamos. Nem uma linha, nem "para corrigir depois".
        auditLog({
          action: "infra_credential.save_rejected",
          targetId: slug,
          userId: input.savedBy ?? "admin",
          meta: { reason: "validation_failed" },
        });
        throw new InvalidCredentialError(result.detail);
      }
      status = result.status;
      detail = result.detail;
    }

    const data = {
      label,
      tokenEncrypted: encrypt(token),
      last4: last4Of(token),
      tokenLength: token.length,
      savedBy: input.savedBy ?? "admin",
      validationStatus: status,
      validationDetail: detail,
      validatedAt: status === "valid" ? new Date() : null,
    };

    await prisma.infraCredential.upsert({
      where: { service: slug },
      create: { service: slug, ...data },
      update: data,
    });

    auditLog({
      action: "infra_credential.save",
      targetId: slug,
      userId: input.savedBy ?? "admin",
      // last4 é o máximo que pode aparecer em log. O token, nunca.
      meta: { last4: data.last4, validation: status },
    });

    const row = (await prisma.infraCredential.findUnique({ where: { service: slug } })) as Row | null;
    const usage = await this.usageBySlug();
    return {
      view: viewOf(row, slug, label, usage.get(slug) ?? { count: 0, lastAt: null }),
      validationStatus: status,
      validationDetail: detail,
    };
  },

  /** Apaga o token. A trilha de quem já o usou permanece (ON DELETE SET NULL). */
  async remove(service: string, actor = "admin"): Promise<boolean> {
    const slug = service.trim().toLowerCase();
    try {
      await prisma.infraCredential.delete({ where: { service: slug } });
    } catch {
      return false;
    }
    auditLog({ action: "infra_credential.delete", targetId: slug, userId: actor });
    return true;
  },

  /**
   * A ÚNICA porta para o valor em texto puro — servidor-só. Jamais chame isto a partir
   * de uma rota que responda ao navegador com o resultado.
   *
   * `purpose` é obrigatório e vai para a trilha: leitura sem motivo declarado é leitura
   * cega, e chave-mestra não admite leitura cega.
   */
  async useToken(
    service: string,
    context: { actor: string; purpose: string },
  ): Promise<UseTokenResult> {
    const slug = service.trim().toLowerCase();
    const actor = context.actor.trim() || "desconhecido";
    const purpose = context.purpose.trim();
    if (!purpose) {
      throw new CredentialInputError("Toda leitura de credencial precisa declarar para quê.");
    }

    let row: { id: string; tokenEncrypted: string } | null = null;
    try {
      row = await prisma.infraCredential.findUnique({
        where: { service: slug },
        select: { id: true, tokenEncrypted: true },
      });
    } catch (err) {
      console.error("[InfraCredential] leitura falhou", err);
    }

    if (!row) {
      await this.recordAccess(null, slug, actor, purpose, "missing");
      return {
        ok: false,
        reason: "missing",
        message: `Não há credencial guardada para "${slug}".`,
      };
    }

    let token: string;
    try {
      token = decrypt(row.tokenEncrypted);
    } catch {
      await this.recordAccess(row.id, slug, actor, purpose, "decrypt_failed");
      return {
        ok: false,
        reason: "decrypt_failed",
        message:
          "A credencial guardada não pôde ser aberta (ENCRYPTION_KEY trocada ou registro corrompido). Salve o token de novo.",
      };
    }

    await this.recordAccess(row.id, slug, actor, purpose, "ok");
    return { ok: true, token };
  },

  /**
   * Grava a linha de trilha. Nunca lança: uma falha de auditoria não pode derrubar quem
   * está trabalhando — mas também não pode passar despercebida, então grita no log.
   */
  async recordAccess(
    credentialId: string | null,
    service: string,
    actor: string,
    purpose: string,
    outcome: "ok" | "missing" | "decrypt_failed",
  ): Promise<void> {
    auditLog({
      action: "infra_credential.read",
      targetId: service,
      userId: actor,
      meta: { purpose, outcome },
    });
    try {
      await prisma.infraCredentialAccess.create({
        data: { credentialId, service, actor, purpose, outcome },
      });
    } catch (err) {
      console.error("[InfraCredential] NÃO consegui gravar a trilha de acesso", {
        service,
        actor,
        purpose,
        outcome,
        err,
      });
    }
  },
};
