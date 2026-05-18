import { useI18n } from "@/i18n/useI18n";
import { useChangeHistory } from "@/contexts/ChangeHistoryContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Clock, ArrowRight } from "lucide-react";

interface ChangeHistoryProps {
  entityId: string;
}

export function ChangeHistory({ entityId }: ChangeHistoryProps) {
  const { t } = useI18n();
  const { getEntityHistory } = useChangeHistory();
  const records = getEntityHistory(entityId);

  if (records.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-center text-muted-foreground">
          {t("noHistory")}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-display text-sm">{t("changeHistory")}</CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <ScrollArea className="max-h-60">
          <div className="divide-y divide-border">
            {records.map((r) => (
              <div key={r.id} className="px-4 py-3 flex items-start gap-3">
                <Clock className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">
                    <span className="font-medium text-foreground">{r.userName}</span>
                    {" "}{t("changed")} <span className="font-medium">{r.field}</span>
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                    <span className="line-through">{r.oldValue}</span>
                    <ArrowRight className="h-3 w-3" />
                    <span className="text-foreground font-medium">{r.newValue}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {new Date(r.timestamp).toLocaleString("pt-BR")}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
