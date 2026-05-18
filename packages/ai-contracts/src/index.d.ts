export type LeadIntent = 'curioso' | 'frio' | 'pesquisa' | 'qualificado' | 'quente' | 'pronto_para_visita' | 'pronto_para_proposta' | 'indefinido';
export type ConversationRisk = 'baixo' | 'medio' | 'alto' | 'critico';
export type OpportunityStatus = 'ativa' | 'em_risco' | 'perdida' | 'pronta_para_retomada' | 'sem_oportunidade_clara';
export interface NormalizedMessage {
    id: number;
    sender: 'operator' | 'contact';
    text: string;
    datetime: string | Date;
    userId?: number | null;
    userName?: string | null;
}
export interface ConversationAIResult {
    summary: string;
    leadIntent: LeadIntent;
    opportunityStatus: OpportunityStatus;
    risk: ConversationRisk;
    mainObjection: string | null;
    objections: string[];
    sellerQualityScore: number;
    responseQualityScore: number;
    qualificationScore: number;
    followUpScore: number;
    firstResponseMinutes: number | null;
    hasSellerAbandonment: boolean;
    hasLeadAbandonment: boolean;
    hasQualification: boolean;
    hasSchedulingAttempt: boolean;
    hasProposalOrSimulationAttempt: boolean;
    lostOpportunity: boolean;
    nextBestAction: string;
    evidence: string[];
    metrics: Record<string, unknown>;
}
