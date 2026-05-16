---
name: frontend-react
description: >-
  Implement a React feature in one of the monorepo frontends (omniconnect-
  frontend, botify, crm-imobiliario, smart-ad-automator) following the Vite +
  shadcn-ui + TanStack Query + React Hook Form + Zod stack. Use when the user
  asks to add a page, component, form, table, or any UI feature to any
  frontend app.
---

# Frontend Feature Implementation

Applies to all 4 frontend apps. They share the same stack (see `20-react-frontend.mdc`):

- Vite + **React 19** + TypeScript estrito
- Tailwind + shadcn-ui + Radix UI
- TanStack Query 5 + React Hook Form 7 + Zod 3
- react-router-dom 6 + socket.io-client + recharts + sonner + lucide-react + date-fns

## Pre-flight

- [ ] Which **app** does this belong to? (`omniconnect-frontend`, `botify`, `crm-imobiliario`, `smart-ad-automator`)
- [ ] Is the **data already in shared types**? (`packages/ai-contracts`, `packages/shared-types`)
- [ ] Does this need a **new API endpoint**? (if yes, also use skill `backend-nestjs`)
- [ ] **Auth/tenant** requirements?

## Service layer (data fetching)

```typescript
// src/services/leads.service.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { Lead, LeadFilters, CreateLeadInput } from '@omniconnect-pro/shared-types';

export function useLeads(filters: LeadFilters) {
  return useQuery({
    queryKey: ['leads', filters],
    queryFn: async () => {
      const { data } = await apiClient.get<{ data: Lead[]; meta: PageMeta }>('/leads', { params: filters });
      return data;
    },
  });
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateLeadInput) => apiClient.post('/leads', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['leads'] }),
  });
}
```

## Form with React Hook Form + Zod

```typescript
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const schema = z.object({
  name: z.string().min(2).max(120),
  source: z.enum(['whatsapp', 'meta_ads', 'google_ads', 'organic']).optional(),
});
type FormValues = z.infer<typeof schema>;

export function CreateLeadForm() {
  const form = useForm<FormValues>({ resolver: zodResolver(schema) });
  const createLead = useCreateLead();

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((v) => createLead.mutate(v))}>
        <FormField name="name" control={form.control} render={({ field }) => (
          <FormItem>
            <FormLabel>Nome</FormLabel>
            <FormControl><Input {...field} /></FormControl>
            <FormMessage />
          </FormItem>
        )} />
        <Button type="submit" disabled={createLead.isPending}>
          {createLead.isPending ? 'Salvando…' : 'Salvar'}
        </Button>
      </form>
    </Form>
  );
}
```

## Component sizing

- < 150 lines: keep as one component
- > 150 lines: extract subcomponents, hooks, helpers
- Logic-heavy: extract custom hook (`useLeadFilters`, `useLeadStatusBadge`)

## Page structure

```typescript
// src/pages/leads/LeadsListPage.tsx
export default function LeadsListPage() {
  const [filters, setFilters] = useState<LeadFilters>({ page: 0, pageSize: 25 });
  const { data, isLoading, error } = useLeads(filters);

  if (isLoading) return <LeadsListSkeleton />;
  if (error) return <ErrorState error={error} />;

  return (
    <PageLayout title="Leads">
      <LeadsFilters value={filters} onChange={setFilters} />
      <LeadsTable leads={data?.data ?? []} />
      <Pagination meta={data?.meta} onChange={(page) => setFilters({ ...filters, page })} />
    </PageLayout>
  );
}
```

## Loading / error / empty states

Sempre 3 estados: `loading`, `error`, `empty`. Não deixar tela em branco.

```typescript
{isLoading ? <Skeleton /> : error ? <ErrorState /> : data.length === 0 ? <EmptyState /> : <Table data={data} />}
```

## Real-time com socket.io

O backend emite via WebSocket; frontend escuta para atualizar UI:

```typescript
// hooks/useConversationLive.ts
useEffect(() => {
  socket.on('message:received', (msg) => {
    qc.invalidateQueries({ queryKey: ['messages', msg.conversationId] });
  });
  socket.on('conversation.analyzed', (event) => {
    qc.invalidateQueries({ queryKey: ['insight-ai', event.conversationId] });
  });
  return () => {
    socket.off('message:received');
    socket.off('conversation.analyzed');
  };
}, []);
```

Pareie sempre: **WS recebe evento → invalida cache → TanStack Query refetcha**. Não tente manter estado local sincronizado manualmente.

## Gráficos (recharts)

Para dashboards (executive summary, leakage, AI metrics):

```typescript
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

<ResponsiveContainer width="100%" height={300}>
  <BarChart data={data}>
    <XAxis dataKey="name" />
    <YAxis />
    <Tooltip />
    <Bar dataKey="value" fill="#3b82f6" />
  </BarChart>
</ResponsiveContainer>
```

## Toasts (sonner)

```typescript
import { toast } from 'sonner';

createLead.mutate(values, {
  onSuccess: () => toast.success('Lead criado'),
  onError: (err) => toast.error('Falha ao criar lead', { description: err.message }),
});
```

## Shared UI

Componentes shadcn primitivos: `Button`, `Card`, `Dialog`, `Form`, `Input`, `Select`, `Table`, `Toast`, etc. Não recriar. Customizar via variants se necessário.

Componentes próprios do produto (multi-app): vão para `packages/ui` quando estabilizarem.

## Accessibility

- Tudo interativo tem `aria-label` se for ícone
- Forms sempre com `<FormLabel>` (não placeholder como label)
- Foco visível (Radix já cuida)
- Tab order natural

## Anti-patterns

- ❌ `fetch` direto em componente — use service hook
- ❌ State global desnecessário (Redux/Zustand sem motivo)
- ❌ Inline styles
- ❌ `any` em props
- ❌ Lógica de negócio no componente

## See also

- `.cursor/rules/20-react-frontend.mdc`
- shadcn-ui docs (sempre prefira primitives)
