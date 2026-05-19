import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { getBotifyAuthSource } from '@/lib/omniconnectClient';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Eye, EyeOff } from 'lucide-react';
import { z } from 'zod';
import type { LoginCredentials } from '@/types/api';

// ============= Validation Schema =============

const loginSchema = z.object({
  username: z.string()
    .min(3, 'Usuário deve ter pelo menos 3 caracteres')
    .max(100, 'Usuário muito longo'),
  password: z.string()
    .min(6, 'Senha deve ter pelo menos 6 caracteres')
    .max(100, 'Senha muito longa'),
});

type LoginFormData = z.infer<typeof loginSchema>;

// ============= Component =============

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login, isLoading } = useAuth();
  const authSource = getBotifyAuthSource();
  const useOmniAuth = authSource === 'omniconnect';
  
  const [formData, setFormData] = useState<LoginFormData>({
    username: '',
    password: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof LoginFormData, string>>>({});
  const [generalError, setGeneralError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Get the redirect path from location state
  const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/';

  const handleChange = (field: keyof LoginFormData) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({ ...prev, [field]: e.target.value }));
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: undefined }));
    }
    if (generalError) {
      setGeneralError(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setGeneralError(null);

    // Validate form data
    const result = loginSchema.safeParse(formData);
    if (!result.success) {
      const fieldErrors: Partial<Record<keyof LoginFormData, string>> = {};
      result.error.errors.forEach((error) => {
        const field = error.path[0] as keyof LoginFormData;
        fieldErrors[field] = error.message;
      });
      setErrors(fieldErrors);
      return;
    }

    const validatedData: LoginCredentials = {
      username: result.data.username,
      password: result.data.password,
    };

    try {
      await login(validatedData);
      navigate(from, { replace: true });
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.toLowerCase().includes('invalid')) {
          setGeneralError('Usuário ou senha inválidos');
        } else if (error.message.includes('429')) {
          setGeneralError('Muitas tentativas. Aguarde alguns minutos.');
        } else if (error.message.includes('network') || error.message.includes('fetch')) {
          setGeneralError('Erro de conexão. Verifique sua internet.');
        } else {
          setGeneralError(error.message || 'Erro ao fazer login');
        }
      } else {
        setGeneralError('Erro inesperado. Tente novamente.');
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-background shadow-lg mb-4 border border-border">
          <img
            src="/botflow-logo.svg"
            alt="BotFlow"
            className="h-10 w-10"
          />
        </div>
          <h1 className="text-2xl font-bold text-foreground">BotFlow Manager</h1>
          <p className="text-muted-foreground">Gerenciamento de Bots WhatsApp</p>
        </div>

        {/* Login Card */}
        <Card className="border-border/50 shadow-xl">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl text-center">Entrar</CardTitle>
            <CardDescription className="text-center">
              Entre com suas credenciais para acessar o painel
            </CardDescription>
          </CardHeader>
          
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              {/* General Error Alert */}
              {generalError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{generalError}</AlertDescription>
                </Alert>
              )}

              {/* Username Field */}
              <div className="space-y-2">
                <Label htmlFor="username">{useOmniAuth ? 'E-mail' : 'Usuário'}</Label>
                <Input
                  id="username"
                  type={useOmniAuth ? 'email' : 'text'}
                  placeholder={useOmniAuth ? 'admin@vend.com' : 'Digite seu usuário'}
                  value={formData.username}
                  onChange={handleChange('username')}
                  disabled={isLoading}
                  autoComplete="username"
                  className={errors.username ? 'border-destructive' : ''}
                />
                {errors.username && (
                  <p className="text-sm text-destructive">{errors.username}</p>
                )}
              </div>

              {/* Password Field */}
              <div className="space-y-2">
                <Label htmlFor="password">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Digite sua senha"
                    value={formData.password}
                    onChange={handleChange('password')}
                    disabled={isLoading}
                    autoComplete="current-password"
                    className={errors.password ? 'border-destructive pr-10' : 'pr-10'}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                    onClick={() => setShowPassword(!showPassword)}
                    disabled={isLoading}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    )}
                    <span className="sr-only">
                      {showPassword ? 'Esconder senha' : 'Mostrar senha'}
                    </span>
                  </Button>
                </div>
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password}</p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button 
                type="submit" 
                className="w-full" 
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Entrando...
                  </>
                ) : (
                  'Entrar'
                )}
              </Button>
              
              <p className="text-sm text-muted-foreground text-center">
                Suas credenciais são gerenciadas pelo administrador WordPress.
              </p>
            </CardFooter>
          </form>
        </Card>

        {/* Footer */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          BotFlow Manager v2.0 &copy; {new Date().getFullYear()}
        </p>
      </div>
    </div>
  );
}
