import { createFileRoute } from "@tanstack/react-router";
import { ModuleGate } from "@/components/module-gate";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_app/omnihub")({
  head: () => ({ meta: [{ title: "OmniHub — OmniconnectPRO" }] }),
  component: () => (
    <ModuleGate moduleId="omnihub">
      <ModulePlaceholder moduleId="omnihub" />
    </ModuleGate>
  ),
});
