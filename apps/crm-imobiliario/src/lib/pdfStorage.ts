import { supabase } from "@/integrations/supabase/client";

const BUCKET = "proposal-contracts";

/**
 * Extracts the storage object path from a Supabase signed URL.
 * Signed URLs look like: https://<ref>.supabase.co/storage/v1/object/sign/<bucket>/<path>?token=...
 * Public URLs:           https://<ref>.supabase.co/storage/v1/object/public/<bucket>/<path>
 */
export function extractStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const marker = `/object/`;
    const idx = u.pathname.indexOf(marker);
    if (idx === -1) return null;
    // after "/object/" we have either "sign/<bucket>/..." or "public/<bucket>/..."
    const rest = u.pathname.slice(idx + marker.length); // sign/bucket/path or public/bucket/path
    const parts = rest.split("/");
    if (parts.length < 3) return null;
    const bucket = parts[1];
    if (bucket !== BUCKET) return null;
    return decodeURIComponent(parts.slice(2).join("/"));
  } catch {
    return null;
  }
}

/** Removes a PDF from storage given a previously-issued (signed or public) URL. */
export async function deletePdfByUrl(url: string | null | undefined): Promise<boolean> {
  const path = extractStoragePath(url);
  if (!path) return false;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) {
    console.error("deletePdfByUrl error", error);
    return false;
  }
  return true;
}

/**
 * Upload a PDF (Blob) to the user's folder and return a signed URL valid for 1 year.
 */
export async function uploadPdf(
  userId: string,
  kind: "proposals" | "contracts" | "uploads",
  fileName: string,
  blob: Blob
): Promise<string | null> {
  const path = `${userId}/${kind}/${Date.now()}-${fileName.replace(/[^a-z0-9.\-_]/gi, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, {
    contentType: "application/pdf",
    upsert: false,
  });
  if (error) {
    console.error("uploadPdf error", error);
    return null;
  }
  const { data: signed } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 60 * 24 * 365);
  return signed?.signedUrl ?? null;
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