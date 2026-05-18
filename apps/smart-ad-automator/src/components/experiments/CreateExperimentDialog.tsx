import { useState, useMemo } from 'react';
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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useCompany } from '@/contexts/CompanyContext';
import { useCreateExperiment } from '@/hooks/useExperiments';
import { toast } from '@/hooks/use-toast';
import { mockPosts } from '@/data/mockData';
import type { Post } from '@/types/campaign';
import {
  EXPERIMENT_MODE_LABELS,
  WINNING_METRIC_LABELS,
  postToSnapshot,
  type ExperimentMode,
  type WinningMetric,
} from '@/types/experiment';
import {
  Beaker,
  Plus,
  Trash2,
  Check,
  Sparkles,
  Instagram,
  Facebook,
  Image as ImageIcon,
  Eye,
  Heart,
  TrendingUp,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated?: (id: string) => void;
}

interface VariantDraft {
  label: string;
  note: string;
  postId: string;
}

const DEFAULT_VARIANTS: VariantDraft[] = [
  { label: 'Variante A (controle)', note: '', postId: '' },
  { label: 'Variante B', note: '', postId: '' },
];

const HYPOTHESIS_TEMPLATES = [
  'Reels com depoimento de cliente terão mais salvamentos do que carrosséis informativos.',
  'Posts publicados às 19h terão maior alcance do que os publicados de manhã.',
  'Legendas com pergunta no início aumentam comentários em pelo menos 30%.',
  'Imagem de produto em uso supera imagem de produto isolado em taxa de engajamento.',
];

const METRIC_DESCRIPTIONS: Record<WinningMetric, { hint: string; bestFor: string }> = {
  engagement_rate: { hint: 'Interações ÷ alcance', bestFor: 'Padrão recomendado para posts orgânicos' },
  reach: { hint: 'Contas únicas atingidas', bestFor: 'Topo de funil, awareness' },
  impressions: { hint: 'Total de visualizações', bestFor: 'Volume de exposição' },
  likes: { hint: 'Curtidas no post', bestFor: 'Sinal de aprovação rápida' },
  comments: { hint: 'Comentários recebidos', bestFor: 'Posts conversacionais' },
  shares: { hint: 'Compartilhamentos', bestFor: 'Conteúdo viral / valor social' },
  saves: { hint: 'Salvamentos', bestFor: 'Conteúdo educativo / referência' },
  total_interactions: { hint: 'Soma de todas interações', bestFor: 'Volume bruto de engajamento' },
  profile_visits: { hint: 'Visitas ao perfil pelo post', bestFor: 'Posts com call to follow' },
  website_clicks: { hint: 'Cliques para link na bio', bestFor: 'Conversão para fora do app' },
};

const STEP_TITLES = ['Modo do teste', 'Hipótese e métrica', 'Variantes'];

export function CreateExperimentDialog({ open, onOpenChange, onCreated }: Props) {
  const { selectedCompanyId, selectedPlatform } = useCompany();
  const createMut = useCreateExperiment();

  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<ExperimentMode>('retroactive');
  const [name, setName] = useState('');
  const [hypothesis, setHypothesis] = useState('');
  const [winningMetric, setWinningMetric] = useState<WinningMetric>('engagement_rate');
  const [durationDays, setDurationDays] = useState(7);
  const [minReach, setMinReach] = useState(500);
  const [variants, setVariants] = useState<VariantDraft[]>(DEFAULT_VARIANTS);

  const reset = () => {
    setStep(1);
    setMode('retroactive');
    setName('');
    setHypothesis('');
    setWinningMetric('engagement_rate');
    setDurationDays(7);
    setMinReach(500);
    setVariants(DEFAULT_VARIANTS);
  };

  const close = (v: boolean) => {
    onOpenChange(v);
    if (!v) setTimeout(reset, 200);
  };

  const updateVariant = (i: number, patch: Partial<VariantDraft>) =>
    setVariants((vs) => vs.map((v, idx) => (idx === i ? { ...v, ...patch } : v)));

  const addVariant = () =>
    setVariants((vs) =>
      vs.length >= 4
        ? vs
        : [
            ...vs,
            { label: `Variante ${String.fromCharCode(65 + vs.length)}`, note: '', postId: '' },
          ],
    );

  const removeVariant = (i: number) =>
    setVariants((vs) => (vs.length <= 2 ? vs : vs.filter((_, idx) => idx !== i)));

  const postsByMap = useMemo(() => {
    const map: Record<string, Post> = {};
    mockPosts.forEach((p) => (map[p.id] = p));
    return map;
  }, []);

  const usedPostIds = useMemo(
    () => new Set(variants.map((v) => v.postId).filter(Boolean)),
    [variants],
  );

  const canProceed1 = !!mode && mode !== 'publish';
  const canProceed2 = name.trim().length > 0 && durationDays > 0;

  const validateManualId = (id: string) => /^[A-Za-z0-9_\-]{5,}$/.test(id.trim());

  const variantIssues = useMemo(() => {
    return variants.map((v) => {
      if (!v.label.trim()) return 'Defina um nome para a variante.';
      if (mode === 'retroactive' && !v.postId) return 'Selecione um post para esta variante.';
      if (mode === 'manual') {
        if (!v.postId.trim()) return 'Associe um post (busque ou cole o ID).';
        const pickedExists = !!postsByMap[v.postId];
        if (!pickedExists && !validateManualId(v.postId))
          return 'ID inválido. Use o ID numérico/alfanumérico do post no Meta.';
      }
      return null;
    });
  }, [variants, mode, postsByMap]);

  const duplicateIds = useMemo(() => {
    const counts: Record<string, number> = {};
    variants.forEach((v) => {
      const k = v.postId.trim();
      if (k) counts[k] = (counts[k] ?? 0) + 1;
    });
    return new Set(Object.keys(counts).filter((k) => counts[k] > 1));
  }, [variants]);

  const canSubmit =
    variants.length >= 2 &&
    variantIssues.every((i) => i === null) &&
    duplicateIds.size === 0;

  const handleSubmit = async () => {
    if (!selectedCompanyId) return;
    try {
      const { supabase } = await import('@/integrations/supabase/client');
      const { data: comp, error } = await supabase
        .from('companies')
        .select('agency_id')
        .eq('id', selectedCompanyId)
        .single();
      if (error || !comp) throw error ?? new Error('Empresa não encontrada');

      const id = await createMut.mutateAsync({
        agency_id: comp.agency_id,
        company_id: selectedCompanyId,
        platform: selectedPlatform,
        name,
        hypothesis,
        mode,
        winning_metric: winningMetric,
        min_sample_reach: minReach,
        duration_days: durationDays,
        variants: variants.map((v) => {
          const post = v.postId ? postsByMap[v.postId] : undefined;
          return {
            label: v.label,
            note: v.note,
            post_id: v.postId || undefined,
            caption: post?.caption,
            post_type: post?.type,
            platform: post?.platform,
            metrics_snapshot: post ? postToSnapshot(post) : undefined,
          };
        }),
      });
      toast({ title: 'Teste criado', description: `"${name}" foi criado com sucesso.` });
      onCreated?.(id);
      close(false);
    } catch (e) {
      toast({
        title: 'Erro ao criar teste',
        description: e instanceof Error ? e.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Beaker className="h-5 w-5 text-primary" />
            Novo teste A/B de posts orgânicos
          </DialogTitle>
          <DialogDescription>
            Compare variações de conteúdo e descubra o que gera mais resultado.
          </DialogDescription>
        </DialogHeader>

        {/* Stepper */}
        <Stepper step={step} />

        <ScrollArea className="flex-1 pr-3 -mr-3">
          {step === 1 && <Step1 mode={mode} setMode={setMode} />}
          {step === 2 && (
            <Step2
              mode={mode}
              name={name}
              setName={setName}
              hypothesis={hypothesis}
              setHypothesis={setHypothesis}
              winningMetric={winningMetric}
              setWinningMetric={setWinningMetric}
              durationDays={durationDays}
              setDurationDays={setDurationDays}
              minReach={minReach}
              setMinReach={setMinReach}
            />
          )}
          {step === 3 && (
            <Step3
              mode={mode}
              variants={variants}
              updateVariant={updateVariant}
              addVariant={addVariant}
              removeVariant={removeVariant}
              usedPostIds={usedPostIds}
              winningMetric={winningMetric}
              variantIssues={variantIssues}
              duplicateIds={duplicateIds}
            />
          )}
        </ScrollArea>

        <DialogFooter className="flex sm:justify-between gap-2">
          <Button variant="ghost" onClick={() => (step > 1 ? setStep(step - 1) : close(false))}>
            {step > 1 ? 'Voltar' : 'Cancelar'}
          </Button>
          {step < 3 ? (
            <Button
              onClick={() => setStep(step + 1)}
              disabled={(step === 1 && !canProceed1) || (step === 2 && !canProceed2)}
            >
              Próximo
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!canSubmit || createMut.isPending}>
              {createMut.isPending ? 'Criando…' : 'Criar teste'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2 px-1">
      {STEP_TITLES.map((title, i) => {
        const n = i + 1;
        const active = n === step;
        const done = n < step;
        return (
          <div key={title} className="flex-1 flex items-center gap-2">
            <div
              className={cn(
                'h-7 w-7 shrink-0 rounded-full border flex items-center justify-center text-xs font-semibold transition-colors',
                done && 'bg-primary border-primary text-primary-foreground',
                active && 'border-primary text-primary bg-primary/10',
                !active && !done && 'border-border text-muted-foreground',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : n}
            </div>
            <span
              className={cn(
                'text-xs font-medium hidden sm:inline',
                active ? 'text-foreground' : 'text-muted-foreground',
              )}
            >
              {title}
            </span>
            {i < STEP_TITLES.length - 1 && (
              <div className={cn('h-px flex-1', done ? 'bg-primary' : 'bg-border')} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step1({ mode, setMode }: { mode: ExperimentMode; setMode: (m: ExperimentMode) => void }) {
  const cards: { mode: ExperimentMode; title: string; desc: string; tag?: string }[] = [
    {
      mode: 'retroactive',
      title: EXPERIMENT_MODE_LABELS.retroactive,
      desc: 'Compare 2 a 4 posts já publicados. Métricas são puxadas automaticamente. Ideal para entender o que já funcionou.',
      tag: 'Mais rápido',
    },
    {
      mode: 'manual',
      title: EXPERIMENT_MODE_LABELS.manual,
      desc: 'Defina hipótese e variantes agora. Depois cole o ID dos posts no Meta para o sistema acompanhar.',
      tag: 'Mais flexível',
    },
    {
      mode: 'publish',
      title: EXPERIMENT_MODE_LABELS.publish,
      desc: 'Publicar variações automaticamente via Graph API. Requer permissões adicionais no app Meta.',
      tag: 'Em breve',
    },
  ];
  return (
    <div className="space-y-3 py-2">
      {cards.map((c) => {
        const disabled = c.mode === 'publish';
        const selected = mode === c.mode;
        return (
          <button
            key={c.mode}
            disabled={disabled}
            onClick={() => setMode(c.mode)}
            className={cn(
              'w-full rounded-lg border p-4 text-left transition-all',
              selected && !disabled && 'border-primary bg-primary/5 ring-1 ring-primary/30',
              !selected && !disabled && 'border-border hover:bg-muted/50',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-foreground">{c.title}</span>
              {c.tag && <Badge variant={disabled ? 'outline' : 'secondary'}>{c.tag}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{c.desc}</p>
          </button>
        );
      })}
    </div>
  );
}

function Step2(props: {
  mode: ExperimentMode;
  name: string;
  setName: (v: string) => void;
  hypothesis: string;
  setHypothesis: (v: string) => void;
  winningMetric: WinningMetric;
  setWinningMetric: (m: WinningMetric) => void;
  durationDays: number;
  setDurationDays: (n: number) => void;
  minReach: number;
  setMinReach: (n: number) => void;
}) {
  const {
    name,
    setName,
    hypothesis,
    setHypothesis,
    winningMetric,
    setWinningMetric,
    durationDays,
    setDurationDays,
    minReach,
    setMinReach,
  } = props;

  return (
    <div className="space-y-5 py-2">
      <div>
        <Label htmlFor="exp-name">Nome do teste *</Label>
        <Input
          id="exp-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Reels vs carrossel — campanha de junho"
        />
      </div>

      <div>
        <div className="flex items-center justify-between mb-1">
          <Label htmlFor="exp-hyp">Hipótese</Label>
          <span className="text-[11px] text-muted-foreground">
            <Sparkles className="inline h-3 w-3 mr-0.5" /> Use um modelo
          </span>
        </div>
        <Textarea
          id="exp-hyp"
          value={hypothesis}
          onChange={(e) => setHypothesis(e.target.value)}
          placeholder="O que você espera descobrir com este teste?"
          rows={3}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {HYPOTHESIS_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setHypothesis(t)}
              className="text-[11px] rounded-md border border-border px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors text-left"
            >
              {t.length > 60 ? t.slice(0, 58) + '…' : t}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label className="mb-2 block">Métrica de vitória</Label>
        <div className="grid gap-2 sm:grid-cols-2">
          {(Object.keys(WINNING_METRIC_LABELS) as WinningMetric[]).map((m) => {
            const selected = winningMetric === m;
            const meta = METRIC_DESCRIPTIONS[m];
            return (
              <button
                key={m}
                type="button"
                onClick={() => setWinningMetric(m)}
                className={cn(
                  'rounded-md border p-2 text-left transition-colors',
                  selected
                    ? 'border-primary bg-primary/5 ring-1 ring-primary/30'
                    : 'border-border hover:bg-muted/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-foreground">
                    {WINNING_METRIC_LABELS[m]}
                  </span>
                  {selected && <Check className="h-3.5 w-3.5 text-primary" />}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{meta.hint}</div>
                <div className="text-[10px] text-muted-foreground/70 mt-0.5">{meta.bestFor}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="exp-duration">Duração (dias)</Label>
          <Input
            id="exp-duration"
            type="number"
            min={1}
            max={90}
            value={durationDays}
            onChange={(e) => setDurationDays(Number(e.target.value))}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Janela para coletar dados. Recomendado: 7–14 dias.
          </p>
        </div>
        <div>
          <Label htmlFor="exp-reach">Alcance mín. por variante</Label>
          <Input
            id="exp-reach"
            type="number"
            min={0}
            value={minReach}
            onChange={(e) => setMinReach(Number(e.target.value))}
          />
          <p className="text-[11px] text-muted-foreground mt-1">
            Vencedor só é declarado se todas variantes superarem este alcance.
          </p>
        </div>
      </div>
    </div>
  );
}

function Step3(props: {
  mode: ExperimentMode;
  variants: VariantDraft[];
  updateVariant: (i: number, patch: Partial<VariantDraft>) => void;
  addVariant: () => void;
  removeVariant: (i: number) => void;
  usedPostIds: Set<string>;
  winningMetric: WinningMetric;
  variantIssues: (string | null)[];
  duplicateIds: Set<string>;
}) {
  const {
    mode,
    variants,
    updateVariant,
    addVariant,
    removeVariant,
    usedPostIds,
    winningMetric,
    variantIssues,
    duplicateIds,
  } = props;

  const allOk = variantIssues.every((i) => i === null) && duplicateIds.size === 0;

  return (
    <div className="space-y-3 py-2">
      <p className="text-xs text-muted-foreground">
        {mode === 'retroactive'
          ? 'Selecione 2 a 4 posts já publicados para comparar.'
          : 'Associe um post a cada variante. Você pode buscar nos posts já capturados ou colar o ID do Meta — validamos antes de salvar.'}
      </p>

      {variants.map((v, i) => {
        const issue = variantIssues[i];
        const isDup = !!v.postId.trim() && duplicateIds.has(v.postId.trim());
        return (
          <div
            key={i}
            className={cn(
              'rounded-lg border p-3 space-y-2',
              issue || isDup ? 'border-destructive/50' : 'border-border',
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <Input
                value={v.label}
                onChange={(e) => updateVariant(i, { label: e.target.value })}
                placeholder={`Variante ${String.fromCharCode(65 + i)}`}
                className="flex-1 font-medium"
              />
              {variants.length > 2 && (
                <Button size="icon" variant="ghost" onClick={() => removeVariant(i)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Textarea
              value={v.note}
              onChange={(e) => updateVariant(i, { note: e.target.value })}
              placeholder="Anotação (ex.: 'Reels com depoimento, 30s, sem música')"
              rows={2}
            />

            {(mode === 'retroactive' || mode === 'manual') && (
              <PostPicker
                selectedPostId={v.postId}
                onSelect={(id) => updateVariant(i, { postId: id })}
                disabledIds={usedPostIds}
                winningMetric={winningMetric}
                allowManualId={mode === 'manual'}
              />
            )}

            {(issue || isDup) && (
              <p className="text-[11px] text-destructive flex items-center gap-1">
                {isDup ? 'Este post já foi associado a outra variante.' : issue}
              </p>
            )}
          </div>
        );
      })}

      {variants.length < 4 && (
        <Button variant="outline" size="sm" onClick={addVariant}>
          <Plus className="h-4 w-4 mr-1" /> Adicionar variante ({variants.length}/4)
        </Button>
      )}

      {!allOk && (
        <p className="text-[11px] text-muted-foreground">
          Resolva os avisos acima para habilitar o botão de criar teste.
        </p>
      )}
    </div>
  );
}

function PostPicker({
  selectedPostId,
  onSelect,
  disabledIds,
  winningMetric,
  allowManualId = false,
}: {
  selectedPostId: string;
  onSelect: (id: string) => void;
  disabledIds: Set<string>;
  winningMetric: WinningMetric;
  allowManualId?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [platformFilter, setPlatformFilter] = useState<'all' | 'Instagram' | 'Facebook'>('all');

  const selected = mockPosts.find((p) => p.id === selectedPostId);

  const filtered = useMemo(
    () =>
      mockPosts.filter((p) => {
        if (platformFilter !== 'all' && p.platform !== platformFilter) return false;
        if (search && !p.caption.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
      }),
    [search, platformFilter],
  );

  if (selected) {
    return (
      <div className="rounded-md border border-primary/40 bg-primary/5 p-2 flex items-center gap-3">
        <PostThumb post={selected} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            {selected.platform === 'Instagram' ? (
              <Instagram className="h-3 w-3" />
            ) : (
              <Facebook className="h-3 w-3" />
            )}
            <span>{selected.type}</span>
            <span>·</span>
            <span>{new Date(selected.publishedAt).toLocaleDateString('pt-BR')}</span>
            <Badge variant="secondary" className="ml-1 text-[9px] py-0 gap-0.5">
              <Check className="h-2.5 w-2.5" /> validado
            </Badge>
          </div>
          <p className="text-xs text-foreground line-clamp-2 mt-0.5">{selected.caption}</p>
          <PostMetricsRow post={selected} highlight={winningMetric} />
        </div>
        <Button size="sm" variant="ghost" onClick={() => onSelect('')}>
          Trocar
        </Button>
      </div>
    );
  }

  // Manual ID entered but not in fetched posts
  if (allowManualId && selectedPostId) {
    const validFormat = /^[A-Za-z0-9_\-]{5,}$/.test(selectedPostId.trim());
    return (
      <div
        className={cn(
          'rounded-md border p-2 flex items-center gap-3',
          validFormat ? 'border-primary/40 bg-primary/5' : 'border-destructive/50 bg-destructive/5',
        )}
      >
        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
          <ImageIcon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-muted-foreground">Post ID manual</div>
          <p className="text-xs font-mono text-foreground truncate">{selectedPostId}</p>
          <p className="text-[11px] mt-0.5">
            {validFormat ? (
              <span className="text-primary inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> Formato válido — métricas serão coletadas após salvar.
              </span>
            ) : (
              <span className="text-destructive">
                Formato inválido. Use o ID do post no Meta (ex.: 17841405822304914_3215...).
              </span>
            )}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => onSelect('')}>
          Trocar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label className="text-xs text-muted-foreground">Selecione um post</Label>
      <div className="flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por legenda…"
          className="h-8 text-xs"
        />
        <div className="flex gap-1">
          {(['all', 'Instagram', 'Facebook'] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPlatformFilter(p)}
              className={cn(
                'h-8 px-2 rounded-md border text-[11px] font-medium transition-colors',
                platformFilter === p
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-card text-foreground hover:bg-muted',
              )}
            >
              {p === 'all' ? 'Todas' : p === 'Instagram' ? 'IG' : 'FB'}
            </button>
          ))}
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto rounded-md border border-border divide-y divide-border">
        {filtered.length === 0 && (
          <p className="text-xs text-muted-foreground p-3">Nenhum post encontrado.</p>
        )}
        {filtered.map((p) => {
          const used = disabledIds.has(p.id);
          return (
            <button
              key={p.id}
              type="button"
              disabled={used}
              onClick={() => onSelect(p.id)}
              className={cn(
                'w-full flex items-center gap-3 p-2 text-left transition-colors',
                used ? 'opacity-40 cursor-not-allowed' : 'hover:bg-muted/50',
              )}
            >
              <PostThumb post={p} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  {p.platform === 'Instagram' ? (
                    <Instagram className="h-3 w-3" />
                  ) : (
                    <Facebook className="h-3 w-3" />
                  )}
                  <span>{p.type}</span>
                  <span>·</span>
                  <span>{new Date(p.publishedAt).toLocaleDateString('pt-BR')}</span>
                  {used && <Badge variant="outline" className="ml-1 text-[9px] py-0">já usado</Badge>}
                </div>
                <p className="text-xs text-foreground line-clamp-1 mt-0.5">{p.caption}</p>
                <PostMetricsRow post={p} highlight={winningMetric} />
              </div>
            </button>
          );
        })}
      </div>
      {allowManualId && (
        <div className="rounded-md border border-dashed border-border p-2">
          <Label className="text-[11px] text-muted-foreground">
            Não encontrou? Cole o ID do post no Meta
          </Label>
          <Input
            placeholder="Ex.: 17841405822304914_3215..."
            className="h-8 text-xs font-mono mt-1"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const v = (e.target as HTMLInputElement).value.trim();
                if (v) onSelect(v);
              }
            }}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) onSelect(v);
            }}
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Pressione Enter ou saia do campo para validar o formato.
          </p>
        </div>
      )}
    </div>
  );
}

function PostThumb({ post }: { post: Post }) {
  if (post.thumbnailUrl) {
    return (
      <img
        src={post.thumbnailUrl}
        alt=""
        className="h-12 w-12 rounded object-cover bg-muted shrink-0"
      />
    );
  }
  return (
    <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0">
      <ImageIcon className="h-5 w-5 text-muted-foreground" />
    </div>
  );
}

function PostMetricsRow({ post, highlight }: { post: Post; highlight: WinningMetric }) {
  const fmt = (n: number) => n.toLocaleString('pt-BR');
  const items = [
    { key: 'reach' as const, icon: Eye, value: fmt(post.reach), label: 'alcance' },
    { key: 'engagement_rate' as const, icon: TrendingUp, value: `${post.engagementRate.toFixed(1)}%`, label: 'eng.' },
    { key: 'likes' as const, icon: Heart, value: fmt(post.likes), label: 'curtidas' },
  ];
  return (
    <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
      {items.map((it) => {
        const Icon = it.icon;
        const isHi = it.key === highlight;
        return (
          <span
            key={it.key}
            className={cn('inline-flex items-center gap-1', isHi && 'text-primary font-semibold')}
          >
            <Icon className="h-3 w-3" /> {it.value}
          </span>
        );
      })}
    </div>
  );
}
