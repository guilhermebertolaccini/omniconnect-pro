import { AlertConfig, AlertEvent, AlertType, AlertSeverity, WebhookPayload } from '@/types/alerts';
import { WhatsAppNumber } from '@/types/whatsapp';

const STORAGE_KEY = 'whatsapp_alert_configs';
const EVENTS_KEY = 'whatsapp_alert_events';
const LAST_STATE_KEY = 'whatsapp_last_state';

interface NumberState {
  phoneNumber: string;
  qualityRating: string;
  status: string;
  messagingLimit: number;
  lastChecked: string;
}

class AlertService {
  private configs: AlertConfig[] = [];
  private events: AlertEvent[] = [];
  private lastStates: Map<string, NumberState> = new Map();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const configsJson = localStorage.getItem(STORAGE_KEY);
      if (configsJson) {
        this.configs = JSON.parse(configsJson);
      }

      const eventsJson = localStorage.getItem(EVENTS_KEY);
      if (eventsJson) {
        this.events = JSON.parse(eventsJson);
      }

      const statesJson = localStorage.getItem(LAST_STATE_KEY);
      if (statesJson) {
        const states = JSON.parse(statesJson);
        this.lastStates = new Map(states);
      }
    } catch (error) {
      console.error('Error loading alert configs from storage:', error);
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.configs));
      localStorage.setItem(EVENTS_KEY, JSON.stringify(this.events.slice(-100))); // Keep last 100 events
      localStorage.setItem(LAST_STATE_KEY, JSON.stringify(Array.from(this.lastStates.entries())));
    } catch (error) {
      console.error('Error saving alert configs to storage:', error);
    }
  }

  getConfigs(): AlertConfig[] {
    return [...this.configs];
  }

  getEvents(): AlertEvent[] {
    return [...this.events].sort((a, b) => 
      new Date(b.triggeredAt).getTime() - new Date(a.triggeredAt).getTime()
    );
  }

  addConfig(config: Omit<AlertConfig, 'id' | 'createdAt'>): AlertConfig {
    const newConfig: AlertConfig = {
      ...config,
      id: `alert_${Date.now()}`,
      createdAt: new Date().toISOString(),
    };
    this.configs.push(newConfig);
    this.saveToStorage();
    return newConfig;
  }

  updateConfig(id: string, updates: Partial<AlertConfig>): AlertConfig | null {
    const index = this.configs.findIndex(c => c.id === id);
    if (index === -1) return null;

    this.configs[index] = { ...this.configs[index], ...updates };
    this.saveToStorage();
    return this.configs[index];
  }

  deleteConfig(id: string): boolean {
    const index = this.configs.findIndex(c => c.id === id);
    if (index === -1) return false;

    this.configs.splice(index, 1);
    this.saveToStorage();
    return true;
  }

  private getSeverity(type: AlertType, currentValue: string): AlertSeverity {
    if (type === 'quality_drop') {
      if (currentValue === 'RED') return 'critical';
      if (currentValue === 'YELLOW') return 'warning';
      return 'info';
    }
    if (type === 'status_change') {
      if (currentValue === 'DISCONNECTED' || currentValue === 'BANNED') return 'critical';
      if (currentValue === 'FLAGGED') return 'warning';
      return 'info';
    }
    if (type === 'health_degraded') {
      return 'warning';
    }
    return 'info';
  }

  private async sendWebhook(url: string, payload: WebhookPayload): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        mode: 'no-cors', // Allow cross-origin requests
      });

      // With no-cors, we can't read the response, but if no error, assume success
      return { success: true, statusCode: 200 };
    } catch (error) {
      console.error('Webhook error:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  async checkAndTriggerAlerts(numbers: WhatsAppNumber[]): Promise<AlertEvent[]> {
    const triggeredEvents: AlertEvent[] = [];
    const enabledConfigs = this.configs.filter(c => c.enabled);

    for (const number of numbers) {
      const lastState = this.lastStates.get(number.phoneNumber);
      
      for (const config of enabledConfigs) {
        let shouldTrigger = false;
        const alertType: AlertType = config.type;
        let message = '';
        let previousValue: string | undefined;
        let currentValue: string | undefined;

        // Check quality drop
        if (config.type === 'quality_drop' && config.conditions.qualityThreshold) {
          const qualityOrder = ['GREEN', 'YELLOW', 'RED'];
          const thresholdIndex = qualityOrder.indexOf(config.conditions.qualityThreshold);
          const currentIndex = qualityOrder.indexOf(number.qualityRating);
          
          if (currentIndex >= thresholdIndex) {
            if (!lastState || lastState.qualityRating !== number.qualityRating) {
              shouldTrigger = true;
              previousValue = lastState?.qualityRating;
              currentValue = number.qualityRating;
              message = `Qualidade do número ${number.verifiedName} caiu para ${number.qualityRating}`;
            }
          }
        }

        // Check status change
        if (config.type === 'status_change' && config.conditions.statusChange) {
          if (lastState && lastState.status !== number.status) {
            shouldTrigger = true;
            previousValue = lastState.status;
            currentValue = number.status;
            message = `Status do número ${number.verifiedName} mudou de ${lastState.status} para ${number.status}`;
          }
        }

        // Check messaging limit
        if (config.type === 'messaging_limit' && config.conditions.messagingLimitBelow) {
          const limitStr = typeof number.messagingLimit === 'string' ? number.messagingLimit : String(number.messagingLimit);
          const limit = parseInt(limitStr.replace(/[^0-9]/g, '')) || 0;
          if (limit < config.conditions.messagingLimitBelow) {
            if (!lastState || lastState.messagingLimit !== limit) {
              shouldTrigger = true;
              previousValue = lastState?.messagingLimit?.toString();
              currentValue = limit.toString();
              message = `Limite de mensagens do ${number.verifiedName} está abaixo de ${config.conditions.messagingLimitBelow}`;
            }
          }
        }

        if (shouldTrigger) {
          const severity = this.getSeverity(alertType, currentValue || '');
          
          const msgLimitStr = typeof number.messagingLimit === 'string' ? number.messagingLimit : String(number.messagingLimit);
          const payload: WebhookPayload = {
            event: alertType,
            severity,
            timestamp: new Date().toISOString(),
            phoneNumber: number.phoneNumber,
            displayName: number.verifiedName,
            message,
            details: {
              previousValue,
              currentValue,
              qualityRating: number.qualityRating,
              status: number.status,
              messagingLimit: parseInt(msgLimitStr.replace(/[^0-9]/g, '')) || 0,
            },
          };

          const webhookResponse = await this.sendWebhook(config.webhookUrl, payload);

          const event: AlertEvent = {
            id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            alertConfigId: config.id,
            type: alertType,
            severity,
            message,
            phoneNumber: number.phoneNumber,
            phoneDisplayName: number.verifiedName,
            previousValue,
            currentValue,
            triggeredAt: new Date().toISOString(),
            webhookResponse,
          };

          this.events.push(event);
          triggeredEvents.push(event);

          // Update last triggered
          config.lastTriggered = new Date().toISOString();
        }
      }

      // Update last state
      const msgLimitStrFinal = typeof number.messagingLimit === 'string' ? number.messagingLimit : String(number.messagingLimit);
      this.lastStates.set(number.phoneNumber, {
        phoneNumber: number.phoneNumber,
        qualityRating: number.qualityRating,
        status: number.status,
        messagingLimit: parseInt(msgLimitStrFinal.replace(/[^0-9]/g, '')) || 0,
        lastChecked: new Date().toISOString(),
      });
    }

    this.saveToStorage();
    return triggeredEvents;
  }

  clearEvents(): void {
    this.events = [];
    this.saveToStorage();
  }

  testWebhook(webhookUrl: string): Promise<{ success: boolean; statusCode?: number; error?: string }> {
    const testPayload: WebhookPayload = {
      event: 'quality_drop',
      severity: 'info',
      timestamp: new Date().toISOString(),
      phoneNumber: '+5511999999999',
      displayName: 'Teste',
      message: 'Este é um teste de webhook',
      details: {
        previousValue: 'GREEN',
        currentValue: 'YELLOW',
        qualityRating: 'YELLOW',
        status: 'CONNECTED',
        messagingLimit: 1000,
      },
    };

    return this.sendWebhook(webhookUrl, testPayload);
  }
}

export const alertService = new AlertService();
