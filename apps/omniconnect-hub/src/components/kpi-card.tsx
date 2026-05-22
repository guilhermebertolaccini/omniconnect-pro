import { Card, CardContent } from "@/components/ui/card";

export function KpiCard({
  label,
  value,
  delta,
  hint,
}: {
  label: string;
  value: string;
  delta?: string;
  hint?: string;
}) {
  const positive = delta?.trim().startsWith("+");
  const negative = delta?.trim().startsWith("-");
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="text-2xl font-semibold tracking-tight">{value}</p>
        <div className="flex items-center justify-between">
          {delta ? (
            <span
              className={
                "text-xs font-medium " +
                (positive
                  ? "text-success"
                  : negative
                    ? "text-destructive"
                    : "text-muted-foreground")
              }
            >
              {delta}
            </span>
          ) : (
            <span />
          )}
          {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
        </div>
      </CardContent>
    </Card>
  );
}
