/**
 * Role mapping — backend canónico ↔ rótulos de display do Hub.
 *
 * Autoridade: ADR-0003 §3. O enum `Role` do `@prisma/client` permanece
 * canónico no backend. O Hub mantém uma tabela de display que mapeia
 * cada papel canónico para um rótulo de UX usado em menus/labels — sem
 * acrescentar, remover ou renomear valores no backend.
 *
 * Quando um valor canónico novo aparecer (ex.: `executive` ficando real
 * via migration), atualizar aqui + atualizar `permissions.ts` + atualizar
 * a tabela em ADR-0003.
 */

import type { Role as HubDisplayRole } from "./permissions";

/**
 * Papéis canónicos no backend Omni (enum `Role` em Prisma).
 *
 * Mantemos como string literal union em vez de importar de
 * `@prisma/client` para evitar acoplar o frontend ao runtime do Prisma.
 */
export type BackendRole =
  | "admin"
  | "supervisor"
  | "operator"
  | "ativador"
  | "digital"
  | "broker";

/**
 * Mapa backend → display (Hub) per ADR-0003 §3.
 *
 * - `ceo_cfo` é provisionalmente um display de `digital` enquanto não
 *   houver papel `executive` canónico. Acesso C-level no piloto é
 *   protegido pelos roles do backend (`digital` já tem leitura dos
 *   `/insight-ai/dashboard/*`).
 * - `ativador` é um papel canónico sem entrada própria no menu Hub
 *   (apenas vistas admin); mapeamos para `admin` para não esconder o
 *   utilizador, mas o item de UX da entrada "Ativador" no menu fica
 *   coberto pelo bucket `admin`.
 */
export function backendToDisplayRole(role: BackendRole): HubDisplayRole {
  switch (role) {
    case "admin":
      return "admin";
    case "supervisor":
      return "gestor_comercial";
    case "operator":
      return "atendente";
    case "ativador":
      // Sem entrada própria — cai em admin para preservar acessos operacionais.
      return "admin";
    case "digital":
      return "analista_agencia";
    case "broker":
      return "corretor";
    default: {
      // Defesa: novo valor backend ainda não mapeado.
      // eslint-disable-next-line no-console
      console.warn(`[roleMapping] backend role "${role}" sem display; usando "admin"`);
      return "admin";
    }
  }
}

/**
 * Mapa display → backend (Hub) per ADR-0003 §3.1.
 *
 * Usado APENAS pelo switcher de UX em ambientes de demo/preview, jamais
 * para autorização. A autorização real é sempre `RolesGuard` no backend,
 * que lê o enum canónico do JWT.
 */
export function displayToBackendRole(role: HubDisplayRole): BackendRole {
  switch (role) {
    case "admin":
      return "admin";
    case "gestor_comercial":
      return "supervisor";
    case "atendente":
      return "operator";
    case "analista_agencia":
      return "digital";
    case "ceo_cfo":
      // Provisional — ver ADR-0003 §3.1; até virar enum, é display de `digital`.
      return "digital";
    case "corretor":
      return "broker";
    default:
      return "admin";
  }
}
