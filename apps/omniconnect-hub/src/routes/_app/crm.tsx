import { createFileRoute } from "@tanstack/react-router";
import { ModuleGate } from "@/components/module-gate";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_app/crm")({
  head: () => ({ meta: [{ title: "CRM Imobiliário — OmniconnectPRO" }] }),
  component: () => (
    <ModuleGate moduleId="crm">
      <ModulePlaceholder moduleId="crm" />
    </ModuleGate>
  ),
});
