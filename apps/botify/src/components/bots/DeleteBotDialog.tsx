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
import type { Bot } from '@/types/bot';

interface DeleteBotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bot: Bot | null;
  onConfirm: () => void;
}

export function DeleteBotDialog({ open, onOpenChange, bot, onConfirm }: DeleteBotDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir Bot</AlertDialogTitle>
          <AlertDialogDescription>
            Tem certeza que deseja excluir o bot "{bot?.name}"? Esta ação não pode ser desfeita.
            Todas as conversas e configurações serão perdidas.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Excluir
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
