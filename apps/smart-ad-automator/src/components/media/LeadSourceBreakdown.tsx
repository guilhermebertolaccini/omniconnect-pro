import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';

const COLORS = [
  'hsl(217, 91%, 60%)',
  'hsl(142, 71%, 45%)',
  'hsl(330, 81%, 60%)',
  'hsl(45, 93%, 58%)',
  'hsl(280, 70%, 60%)',
  'hsl(15, 85%, 60%)',
];

const fmtNum = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });

export function LeadSourceBreakdown({
  data,
}: {
  data: { source: string; leads: number; share: number }[];
}) {
  const filtered = data.filter((d) => d.leads > 0);

  return (
    <Card className="bg-card/50 backdrop-blur border-border/50">
      <CardHeader>
        <CardTitle className="text-base">Origem dos leads</CardTitle>
      </CardHeader>
      <CardContent>
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem leads atribuídos no período.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={filtered}
                    dataKey="leads"
                    nameKey="source"
                    innerRadius={50}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {filtered.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(v: number) => fmtNum(v) + ' leads'}
                    contentStyle={{
                      background: 'hsl(var(--popover))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: 8,
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="space-y-2">
              {filtered.map((d, i) => (
                <div key={d.source} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 truncate">
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ background: COLORS[i % COLORS.length] }}
                    />
                    <span className="truncate">{d.source}</span>
                  </div>
                  <div className="flex items-center gap-3 text-muted-foreground shrink-0">
                    <span>{fmtNum(d.leads)}</span>
                    <span className="font-medium text-foreground w-12 text-right">
                      {d.share.toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
