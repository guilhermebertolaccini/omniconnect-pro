import { createFileRoute } from "@tanstack/react-router";
import { ModuleGate } from "@/components/module-gate";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_app/botify")({
  head: () => ({ meta: [{ title: "Botify — OmniconnectPRO" }] }),
  component: () => (
    <ModuleGate moduleId="botify">
      <ModulePlaceholder moduleId="botify" />
    </ModuleGate>
  ),
});
