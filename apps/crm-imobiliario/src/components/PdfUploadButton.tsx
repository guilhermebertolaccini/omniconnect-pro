import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Upload, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { uploadPdf, deletePdfByUrl } from "@/lib/pdfStorage";
import type { CrmDocumentParentType } from "@/lib/api/crm";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  kind: "proposals" | "contracts" | "uploads";
  parentType?: CrmDocumentParentType;
  parentId?: string;
  fileNamePrefix?: string;
  onUploaded: (url: string, fileName: string) => void | Promise<void>;
  /** Existing PDF URL — when present, button becomes "Substituir PDF" with confirmation. */
  existingUrl?: string | null;
  /** Disable any change (e.g. status locked). */
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "sm";
}

/** Generic PDF upload/replace button. Uploads to private bucket and returns a signed URL. */
export function PdfUploadButton({
  kind, parentType, parentId, fileNamePrefix, onUploaded, existingUrl, disabled, disabledReason,
  label, variant = "outline", size = "sm",
}: Props) {
  const { user } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const isReplace = !!existingUrl;
  const buttonLabel = label ?? (isReplace ? "Substituir PDF" : "Anexar PDF");

  const processFile = async (file: File) => {
    if (!user) return;
    if (file.type !== "application/pdf") {
      toast({ title: "Apenas PDFs", variant: "destructive" });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast({ title: "Arquivo muito grande", description: "Máximo 15MB.", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const name = fileNamePrefix ? `${fileNamePrefix}-${file.name}` : file.name;
      const url = await uploadPdf(user.id, kind, name, file, { parentType, parentId });
      if (!url) throw new Error("Upload falhou");
      await onUploaded(url, file.name);
      if (existingUrl) {
        // Best-effort cleanup of previous file
        await deletePdfByUrl(existingUrl);
      }
      toast({ title: isReplace ? "PDF substituído" : "PDF anexado" });
    } catch (err) {
      toast({ title: "Erro ao enviar PDF", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const handle = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await processFile(file);
  };

  const onClick = () => {
    if (disabled) {
      if (disabledReason) toast({ title: "Ação bloqueada", description: disabledReason });
      return;
    }
    if (isReplace) setConfirmOpen(true);
    else inputRef.current?.click();
  };

  return (
    <>
      <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={handle} />
      <Button variant={variant} size={size} className="gap-1" disabled={busy || disabled} onClick={onClick}>
        {busy
          ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
          : isReplace ? <RefreshCw className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}
        {buttonLabel}
      </Button>
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Substituir PDF anexado?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo atual será removido permanentemente do armazenamento e substituído pelo novo PDF que você selecionar. Esta ação ficará registrada na auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); inputRef.current?.click(); }}>
              Selecionar novo PDF
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface DeleteProps {
  existingUrl: string | null | undefined;
  onDeleted: () => void | Promise<void>;
  disabled?: boolean;
  disabledReason?: string;
  label?: string;
}

/** Delete-with-confirmation button for an attached PDF. */
export function PdfDeleteButton({ existingUrl, onDeleted, disabled, disabledReason, label = "Excluir PDF" }: DeleteProps) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  if (!existingUrl) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await deletePdfByUrl(existingUrl);
      await onDeleted();
      toast({ title: "PDF removido" });
    } catch (err) {
      toast({ title: "Erro ao remover PDF", description: (err as Error).message, variant: "destructive" });
    } finally {
      setBusy(false);
      setOpen(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        className="gap-1 text-destructive hover:text-destructive"
        disabled={busy || disabled}
        onClick={() => {
          if (disabled) { if (disabledReason) toast({ title: "Ação bloqueada", description: disabledReason }); return; }
          setOpen(true);
        }}
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
        {label}
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir PDF anexado?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo será removido permanentemente do armazenamento e o vínculo desfeito. Esta ação ficará registrada na auditoria.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirm} disabled={busy} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {busy && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}