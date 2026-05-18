import { useCallback } from "react";
import { useClients } from "@/contexts/ClientContext";
import { useContracts } from "@/contexts/ContractContext";
import { useFinancial } from "@/contexts/FinancialContext";
import { useProperties } from "@/contexts/PropertyContext";
import { useProposals } from "@/contexts/ProposalContext";
import { useCrmRealtime } from "@/hooks/use-crm-realtime";

export function CrmRealtimeBridge() {
  const properties = useProperties();
  const clients = useClients();
  const proposals = useProposals();
  const contracts = useContracts();
  const financial = useFinancial();

  const refreshAll = useCallback(() => {
    void Promise.all([
      properties.refresh(),
      clients.refresh(),
      proposals.refresh(),
      contracts.refresh(),
      financial.refresh(),
    ]);
  }, [clients, contracts, financial, properties, proposals]);

  useCrmRealtime(refreshAll);
  return null;
}
