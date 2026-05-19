/**
 * Tenant id válido para `X-Omni-Tenant-Id` na API interna
 * `GET /botify/internal/flows/:flowId/runtime-config`.
 *
 * Em Prisma, `Tenant.id` é `String @id` — pode ser UUID ou slug (ex.: seed `default-tenant`).
 */
export const BOTIFY_SYNC_TENANT_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidBotifySyncTenantId(value: string): boolean {
  const s = String(value ?? '').trim();
  return BOTIFY_SYNC_TENANT_ID_RE.test(s);
}
