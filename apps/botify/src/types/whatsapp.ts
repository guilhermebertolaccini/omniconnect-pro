export interface WhatsAppNumber {
  id: string;
  phoneNumber: string;
  displayPhoneNumber: string;
  verifiedName: string;
  qualityRating: 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';
  status: 'CONNECTED' | 'DISCONNECTED' | 'PENDING' | 'BANNED';
  wabaId: string;
  wabaName: string;
  businessManagerId: string;
  businessManagerName: string;
  messagingLimit: number;
  currentTier: string;
  createdAt: string;
  lastActive: string;
}

export interface BusinessManager {
  id: string;
  name: string;
  wabaCount: number;
  phoneNumberCount: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING_VERIFICATION';
}

export interface WABA {
  id: string;
  name: string;
  businessManagerId: string;
  phoneNumberCount: number;
  timezone: string;
  currency: string;
  status: 'ACTIVE' | 'SUSPENDED' | 'PENDING';
}

export interface MessageAnalytics {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  pending: number;
}

export interface DeliveryMetrics {
  totalSent: number;
  totalDelivered: number;
  totalRead: number;
  totalFailed: number;
  deliveryRate: number;
  readRate: number;
  failureRate: number;
}

export interface FailureReason {
  code: string;
  description: string;
  count: number;
  percentage: number;
}

export interface SpamReport {
  date: string;
  reportsReceived: number;
  blockedUsers: number;
  qualityImpact: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface PhoneNumberHealth {
  phoneNumberId: string;
  phoneNumber: string;
  qualityScore: number;
  messagesSent24h: number;
  deliveryRate24h: number;
  spamReports24h: number;
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL';
}
