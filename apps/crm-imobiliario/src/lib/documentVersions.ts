import {
  listCrmDocumentAccessLogs,
  listCrmDocumentVersions,
  type CrmDocumentParentType,
} from "@/lib/api/crm";

export type VersionAction = "attached" | "replaced" | "generated" | "imported";
export type VersionParent = "proposal" | "contract";
export type AccessAction = "viewed" | "downloaded";

export interface DocumentVersion {
  id: string;
  parent_type: VersionParent;
  parent_id: string;
  pdf_url: string;
  file_name: string | null;
  action: VersionAction;
  uploaded_by: string | null;
  uploader_name: string | null;
  created_at: string;
}

export async function recordDocumentVersion(input: {
  parentType: VersionParent;
  parentId: string;
  pdfUrl: string;
  fileName?: string | null;
  action: VersionAction;
  uploadedBy?: string | null;
  uploaderName?: string | null;
}) {
  void input;
  // O backend registra versões no upload (`/crm/storage/upload`) e associa
  // action/actor em `CrmDocumentVersion`. Mantemos a função para compat dos
  // componentes antigos, sem persistência local.
}

export async function listDocumentVersions(
  parentType: VersionParent,
  parentId: string,
): Promise<DocumentVersion[]> {
  const rows = await listCrmDocumentVersions(parentType as CrmDocumentParentType, parentId);
  return rows.map((r) => ({
    id: r.id,
    parent_type: r.parentType,
    parent_id: r.parentId,
    pdf_url: r.pdfUrl,
    file_name: r.fileName,
    action: r.action,
    uploaded_by: r.uploadedById == null ? null : String(r.uploadedById),
    uploader_name: r.uploaderName,
    created_at: r.createdAt,
  }));
}

export interface DocumentAccessLog {
  id: string;
  parent_type: VersionParent;
  parent_id: string;
  pdf_url: string;
  action: AccessAction;
  user_id: string | null;
  user_name: string | null;
  created_at: string;
}

export async function recordDocumentAccess(input: {
  parentType: VersionParent;
  parentId: string;
  pdfUrl: string;
  action: AccessAction;
}) {
  void input;
  // O backend registra download/visualização quando o arquivo é servido.
}

export async function listDocumentAccessLogs(
  parentType: VersionParent,
  parentId: string,
): Promise<DocumentAccessLog[]> {
  const rows = await listCrmDocumentAccessLogs(parentType as CrmDocumentParentType, parentId);
  return rows.map((r) => ({
    id: r.id,
    parent_type: r.parentType,
    parent_id: r.parentId,
    pdf_url: r.pdfUrl,
    action: r.action,
    user_id: r.userId == null ? null : String(r.userId),
    user_name: r.userName,
    created_at: r.createdAt,
  }));
}