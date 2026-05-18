import { Check, ChevronsUpDown, Building2 } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import type { AdAccount } from '@/types/campaign';

interface AccountSelectorProps {
  accounts: AdAccount[];
  selectedAccount: AdAccount | null;
  onSelect: (account: AdAccount | null) => void;
}

export function AccountSelector({
  accounts,
  selectedAccount,
  onSelect,
}: AccountSelectorProps) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[280px] justify-between"
        >
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-muted-foreground" />
            {selectedAccount ? (
              <span className="truncate">{selectedAccount.name}</span>
            ) : (
              <span className="text-muted-foreground">Todas as contas</span>
            )}
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-0">
        <Command>
          <CommandInput placeholder="Buscar conta..." />
          <CommandList>
            <CommandEmpty>Nenhuma conta encontrada.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="all"
                onSelect={() => {
                  onSelect(null);
                  setOpen(false);
                }}
              >
                <Check
                  className={cn(
                    'mr-2 h-4 w-4',
                    !selectedAccount ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span>Todas as contas</span>
              </CommandItem>
              {accounts.map((account) => (
                <CommandItem
                  key={account.id}
                  value={account.name}
                  onSelect={() => {
                    onSelect(account);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'mr-2 h-4 w-4',
                      selectedAccount?.id === account.id
                        ? 'opacity-100'
                        : 'opacity-0'
                    )}
                  />
                  <div className="flex flex-1 items-center justify-between">
                    <span>{account.name}</span>
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-xs',
                        account.status === 'connected' &&
                          'border-success/30 text-success',
                        account.status === 'syncing' &&
                          'border-warning/30 text-warning',
                        account.status === 'error' &&
                          'border-destructive/30 text-destructive'
                      )}
                    >
                      {account.status === 'connected' && 'Conectada'}
                      {account.status === 'syncing' && 'Sincronizando'}
                      {account.status === 'error' && 'Erro'}
                    </Badge>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
