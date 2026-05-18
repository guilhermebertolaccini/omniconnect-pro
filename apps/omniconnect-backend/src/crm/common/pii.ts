/**
 * Helpers compartilhados entre todos os módulos do CRM (Sprint 3).
 *
 * - {@link maskCpfCnpj}: oculta dígitos centrais de CPF/CNPJ para listas e
 *   logs. Mantém máscara visual (`***`) só para reconhecer formato.
 * - {@link summarizeClient}: shape público de CrmClient sem PII completa.
 *
 * Use isso na camada Service / DTO de retorno SEM exceção quando o cenário
 * for "lista paginada" ou "preview". Detalhes só com auditoria via
 * CrmDocumentAccessLog ou outro chokepoint.
 */
import type { CrmClient } from '@prisma/client';

/** Mascarar CPF/CNPJ preservando 3 últimos caracteres. */
export function maskCpfCnpj(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  const tail = digits.slice(-3);
  return `***${tail}`;
}

/** Mascarar email mantendo letra inicial e domínio. */
export function maskEmail(value: string | null | undefined): string | null {
  if (!value) return null;
  const [local, domain] = value.split('@');
  if (!domain) return '***';
  if (!local) return `***@${domain}`;
  return `${local[0]}***@${domain}`;
}

/** Mascarar telefone preservando DDD + 2 últimos. */
export function maskPhone(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `${digits.slice(0, 2)}*****${digits.slice(-2)}`;
}

export interface CrmClientSummary {
  id: string;
  name: string;
  cpfCnpj: string | null;
  phone: string | null;
  email: string | null;
  score: CrmClient['score'] | null;
  brokerId: number | null;
}

/** Saída segura de lista — nunca devolve `income`, `notes`, full PII. */
export function summarizeClient(row: CrmClient): CrmClientSummary {
  return {
    id: row.id,
    name: row.name,
    cpfCnpj: maskCpfCnpj(row.cpfCnpj),
    phone: maskPhone(row.phone),
    email: maskEmail(row.email),
    score: row.score,
    brokerId: row.brokerId,
  };
}
