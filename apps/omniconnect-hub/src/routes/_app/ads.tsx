import { createFileRoute } from "@tanstack/react-router";
import { ModuleGate } from "@/components/module-gate";
import { ModulePlaceholder } from "@/components/module-placeholder";

export const Route = createFileRoute("/_app/ads")({
  head: () => ({ meta: [{ title: "Ads Manager — OmniconnectPRO" }] }),
  component: () => (
    <ModuleGate moduleId="ads">
      <ModulePlaceholder moduleId="ads" />
    </ModuleGate>
  ),
});
