import { useEffect, useState } from "react";
import { Download, FileText, History, Loader2, RefreshCw, Sparkles, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { TrackedPdfLink } from "@/components/TrackedPdfLink";
import {
  DocumentVersion,
  listDocumentVersions,
  VersionAction,
  VersionParent,
} from "@/lib/documentVersions";

interface Props {
  parentType: VersionParent;
  parentId: string;
  /** Bump this value to force a refresh after upload/replace. */
  refreshKey?: number;
  compact?: boolean;
  /** Fired when a version PDF is opened/downloaded by the user. */
  onAccess?: () => void;
}

const actionMeta: Record<VersionAction, { label: string; icon: any; cls: string }> = {
  attached: { label: "Anexado", icon: Upload, cls: "bg-blue-100 text-blue-700" },
  replaced: { label: "Substituído", icon: RefreshCw, cls: "bg-amber-100 text-amber-700" },
  generated: { label: "Gerado", icon: Sparkles, cls: "bg-purple-100 text-purple-700" },
  imported: { label: "Importado", icon: FileText, cls: "bg-slate-100 text-slate-700" },
};

export function PdfVersionsList({ parentType, parentId, refreshKey = 0, compact, onAccess }: Props) {
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listDocumentVersions(parentType, parentId).then((data) => {
      if (mounted) {
        setVersions(data);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [parentType, parentId, refreshKey]);

  const body = (
    <>
      {loading ? (
        <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>
      ) : versions.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhuma versão registrada.</p>
      ) : (
        <ol className="space-y-2">
          {versions.map((v, idx) => {
            const meta = actionMeta[v.action];
            const Icon = meta.icon;
            const versionNumber = versions.length - idx;
            return (
              <li key={v.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary">
                <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">v{versionNumber}</span>
                    <Badge variant="secondary" className={meta.cls + " text-xs"}>{meta.label}</Badge>
                    {idx === 0 && <Badge variant="outline" className="text-xs">Atual</Badge>}
                  </div>
                  {v.file_name && (
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{v.file_name}</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(v.created_at).toLocaleString("pt-BR")}
                    {v.uploader_name && <> • por <span className="font-medium text-foreground">{v.uploader_name}</span></>}
                  </p>
                </div>
                <Button variant="ghost" size="sm" asChild className="shrink-0">
                  <TrackedPdfLink
                    href={v.pdf_url}
                    parentType={parentType}
                    parentId={parentId}
                    action="downloaded"
                    onTracked={onAccess}
                  >
                    <Download className="h-3.5 w-3.5" />
                  </TrackedPdfLink>
                </Button>
              </li>
            );
          })}
        </ol>
      )}
    </>
  );

  if (compact) return body;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-base flex items-center gap-2">
          <History className="h-4 w-4" />Versões do PDF
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}