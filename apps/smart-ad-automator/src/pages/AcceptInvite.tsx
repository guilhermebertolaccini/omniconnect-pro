import { useEffect, useState } from 'react';
import { useNavigate, useParams, Navigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { TrendingUp, Loader2 } from 'lucide-react';

interface Invitation {
  id: string;
  agency_id: string;
  email: string;
  role: 'owner' | 'admin' | 'operator';
  token: string;
  expires_at: string;
  accepted_at: string | null;
  agency: { name: string };
}

export default function AcceptInvite() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  // Signup state (when no user logged in)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [mode, setMode] = useState<'signup' | 'login'>('signup');

  useEffect(() => {
    async function load() {
      if (!token) { setError('Token inválido'); setLoading(false); return; }
      const { data, error } = await supabase
        .from('agency_invitations')
        .select('*, agency:agencies(name)')
        .eq('token', token)
        .maybeSingle();
      if (error || !data) { setError('Convite não encontrado'); setLoading(false); return; }
      if (data.accepted_at) { setError('Este convite já foi aceito'); setLoading(false); return; }
      if (new Date(data.expires_at) < new Date()) { setError('Convite expirado'); setLoading(false); return; }
      setInvitation(data as unknown as Invitation);
      setEmail(data.email);
      setLoading(false);
    }
    load();
  }, [token]);

  async function handleAccept() {
    if (!invitation || !user) return;
    setAccepting(true);
    const { error: memberErr } = await supabase.from('agency_members').insert({
      agency_id: invitation.agency_id,
      user_id: user.id,
      role: invitation.role,
    });
    if (memberErr && !memberErr.message.includes('duplicate')) {
      toast.error(memberErr.message); setAccepting(false); return;
    }
    await supabase.from('agency_invitations')
      .update({ accepted_at: new Date().toISOString() })
      .eq('id', invitation.id);
    toast.success(`Bem-vindo a ${invitation.agency.name}!`);
    navigate('/');
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (!invitation) return;
    setAccepting(true);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: {
        emailRedirectTo: `${window.location.origin}/accept-invite/${invitation.token}`,
        data: { display_name: displayName },
      },
    });
    setAccepting(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Conta criada! Verifique seu e-mail para confirmar e voltar aqui.');
  }

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setAccepting(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setAccepting(false);
    if (error) toast.error(error.message);
  }

  if (loading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle>Convite inválido</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate('/login')}>Ir para login</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-lg shadow-primary/25">
            <TrendingUp className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-2xl font-bold">
            <span className="text-primary">AdPilot</span><span className="text-accent">AI</span>
          </h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Você foi convidado</CardTitle>
            <CardDescription>
              para entrar em <strong>{invitation?.agency.name}</strong> como{' '}
              <strong className="capitalize">{invitation?.role}</strong>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {user ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Você está logado como <strong>{user.email}</strong>.
                </p>
                <Button onClick={handleAccept} disabled={accepting} className="w-full bg-gradient-primary">
                  {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Aceitar convite'}
                </Button>
              </div>
            ) : (
              <form onSubmit={mode === 'signup' ? handleSignup : handleLogin} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>E-mail</Label>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label>Senha</Label>
                  <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
                </div>
                <Button type="submit" disabled={accepting} className="w-full bg-gradient-primary">
                  {accepting ? <Loader2 className="h-4 w-4 animate-spin" /> : (mode === 'signup' ? 'Criar conta' : 'Entrar')}
                </Button>
                <p className="text-xs text-center text-muted-foreground">
                  {mode === 'signup' ? 'Já tem conta?' : 'Não tem conta?'}{' '}
                  <button type="button" onClick={() => setMode(mode === 'signup' ? 'login' : 'signup')}
                    className="text-primary hover:underline font-medium">
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
