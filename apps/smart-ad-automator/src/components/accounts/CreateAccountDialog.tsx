import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Plus } from 'lucide-react';
import type { AdAccount } from '@/types/campaign';

interface CreateAccountDialogProps {
  onCreateAccount: (account: AdAccount) => void;
}

export function CreateAccountDialog({ onCreateAccount }: CreateAccountDialogProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [timezone, setTimezone] = useState('America/Sao_Paulo');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim() || !businessName.trim()) return;

    const newAccount: AdAccount = {
      id: `acc_${Date.now()}`,
      name: name.trim().slice(0, 100),
      businessName: businessName.trim().slice(0, 100),
      currency,
      timezone,
      status: 'connected',
      lastSync: new Date().toISOString(),
      totalSpent: 0,
      activeCampaigns: 0,
    };

    onCreateAccount(newAccount);
    setName('');
    setBusinessName('');
    setCurrency('BRL');
    setTimezone('America/Sao_Paulo');
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 self-start sm:self-auto">
          <Plus className="h-4 w-4" />
          Cadastrar Empresa
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cadastrar Nova Empresa</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nome da Conta</Label>
            <Input
              id="name"
              placeholder="Ex: E-commerce Brasil"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="businessName">Nome da Empresa</Label>
            <Input
              id="businessName"
              placeholder="Ex: Loja Virtual LTDA"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              maxLength={100}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Moeda</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BRL">BRL (R$)</SelectItem>
                  <SelectItem value="USD">USD ($)</SelectItem>
                  <SelectItem value="EUR">EUR (€)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Fuso horário</Label>
              <Select value={timezone} onValueChange={setTimezone}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="America/Sao_Paulo">São Paulo</SelectItem>
                  <SelectItem value="America/Manaus">Manaus</SelectItem>
                  <SelectItem value="America/Fortaleza">Fortaleza</SelectItem>
                  <SelectItem value="America/Recife">Recife</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={!name.trim() || !businessName.trim()}>
              Cadastrar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
