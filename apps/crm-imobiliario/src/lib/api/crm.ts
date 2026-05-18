import type {
  Client,
  Contract,
  ContractStatus,
  PaymentCondition,
  Property,
  PropertyDocument,
  Proposal,
  ProposalStatus,
  SignatureEntry,
  Tower,
  Unit,
  UnitStatus,
} from "@/types/property";
import type { Commission, Payment, PropertyCommissionConfig } from "@/types/financial";
import type { FollowUp, Interaction, Lead, LeadStage } from "@/types/crm";
import { request } from "@/lib/omniconnectClient";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=600&h=400&fit=crop";
const API_BASE_URL = (
  import.meta.env.VITE_OMNICONNECT_API_URL ??
  import.meta.env.VITE_API_URL ??
  "/api"
).replace(/\/$/, "");

interface CrmPropertyRow {
  id: string;
  name: string;
  address: string;
  city: string;
  developer: string | null;
  imageUrl: string | null;
  towers: unknown;
  documents: unknown;
}

interface CrmUnitRow {
  id: string;
  propertyId: string;
  number: string;
  tower: string | null;
  floor: number | null;
  typology: string | null;
  area: number | string | null;
  price: number | string | null;
  status: UnitStatus;
  observations: string | null;
  clientId: string | null;
  reservedAt: string | null;
  reservationExpiry: string | null;
  proposalId: string | null;
  contractId: string | null;
}

interface CrmClientRow {
  id: string;
  name: string;
  cpfCnpj: string | null;
  phone: string | null;
  email: string | null;
  income?: number | string | null;
  score: Client["score"] | null;
  notes?: string | null;
  createdAt?: string;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function toNumber(value: number | string | null | undefined): number {
  if (value == null || value === "") return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function rowToUnit(row: CrmUnitRow): Unit {
  return {
    id: row.id,
    number: row.number,
    tower: row.tower ?? "",
    floor: row.floor ?? 0,
    typology: row.typology ?? "",
    area: toNumber(row.area),
    price: toNumber(row.price),
    status: row.status ?? "available",
    observations: row.observations ?? undefined,
    clientId: row.clientId ?? undefined,
    reservedAt: row.reservedAt ?? undefined,
    reservationExpiry: row.reservationExpiry ?? undefined,
    proposalId: row.proposalId ?? undefined,
    contractId: row.contractId ?? undefined,
  };
}

export function rowToProperty(row: CrmPropertyRow, units: Unit[]): Property {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    developer: row.developer ?? "",
    image: row.imageUrl ?? FALLBACK_IMAGE,
    towers: asArray<Tower>(row.towers),
    units,
    documents: asArray<PropertyDocument>(row.documents),
  };
}

export function rowToClient(row: CrmClientRow): Client {
  return {
    id: row.id,
    name: row.name,
    cpfCnpj: row.cpfCnpj ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
    income: toNumber(row.income),
    score: row.score ?? "B",
    notes: row.notes ?? undefined,
    createdAt: row.createdAt ?? new Date().toISOString(),
  };
}

export async function listProperties(): Promise<Property[]> {
  const [properties, units] = await Promise.all([
    request<CrmPropertyRow[]>("/crm/properties"),
    request<CrmUnitRow[]>("/crm/units"),
  ]);
  const unitsByProperty = new Map<string, Unit[]>();
  for (const row of units) {
    const list = unitsByProperty.get(row.propertyId) ?? [];
    list.push(rowToUnit(row));
    unitsByProperty.set(row.propertyId, list);
  }
  return properties.map((p) => rowToProperty(p, unitsByProperty.get(p.id) ?? []));
}

export async function createProperty(property: Property): Promise<string> {
  const created = await request<CrmPropertyRow>("/crm/properties", {
    method: "POST",
    body: JSON.stringify({
      name: property.name,
      address: property.address,
      city: property.city,
      developer: property.developer || undefined,
      imageUrl: property.image || undefined,
      towers: property.towers ?? [],
      documents: property.documents ?? [],
    }),
  });
  for (const unit of property.units) {
    await request<CrmUnitRow>("/crm/units", {
      method: "POST",
      body: JSON.stringify({
        propertyId: created.id,
        number: unit.number,
        tower: unit.tower || undefined,
        floor: unit.floor,
        typology: unit.typology || undefined,
        area: unit.area,
        price: unit.price,
        status: unit.status,
        observations: unit.observations,
      }),
    });
  }
  return created.id;
}

export function updateProperty(id: string, data: Partial<Property>): Promise<CrmPropertyRow> {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.address !== undefined) patch.address = data.address;
  if (data.city !== undefined) patch.city = data.city;
  if (data.developer !== undefined) patch.developer = data.developer || null;
  if (data.image !== undefined) patch.imageUrl = data.image || null;
  if (data.towers !== undefined) patch.towers = data.towers;
  if (data.documents !== undefined) patch.documents = data.documents;
  return request<CrmPropertyRow>(`/crm/properties/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function updateUnit(unitId: string, data: Partial<Unit>): Promise<CrmUnitRow> {
  const patch: Record<string, unknown> = {};
  if (data.number !== undefined) patch.number = data.number;
  if (data.tower !== undefined) patch.tower = data.tower || null;
  if (data.floor !== undefined) patch.floor = data.floor;
  if (data.typology !== undefined) patch.typology = data.typology || null;
  if (data.area !== undefined) patch.area = data.area;
  if (data.price !== undefined) patch.price = data.price;
  if (data.observations !== undefined) patch.observations = data.observations ?? null;
  return request<CrmUnitRow>(`/crm/units/${encodeURIComponent(unitId)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

export function updateUnitStatus(
  unitId: string,
  status: UnitStatus,
  payload: { clientId?: string | null; reservationExpiry?: string | null } = {},
): Promise<CrmUnitRow> {
  return request<CrmUnitRow>(`/crm/units/${encodeURIComponent(unitId)}/status`, {
    method: "PATCH",
    body: JSON.stringify({
      status,
      clientId: payload.clientId ?? null,
      reservationExpiry: payload.reservationExpiry ?? null,
    }),
  });
}

export async function listClients(): Promise<Client[]> {
  const rows = await request<CrmClientRow[]>("/crm/clients");
  return rows.map(rowToClient);
}

export async function createClient(client: Client): Promise<Client> {
  const row = await request<CrmClientRow>("/crm/clients", {
    method: "POST",
    body: JSON.stringify({
      name: client.name,
      cpfCnpj: client.cpfCnpj || undefined,
      phone: client.phone || undefined,
      email: client.email || undefined,
      income: client.income || undefined,
      score: client.score,
      notes: client.notes,
    }),
  });
  return rowToClient(row);
}

export async function updateClient(id: string, data: Partial<Client>): Promise<Client> {
  const patch: Record<string, unknown> = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.cpfCnpj !== undefined) patch.cpfCnpj = data.cpfCnpj || null;
  if (data.phone !== undefined) patch.phone = data.phone || null;
  if (data.email !== undefined) patch.email = data.email || null;
  if (data.income !== undefined) patch.income = data.income;
  if (data.score !== undefined) patch.score = data.score;
  if (data.notes !== undefined) patch.notes = data.notes ?? null;
  const row = await request<CrmClientRow>(`/crm/clients/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return rowToClient(row);
}

export function deleteClient(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/crm/clients/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

// ─── Leads / interactions / follow-ups ─────────────────────────────────────

interface CrmLeadRow {
  id: string;
  clientId: string | null;
  name: string;
  source: Lead["source"] | string | null;
  stage: LeadStage;
  propertyInterest: string | null;
  estimatedValue: number | string | null;
  brokerId: number | null;
  brokerName: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CrmInteractionRow {
  id: string;
  leadId: string;
  type: Interaction["type"];
  content: string | null;
  createdAt: string;
  createdById: number | null;
}

interface CrmFollowUpRow {
  id: string;
  leadId: string;
  title: string | null;
  scheduledAt: string;
  status: "pending" | "done" | "cancelled";
  notes: string | null;
  completedAt?: string | null;
  createdAt: string;
  createdById: number | null;
}

export function rowToInteraction(row: CrmInteractionRow, clientId = ""): Interaction {
  return {
    id: row.id,
    clientId,
    type: row.type ?? "note",
    description: row.content ?? "",
    createdAt: row.createdAt,
    createdBy: row.createdById ? String(row.createdById) : "",
  };
}

export function rowToFollowUp(row: CrmFollowUpRow, clientId = ""): FollowUp {
  return {
    id: row.id,
    clientId,
    title: row.title ?? row.notes ?? "",
    dueDate: row.scheduledAt,
    completed: row.status === "done" || !!row.completedAt,
    completedAt: row.completedAt ?? undefined,
    createdAt: row.createdAt,
    createdBy: row.createdById ? String(row.createdById) : "",
  };
}

export function rowToLead(
  row: CrmLeadRow,
  interactions: Interaction[] = [],
  followUps: FollowUp[] = [],
): Lead {
  return {
    id: row.id,
    clientId: row.clientId ?? "",
    clientName: row.name,
    stage: row.stage ?? "new",
    source: (row.source ?? "other") as Lead["source"],
    propertyInterest: row.propertyInterest ?? undefined,
    estimatedValue:
      row.estimatedValue != null ? toNumber(row.estimatedValue) : undefined,
    assignedTo: row.brokerId != null ? String(row.brokerId) : "",
    assignedToName: row.brokerName ?? "",
    interactions,
    followUps,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listLeads(): Promise<Lead[]> {
  const leads = await request<CrmLeadRow[]>("/crm/leads");
  const hydrated = await Promise.all(
    leads.map(async (lead) => {
      const [interactions, followUps] = await Promise.all([
        request<CrmInteractionRow[]>(
          `/crm/leads/${encodeURIComponent(lead.id)}/interactions`,
        ),
        request<CrmFollowUpRow[]>(
          `/crm/follow-ups?leadId=${encodeURIComponent(lead.id)}`,
        ),
      ]);
      return rowToLead(
        lead,
        interactions.map((i) => rowToInteraction(i, lead.clientId ?? "")),
        followUps.map((f) => rowToFollowUp(f, lead.clientId ?? "")),
      );
    }),
  );
  return hydrated;
}

export async function createLead(lead: Lead, client?: Client): Promise<Lead> {
  const row = await request<CrmLeadRow>("/crm/leads", {
    method: "POST",
    body: JSON.stringify({
      name: lead.clientName || client?.name || "Lead",
      email: client?.email || undefined,
      phone: client?.phone || undefined,
      clientId: lead.clientId || undefined,
      source: lead.source,
      stage: lead.stage,
      propertyInterest: lead.propertyInterest,
      estimatedValue: lead.estimatedValue,
    }),
  });
  return rowToLead(row);
}

export async function updateLead(id: string, data: Partial<Lead>): Promise<Lead> {
  const patch: Record<string, unknown> = {};
  if (data.clientName !== undefined) patch.name = data.clientName;
  if (data.stage !== undefined) patch.stage = data.stage;
  if (data.source !== undefined) patch.source = data.source;
  if (data.clientId !== undefined) patch.clientId = data.clientId || null;
  if (data.propertyInterest !== undefined)
    patch.propertyInterest = data.propertyInterest ?? null;
  if (data.estimatedValue !== undefined)
    patch.estimatedValue = data.estimatedValue ?? null;
  const row = await request<CrmLeadRow>(`/crm/leads/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
  return rowToLead(row);
}

export function deleteLead(id: string): Promise<{ id: string }> {
  return request<{ id: string }>(`/crm/leads/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export async function createLeadInteraction(
  leadId: string,
  interaction: Interaction,
): Promise<Interaction> {
  const row = await request<CrmInteractionRow>(
    `/crm/leads/${encodeURIComponent(leadId)}/interactions`,
    {
      method: "POST",
      body: JSON.stringify({
        type: interaction.type,
        content: interaction.description,
      }),
    },
  );
  return rowToInteraction(row, interaction.clientId);
}

export async function createLeadFollowUp(
  leadId: string,
  followUp: FollowUp,
): Promise<FollowUp> {
  const row = await request<CrmFollowUpRow>(
    `/crm/leads/${encodeURIComponent(leadId)}/follow-ups`,
    {
      method: "POST",
      body: JSON.stringify({
        title: followUp.title,
        scheduledAt: followUp.dueDate,
        notes: followUp.title,
      }),
    },
  );
  return rowToFollowUp(row, followUp.clientId);
}

export async function updateFollowUp(
  followUpId: string,
  data: { status?: "pending" | "done" | "cancelled"; completedAt?: string },
): Promise<FollowUp> {
  const row = await request<CrmFollowUpRow>(
    `/crm/follow-ups/${encodeURIComponent(followUpId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        status: data.status,
        // Backend deriva completedAt ao marcar done; mantemos campo aqui
        // para compat futura sem quebrar chamadores.
      }),
    },
  );
  return rowToFollowUp(row);
}

// ─── Proposals / contracts ─────────────────────────────────────────────────

interface CrmProposalRow {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  clientId: string;
  clientName: string;
  brokerName: string | null;
  originalPrice: number | string | null;
  discount: number | string | null;
  discountPercent: number | string | null;
  finalPrice: number | string | null;
  paymentCondition: unknown;
  status: ProposalStatus;
  validUntil: string | null;
  createdAt: string;
  notes: string | null;
  pdfUrl: string | null;
}

interface CrmContractRow {
  id: string;
  proposalId: string | null;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  clientId: string;
  clientName: string;
  clientCpfCnpj: string | null;
  brokerName: string | null;
  finalPrice: number | string | null;
  paymentCondition: unknown;
  status: ContractStatus;
  signatures: unknown;
  createdAt: string;
  notes: string | null;
  pdfUrl: string | null;
  externalEnvelopeId: string | null;
  externalEnvelopeUrl: string | null;
  externalProvider: string | null;
}

function normalizePaymentCondition(value: unknown): PaymentCondition {
  const v = (value && typeof value === "object" ? value : {}) as Partial<PaymentCondition>;
  return {
    downPayment: Number(v.downPayment ?? 0),
    downPaymentPercent: Number(v.downPaymentPercent ?? 0),
    installments: Number(v.installments ?? 0),
    installmentValue: Number(v.installmentValue ?? 0),
    balloon: Number(v.balloon ?? 0),
    balloonPercent: Number(v.balloonPercent ?? 0),
    interestRate: Number(v.interestRate ?? 0),
    method: v.method ?? "price",
    indexer: v.indexer ?? "none",
  };
}

export function rowToProposal(row: CrmProposalRow): Proposal {
  return {
    id: row.id,
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    unitId: row.unitId,
    unitNumber: row.unitNumber,
    clientId: row.clientId,
    clientName: row.clientName,
    originalPrice: toNumber(row.originalPrice),
    discount: toNumber(row.discount),
    discountPercent: toNumber(row.discountPercent),
    finalPrice: toNumber(row.finalPrice),
    paymentCondition: normalizePaymentCondition(row.paymentCondition),
    status: row.status,
    validUntil: row.validUntil ?? new Date().toISOString(),
    createdAt: row.createdAt,
    createdBy: row.brokerName ?? "",
    notes: row.notes ?? undefined,
    pdfUrl: row.pdfUrl ?? undefined,
  };
}

export function rowToContract(row: CrmContractRow): Contract {
  return {
    id: row.id,
    proposalId: row.proposalId ?? "",
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    unitId: row.unitId,
    unitNumber: row.unitNumber,
    clientId: row.clientId,
    clientName: row.clientName,
    clientCpfCnpj: row.clientCpfCnpj ?? "",
    finalPrice: toNumber(row.finalPrice),
    paymentCondition: normalizePaymentCondition(row.paymentCondition),
    status: row.status,
    signatures: asArray<SignatureEntry>(row.signatures),
    createdAt: row.createdAt,
    createdBy: row.brokerName ?? "",
    notes: row.notes ?? undefined,
    pdfUrl: row.pdfUrl ?? undefined,
    externalEnvelopeId: row.externalEnvelopeId ?? undefined,
    externalEnvelopeUrl: row.externalEnvelopeUrl ?? undefined,
    externalProvider: row.externalProvider ?? undefined,
  };
}

export async function listProposals(): Promise<Proposal[]> {
  const rows = await request<CrmProposalRow[]>("/crm/proposals");
  return rows.map(rowToProposal);
}

export async function createProposal(p: Omit<Proposal, "id">): Promise<Proposal> {
  const row = await request<CrmProposalRow>("/crm/proposals", {
    method: "POST",
    body: JSON.stringify({
      propertyId: p.propertyId,
      unitId: p.unitId,
      clientId: p.clientId,
      originalPrice: p.originalPrice,
      discount: p.discount,
      discountPercent: p.discountPercent,
      finalPrice: p.finalPrice,
      paymentCondition: p.paymentCondition,
      validUntil: p.validUntil,
      notes: p.notes,
    }),
  });
  return rowToProposal(row);
}

export async function transitionProposal(
  id: string,
  status: ProposalStatus,
): Promise<Proposal> {
  const row = await request<CrmProposalRow>(
    `/crm/proposals/${encodeURIComponent(id)}/transition`,
    { method: "POST", body: JSON.stringify({ status }) },
  );
  return rowToProposal(row);
}

export async function updateProposalPdf(
  id: string,
  pdfUrl: string | null,
): Promise<Proposal> {
  const row = await request<CrmProposalRow>(`/crm/proposals/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ pdfUrl }),
  });
  return rowToProposal(row);
}

export async function listContracts(): Promise<Contract[]> {
  const rows = await request<CrmContractRow[]>("/crm/contracts");
  return rows.map(rowToContract);
}

export async function createContract(c: Omit<Contract, "id">): Promise<Contract> {
  const row = await request<CrmContractRow>("/crm/contracts", {
    method: "POST",
    body: JSON.stringify({
      proposalId: c.proposalId,
      paymentCondition: c.paymentCondition,
      notes: c.notes,
    }),
  });
  return rowToContract(row);
}

export async function transitionContract(
  id: string,
  status: ContractStatus,
): Promise<Contract> {
  const row = await request<CrmContractRow>(
    `/crm/contracts/${encodeURIComponent(id)}/transition`,
    { method: "POST", body: JSON.stringify({ status }) },
  );
  return rowToContract(row);
}

export async function updateContractPdf(
  id: string,
  pdfUrl: string | null,
): Promise<Contract> {
  const row = await request<CrmContractRow>(`/crm/contracts/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ pdfUrl }),
  });
  return rowToContract(row);
}

// ─── Financial ──────────────────────────────────────────────────────────────

interface CrmPaymentRow {
  id: string;
  contractId: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  clientId: string;
  clientName: string;
  type: Payment["type"];
  installmentNumber: number | null;
  amount: number | string | null;
  dueDate: string | null;
  paidAt: string | null;
  status: Payment["status"];
}

interface CrmCommissionRow {
  id: string;
  propertyId: string;
  propertyName: string;
  unitId: string;
  unitNumber: string;
  brokerId: number;
  brokerName: string | null;
  salePrice: number | string | null;
  commissionPercent: number | string | null;
  commissionValue: number | string | null;
  status: Commission["status"];
  paidAt: string | null;
}

interface CrmCommissionConfigRow {
  propertyId: string;
  commissionPercent: number | string;
}

export function rowToPayment(row: CrmPaymentRow): Payment {
  return {
    id: row.id,
    contractId: row.contractId,
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    unitId: row.unitId,
    unitNumber: row.unitNumber,
    clientId: row.clientId,
    clientName: row.clientName,
    type: row.type,
    installmentNumber: row.installmentNumber ?? undefined,
    amount: toNumber(row.amount),
    dueDate: row.dueDate ?? new Date().toISOString(),
    paidAt: row.paidAt ?? undefined,
    status: row.status,
  };
}

export function rowToCommission(row: CrmCommissionRow): Commission {
  return {
    id: row.id,
    propertyId: row.propertyId,
    propertyName: row.propertyName,
    unitId: row.unitId,
    unitNumber: row.unitNumber,
    brokerId: String(row.brokerId),
    brokerName: row.brokerName ?? "",
    salePrice: toNumber(row.salePrice),
    commissionPercent: toNumber(row.commissionPercent),
    commissionValue: toNumber(row.commissionValue),
    status: row.status,
    paidAt: row.paidAt ?? undefined,
  };
}

export async function listPayments(): Promise<Payment[]> {
  const rows = await request<CrmPaymentRow[]>("/crm/payments");
  return rows.map(rowToPayment);
}

export async function markPaymentPaid(id: string): Promise<Payment> {
  const paidAt = new Date().toISOString();
  const row = await request<CrmPaymentRow>(`/crm/payments/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "paid", paidAt }),
  });
  return rowToPayment(row);
}

export async function listCommissions(): Promise<Commission[]> {
  const rows = await request<CrmCommissionRow[]>("/crm/commissions");
  return rows.map(rowToCommission);
}

export async function markCommissionPaid(id: string): Promise<Commission> {
  const paidAt = new Date().toISOString();
  const row = await request<CrmCommissionRow>(
    `/crm/commissions/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify({ status: "paid", paidAt }) },
  );
  return rowToCommission(row);
}

export async function getCommissionConfig(
  propertyId: string,
): Promise<PropertyCommissionConfig | null> {
  try {
    const row = await request<CrmCommissionConfigRow>(
      `/crm/properties/${encodeURIComponent(propertyId)}/commission-config`,
    );
    return {
      propertyId: row.propertyId,
      commissionPercent: toNumber(row.commissionPercent),
    };
  } catch {
    return null;
  }
}

export async function setCommissionConfig(
  propertyId: string,
  commissionPercent: number,
): Promise<PropertyCommissionConfig> {
  const row = await request<CrmCommissionConfigRow>(
    `/crm/properties/${encodeURIComponent(propertyId)}/commission-config`,
    {
      method: "PUT",
      body: JSON.stringify({ commissionPercent }),
    },
  );
  return {
    propertyId: row.propertyId,
    commissionPercent: toNumber(row.commissionPercent),
  };
}

// ─── Storage + PDF parser ──────────────────────────────────────────────────

export type CrmDocumentParentType = "proposal" | "contract";

export interface UploadedCrmDocument {
  fileId: string;
  url: string;
  parentType: CrmDocumentParentType;
  parentId: string;
  size: number;
  mimeType: string;
}

export async function uploadCrmDocument(input: {
  parentType: CrmDocumentParentType;
  parentId: string;
  fileName: string;
  file: Blob;
}): Promise<UploadedCrmDocument> {
  const form = new FormData();
  form.set("file", input.file, input.fileName);
  form.set("parentType", input.parentType);
  form.set("parentId", input.parentId);
  form.set("fileName", input.fileName);
  const uploaded = await request<UploadedCrmDocument>("/crm/storage/upload", {
    method: "POST",
    body: form,
    noJsonHeader: true,
  });
  return {
    ...uploaded,
    url: uploaded.url.startsWith("http")
      ? uploaded.url
      : `${API_BASE_URL}${uploaded.url.startsWith("/") ? "" : "/"}${uploaded.url}`,
  };
}

export interface ParsedCrmPdf {
  propertyName: string | null;
  unitNumber: string | null;
  clientName: string | null;
  clientCpfCnpj: string | null;
  brokerName: string | null;
  finalPrice: number | null;
  paymentCondition: {
    downPayment: number | null;
    installments: Array<{
      amount: number | null;
      dueDate: string | null;
      type: "signal" | "installment" | "balloon";
    }>;
  } | null;
  notes: string | null;
}

export function parseCrmPdf(input: {
  kind: CrmDocumentParentType;
  text: string;
}): Promise<ParsedCrmPdf> {
  return request<ParsedCrmPdf>("/crm/pdf-parser", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export interface CrmSignatureRow {
  id: string;
  role: string;
  signerName: string | null;
  signerEmail: string | null;
  status: string;
  signedAt: string | null;
  signatureHash: string | null;
  ipAddress: string | null;
}

export function listContractSignatures(contractId: string): Promise<CrmSignatureRow[]> {
  return request<CrmSignatureRow[]>(
    `/crm/signatures/contracts/${encodeURIComponent(contractId)}`,
  );
}

export function createSignatureEnvelope(
  contractId: string,
  signers: Array<{ role: string; name: string; email: string }>,
) {
  return request<{
    envelopeId: string;
    envelopeUrl: string;
    provider: string;
    contract: CrmContractRow;
  }>(`/crm/signatures/contracts/${encodeURIComponent(contractId)}/envelope`, {
    method: "POST",
    body: JSON.stringify({ signers }),
  });
}
