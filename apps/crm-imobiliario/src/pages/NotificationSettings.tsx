import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Loader2, Save } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

type Prefs = {
  proposal_sent: boolean;
  contract_pending_signature: boolean;
  payment_due_soon: boolean;
  payment_overdue: boolean;
  commission_paid: boolean;
};

const DEFAULT_PREFS: Prefs = {
  proposal_sent: true,
  contract_pending_signature: true,
  payment_due_soon: true,
  payment_overdue: true,
  commission_paid: true,
};

const LABELS: Record<keyof Prefs, { title: string; desc: string }> = {
  proposal_sent: { title: "Proposta enviada", desc: "Quando uma proposta for enviada ao cliente." },
  contract_pending_signature: { title: "Contrato aguardando assinatura", desc: "Quando o contrato for liberado para assinatura." },
  payment_due_soon: { title: "Parcela vencendo", desc: "3 dias antes do vencimento de cada parcela." },
  payment_overdue: { title: "Parcela vencida", desc: "No dia em que uma parcela ficar em atraso." },
  commission_paid: { title: "Comissão liberada", desc: "Quando uma comissão sua for marcada como paga." },
};

export default function NotificationSettings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("notification_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) {
        setPrefs({
          proposal_sent: data.proposal_sent,
          contract_pending_signature: data.contract_pending_signature,
          payment_due_soon: data.payment_due_soon,
          payment_overdue: data.payment_overdue,
          commission_paid: data.commission_paid,
        });
      }
      setLoading(false);
    })();
  }, [user]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("notification_preferences")
      .upsert({ user_id: user.id, ...prefs });
    setSaving(false);
    if (error) {
      toast({ title: "Erro ao salvar", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Preferências salvas" });
    }
  };

  if (loading) {
    return <div className="py-20 text-center"><Loader2 className="h-6 w-6 animate-spin inline" /></div>;
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
        <ArrowLeft className="h-4 w-4 mr-2" />Voltar
      </Button>
      <Card>
        <CardHeader>
          <CardTitle className="font-display flex items-center gap-2">
            <Bell className="h-5 w-5" />Notificações por e-mail
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Escolha quais eventos do fluxo de vendas geram um e-mail para você.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {(Object.keys(LABELS) as (keyof Prefs)[]).map((k) => (
            <div key={k} className="flex items-start justify-between gap-4 p-3 rounded-lg border">
              <div className="flex-1">
                <Label className="font-medium">{LABELS[k].title}</Label>
                <p className="text-xs text-muted-foreground mt-1">{LABELS[k].desc}</p>
              </div>
              <Switch
                checked={prefs[k]}
                onCheckedChange={(v) => setPrefs((p) => ({ ...p, [k]: v }))}
              />
            </div>
          ))}
          <div className="flex justify-end pt-2">
            <Button onClick={save} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Salvar preferências
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}