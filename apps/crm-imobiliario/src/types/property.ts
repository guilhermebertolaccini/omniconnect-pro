export type UnitStatus = "available" | "reserved" | "sold";

export interface Unit {
  id: string;
  number: string;
  tower: string;
  floor: number;
  typology: string;
  area: number;
  price: number;
  status: UnitStatus;
  observations?: string;
  clientId?: string;
  reservedAt?: string;
  reservationExpiry?: string;
  proposalId?: string;
  contractId?: string;
}

export interface Tower {
  name: string;
  floors: number;
  unitsPerFloor: number;
}

export interface PropertyDocument {
  id: string;
  name: string;
  type: "floor_plan" | "permit" | "memorial" | "regulation" | "other";
  typology?: string; // for floor plans
  url: string; // mock URL or data URL
  uploadedAt: string;
  uploadedBy: string;
}

export interface Property {
  id: string;
  name: string;
  address: string;
  city: string;
  developer: string;
  towers: Tower[];
  units: Unit[];
  image: string;
  documents?: PropertyDocument[];
}

export type UserRole = "admin" | "manager" | "broker";

export interface User {
  id: string;
  name: string;
  role: UserRole;
  avatar?: string;
}

export interface Client {
  id: string;
  name: string;
  cpfCnpj: string;
  phone: string;
  email: string;
  income: number;
  score: "A" | "B" | "C" | "D";
  notes?: string;
  createdAt: string;
}

export interface ChangeRecord {
  id: string;
  entityType: "unit" | "property" | "client" | "proposal" | "contract";
  entityId: string;
  field: string;
  oldValue: string;
  newValue: string;
  userId: string;
  userName: string;
  timestamp: string;
}

export type ProposalStatus = "draft" | "sent" | "accepted" | "rejected";

export interface PaymentCondition {
  downPayment: number;
  downPaymentPercent: number;
  installments: number;
  installmentValue: number;
  balloon: number;
  balloonPercent: number;
  interestRate: number;
  method: "sac" | "price";
  indexer: "none" | "incc" | "ipca";
}

export interface Proposal {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  clientId: string;
  clientName: string;
  originalPrice: number;
  discount: number;
  discountPercent: number;
  finalPrice: number;
  paymentCondition: PaymentCondition;
  status: ProposalStatus;
  validUntil: string;
  createdAt: string;
  createdBy: string;
  notes?: string;
  pdfUrl?: string;
  sourcePdfUrl?: string;
}

export type ContractStatus = "draft" | "review" | "pending_signature" | "signed";

export interface SignatureEntry {
  role: "buyer" | "seller" | "witness1" | "witness2";
  name: string;
  signedAt?: string;
  signed: boolean;
}

export interface Contract {
  id: string;
  proposalId: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  clientId: string;
  clientName: string;
  clientCpfCnpj: string;
  finalPrice: number;
  paymentCondition: PaymentCondition;
  status: ContractStatus;
  signatures: SignatureEntry[];
  createdAt: string;
  createdBy: string;
  notes?: string;
  pdfUrl?: string;
  sourcePdfUrl?: string;
  externalEnvelopeId?: string;
  externalEnvelopeUrl?: string;
  externalProvider?: string;
}

export type SalePipelineStage =
  | "available"
  | "reserved"
  | "proposal"
  | "simulation"
  | "contract"
  | "signature"
  | "sold";
