import { EvolutionInstance, EvolutionConfig, EvolutionQRCode, EvolutionConnectionState } from '@/types/evolution';

const STORAGE_KEY = 'evolution_config';

class EvolutionAPIService {
  private config: EvolutionConfig | null = null;

  constructor() {
    this.loadConfig();
  }

  private loadConfig(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.config = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Error loading Evolution config:', error);
    }
  }

  saveConfig(config: EvolutionConfig): void {
    this.config = config;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  }

  getConfig(): EvolutionConfig | null {
    return this.config;
  }

  clearConfig(): void {
    this.config = null;
    localStorage.removeItem(STORAGE_KEY);
  }

  private getHeaders(): HeadersInit {
    return {
      'Content-Type': 'application/json',
      'apikey': this.config?.apiKey || '',
    };
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.config?.serverUrl) {
      throw new Error('Evolution API not configured');
    }

    const url = `${this.config.serverUrl.replace(/\/$/, '')}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        ...this.getHeaders(),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || `Request failed: ${response.status}`);
    }

    return response.json();
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      await this.request('/instance/fetchInstances');
      return { success: true };
    } catch (error) {
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Connection failed' 
      };
    }
  }

  async fetchInstances(): Promise<EvolutionInstance[]> {
    try {
      const response = await this.request<any[]>('/instance/fetchInstances');
      return response.map((inst) => ({
        id: inst.instance?.instanceId || inst.instanceName,
        name: inst.instance?.instanceName || inst.instanceName,
        status: inst.instance?.status || 'close',
        phoneNumber: inst.instance?.owner,
        profileName: inst.instance?.profileName,
        profilePicture: inst.instance?.profilePictureUrl,
        createdAt: inst.instance?.createdAt || new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error fetching instances:', error);
      return [];
    }
  }

  async createInstance(instanceName: string, options?: {
    qrcode?: boolean;
    integration?: string;
  }): Promise<{ instance: EvolutionInstance; qrcode?: EvolutionQRCode }> {
    const response = await this.request<any>('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName,
        qrcode: options?.qrcode ?? true,
        integration: options?.integration || 'WHATSAPP-BAILEYS',
      }),
    });

    return {
      instance: {
        id: response.instance?.instanceId || instanceName,
        name: response.instance?.instanceName || instanceName,
        status: response.instance?.status || 'connecting',
        createdAt: new Date().toISOString(),
      },
      qrcode: response.qrcode ? {
        code: response.qrcode.code,
        base64: response.qrcode.base64,
        pairingCode: response.qrcode.pairingCode,
      } : undefined,
    };
  }

  async getQRCode(instanceName: string): Promise<EvolutionQRCode> {
    const response = await this.request<any>(`/instance/connect/${instanceName}`);
    
    return {
      code: response.code || response.qrcode?.code,
      base64: response.base64 || response.qrcode?.base64,
      pairingCode: response.pairingCode,
    };
  }

  async getConnectionState(instanceName: string): Promise<EvolutionConnectionState> {
    const response = await this.request<any>(`/instance/connectionState/${instanceName}`);
    
    return {
      instance: instanceName,
      state: response.instance?.state || response.state || 'close',
    };
  }

  async logout(instanceName: string): Promise<void> {
    await this.request(`/instance/logout/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async deleteInstance(instanceName: string): Promise<void> {
    await this.request(`/instance/delete/${instanceName}`, {
      method: 'DELETE',
    });
  }

  async restartInstance(instanceName: string): Promise<void> {
    await this.request(`/instance/restart/${instanceName}`, {
      method: 'PUT',
    });
  }

  async setWebhook(instanceName: string, webhookUrl: string, events: string[]): Promise<void> {
    await this.request(`/webhook/set/${instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        url: webhookUrl,
        events,
        webhook_by_events: true,
        webhook_base64: false,
      }),
    });
  }

  async getWebhook(instanceName: string): Promise<{ url: string; events: string[]; enabled: boolean } | null> {
    try {
      const response = await this.request<any>(`/webhook/find/${instanceName}`);
      return {
        url: response.url || response.webhook?.url || '',
        events: response.events || response.webhook?.events || [],
        enabled: response.enabled ?? response.webhook?.enabled ?? true,
      };
    } catch (error) {
      console.error('Error fetching webhook:', error);
      return null;
    }
  }

  async autoConfigureWebhook(instanceName: string): Promise<boolean> {
    if (!this.config?.webhookUrl || !this.config?.autoConfigureWebhook) {
      return false;
    }

    try {
      const events = this.config.webhookEvents || [
        'MESSAGES_UPSERT',
        'MESSAGES_UPDATE',
        'CONNECTION_UPDATE',
        'QRCODE_UPDATED',
        'SEND_MESSAGE',
      ];

      await this.setWebhook(instanceName, this.config.webhookUrl, events);
      return true;
    } catch (error) {
      console.error('Error auto-configuring webhook:', error);
      return false;
    }
  }
}

export const evolutionAPI = new EvolutionAPIService();
