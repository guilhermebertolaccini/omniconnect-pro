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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Phone, Building2, Smartphone } from 'lucide-react';

interface ConnectNumberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnect: (data: ConnectNumberData) => Promise<void>;
}

export interface ConnectNumberData {
  accessToken: string;
  businessManagerId: string;
  wabaId: string;
  phoneNumberId: string;
}

export function ConnectNumberDialog({ open, onOpenChange, onConnect }: ConnectNumberDialogProps) {
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<ConnectNumberData>({
    accessToken: '',
    businessManagerId: '',
    wabaId: '',
    phoneNumberId: '',
  });

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      await onConnect(formData);
      onOpenChange(false);
      setStep(1);
      setFormData({ accessToken: '', businessManagerId: '', wabaId: '', phoneNumberId: '' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleNextStep = () => {
    if (step < 3) setStep(step + 1);
  };

  const handlePrevStep = () => {
    if (step > 1) setStep(step - 1);
  };

  const isStepValid = () => {
    switch (step) {
      case 1:
        return formData.accessToken.length > 0;
      case 2:
        return formData.businessManagerId.length > 0 && formData.wabaId.length > 0;
      case 3:
        return formData.phoneNumberId.length > 0;
      default:
        return false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-primary" />
            Conectar Número WhatsApp
          </DialogTitle>
          <DialogDescription>
            Conecte um número da API oficial do WhatsApp Business. Passo {step} de 3.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-center gap-2 my-4">
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              className={`h-2 w-16 rounded-full transition-colors ${
                s <= step ? 'bg-primary' : 'bg-muted'
              }`}
            />
          ))}
        </div>

        <div className="space-y-4 py-4">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <Building2 className="h-8 w-8 text-primary" />
                <div>
                  <h4 className="font-medium">Autenticação Meta</h4>
                  <p className="text-sm text-muted-foreground">
                    Insira o Access Token do Meta Business
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="accessToken">Access Token</Label>
                <Input
                  id="accessToken"
                  type="password"
                  placeholder="EAAGm..."
                  value={formData.accessToken}
                  onChange={(e) => setFormData({ ...formData, accessToken: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Obtenha em developers.facebook.com → Seu App → Configurações
                </p>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <Building2 className="h-8 w-8 text-primary" />
                <div>
                  <h4 className="font-medium">Business Manager & WABA</h4>
                  <p className="text-sm text-muted-foreground">
                    Selecione o BM e a conta WABA
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessManagerId">Business Manager ID</Label>
                <Input
                  id="businessManagerId"
                  placeholder="123456789012345"
                  value={formData.businessManagerId}
                  onChange={(e) => setFormData({ ...formData, businessManagerId: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="wabaId">WABA ID (WhatsApp Business Account)</Label>
                <Input
                  id="wabaId"
                  placeholder="123456789012345"
                  value={formData.wabaId}
                  onChange={(e) => setFormData({ ...formData, wabaId: e.target.value })}
                />
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-lg bg-muted/50">
                <Smartphone className="h-8 w-8 text-primary" />
                <div>
                  <h4 className="font-medium">Número de Telefone</h4>
                  <p className="text-sm text-muted-foreground">
                    Insira o ID do número a conectar
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="phoneNumberId">Phone Number ID</Label>
                <Input
                  id="phoneNumberId"
                  placeholder="123456789012345"
                  value={formData.phoneNumberId}
                  onChange={(e) => setFormData({ ...formData, phoneNumberId: e.target.value })}
                />
                <p className="text-xs text-muted-foreground">
                  Encontre em developers.facebook.com → WhatsApp → Configuração da API
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div>
            {step > 1 && (
              <Button variant="outline" onClick={handlePrevStep}>
                Voltar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            {step < 3 ? (
              <Button onClick={handleNextStep} disabled={!isStepValid()}>
                Próximo
              </Button>
            ) : (
              <Button onClick={handleConnect} disabled={!isStepValid() || isLoading}>
                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Conectar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
