import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { Bot } from '@/types/bot';

interface CreateBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (bot: Omit<Bot, 'id' | 'createdAt'>) => void;
  editBot?: Bot | null;
}

export function CreateBotDialog({ open, onOpenChange, onSave, editBot }: CreateBotDialogProps) {
  const [name, setName] = useState(editBot?.name || '');
  const [description, setDescription] = useState(editBot?.description || '');
  const [phoneNumber, setPhoneNumber] = useState(editBot?.phoneNumber || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      name,
      description,
      phoneNumber,
      status: 'offline',
      lineHealth: 'disconnected',
      messagesReceived: 0,
      messagesSent: 0,
      activeConversations: 0,
      lastActivity: new Date(),
    });
    setName('');
    setDescription('');
    setPhoneNumber('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>{editBot ? 'Editar Bot' : 'Criar Novo Bot'}</DialogTitle>
          <DialogDescription>
            {editBot 
              ? 'Atualize as informações do bot abaixo.'
              : 'Preencha as informações para criar um novo bot WhatsApp.'
            }
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Nome do Bot</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Atendimento Geral"
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Descrição</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o propósito do bot..."
                rows={3}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="phone">Número WhatsApp</Label>
              <Input
                id="phone"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+55 11 99999-9999"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit">
              {editBot ? 'Salvar Alterações' : 'Criar Bot'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
