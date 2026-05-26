import type { ModuleId } from "@/lib/permissions";

const MODULE_DESTINATIONS: Partial<Record<ModuleId, string | undefined>> = {
  crm: import.meta.env.VITE_CRM_URL,
  omnihub: import.meta.env.VITE_OMNIHUB_URL,
  ads: import.meta.env.VITE_SAA_URL,
  botify: import.meta.env.VITE_BOTIFY_URL,
};

export function resolveModuleDestination(
  moduleId: ModuleId,
  destinations: Partial<Record<ModuleId, string | undefined>> = MODULE_DESTINATIONS,
): string | null {
  const destination = destinations[moduleId]?.trim();
  if (!destination) return null;

  try {
    const url = new URL(destination);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}
