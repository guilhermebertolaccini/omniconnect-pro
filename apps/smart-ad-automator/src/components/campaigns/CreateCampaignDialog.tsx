import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, Plus, ArrowLeft, ArrowRight, Check, Upload, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { mockAccounts } from '@/data/mockData';
import type { Campaign, AdAccount } from '@/types/campaign';
import { getPlatformAdapter } from '@/services/platformRegistry';
import { PLATFORM_LABELS, type AdPlatform } from '@/services/platformConfigService';
import { useToast } from '@/hooks/use-toast';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Separator } from '@/components/ui/separator';

const TOTAL_STEPS = 7;

const objectives = [
  { value: 'Conversions', label: 'Conversões' },
  { value: 'Lead Generation', label: 'Geração de Leads' },
  { value: 'Awareness', label: 'Reconhecimento' },
  { value: 'Traffic', label: 'Tráfego' },
  { value: 'Engagement', label: 'Engajamento' },
];

const interestOptions = [
  'Tecnologia', 'Moda', 'Esportes', 'Gastronomia', 'Viagens',
  'Fitness', 'Música', 'Games', 'Negócios', 'Educação',
  'Saúde', 'Beleza', 'Automóveis', 'Imóveis', 'Finanças',
];

const countryOptions = [
  'Brasil', 'Estados Unidos', 'Portugal', 'Argentina', 'México',
  'Colômbia', 'Chile', 'Espanha', 'Alemanha', 'Reino Unido',
];

const cityOptions = [
  'São Paulo', 'Rio de Janeiro', 'Belo Horizonte', 'Brasília', 'Curitiba',
  'Salvador', 'Fortaleza', 'Recife', 'Porto Alegre', 'Manaus',
];

const platformOptions = [
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'audience_network', label: 'Audience Network' },
];

const positionOptions = [
  { value: 'feed', label: 'Feed' },
  { value: 'stories', label: 'Stories' },
  { value: 'reels', label: 'Reels' },
  { value: 'explore', label: 'Explorar' },
  { value: 'right_column', label: 'Coluna Direita' },
];

const ctaOptions = [
  { value: 'LEARN_MORE', label: 'Saiba Mais' },
  { value: 'SHOP_NOW', label: 'Comprar Agora' },
  { value: 'SIGN_UP', label: 'Cadastre-se' },
  { value: 'CONTACT_US', label: 'Fale Conosco' },
  { value: 'DOWNLOAD', label: 'Baixar' },
  { value: 'GET_QUOTE', label: 'Solicitar Orçamento' },
];

const stepLabels = ['Campanha', 'Orçamento', 'Público', 'Localização', 'Posicionamentos', 'Criativo', 'Revisão'];

const fullSchema = z.object({
  accountId: z.string().min(1, 'Selecione uma conta'),
  name: z.string().min(3, 'Nome deve ter ao menos 3 caracteres'),
  objective: z.string().min(1, 'Selecione um objetivo'),
  budget: z.coerce.number().min(1, 'Orçamento mínimo é R$ 1'),
  budgetType: z.enum(['daily', 'lifetime']),
  startDate: z.date({ required_error: 'Selecione a data de início' }),
  endDate: z.date().optional(),
  ageMin: z.coerce.number().min(13, 'Idade mínima é 13').max(65),
  ageMax: z.coerce.number().min(13, 'Idade mínima é 13').max(65),
  genders: z.enum(['all', 'male', 'female']),
  interests: z.array(z.string()),
  countries: z.array(z.string()).min(1, 'Selecione ao menos 1 país'),
  cities: z.array(z.string()),
  platforms: z.array(z.string()).min(1, 'Selecione ao menos 1 plataforma'),
  positions: z.array(z.string()).min(1, 'Selecione ao menos 1 posicionamento'),
  creativeFormat: z.enum(['image', 'video', 'carousel']),
  headline: z.string().min(1, 'Título é obrigatório'),
  primaryText: z.string().min(1, 'Texto principal é obrigatório'),
  description: z.string(),
  ctaType: z.string().min(1, 'Selecione um CTA'),
  destinationUrl: z.string().url('URL inválida').or(z.literal('')),
});

type FormValues = z.infer<typeof fullSchema>;

const stepFields: Record<number, (keyof FormValues)[]> = {
  1: ['accountId', 'name', 'objective'],
  2: ['budget', 'budgetType', 'startDate'],
  3: ['ageMin', 'ageMax', 'genders'],
  4: ['countries'],
  5: ['platforms', 'positions'],
  6: ['headline', 'primaryText', 'ctaType'],
};

interface CreateCampaignDialogProps {
  onCreateCampaign: (campaign: Campaign) => void;
  accounts?: AdAccount[];
  platform?: AdPlatform;
  companyId?: string | null;
  isLive?: boolean;
}

export function CreateCampaignDialog({
  onCreateCampaign,
  accounts,
  platform = 'meta',
  companyId,
  isLive = false,
}: CreateCampaignDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [autoPlacement, setAutoPlacement] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { toast } = useToast();

  const accountList = accounts && accounts.length > 0 ? accounts : mockAccounts;

  const form = useForm<FormValues>({
    resolver: zodResolver(fullSchema),
    defaultValues: {
      accountId: '',
      name: '',
      objective: '',
      budget: 0,
      budgetType: 'daily',
      startDate: undefined,
      endDate: undefined,
      ageMin: 18,
      ageMax: 65,
      genders: 'all',
      interests: [],
      countries: [],
      cities: [],
      platforms: ['facebook', 'instagram'],
      positions: ['feed', 'stories'],
      creativeFormat: 'image',
      headline: '',
      primaryText: '',
      description: '',
      ctaType: '',
      destinationUrl: '',
    },
  });

  const handleNext = async () => {
    const fields = stepFields[step];
    if (fields) {
      const valid = await form.trigger(fields);
      if (!valid) return;
    }
    setStep((s) => s + 1);
  };

  const handleSubmit = async () => {
    const v = form.getValues();
    const account = accountList.find((a) => a.id === v.accountId);

    setSubmitting(true);
    try {
      let externalId: string | undefined;
      if (isLive && companyId) {
        const result = await getPlatformAdapter(platform).createCampaign(companyId, v.accountId, {
          name: v.name,
          objective: v.objective,
          dailyBudget: v.budgetType === 'daily' ? v.budget : undefined,
          lifetimeBudget: v.budgetType === 'lifetime' ? v.budget : undefined,
          status: 'PAUSED',
          startTime: v.startDate ? v.startDate.toISOString() : undefined,
          stopTime: v.endDate ? v.endDate.toISOString() : undefined,
        });
        externalId = result.id;
        toast({
          title: `Campanha criada no ${PLATFORM_LABELS[platform]}`,
          description: `"${v.name}" foi enviada (status PAUSADA por segurança).`,
        });
      } else {
        toast({
          title: 'Campanha criada (modo demo)',
          description: 'Configure a plataforma para enviar campanhas reais.',
        });
      }

      const newCampaign: Campaign = {
        id: externalId || `camp_${Date.now()}`,
        name: v.name,
        accountName: account?.name ?? '',
        status: 'paused',
        objective: v.objective,
        budget: v.budget,
        spent: 0,
        impressions: 0,
        clicks: 0,
        conversions: 0,
        ctr: 0,
        cpc: 0,
        cpm: 0,
        roas: 0,
        cpa: 0,
        whatsappConversations: 0,
        mqls: 0,
        sqls: 0,
        salesClosed: 0,
        startDate: format(v.startDate, 'yyyy-MM-dd'),
        endDate: v.endDate ? format(v.endDate, 'yyyy-MM-dd') : undefined,
        targeting: { ageMin: v.ageMin, ageMax: v.ageMax, genders: v.genders, interests: v.interests },
        geoLocations: { countries: v.countries, cities: v.cities },
        placements: { platforms: v.platforms, positions: v.positions },
        creative: {
          format: v.creativeFormat,
          headline: v.headline,
          primaryText: v.primaryText,
          description: v.description,
          ctaType: v.ctaType,
          destinationUrl: v.destinationUrl,
        },
      };

      onCreateCampaign(newCampaign);
      setOpen(false);
      setStep(1);
      form.reset();
    } catch (err: any) {
      toast({
        title: 'Falha ao criar campanha',
        description: err?.message || 'Erro desconhecido',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  const resetDialog = () => {
    setStep(1);
    form.reset();
    setAutoPlacement(false);
  };

  const values = form.watch();
  const selectedAccount = accountList.find((a) => a.id === values.accountId);

  const toggleArrayValue = (field: 'interests' | 'countries' | 'cities' | 'platforms' | 'positions', value: string) => {
    const current = form.getValues(field) as string[];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    form.setValue(field, next, { shouldValidate: true });
  };

  const handleAutoPlacement = (checked: boolean) => {
    setAutoPlacement(checked);
    if (checked) {
      form.setValue('platforms', platformOptions.map((p) => p.value), { shouldValidate: true });
      form.setValue('positions', positionOptions.map((p) => p.value), { shouldValidate: true });
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetDialog(); }}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" /> Nova Campanha</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Campanha</DialogTitle>
        </DialogHeader>

        <Progress value={(step / TOTAL_STEPS) * 100} className="h-2" />
        <p className="text-xs text-muted-foreground text-center">
          Etapa {step} de {TOTAL_STEPS} — {stepLabels[step - 1]}
        </p>

        <Form {...form}>
          <form className="space-y-4" onSubmit={(e) => e.preventDefault()}>
            {/* Step 1 - Campaign */}
            {step === 1 && (
              <>
                <FormField control={form.control} name="accountId" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta de anúncios</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione a conta" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {accountList.map((acc) => (
                          <SelectItem key={acc.id} value={acc.id}>{acc.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="name" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da campanha</FormLabel>
                    <FormControl><Input placeholder="Ex: Campanha de Verão 2026" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="objective" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Objetivo</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione o objetivo" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {objectives.map((obj) => (
                          <SelectItem key={obj.value} value={obj.value}>{obj.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
              </>
            )}

            {/* Step 2 - Budget & Schedule */}
            {step === 2 && (
              <>
                <FormField control={form.control} name="budgetType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de orçamento</FormLabel>
                    <FormControl>
                      <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="daily" id="daily" />
                          <Label htmlFor="daily">Diário</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="lifetime" id="lifetime" />
                          <Label htmlFor="lifetime">Total</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )} />
                <FormField control={form.control} name="budget" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Orçamento (R$)</FormLabel>
                    <FormControl><Input type="number" min={1} placeholder="100" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de início</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, 'dd/MM/yyyy') : 'Selecione'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Data de término (opcional)</FormLabel>
                    <Popover>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !field.value && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {field.value ? format(field.value, 'dd/MM/yyyy') : 'Selecione'}
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus className="p-3 pointer-events-auto" />
                      </PopoverContent>
                    </Popover>
                  </FormItem>
                )} />
              </>
            )}

            {/* Step 3 - Audience */}
            {step === 3 && (
              <>
                <div>
                  <Label className="mb-2 block">Faixa etária</Label>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground w-8">{values.ageMin}</span>
                    <Slider
                      min={13} max={65} step={1}
                      value={[values.ageMin, values.ageMax]}
                      minStepsBetweenThumbs={1}
                      onValueChange={([min, max]) => {
                        const safeMax = Math.max(min, max);
                        form.setValue('ageMin', min);
                        form.setValue('ageMax', safeMax);
                      }}
                      className="flex-1"
                    />
                    <span className="text-sm text-muted-foreground w-8">{values.ageMax}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Meta permite segmentação a partir de 13 anos</p>
                </div>

                <FormField control={form.control} name="genders" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gênero</FormLabel>
                    <FormControl>
                      <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="all" id="g-all" />
                          <Label htmlFor="g-all">Todos</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="male" id="g-male" />
                          <Label htmlFor="g-male">Masculino</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="female" id="g-female" />
                          <Label htmlFor="g-female">Feminino</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )} />

                <div>
                  <Label className="mb-2 block">Interesses</Label>
                  <div className="flex flex-wrap gap-2">
                    {interestOptions.map((interest) => {
                      const selected = values.interests.includes(interest);
                      return (
                        <Badge
                          key={interest}
                          variant={selected ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => toggleArrayValue('interests', interest)}
                        >
                          {interest}
                          {selected && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Step 4 - Geo-location */}
            {step === 4 && (
              <>
                <div>
                  <Label className="mb-2 block">Países *</Label>
                  <div className="flex flex-wrap gap-2">
                    {countryOptions.map((country) => {
                      const selected = values.countries.includes(country);
                      return (
                        <Badge
                          key={country}
                          variant={selected ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => toggleArrayValue('countries', country)}
                        >
                          {country}
                          {selected && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      );
                    })}
                  </div>
                  {form.formState.errors.countries && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.countries.message}</p>
                  )}
                </div>

                <div>
                  <Label className="mb-2 block">Cidades (opcional)</Label>
                  <div className="flex flex-wrap gap-2">
                    {cityOptions.map((city) => {
                      const selected = values.cities.includes(city);
                      return (
                        <Badge
                          key={city}
                          variant={selected ? 'default' : 'outline'}
                          className="cursor-pointer"
                          onClick={() => toggleArrayValue('cities', city)}
                        >
                          {city}
                          {selected && <X className="ml-1 h-3 w-3" />}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              </>
            )}

            {/* Step 5 - Placements */}
            {step === 5 && (
              <>
                <div className="flex items-center justify-between">
                  <Label>Posicionamentos automáticos</Label>
                  <Switch checked={autoPlacement} onCheckedChange={handleAutoPlacement} />
                </div>

                <div>
                  <Label className="mb-2 block">Plataformas *</Label>
                  <div className="space-y-2">
                    {platformOptions.map((platform) => {
                      const checked = values.platforms.includes(platform.value);
                      return (
                        <div key={platform.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`plat-${platform.value}`}
                            checked={checked}
                            disabled={autoPlacement}
                            onCheckedChange={() => toggleArrayValue('platforms', platform.value)}
                          />
                          <Label htmlFor={`plat-${platform.value}`}>{platform.label}</Label>
                        </div>
                      );
                    })}
                  </div>
                  {form.formState.errors.platforms && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.platforms.message}</p>
                  )}
                </div>

                <div>
                  <Label className="mb-2 block">Posições *</Label>
                  <div className="space-y-2">
                    {positionOptions.map((position) => {
                      const checked = values.positions.includes(position.value);
                      return (
                        <div key={position.value} className="flex items-center gap-2">
                          <Checkbox
                            id={`pos-${position.value}`}
                            checked={checked}
                            disabled={autoPlacement}
                            onCheckedChange={() => toggleArrayValue('positions', position.value)}
                          />
                          <Label htmlFor={`pos-${position.value}`}>{position.label}</Label>
                        </div>
                      );
                    })}
                  </div>
                  {form.formState.errors.positions && (
                    <p className="text-sm text-destructive mt-1">{form.formState.errors.positions.message}</p>
                  )}
                </div>
              </>
            )}

            {/* Step 6 - Creative */}
            {step === 6 && (
              <>
                <FormField control={form.control} name="creativeFormat" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Formato</FormLabel>
                    <FormControl>
                      <RadioGroup onValueChange={field.onChange} value={field.value} className="flex gap-4">
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="image" id="f-img" />
                          <Label htmlFor="f-img">Imagem</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="video" id="f-vid" />
                          <Label htmlFor="f-vid">Vídeo</Label>
                        </div>
                        <div className="flex items-center gap-2">
                          <RadioGroupItem value="carousel" id="f-car" />
                          <Label htmlFor="f-car">Carrossel</Label>
                        </div>
                      </RadioGroup>
                    </FormControl>
                  </FormItem>
                )} />

                <div className="border-2 border-dashed rounded-lg p-6 flex flex-col items-center gap-2 text-muted-foreground">
                  <Upload className="h-8 w-8" />
                  <p className="text-sm">Arraste a mídia ou clique para enviar</p>
                  <p className="text-xs">(Preview — upload não funcional)</p>
                </div>

                <FormField control={form.control} name="headline" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Título</FormLabel>
                    <FormControl><Input placeholder="Título do anúncio" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="primaryText" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Texto principal</FormLabel>
                    <FormControl><Textarea placeholder="Texto que aparece acima da mídia" rows={3} {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descrição (opcional)</FormLabel>
                    <FormControl><Input placeholder="Descrição complementar" {...field} /></FormControl>
                  </FormItem>
                )} />

                <FormField control={form.control} name="ctaType" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Botão de ação (CTA)</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger><SelectValue placeholder="Selecione o CTA" /></SelectTrigger></FormControl>
                      <SelectContent>
                        {ctaOptions.map((cta) => (
                          <SelectItem key={cta.value} value={cta.value}>{cta.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />

                <FormField control={form.control} name="destinationUrl" render={({ field }) => (
                  <FormItem>
                    <FormLabel>URL de destino</FormLabel>
                    <FormControl><Input placeholder="https://seusite.com/oferta" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </>
            )}

            {/* Step 7 - Review */}
            {step === 7 && (
              <Card>
                <CardContent className="pt-6 space-y-4 text-sm">
                  <div>
                    <h4 className="font-semibold mb-2">Campanha</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Conta</span><span className="font-medium">{selectedAccount?.name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Nome</span><span className="font-medium">{values.name}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Objetivo</span><span className="font-medium">{objectives.find((o) => o.value === values.objective)?.label}</span></div>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-semibold mb-2">Orçamento</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Valor</span><span className="font-medium">R$ {values.budget} ({values.budgetType === 'daily' ? 'diário' : 'total'})</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Início</span><span className="font-medium">{values.startDate ? format(values.startDate, 'dd/MM/yyyy') : '-'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Término</span><span className="font-medium">{values.endDate ? format(values.endDate, 'dd/MM/yyyy') : 'Sem data'}</span></div>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-semibold mb-2">Público</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Idade</span><span className="font-medium">{values.ageMin} – {values.ageMax}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Gênero</span><span className="font-medium">{values.genders === 'all' ? 'Todos' : values.genders === 'male' ? 'Masculino' : 'Feminino'}</span></div>
                      {values.interests.length > 0 && (
                        <div><span className="text-muted-foreground">Interesses:</span> <span className="font-medium">{values.interests.join(', ')}</span></div>
                      )}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-semibold mb-2">Localização</h4>
                    <div className="space-y-1">
                      <div><span className="text-muted-foreground">Países:</span> <span className="font-medium">{values.countries.join(', ')}</span></div>
                      {values.cities.length > 0 && (
                        <div><span className="text-muted-foreground">Cidades:</span> <span className="font-medium">{values.cities.join(', ')}</span></div>
                      )}
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-semibold mb-2">Posicionamentos</h4>
                    <div className="space-y-1">
                      <div><span className="text-muted-foreground">Plataformas:</span> <span className="font-medium">{values.platforms.map((p) => platformOptions.find((o) => o.value === p)?.label).join(', ')}</span></div>
                      <div><span className="text-muted-foreground">Posições:</span> <span className="font-medium">{values.positions.map((p) => positionOptions.find((o) => o.value === p)?.label).join(', ')}</span></div>
                    </div>
                  </div>
                  <Separator />
                  <div>
                    <h4 className="font-semibold mb-2">Criativo</h4>
                    <div className="space-y-1">
                      <div className="flex justify-between"><span className="text-muted-foreground">Formato</span><span className="font-medium capitalize">{values.creativeFormat === 'image' ? 'Imagem' : values.creativeFormat === 'video' ? 'Vídeo' : 'Carrossel'}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">Título</span><span className="font-medium">{values.headline}</span></div>
                      <div><span className="text-muted-foreground">Texto:</span> <span className="font-medium">{values.primaryText}</span></div>
                      <div className="flex justify-between"><span className="text-muted-foreground">CTA</span><span className="font-medium">{ctaOptions.find((c) => c.value === values.ctaType)?.label}</span></div>
                      {values.destinationUrl && (
                        <div className="flex justify-between"><span className="text-muted-foreground">URL</span><span className="font-medium truncate max-w-[200px]">{values.destinationUrl}</span></div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigation */}
            <div className="flex justify-between pt-2">
              {step > 1 ? (
                <Button type="button" variant="outline" onClick={() => setStep((s) => s - 1)}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Voltar
                </Button>
              ) : <div />}

              {step < TOTAL_STEPS ? (
                <Button type="button" onClick={handleNext}>
                  Próximo <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <Button type="button" onClick={handleSubmit} disabled={submitting}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                  {submitting ? 'Enviando…' : isLive ? `Criar no ${PLATFORM_LABELS[platform]}` : 'Criar Campanha'}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
