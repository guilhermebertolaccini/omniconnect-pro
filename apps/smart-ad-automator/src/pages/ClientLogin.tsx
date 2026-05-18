import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Lock, Mail, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { toast } from 'sonner';

const MOCK_CLIENTS = [
  { email: 'cliente@empresa.com', password: 'cliente123', accountId: 'act_1' },
  { email: 'loja@exemplo.com', password: 'loja123', accountId: 'act_2' },
];

export default function ClientLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    setTimeout(() => {
      const client = MOCK_CLIENTS.find(
        (c) => c.email === email && c.password === password,
      );
      if (client) {
        sessionStorage.setItem('adpilot_client', client.accountId);
        toast.success('Bem-vindo ao seu portal!');
        navigate(`/client/${client.accountId}`);
      } else {
        toast.error('E-mail ou senha inválidos.');
      }
      setLoading(false);
    }, 800);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        {/* Branding */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-lg shadow-primary/25">
            <TrendingUp className="h-7 w-7 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">
              <span className="text-primary">AdPilot</span>
              <span className="text-accent">AI</span>
            </h1>
            <p className="text-sm text-muted-foreground">Portal do Cliente</p>
          </div>
        </div>

        {/* Login Card */}
        <Card className="border-border/50 shadow-xl">
          <CardHeader className="space-y-1 pb-4">
            <CardTitle className="text-xl">Acessar meu Portal</CardTitle>
            <CardDescription>
              Acompanhe os resultados das suas campanhas
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mail</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-10"
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-10 pr-10"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <Button type="submit" className="w-full bg-gradient-primary" disabled={loading}>
                {loading ? 'Entrando...' : 'Acessar Portal'}
              </Button>
            </form>

            <div className="mt-4 rounded-lg border border-border bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">Credenciais de teste:</p>
              <p className="mt-1 text-xs text-muted-foreground">
                <span className="font-mono text-foreground">cliente@empresa.com</span> / <span className="font-mono text-foreground">cliente123</span>
              </p>
              <p className="text-xs text-muted-foreground">
                <span className="font-mono text-foreground">loja@exemplo.com</span> / <span className="font-mono text-foreground">loja123</span>
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Link to admin */}
        <p className="text-center text-xs text-muted-foreground">
          É administrador?{' '}
          <button
            onClick={() => navigate('/login')}
            className="font-medium text-primary hover:underline"
          >
            Acessar painel admin
          </button>
        </p>
      </div>
    </div>
  );
}
