import { supabase } from "@/integrations/supabase/client";

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
  const { error } = await supabase.from("document_versions").insert({
    parent_type: input.parentType,
    parent_id: input.parentId,
    pdf_url: input.pdfUrl,
    file_name: input.fileName ?? null,
    action: input.action,
    uploaded_by: input.uploadedBy ?? null,
    uploader_name: input.uploaderName ?? null,
  });
  if (error) console.error("recordDocumentVersion error", error);
}

export async function listDocumentVersions(
  parentType: VersionParent,
  parentId: string,
): Promise<DocumentVersion[]> {
  const { data, error } = await supabase
    .from("document_versions")
    .select("*")
    .eq("parent_type", parentType)
    .eq("parent_id", parentId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listDocumentVersions error", error);
    return [];
  }
  return (data ?? []) as DocumentVersion[];
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
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return;
    let userName: string | null = null;
    const { data: prof } = await supabase
      .from("profiles").select("full_name").eq("id", user.id).maybeSingle();
    userName = prof?.full_name ?? user.email ?? null;
    const { error } = await supabase.from("document_access_log").insert({
      parent_type: input.parentType,
      parent_id: input.parentId,
      pdf_url: input.pdfUrl,
      action: input.action,
      user_id: user.id,
      user_name: userName,
    });
    if (error) console.error("recordDocumentAccess error", error);
  } catch (e) {
    console.error("recordDocumentAccess fatal", e);
  }
}

export async function listDocumentAccessLogs(
  parentType: VersionParent,
  parentId: string,
): Promise<DocumentAccessLog[]> {
  const { data, error } = await supabase
    .from("document_access_log")
    .select("*")
    .eq("parent_type", parentType)
    .eq("parent_id", parentId)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("listDocumentAccessLogs error", error);
    return [];
  }
  return (data ?? []) as DocumentAccessLog[];
}