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
  const rows = readLocal<DocumentVersion>("crm-document-versions");
  rows.unshift({
    id: `version-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parent_type: input.parentType,
    parent_id: input.parentId,
    pdf_url: input.pdfUrl,
    file_name: input.fileName ?? null,
    action: input.action,
    uploaded_by: input.uploadedBy ?? null,
    uploader_name: input.uploaderName ?? null,
    created_at: new Date().toISOString(),
  });
  writeLocal("crm-document-versions", rows.slice(0, 500));
}

export async function listDocumentVersions(
  parentType: VersionParent,
  parentId: string,
): Promise<DocumentVersion[]> {
  return readLocal<DocumentVersion>("crm-document-versions").filter(
    (r) => r.parent_type === parentType && r.parent_id === parentId,
  );
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
  const rows = readLocal<DocumentAccessLog>("crm-document-access-log");
  rows.unshift({
    id: `access-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    parent_type: input.parentType,
    parent_id: input.parentId,
    pdf_url: input.pdfUrl,
    action: input.action,
    user_id: null,
    user_name: null,
    created_at: new Date().toISOString(),
  });
  writeLocal("crm-document-access-log", rows.slice(0, 500));
}

export async function listDocumentAccessLogs(
  parentType: VersionParent,
  parentId: string,
): Promise<DocumentAccessLog[]> {
  return readLocal<DocumentAccessLog>("crm-document-access-log").filter(
    (r) => r.parent_type === parentType && r.parent_id === parentId,
  );
}

function readLocal<T>(key: string): T[] {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "[]") as T[];
  } catch {
    return [];
  }
}

function writeLocal<T>(key: string, rows: T[]) {
  window.localStorage.setItem(key, JSON.stringify(rows));
}