import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { TrendingUp, Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  acceptInvitation,
  previewInvitation,
  signIn,
  type InvitationPreview,
} from '@/lib/omniconnectClient';

/**
 * Accept-invite (Sprint 2.4): consome /tenant-invitations/by-token/:token e
 * /tenant-invitations/by-token/:token/accept do backend. Cobre os 3 cenários do
 * service (autenticado, account existente, account nova) e finaliza fazendo
 * signIn automaticamente — o backend só emite refresh cookie em /auth/login,
 * /auth/register e /auth/refresh; aceitar invite NÃO autentica sozinho.
 */
export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, status, loading: authLoading } = useAuth();

  const [invitation, setInvitation] = useState<InvitationPreview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Form state para fluxos anônimos (existente OU novo)
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signup' | 'login'>('signup');

  useEffect(() => {
    async function load() {
      if (!token) {
        setError('Token inválido');
        setLoading(false);
        return;
      }
      try {
        const preview = await previewInvitation(token);
        if (preview.isAccepted) {
          setError('Este convite já foi aceito');
        } else if (preview.isExpired) {
          setError('Convite expirado');
        } else {
          setInvitation(preview);
        }
      } catch {
        setError('Convite não encontrado');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [token]);

  async function acceptForLoggedUser() {
    if (!invitation || !token) return;
    setAccepting(true);
    try {
      await acceptInvitation(token, {});
      toast.success(`Bem-vindo a ${invitation.tenantName}!`);
      navigate('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao aceitar convite.');
    } finally {
      setAccepting(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!invitation || !token) return;
    if (mode === 'signup' && !name.trim()) {
      toast.error('Informe seu nome.');
      return;
    }
    if (password.length < 8) {
      toast.error('A senha deve ter pelo menos 8 caracteres.');
      return;
    }
    setAccepting(true);
    try {
      await acceptInvitation(token, {
        name: mode === 'signup' ? name.trim() : undefined,
        password,
      });
      // Após aceitar, autentica para emitir o refresh cookie.
      await signIn(invitation.email, password);
      toast.success(`Bem-vindo a ${invitation.tenantName}!`);
      navigate('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao aceitar convite.');
    } finally {
      setAccepting(false);
    }
  }

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !invitation) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Convite inválido</CardTitle>
            <CardDescription>{error ?? 'Convite não encontrado.'}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/login')}>Ir para login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isLoggedIn = status === 'authenticated' && user;
  const mismatchedEmail =
    isLoggedIn && user.email.toLowerCase() !== invitation.email.toLowerCase();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-lg shadow-primary/25">
            <TrendingUp className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">
            <span className="text-primary">AdPilot</span>
            <span className="text-accent">AI</span>
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Você foi convidado</CardTitle>
            <CardDescription>
              para entrar em <strong>{invitation.tenantName}</strong> como{' '}
              <strong className="capitalize">{invitation.role}</strong>
              {invitation.invitedByName ? (
                <>
                  {' '}por <strong>{invitation.invitedByName}</strong>
                </>
              ) : null}
              .
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoggedIn && !mismatchedEmail ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Você está logado como <strong>{user.email}</strong>.
                </p>
                <Button
                  onClick={acceptForLoggedUser}
                  disabled={accepting}
                  className="w-full bg-gradient-primary"
                >
                  {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aceitar convite'}
                </Button>
              </div>
            ) : isLoggedIn && mismatchedEmail ? (
              <div className="space-y-4">
                <p className="text-sm text-destructive">
                  Sua sessão atual ({user.email}) não corresponde ao e-mail deste
                  convite ({invitation.email}). Saia e tente novamente.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} required />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={invitation.email} readOnly disabled />
                </div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <Input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                  />
                </div>
                <Button type="submit" disabled={accepting} className="w-full bg-gradient-primary">
                  {accepting ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : mode === 'signup' ? (
                    'Criar conta e aceitar'
                  ) : (
                    'Entrar e aceitar'
                  )}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  {mode === 'signup' ? 'Já tem conta?' : 'Ainda não tem conta?'}{' '}
                  <button
                    type="button"
                    onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
                    className="text-primary hover:underline font-medium"
                  >
                    {mode === 'signup' ? 'Entrar' : 'Criar conta'}
                  </button>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
