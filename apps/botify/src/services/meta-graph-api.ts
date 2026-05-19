import type {
  WhatsAppNumber,
  BusinessManager,
  WABA,
  MessageAnalytics,
  DeliveryMetrics,
  FailureReason,
  SpamReport,
} from '@/types/whatsapp';

const META_GRAPH_API_VERSION = 'v18.0';
const META_GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_API_VERSION}`;

// Error codes mapping
const ERROR_CODE_DESCRIPTIONS: Record<string, string> = {
  '131047': 'Número inválido ou inexistente',
  '131051': 'Limite de mensagens excedido',
  '131026': 'Usuário bloqueou o remetente',
  '130472': 'Template não aprovado',
  '131053': 'Mídia inválida ou corrompida',
  '131031': 'Conta desconectada',
  '131021': 'Mensagem não entregue - destinatário offline',
  '131045': 'Tempo limite de resposta excedido',
  '132000': 'Erro de parâmetro',
  '133010': 'Número não registrado no WhatsApp',
};

interface MetaAPIError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

interface MetaAPIResponse<T> {
  data?: T;
  error?: MetaAPIError;
  paging?: {
    cursors: {
      before: string;
      after: string;
    };
    next?: string;
  };
}

interface ConversationAnalytics {
  start: number;
  end: number;
  granularity: 'HALF_HOUR' | 'DAILY' | 'MONTHLY';
  data_points: Array<{
    start: number;
    end: number;
    sent: number;
    delivered: number;
    read: number;
    conversation: number;
  }>;
}

interface PhoneNumberFromAPI {
  id: string;
  display_phone_number: string;
  verified_name: string;
  quality_rating: string;
  status: string;
  messaging_limit_tier?: string;
  name_status?: string;
}

interface WABAFromAPI {
  id: string;
  name: string;
  timezone_id: string;
  currency: string;
  account_review_status?: string;
  business_verification_status?: string;
}

interface BusinessFromAPI {
  id: string;
  name: string;
  verification_status?: string;
}

class MetaGraphAPIService {
  private accessToken: string | null = null;
  private cachedData: {
    businessManagers: BusinessManager[];
    wabas: WABA[];
    phoneNumbers: WhatsAppNumber[];
    lastFetch: number;
  } = {
    businessManagers: [],
    wabas: [],
    phoneNumbers: [],
    lastFetch: 0,
  };

  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  setAccessToken(token: string) {
    this.accessToken = token;
    this.clearCache();
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  clearCache() {
    this.cachedData = {
      businessManagers: [],
      wabas: [],
      phoneNumbers: [],
      lastFetch: 0,
    };
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<MetaAPIResponse<T>> {
    if (!this.accessToken) {
      throw new Error('Access token não configurado');
    }

    const url = new URL(`${META_GRAPH_API_BASE}/${endpoint}`);
    url.searchParams.append('access_token', this.accessToken);

    const response = await fetch(url.toString(), {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const data = await response.json();

    if (data.error) {
      throw new Error(data.error.message || 'Erro na API da Meta');
    }

    return data;
  }

  // Fetch all WABAs for a Business Manager
  async getWABAs(businessManagerId: string): Promise<WABA[]> {
    try {
      const response = await this.request<WABAFromAPI[]>(
        `${businessManagerId}/owned_whatsapp_business_accounts`,
        { method: 'GET' }
      );

      if (!response.data) return [];

      const wabas: WABA[] = await Promise.all(
        response.data.map(async (waba) => {
          const phoneNumbers = await this.getPhoneNumbers(waba.id);
          return {
            id: waba.id,
            name: waba.name,
            businessManagerId,
            phoneNumberCount: phoneNumbers.length,
            timezone: waba.timezone_id || 'America/Sao_Paulo',
            currency: waba.currency || 'BRL',
            status: this.mapWABAStatus(waba.account_review_status),
          };
        })
      );

      return wabas;
    } catch (error) {
      console.error('Error fetching WABAs:', error);
      throw error;
    }
  }

  // Fetch all phone numbers for a WABA
  async getPhoneNumbers(wabaId: string): Promise<WhatsAppNumber[]> {
    try {
      const response = await this.request<PhoneNumberFromAPI[]>(
        `${wabaId}/phone_numbers`,
        { method: 'GET' }
      );

      if (!response.data) return [];

      // Get WABA details for context
      const wabaDetails = await this.getWABADetails(wabaId);

      return response.data.map((phone) => ({
        id: phone.id,
        phoneNumber: phone.display_phone_number.replace(/\D/g, ''),
        displayPhoneNumber: phone.display_phone_number,
        verifiedName: phone.verified_name,
        qualityRating: this.mapQualityRating(phone.quality_rating),
        status: this.mapPhoneStatus(phone.status),
        wabaId,
        wabaName: wabaDetails?.name || 'WABA',
        businessManagerId: wabaDetails?.businessManagerId || '',
        businessManagerName: wabaDetails?.businessManagerName || '',
        messagingLimit: this.parseMessagingLimit(phone.messaging_limit_tier),
        currentTier: phone.messaging_limit_tier || 'UNKNOWN',
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Error fetching phone numbers:', error);
      throw error;
    }
  }

  // Get WABA details
  async getWABADetails(wabaId: string): Promise<{
    name: string;
    businessManagerId: string;
    businessManagerName: string;
  } | null> {
    try {
      const response = await this.request<WABAFromAPI>(
        `${wabaId}?fields=id,name,owner_business_info`,
        { method: 'GET' }
      );

      return {
        name: (response as any).name || 'WABA',
        businessManagerId: (response as any).owner_business_info?.id || '',
        businessManagerName: (response as any).owner_business_info?.name || '',
      };
    } catch {
      return null;
    }
  }

  // Fetch message analytics for a phone number
  async getMessageAnalytics(
    wabaId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    analytics: MessageAnalytics[];
    metrics: DeliveryMetrics;
  }> {
    try {
      const startTimestamp = Math.floor(startDate.getTime() / 1000);
      const endTimestamp = Math.floor(endDate.getTime() / 1000);

      const response = await this.request<ConversationAnalytics>(
        `${wabaId}/conversation_analytics?start=${startTimestamp}&end=${endTimestamp}&granularity=DAILY&phone_numbers=[]&metric_types=["SENT","DELIVERED","READ"]`,
        { method: 'GET' }
      );

      const dataPoints = (response as any).data_points || [];

      let totalSent = 0;
      let totalDelivered = 0;
      let totalRead = 0;

      const analytics: MessageAnalytics[] = dataPoints.map((point: any) => {
        const sent = point.sent || 0;
        const delivered = point.delivered || 0;
        const read = point.read || 0;
        const failed = Math.max(0, sent - delivered);

        totalSent += sent;
        totalDelivered += delivered;
        totalRead += read;

        return {
          date: new Date(point.start * 1000).toLocaleDateString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
          }),
          sent,
          delivered,
          read,
          failed,
          pending: 0,
        };
      });

      const totalFailed = Math.max(0, totalSent - totalDelivered);

      const metrics: DeliveryMetrics = {
        totalSent,
        totalDelivered,
        totalRead,
        totalFailed,
        deliveryRate: totalSent > 0 ? (totalDelivered / totalSent) * 100 : 0,
        readRate: totalDelivered > 0 ? (totalRead / totalDelivered) * 100 : 0,
        failureRate: totalSent > 0 ? (totalFailed / totalSent) * 100 : 0,
      };

      return { analytics, metrics };
    } catch (error) {
      console.error('Error fetching message analytics:', error);
      // Return empty data on error
      return {
        analytics: [],
        metrics: {
          totalSent: 0,
          totalDelivered: 0,
          totalRead: 0,
          totalFailed: 0,
          deliveryRate: 0,
          readRate: 0,
          failureRate: 0,
        },
      };
    }
  }

  // Fetch template analytics
  async getTemplateAnalytics(wabaId: string): Promise<FailureReason[]> {
    try {
      const response = await this.request<any>(
        `${wabaId}/template_analytics?start=0&end=${Math.floor(Date.now() / 1000)}&granularity=DAILY&metric_types=["SENT","DELIVERED","READ","FAILED"]`,
        { method: 'GET' }
      );

      const errorCounts: Record<string, number> = {};

      // Aggregate error counts from the response
      const dataPoints = (response as any).data_points || [];
      dataPoints.forEach((point: any) => {
        if (point.failed_reasons) {
          point.failed_reasons.forEach((reason: any) => {
            const code = reason.error_code?.toString() || 'UNKNOWN';
            errorCounts[code] = (errorCounts[code] || 0) + (reason.count || 0);
          });
        }
      });

      const totalErrors = Object.values(errorCounts).reduce((sum, count) => sum + count, 0);

      return Object.entries(errorCounts).map(([code, count]) => ({
        code,
        description: ERROR_CODE_DESCRIPTIONS[code] || `Erro ${code}`,
        count,
        percentage: totalErrors > 0 ? (count / totalErrors) * 100 : 0,
      }));
    } catch (error) {
      console.error('Error fetching template analytics:', error);
      return [];
    }
  }

  // Get phone number health/quality
  async getPhoneNumberHealth(phoneNumberId: string): Promise<{
    qualityScore: string;
    currentLimit: string;
    status: string;
  }> {
    try {
      const response = await this.request<any>(
        `${phoneNumberId}?fields=quality_rating,messaging_limit_tier,status,name_status`,
        { method: 'GET' }
      );

      return {
        qualityScore: (response as any).quality_rating || 'UNKNOWN',
        currentLimit: (response as any).messaging_limit_tier || 'UNKNOWN',
        status: (response as any).status || 'UNKNOWN',
      };
    } catch (error) {
      console.error('Error fetching phone health:', error);
      throw error;
    }
  }

  // Verify webhook callback
  async verifyWebhook(
    wabaId: string,
    callbackUrl: string,
    verifyToken: string
  ): Promise<boolean> {
    try {
      await this.request<any>(`${wabaId}/subscribed_apps`, {
        method: 'POST',
        body: JSON.stringify({
          callback_url: callbackUrl,
          verify_token: verifyToken,
          fields: ['messages', 'messaging_postbacks'],
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  // Register phone number with WABA
  async registerPhoneNumber(
    phoneNumberId: string,
    pin: string
  ): Promise<boolean> {
    try {
      await this.request<any>(`${phoneNumberId}/register`, {
        method: 'POST',
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          pin,
        }),
      });
      return true;
    } catch {
      return false;
    }
  }

  // Helper methods
  private mapQualityRating(rating: string): WhatsAppNumber['qualityRating'] {
    switch (rating?.toUpperCase()) {
      case 'GREEN':
        return 'GREEN';
      case 'YELLOW':
        return 'YELLOW';
      case 'RED':
        return 'RED';
      default:
        return 'UNKNOWN';
    }
  }

  private mapPhoneStatus(status: string): WhatsAppNumber['status'] {
    switch (status?.toUpperCase()) {
      case 'CONNECTED':
        return 'CONNECTED';
      case 'DISCONNECTED':
        return 'DISCONNECTED';
      case 'PENDING':
        return 'PENDING';
      case 'BANNED':
      case 'FLAGGED':
        return 'BANNED';
      default:
        return 'PENDING';
    }
  }

  private mapWABAStatus(status?: string): WABA['status'] {
    switch (status?.toUpperCase()) {
      case 'APPROVED':
        return 'ACTIVE';
      case 'SUSPENDED':
        return 'SUSPENDED';
      default:
        return 'PENDING';
    }
  }

  private parseMessagingLimit(tier?: string): number {
    if (!tier) return 0;
    const match = tier.match(/TIER_(\d+)/i);
    if (match) {
      const tierNum = parseInt(match[1], 10);
      // Approximate limits based on tier
      switch (tierNum) {
        case 50:
          return 50;
        case 250:
          return 250;
        case 1000:
          return 1000;
        case 10000:
          return 10000;
        case 100000:
          return 100000;
        default:
          return tierNum;
      }
    }
    return 0;
  }

  // Test connection with the provided token
  async testConnection(): Promise<{
    success: boolean;
    userId?: string;
    name?: string;
    error?: string;
  }> {
    if (!this.accessToken) {
      return { success: false, error: 'Token não configurado' };
    }

    try {
      const response = await this.request<any>('me?fields=id,name');
      return {
        success: true,
        userId: (response as any).id,
        name: (response as any).name,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  // Get all data with caching
  async getAllData(businessManagerId: string): Promise<{
    businessManagers: BusinessManager[];
    wabas: WABA[];
    phoneNumbers: WhatsAppNumber[];
  }> {
    const now = Date.now();
    
    // Return cached data if still valid
    if (
      this.cachedData.lastFetch > 0 &&
      now - this.cachedData.lastFetch < this.CACHE_TTL
    ) {
      return {
        businessManagers: this.cachedData.businessManagers,
        wabas: this.cachedData.wabas,
        phoneNumbers: this.cachedData.phoneNumbers,
      };
    }

    try {
      // Fetch WABAs
      const wabas = await this.getWABAs(businessManagerId);

      // Fetch phone numbers for each WABA
      const phoneNumberPromises = wabas.map((waba) =>
        this.getPhoneNumbers(waba.id)
      );
      const phoneNumberArrays = await Promise.all(phoneNumberPromises);
      const phoneNumbers = phoneNumberArrays.flat();

      // Create business manager entry
      const businessManagers: BusinessManager[] = [
        {
          id: businessManagerId,
          name: phoneNumbers[0]?.businessManagerName || 'Business Manager',
          wabaCount: wabas.length,
          phoneNumberCount: phoneNumbers.length,
          status: 'ACTIVE',
        },
      ];

      // Cache the data
      this.cachedData = {
        businessManagers,
        wabas,
        phoneNumbers,
        lastFetch: now,
      };

      return { businessManagers, wabas, phoneNumbers };
    } catch (error) {
      console.error('Error fetching all data:', error);
      throw error;
    }
  }
}

export const metaGraphAPI = new MetaGraphAPIService();
