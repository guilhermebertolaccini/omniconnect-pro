import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

interface MetaDataStatusProps {
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  variant?: 'inline' | 'overlay';
}

export function MetaDataLoading({ variant = 'inline' }: { variant?: 'inline' | 'overlay' }) {
  if (variant === 'overlay') {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border bg-card p-8">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Carregando dados da Meta API...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>Sincronizando dados...</span>
    </div>
  );
}

export function MetaDataError({ error, refetch }: { error: Error; refetch: () => void }) {
  const isTokenError = error.message?.includes('Token') || error.message?.includes('token');

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>{isTokenError ? 'Token inválido' : 'Erro ao carregar dados'}</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span className="text-sm">
          {isTokenError
            ? 'Seu token Meta expirou ou é inválido. Verifique em Configurações.'
            : error.message || 'Não foi possível conectar à Meta API. Usando dados de demonstração.'}
        </span>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={() => refetch()}>
          <RefreshCw className="h-3.5 w-3.5" />
          Tentar novamente
        </Button>
      </AlertDescription>
    </Alert>
  );
}

export function MetaDataLoadingSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <div className="mb-6 grid gap-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-24 rounded-xl" />
      ))}
    </div>
  );
}
