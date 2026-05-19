export type AlertType = 'quality_drop' | 'status_change' | 'messaging_limit' | 'health_degraded';

export type AlertSeverity = 'info' | 'warning' | 'critical';

export interface AlertConfig {
  id: string;
  name: string;
  enabled: boolean;
  type: AlertType;
  webhookUrl: string;
  conditions: {
    qualityThreshold?: 'GREEN' | 'YELLOW' | 'RED';
    statusChange?: boolean;
    messagingLimitBelow?: number;
  };
  createdAt: string;
  lastTriggered?: string;
}

export interface AlertEvent {
  id: string;
  alertConfigId: string;
  type: AlertType;
  severity: AlertSeverity;
  message: string;
  phoneNumber: string;
  phoneDisplayName: string;
  previousValue?: string;
  currentValue?: string;
  triggeredAt: string;
  webhookResponse?: {
    success: boolean;
    statusCode?: number;
    error?: string;
  };
}

export interface WebhookPayload {
  event: AlertType;
  severity: AlertSeverity;
  timestamp: string;
  phoneNumber: string;
  displayName: string;
  message: string;
  details: {
    previousValue?: string;
    currentValue?: string;
    qualityRating?: string;
    status?: string;
    messagingLimit?: number;
  };
}
