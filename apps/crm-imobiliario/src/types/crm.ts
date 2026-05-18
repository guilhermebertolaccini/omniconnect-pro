export type LeadStage = "new" | "contacted" | "qualified" | "visit" | "negotiation" | "closed_won" | "closed_lost";

export interface Interaction {
  id: string;
  clientId: string;
  type: "call" | "email" | "visit" | "meeting" | "whatsapp" | "note";
  description: string;
  createdAt: string;
  createdBy: string;
}

export interface FollowUp {
  id: string;
  clientId: string;
  title: string;
  dueDate: string;
  completed: boolean;
  completedAt?: string;
  createdAt: string;
  createdBy: string;
}

export interface Lead {
  id: string;
  clientId: string;
  clientName: string;
  stage: LeadStage;
  source: "website" | "referral" | "social" | "ads" | "walk_in" | "other";
  propertyInterest?: string;
  estimatedValue?: number;
  assignedTo: string;
  assignedToName: string;
  interactions: Interaction[];
  followUps: FollowUp[];
  createdAt: string;
  updatedAt: string;
}
