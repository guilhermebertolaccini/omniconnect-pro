export type CampaignStatus = 'active' | 'paused' | 'ended' | 'issue';

export interface Campaign {
  id: string;
  name: string;
  accountName: string;
  status: CampaignStatus;
  objective: string;
  budget: number;
  spent: number;
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  cpc: number;
  cpm: number;
  roas: number;
  cpa: number;
  whatsappConversations: number;
  mqls: number;
  sqls: number;
  salesClosed: number;
  startDate: string;
  endDate?: string;
  targeting?: {
    ageMin: number;
    ageMax: number;
    genders: 'all' | 'male' | 'female';
    interests: string[];
  };
  geoLocations?: {
    countries: string[];
    cities: string[];
  };
  placements?: {
    platforms: string[];
    positions: string[];
  };
  creative?: {
    format: 'image' | 'video' | 'carousel';
    headline: string;
    primaryText: string;
    description: string;
    ctaType: string;
    destinationUrl: string;
  };
}

export interface AdAccount {
  id: string;
  name: string;
  businessName: string;
  currency: string;
  timezone: string;
  status: 'connected' | 'syncing' | 'error';
  lastSync: string;
  totalSpent: number;
  activeCampaigns: number;
}

export interface MetricSummary {
  totalSpent: number;
  totalConversions: number;
  avgRoas: number;
  avgCpa: number;
  activeCampaigns: number;
  pausedCampaigns: number;
  issuesCampaigns: number;
  totalWhatsappConversations: number;
  totalMqls: number;
  totalSqls: number;
}

export interface AIInsight {
  id: string;
  campaignId: string;
  type: 'warning' | 'opportunity' | 'success' | 'critical';
  title: string;
  description: string;
  recommendation: string;
  impact: string;
  createdAt: string;
}

export type AIAnalysisActionArea =
  | 'campaign'
  | 'creative'
  | 'audience'
  | 'whatsapp'
  | 'sales'
  | 'budget'
  | 'tracking';

export interface AIAnalysisAction {
  title: string;
  priority: 'low' | 'medium' | 'high';
  area: AIAnalysisActionArea;
  description: string;
}

export interface AIAnalysis {
  campaignId: string;
  overallScore: number;
  diagnosis: string;
  problems: string[];
  recommendations: string[];
  predictedImpact: string;
  generatedAt: string;
  rootCause?: string;
  nextActions?: AIAnalysisAction[];
  confidence?: 'low' | 'medium' | 'high';
}

export type PostType = 'image' | 'video' | 'carousel' | 'reels' | 'story';
export type PostPlatform = 'Instagram' | 'Facebook';

export interface Post {
  id: string;
  accountName: string;
  platform: PostPlatform;
  type: PostType;
  caption: string;
  publishedAt: string;
  thumbnailUrl?: string;
  reach: number;
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  saves: number;
  engagementRate: number;
  profileVisits: number;
  websiteClicks: number;
}
