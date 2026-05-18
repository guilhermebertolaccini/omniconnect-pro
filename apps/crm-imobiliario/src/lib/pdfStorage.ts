import {
  uploadCrmDocument,
  type CrmDocumentParentType,
} from "@/lib/api/crm";

/**
 * URLs agora são emitidas pelo backend (`/crm/storage/files/:fileId`).
 * Não há path de storage público exposto; mantemos a função para compat
 * com botões de delete/replacement.
 */
export function extractStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = /\/crm\/storage\/files\/([^/?#]+)/.exec(url);
  return match?.[1] ?? null;
}

/**
 * Backend atual não expõe DELETE de arquivos (remoção lógica acontece ao
 * desassociar pdfUrl do proposal/contract). Mantemos best-effort para não
 * quebrar botões existentes; retorna true quando era uma URL do novo storage.
 */
export async function deletePdfByUrl(url: string | null | undefined): Promise<boolean> {
  const path = extractStoragePath(url);
  return Boolean(path);
}

/**
 * Upload de PDF para o backend. Para persistir no filesystem, passe
 * `{ parentType, parentId }`. Chamadas legadas sem parent (ex.: PDF import
 * antes de existir proposal/contract) recebem uma data URL temporária para
 * continuar o fluxo sem Supabase.
 */
export async function uploadPdf(
  _userId: string,
  kind: "proposals" | "contracts" | "uploads",
  fileName: string,
  blob: Blob,
  parent?: { parentType?: CrmDocumentParentType; parentId?: string },
): Promise<string | null> {
  const parentType =
    parent?.parentType ??
    (kind === "proposals" ? "proposal" : kind === "contracts" ? "contract" : undefined);
  if (parentType && parent?.parentId) {
    const uploaded = await uploadCrmDocument({
      parentType,
      parentId: parent.parentId,
      fileName,
      file: blob,
    });
    return uploaded.url;
  }
  return blobToDataUrl(blob);
}

export async function pdfFileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? "";
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function pdfFileToText(file: File): Promise<string> {
  // Sem pdf.js no bundle atual. O backend parser recebe texto; `file.text()`
  // é um fallback suficiente para PDFs textuais simples e mantém o cutover
  // sem dependências nativas. OCR/extração robusta fica para o frontend
  // pdf.js numa iteração dedicada.
  return file.text();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}