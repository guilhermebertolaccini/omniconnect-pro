export type WebhookProvider = 'evolution' | 'meta';

export interface WebhookLogEntry {
  id: string;
  timestamp: string;
  instanceName: string;
  event: string;
  status: 'received' | 'error' | 'pending';
  payload: any;
  responseTime?: number;
  error?: string;
  provider: WebhookProvider;
  accountId?: string; // Meta account ID for association
  phoneNumberId?: string; // For Meta webhook identification
}

const STORAGE_KEY = 'webhook_logs';
const MAX_LOGS = 500;

class WebhookLogService {
  private logs: WebhookLogEntry[] = [];

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        this.logs = JSON.parse(saved);
      }
    } catch (error) {
      console.error('Error loading webhook logs:', error);
      this.logs = [];
    }
  }

  private saveToStorage(): void {
    try {
      // Keep only last MAX_LOGS entries
      const logsToSave = this.logs.slice(-MAX_LOGS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(logsToSave));
    } catch (error) {
      console.error('Error saving webhook logs:', error);
    }
  }

  addLog(entry: Omit<WebhookLogEntry, 'id' | 'timestamp'>): WebhookLogEntry {
    const newLog: WebhookLogEntry = {
      ...entry,
      id: `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      provider: entry.provider || 'evolution',
    };

    this.logs.push(newLog);
    this.saveToStorage();
    return newLog;
  }

  addMetaLog(entry: {
    event: string;
    status: WebhookLogEntry['status'];
    payload: any;
    phoneNumberId?: string;
    accountId?: string;
    responseTime?: number;
    error?: string;
  }): WebhookLogEntry {
    return this.addLog({
      instanceName: entry.phoneNumberId || 'meta-webhook',
      event: entry.event,
      status: entry.status,
      payload: entry.payload,
      provider: 'meta',
      accountId: entry.accountId,
      phoneNumberId: entry.phoneNumberId,
      responseTime: entry.responseTime,
      error: entry.error,
    });
  }

  getLogs(filters?: {
    instanceName?: string;
    event?: string;
    status?: WebhookLogEntry['status'];
    startDate?: Date;
    endDate?: Date;
    provider?: WebhookProvider;
    accountId?: string;
  }): WebhookLogEntry[] {
    let filtered = [...this.logs];

    if (filters?.instanceName) {
      filtered = filtered.filter((log) => log.instanceName === filters.instanceName);
    }

    if (filters?.event) {
      filtered = filtered.filter((log) => log.event === filters.event);
    }

    if (filters?.status) {
      filtered = filtered.filter((log) => log.status === filters.status);
    }

    if (filters?.startDate) {
      filtered = filtered.filter((log) => new Date(log.timestamp) >= filters.startDate!);
    }

    if (filters?.endDate) {
      filtered = filtered.filter((log) => new Date(log.timestamp) <= filters.endDate!);
    }

    if (filters?.provider) {
      filtered = filtered.filter((log) => log.provider === filters.provider);
    }

    if (filters?.accountId) {
      filtered = filtered.filter((log) => log.accountId === filters.accountId);
    }

    return filtered.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }

  getLogsByAccount(accountId: string): WebhookLogEntry[] {
    return this.getLogs({ provider: 'meta', accountId });
  }

  getMetaLogs(): WebhookLogEntry[] {
    return this.getLogs({ provider: 'meta' });
  }

  getEvolutionLogs(): WebhookLogEntry[] {
    return this.getLogs({ provider: 'evolution' });
  }

  getLogById(id: string): WebhookLogEntry | undefined {
    return this.logs.find((log) => log.id === id);
  }

  clearLogs(): void {
    this.logs = [];
    this.saveToStorage();
  }

  clearInstanceLogs(instanceName: string): void {
    this.logs = this.logs.filter((log) => log.instanceName !== instanceName);
    this.saveToStorage();
  }

  getStats(provider?: WebhookProvider): {
    total: number;
    received: number;
    errors: number;
    byEvent: Record<string, number>;
    byInstance: Record<string, number>;
    byAccount: Record<string, number>;
  } {
    const logsToAnalyze = provider 
      ? this.logs.filter(l => l.provider === provider)
      : this.logs;

    const stats = {
      total: logsToAnalyze.length,
      received: 0,
      errors: 0,
      byEvent: {} as Record<string, number>,
      byInstance: {} as Record<string, number>,
      byAccount: {} as Record<string, number>,
    };

    logsToAnalyze.forEach((log) => {
      if (log.status === 'received') stats.received++;
      if (log.status === 'error') stats.errors++;

      stats.byEvent[log.event] = (stats.byEvent[log.event] || 0) + 1;
      stats.byInstance[log.instanceName] = (stats.byInstance[log.instanceName] || 0) + 1;
      
      if (log.accountId) {
        stats.byAccount[log.accountId] = (stats.byAccount[log.accountId] || 0) + 1;
      }
    });

    return stats;
  }

  // Simulate receiving a webhook for testing
  simulateWebhook(instanceName: string, event: string, payload: any, provider: WebhookProvider = 'evolution'): WebhookLogEntry {
    return this.addLog({
      instanceName,
      event,
      status: 'received',
      payload,
      responseTime: Math.floor(Math.random() * 200) + 50,
      provider,
    });
  }

  // Export logs as JSON
  exportLogs(): string {
    return JSON.stringify(this.logs, null, 2);
  }
}

export const webhookLogService = new WebhookLogService();
