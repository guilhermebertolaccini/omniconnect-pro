export interface EvolutionInstance {
  id: string;
  name: string;
  status: 'open' | 'close' | 'connecting' | 'qrcode';
  phoneNumber?: string;
  profileName?: string;
  profilePicture?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EvolutionConfig {
  serverUrl: string;
  apiKey: string;
  instanceName?: string;
  webhookUrl?: string;
  webhookEvents?: string[];
  autoConfigureWebhook?: boolean;
}

export interface EvolutionQRCode {
  code: string;
  base64: string;
  pairingCode?: string;
}

export interface EvolutionConnectionState {
  instance: string;
  state: 'open' | 'close' | 'connecting';
}

export interface EvolutionWebhook {
  url: string;
  events: string[];
  enabled: boolean;
}

export type ApiProvider = 'meta' | 'evolution';
