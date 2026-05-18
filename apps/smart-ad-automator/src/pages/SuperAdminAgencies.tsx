import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Building2, Plus, Mail, Copy } from 'lucide-react';

interface Agency {
  id: string;
  name: string;
  slug: string;
  plan: string;
  status: string;
  created_at: string;
}

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

export default function SuperAdminAgencies() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteFor, setInviteFor] = useState<Agency | null>(null);

  const { data: agencies, isLoading } = useQuery({
    queryKey: ['super-admin-agencies'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agencies').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data as Agency[];
    },
  });

  const [name, setName] = useState('');
  const [plan, setPlan] = useState('starter');
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreating(true);
    const slug = slugify(name) || `agency-${Date.now()}`;
    const { error } = await supabase.from('agencies').insert({ name, slug, plan });
    setCreating(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Agência criada.');
    setName(''); setCreateOpen(false);
    qc.invalidateQueries({ queryKey: ['super-admin-agencies'] });
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="h-6 w-6 text-primary" />
              Agências
            </h1>
            <p className="text-sm text-muted-foreground">
              Gerencie todas as agências da plataforma.
            </p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-primary"><Plus className="h-4 w-4 mr-2" /> Nova agência</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Criar agência</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="space-y-2">
                  <Label>Nome</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Plano</Label>
                  <Select value={plan} onValueChange={setPlan}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="starter">Starter</SelectItem>
                      <SelectItem value="pro">Pro</SelectItem>
                      <SelectItem value="enterprise">Enterprise</SelectItem>
                      <SelectItem value="internal">Interna</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit" disabled={creating || !name}>
                    {creating ? 'Criando...' : 'Criar'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Lista</CardTitle>
            <CardDescription>{agencies?.length ?? 0} agências cadastradas.</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nome</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Plano</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {agencies?.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="font-mono text-xs">{a.slug}</TableCell>
                      <TableCell><Badge variant="outline">{a.plan}</Badge></TableCell>
                      <TableCell><Badge>{a.status}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="sm" onClick={() => setInviteFor(a)}>
                          <Mail className="h-4 w-4 mr-2" /> Convidar
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <InviteDialog agency={inviteFor} onClose={() => setInviteFor(null)} />
      </div>
    </DashboardLayout>
  );
}

function InviteDialog({ agency, onClose }: { agency: Agency | null; onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'owner' | 'admin' | 'operator'>('owner');
  const [submitting, setSubmitting] = useState(false);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!agency) return;
    setSubmitting(true);
    const token = crypto.randomUUID() + '-' + Date.now().toString(36);
    const { error } = await supabase.from('agency_invitations').insert({
      agency_id: agency.id, email, role, token,
    });
    setSubmitting(false);
    if (error) { toast.error(error.message); return; }
    const url = `${window.location.origin}/accept-invite/${token}`;
    setInviteUrl(url);
    toast.success('Convite criado.');
  }

  return (
    <Dialog open={!!agency} onOpenChange={(o) => !o && (onClose(), setInviteUrl(null), setEmail(''))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Convidar para {agency?.name}</DialogTitle>
        </DialogHeader>
        {inviteUrl ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Compartilhe este link com a pessoa convidada (válido por 7 dias):
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={inviteUrl} className="font-mono text-xs" />
              <Button size="icon" variant="outline" onClick={() => {
                navigator.clipboard.writeText(inviteUrl);
                toast.success('Link copiado.');
              }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInvite} className="space-y-4">
            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v: any) => setRole(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="owner">Owner — gerencia equipe e billing</SelectItem>
                  <SelectItem value="admin">Admin — gerencia equipe</SelectItem>
                  <SelectItem value="operator">Operador — opera campanhas</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter>
              <Button type="submit" disabled={submitting}>
                {submitting ? 'Gerando...' : 'Gerar convite'}
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
