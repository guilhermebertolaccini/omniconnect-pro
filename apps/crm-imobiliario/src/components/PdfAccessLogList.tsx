import { useEffect, useState } from "react";
import { Eye, Download, Loader2, Activity } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  DocumentAccessLog,
  listDocumentAccessLogs,
  VersionParent,
} from "@/lib/documentVersions";

interface Props {
  parentType: VersionParent;
  parentId: string;
  /** Bump to refresh after a new view/download. */
  refreshKey?: number;
  compact?: boolean;
}

export function PdfAccessLogList({ parentType, parentId, refreshKey = 0, compact }: Props) {
  const [logs, setLogs] = useState<DocumentAccessLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    listDocumentAccessLogs(parentType, parentId).then((data) => {
      if (mounted) {
        setLogs(data);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [parentType, parentId, refreshKey]);

  const body = (
    <>
      {loading ? (
        <div className="py-6 text-center"><Loader2 className="h-5 w-5 animate-spin inline text-muted-foreground" /></div>
      ) : logs.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">Nenhum acesso registrado.</p>
      ) : (
        <ol className="space-y-2">
          {logs.map((l) => {
            const isDownload = l.action === "downloaded";
            const Icon = isDownload ? Download : Eye;
            return (
              <li key={l.id} className="flex items-start gap-3 p-3 rounded-lg bg-secondary">
                <div className="w-8 h-8 rounded-full bg-background flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge
                      variant="secondary"
                      className={
                        (isDownload ? "bg-emerald-100 text-emerald-700" : "bg-sky-100 text-sky-700") +
                        " text-xs"
                      }
                    >
                      {isDownload ? "Baixou" : "Visualizou"}
                    </Badge>
                    {l.user_name && (
                      <span className="text-sm font-medium truncate">{l.user_name}</span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </p>
                </div>
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
          <Activity className="h-4 w-4" />Acessos ao PDF
        </CardTitle>
      </CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  );
}