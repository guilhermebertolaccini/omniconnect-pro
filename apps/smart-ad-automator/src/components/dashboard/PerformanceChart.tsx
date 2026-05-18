import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

const data = [
  { date: '20 Jan', spent: 1200, conversions: 45, roas: 3.8 },
  { date: '21 Jan', spent: 1450, conversions: 52, roas: 4.1 },
  { date: '22 Jan', spent: 1380, conversions: 48, roas: 3.9 },
  { date: '23 Jan', spent: 1650, conversions: 62, roas: 4.5 },
  { date: '24 Jan', spent: 1890, conversions: 71, roas: 4.8 },
  { date: '25 Jan', spent: 2100, conversions: 85, roas: 5.2 },
  { date: '26 Jan', spent: 1950, conversions: 78, roas: 4.9 },
  { date: '27 Jan', spent: 2250, conversions: 92, roas: 5.5 },
];

export function PerformanceChart() {
  return (
    <Card className="col-span-2">
      <CardHeader>
        <CardTitle className="text-base font-medium">
          Performance dos Últimos 7 Dias
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorSpent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(220 90% 56%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(220 90% 56%)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorConversions" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="hsl(262 83% 58%)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="hsl(262 83% 58%)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                className="text-xs fill-muted-foreground"
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                className="text-xs fill-muted-foreground"
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--card))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: '8px',
                }}
                labelStyle={{ color: 'hsl(var(--foreground))' }}
              />
              <Area
                type="monotone"
                dataKey="spent"
                stroke="hsl(220 90% 56%)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorSpent)"
                name="Gasto (R$)"
              />
              <Area
                type="monotone"
                dataKey="conversions"
                stroke="hsl(262 83% 58%)"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorConversions)"
                name="Conversões"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
