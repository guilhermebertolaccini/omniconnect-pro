import { useState } from "react";
import { useI18n } from "@/i18n/useI18n";
import { useAuth } from "@/contexts/AuthContext";
import { PropertyDocument } from "@/types/property";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Upload, FileText, Image, Trash2, Eye, Loader2 } from "lucide-react";

interface DocumentManagerProps {
  documents: PropertyDocument[];
  onAddDocument: (doc: PropertyDocument) => void;
  onRemoveDocument: (id: string) => void;
  filterType?: "floor_plan" | "all";
  typologies?: string[];
}

const typeLabels: Record<string, Record<string, string>> = {
  "pt-BR": {
    floor_plan: "Planta",
    permit: "Alvará",
    memorial: "Memorial Descritivo",
    regulation: "Convenção/Regimento",
    other: "Outro",
  },
  en: {
    floor_plan: "Floor Plan",
    permit: "Permit",
    memorial: "Descriptive Memorial",
    regulation: "Regulation",
    other: "Other",
  },
};

export function DocumentManager({ documents, onAddDocument, onRemoveDocument, filterType = "all", typologies = [] }: DocumentManagerProps) {
  const { t, locale } = useI18n();
  const { canEditPrice, user } = useAuth();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [form, setForm] = useState({
    name: "",
    type: filterType === "floor_plan" ? "floor_plan" : "other" as PropertyDocument["type"],
    typology: "",
  });

  const labels = typeLabels[locale] || typeLabels["en"];

  const filtered = filterType === "floor_plan"
    ? documents.filter((d) => d.type === "floor_plan")
    : documents.filter((d) => d.type !== "floor_plan");

  const resetForm = () => {
    setForm({ name: "", type: filterType === "floor_plan" ? "floor_plan" : "other", typology: "" });
    setFile(null);
  };

  const handleUpload = async () => {
    if (!form.name || !user || !file) return;
    setUploading(true);
    try {
      const url = await fileToDataUrl(file);

      const doc: PropertyDocument = {
        id: `doc-${Date.now()}`,
        name: form.name,
        type: form.type,
        typology: form.type === "floor_plan" ? form.typology : undefined,
        url,
        uploadedAt: new Date().toISOString(),
        uploadedBy: user.name,
      };
      onAddDocument(doc);
      toast({ title: t("upload"), description: form.name });
      setDialogOpen(false);
      resetForm();
    } catch (e: any) {
      toast({ title: "Erro", description: e?.message ?? String(e), variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="font-display">
            {filterType === "floor_plan" ? t("plans") : t("documents")}
          </CardTitle>
          {canEditPrice && (
            <Button size="sm" className="gap-1" onClick={() => setDialogOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> {t("upload")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">
            {filterType === "floor_plan" ? t("noFloorPlans") : t("noDocuments")}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filtered.map((doc) => (
              <div key={doc.id} className="border rounded-lg overflow-hidden group">
                {doc.type === "floor_plan" ? (
                  <div className="relative h-36 bg-muted">
                    <img src={doc.url} alt={doc.name} className="w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-foreground/0 group-hover:bg-foreground/40 transition-colors flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                      <Button size="icon" variant="secondary" className="h-8 w-8" onClick={() => setPreviewUrl(doc.url)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {canEditPrice && (
                        <Button size="icon" variant="destructive" className="h-8 w-8" onClick={() => onRemoveDocument(doc.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="h-36 bg-muted flex items-center justify-center">
                    <FileText className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="text-sm font-medium text-foreground truncate">{doc.name}</p>
                  <div className="flex items-center justify-between mt-1">
                    <Badge variant="outline" className="text-xs">{labels[doc.type]}</Badge>
                    {doc.typology && <span className="text-xs text-muted-foreground">{doc.typology}</span>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {doc.uploadedBy} • {new Date(doc.uploadedAt).toLocaleDateString("pt-BR")}
                  </p>
                  {doc.type !== "floor_plan" && canEditPrice && (
                    <Button size="sm" variant="ghost" className="w-full mt-1 text-destructive h-7" onClick={() => onRemoveDocument(doc.id)}>
                      <Trash2 className="h-3 w-3 mr-1" /> {t("remove")}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {/* Upload dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">{t("uploadDocument")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t("documentName")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{locale === "pt-BR" ? "Arquivo" : "File"}</Label>
              <Input
                type="file"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFile(f);
                  if (f && !form.name) setForm((prev) => ({ ...prev, name: f.name.replace(/\.[^.]+$/, "") }));
                }}
              />
            </div>
            {filterType !== "floor_plan" && (
              <div className="space-y-1.5">
                <Label>{t("documentType")}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as PropertyDocument["type"] })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="permit">{labels.permit}</SelectItem>
                    <SelectItem value="memorial">{labels.memorial}</SelectItem>
                    <SelectItem value="regulation">{labels.regulation}</SelectItem>
                    <SelectItem value="other">{labels.other}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            {(filterType === "floor_plan" || form.type === "floor_plan") && typologies.length > 0 && (
              <div className="space-y-1.5">
                <Label>{t("typology")}</Label>
                <Select value={form.typology} onValueChange={(v) => setForm({ ...form, typology: v })}>
                  <SelectTrigger><SelectValue placeholder={t("selectTypology")} /></SelectTrigger>
                  <SelectContent>
                    {typologies.map((tp) => (
                      <SelectItem key={tp} value={tp}>{tp}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={uploading}>{t("cancel")}</Button>
            <Button onClick={handleUpload} disabled={!form.name || !file || uploading}>
              {uploading && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
              {t("upload")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">{t("preview")}</DialogTitle>
          </DialogHeader>
          {previewUrl && <img src={previewUrl} alt="Preview" className="w-full rounded-lg" />}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
