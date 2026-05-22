export type Role =
  | "corretor"
  | "atendente"
  | "gestor_comercial"
  | "analista_agencia"
  | "ceo_cfo"
  | "admin";

export const ROLE_LABELS: Record<Role, string> = {
  corretor: "Corretor",
  atendente: "Atendente",
  gestor_comercial: "Gestor Comercial",
  analista_agencia: "Analista da Agência",
  ceo_cfo: "CEO / CFO",
  admin: "Administrador",
};

export type ModuleId =
  | "crm"
  | "omnihub"
  | "ads"
  | "botify"
  | "insightai"
  | "executive"
  | "leads"
  | "journeys";

export const MODULE_ACCESS: Record<Role, ModuleId[]> = {
  corretor: ["crm", "omnihub", "leads"],
  atendente: ["omnihub", "leads"],
  gestor_comercial: ["crm", "omnihub", "insightai", "leads", "journeys"],
  analista_agencia: ["ads", "insightai", "botify", "journeys", "leads"],
  ceo_cfo: ["executive", "insightai", "leads"],
  admin: [
    "crm",
    "omnihub",
    "ads",
    "botify",
    "insightai",
    "executive",
    "leads",
    "journeys",
  ],
};

export function hasModuleAccess(role: Role, moduleId: ModuleId): boolean {
  return MODULE_ACCESS[role].includes(moduleId);
}
