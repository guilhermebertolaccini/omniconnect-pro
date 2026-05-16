export interface CampaignContact {
  name: string;
  phone: string;
  cpf?: string;
  contract?: string;
  segment?: number;
  variables?: Array<{ key: string; value: string }>;
}
