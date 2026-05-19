import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { 
  ChevronDown, 
  Plus, 
  Check, 
  Building2, 
  Trash2, 
  Edit,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MetaAccount, metaAccountsService } from '@/services/meta-accounts-service';
import { metaGraphAPI } from '@/services/meta-graph-api';

interface AccountSelectorProps {
  activeAccount: MetaAccount | null;
  onAccountChange: (account: MetaAccount) => void;
  onAccountAdded: (account: MetaAccount) => void;
  onAccountDeleted: (accountId: string) => void;
}

export function AccountSelector({ 
  activeAccount, 
  onAccountChange, 
  onAccountAdded,
  onAccountDeleted,
}: AccountSelectorProps) {
  const [accounts, setAccounts] = useState<MetaAccount[]>(metaAccountsService.getAccounts());
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState<MetaAccount | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [businessManagerId, setBusinessManagerId] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [isTestingConnection, setIsTestingConnection] = useState(false);

  const refreshAccounts = async () => {
    await metaAccountsService.loadAccounts();
    setAccounts(metaAccountsService.getAccounts());
  };

  const handleSwitchAccount = async (account: MetaAccount) => {
    try {
      const updatedAccount = await metaAccountsService.setActiveAccount(account.id);
      if (!updatedAccount) return;
      const token = await metaAccountsService.getAccessTokenForGraph(updatedAccount.id);
      metaGraphAPI.setAccessToken(token);
      await refreshAccounts();
      onAccountChange({ ...updatedAccount, accessToken: token });
      toast.success(`Conta "${account.name}" ativada`);
    } catch {
      toast.error('Erro ao ativar conta');
    }
  };

  const handleAddAccount = async () => {
    if (!name.trim()) {
      toast.error('Nome da conta é obrigatório');
      return;
    }
    if (!accessToken.trim()) {
      toast.error('Access Token é obrigatório');
      return;
    }
    if (!businessManagerId.trim()) {
      toast.error('Business Manager ID é obrigatório');
      return;
    }

    setIsTestingConnection(true);
    try {
      // Test connection first
      metaGraphAPI.setAccessToken(accessToken);
      const result = await metaGraphAPI.testConnection();

      if (!result.success) {
        toast.error(`Falha na conexão: ${result.error}`);
        return;
      }

      const newAccount = await metaAccountsService.addAccount({
        name,
        businessManagerId,
        accessToken,
      });

      await refreshAccounts();
      onAccountAdded({ ...newAccount, accessToken });
      setAddDialogOpen(false);
      resetForm();
      toast.success('Conta adicionada com sucesso!');
    } catch (error) {
      toast.error('Erro ao adicionar conta');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleEditAccount = async () => {
    if (!selectedAccount) return;

    if (!name.trim()) {
      toast.error('Nome da conta é obrigatório');
      return;
    }

    setIsTestingConnection(true);
    try {
      // If token changed, test connection
      if (accessToken && accessToken !== selectedAccount.accessToken) {
        metaGraphAPI.setAccessToken(accessToken);
        const result = await metaGraphAPI.testConnection();
        if (!result.success) {
          toast.error(`Falha na conexão: ${result.error}`);
          return;
        }
      }

      const updates: Partial<MetaAccount> = { name };
      if (businessManagerId) updates.businessManagerId = businessManagerId;
      if (accessToken) updates.accessToken = accessToken;

      const updatedAccount = await metaAccountsService.updateAccount(
        selectedAccount.id,
        updates,
      );
      await refreshAccounts();

      if (selectedAccount.isActive && updatedAccount) {
        const token = await metaAccountsService.getAccessTokenForGraph(updatedAccount.id);
        metaGraphAPI.setAccessToken(token);
        onAccountChange({ ...updatedAccount, accessToken: token });
      }

      setEditDialogOpen(false);
      resetForm();
      toast.success('Conta atualizada!');
    } catch (error) {
      toast.error('Erro ao atualizar conta');
    } finally {
      setIsTestingConnection(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!selectedAccount) return;

    await metaAccountsService.deleteAccount(selectedAccount.id);
    await refreshAccounts();
    onAccountDeleted(selectedAccount.id);
    setDeleteDialogOpen(false);
    setSelectedAccount(null);
    toast.success('Conta removida');
  };

  const openEditDialog = (account: MetaAccount) => {
    setSelectedAccount(account);
    setName(account.name);
    setBusinessManagerId(account.businessManagerId);
    setAccessToken(''); // Don't pre-fill token for security
    setEditDialogOpen(true);
  };

  const openDeleteDialog = (account: MetaAccount) => {
    setSelectedAccount(account);
    setDeleteDialogOpen(true);
  };

  const resetForm = () => {
    setName('');
    setBusinessManagerId('');
    setAccessToken('');
    setSelectedAccount(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="gap-2">
            <Building2 className="h-4 w-4" />
            {activeAccount?.name || 'Selecionar Conta'}
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[300px]">
          <DropdownMenuLabel>Contas Business Manager</DropdownMenuLabel>
          <DropdownMenuSeparator />
          
          {accounts.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-muted-foreground">
              Nenhuma conta configurada
            </div>
          ) : (
            <ScrollArea className="max-h-[300px]">
              {accounts.map((account) => (
                <DropdownMenuItem
                  key={account.id}
                  className="flex items-center justify-between cursor-pointer"
                  onClick={() => handleSwitchAccount(account)}
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {account.isActive && <Check className="h-4 w-4 text-primary shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{account.name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        ID: {account.businessManagerId}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0 ml-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        openEditDialog(account);
                      }}
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={(e) => {
                        e.stopPropagation();
                        openDeleteDialog(account);
                      }}
                    >
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                </DropdownMenuItem>
              ))}
            </ScrollArea>
          )}
          
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setAddDialogOpen(true)}
            className="cursor-pointer"
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Nova Conta
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add Account Dialog */}
      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Conta Business Manager</DialogTitle>
            <DialogDescription>
              Adicione uma nova conta da Meta para gerenciar números WhatsApp
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="add-name">Nome da Conta</Label>
              <Input
                id="add-name"
                placeholder="Ex: BM Principal, Cliente X"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-token">Access Token</Label>
              <Input
                id="add-token"
                type="password"
                placeholder="EAAGm0PX..."
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="add-bmid">Business Manager ID</Label>
              <Input
                id="add-bmid"
                placeholder="123456789012345"
                value={businessManagerId}
                onChange={(e) => setBusinessManagerId(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAddDialogOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleAddAccount} disabled={isTestingConnection}>
              {isTestingConnection ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Testando...
                </>
              ) : (
                'Adicionar Conta'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Account Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Conta</DialogTitle>
            <DialogDescription>
              Atualize as informações da conta "{selectedAccount?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Nome da Conta</Label>
              <Input
                id="edit-name"
                placeholder="Ex: BM Principal"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-token">Novo Access Token (opcional)</Label>
              <Input
                id="edit-token"
                type="password"
                placeholder="Deixe em branco para manter o atual"
                value={accessToken}
                onChange={(e) => setAccessToken(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-bmid">Novo Business Manager ID (opcional)</Label>
              <Input
                id="edit-bmid"
                placeholder="Deixe em branco para manter o atual"
                value={businessManagerId}
                onChange={(e) => setBusinessManagerId(e.target.value)}
              />
            </div>
            {selectedAccount?.lastUsed && (
              <p className="text-xs text-muted-foreground">
                Último uso: {format(new Date(selectedAccount.lastUsed), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setEditDialogOpen(false); resetForm(); }}>
              Cancelar
            </Button>
            <Button onClick={handleEditAccount} disabled={isTestingConnection}>
              {isTestingConnection ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Salvando...
                </>
              ) : (
                'Salvar Alterações'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover Conta</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover a conta "{selectedAccount?.name}"? 
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSelectedAccount(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
