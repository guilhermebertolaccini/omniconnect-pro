export interface Payment {
  id: string;
  contractId: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  clientId: string;
  clientName: string;
  type: "signal" | "installment" | "balloon";
  installmentNumber?: number;
  amount: number;
  dueDate: string;
  paidAt?: string;
  status: "pending" | "paid" | "overdue";
}

export interface Commission {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  brokerId: string;
  brokerName: string;
  salePrice: number;
  commissionPercent: number;
  commissionValue: number;
  status: "pending" | "paid";
  paidAt?: string;
}

export interface PropertyCommissionConfig {
  propertyId: string;
  commissionPercent: number;
}
