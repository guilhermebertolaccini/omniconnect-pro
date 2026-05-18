import { useEffect, useState } from "react";
import { Mail, Loader2, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Navigate } from "react-router-dom";

type LogRow = {
  id: string;
  message_id: string | null;
  template_name: string | null;
  recipient_email: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

const statusColor: Record<string, string> = {
  sent: "bg-green-100 text-green-700",
  pending: "bg-blue-100 text-blue-700",
  dlq: "bg-red-100 text-red-700",
  failed: "bg-red-100 text-red-700",
  suppressed: "bg-yellow-100 text-yellow-700",
  bounced: "bg-orange-100 text-orange-700",
  complained: "bg-orange-100 text-orange-700",
};

export default function AdminEmails() {
  const { user } = useAuth();
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [stats, setStats] = useState({ total: 0, sent: 0, failed: 0, suppressed: 0 });

  const isAdmin = user?.role === "admin";

  useEffect(() => {
    if (!user || !isAdmin) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("email_send_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) {
        setTableMissing(true);
        setLoading(false);
        return;
      }
      // Deduplicar por message_id (mais recente vence)
      const byMsg = new Map<string, LogRow>();
      for (const r of (data ?? []) as LogRow[]) {
        const k = r.message_id ?? r.id;
        if (!byMsg.has(k)) byMsg.set(k, r);
      }
      const dedup = Array.from(byMsg.values());
      setRows(dedup);
      setStats({
        total: dedup.length,
        sent: dedup.filter((r) => r.status === "sent").length,
        failed: dedup.filter((r) => r.status === "dlq" || r.status === "failed").length,
        suppressed: dedup.filter((r) => r.status === "suppressed").length,
      });
      setLoading(false);
    })();
  }, [user, isAdmin]);

  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display flex items-center gap-2">
          <Mail className="h-6 w-6" />Envio de e-mails
        </h1>
        <p className="text-sm text-muted-foreground">Auditoria dos últimos 200 envios transacionais.</p>
      </div>

      {tableMissing ? (
        <Card>
          <CardContent className="py-8 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">Infraestrutura de e-mail ainda não está ativa.</p>
              <p className="text-muted-foreground mt-1">
                Configure um domínio de envio em <strong>Cloud → Emails</strong>. Assim que o DNS for verificado,
                os envios começam a ser registrados aqui automaticamente.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{stats.total}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Enviados</p><p className="text-2xl font-bold text-green-700">{stats.sent}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Falhas</p><p className="text-2xl font-bold text-red-700">{stats.failed}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Suprimidos</p><p className="text-2xl font-bold text-yellow-700">{stats.suppressed}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle className="text-base">Últimos envios</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="py-8 text-center"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">Nenhum envio registrado ainda.</p>
              ) : (
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Template</TableHead><TableHead>Destinatário</TableHead>
                    <TableHead>Status</TableHead><TableHead>Quando</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-xs">{r.template_name ?? "—"}</TableCell>
                        <TableCell className="text-sm">{r.recipient_email ?? "—"}</TableCell>
                        <TableCell><Badge className={statusColor[r.status] ?? "bg-muted"}>{r.status}</Badge></TableCell>
                        <TableCell className="text-xs">{new Date(r.created_at).toLocaleString("pt-BR")}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}