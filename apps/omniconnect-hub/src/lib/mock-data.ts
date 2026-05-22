import type { ModuleId } from "./permissions";

export type ModuleStatus = "Ativo" | "Beta" | "Em breve";

export type ModuleMeta = {
  id: ModuleId;
  name: string;
  description: string;
  status: ModuleStatus;
  path: string;
  accent: string;
};

export const MODULES: ModuleMeta[] = [
  {
    id: "leads",
    name: "Leads 360°",
    description: "Visão unificada do lead com histórico cross-channel.",
    status: "Ativo",
    path: "/leads",
    accent: "oklch(0.55 0.18 255)",
  },
  {
    id: "journeys",
    name: "Régua de Acionamento",
    description: "Construa jornadas automatizadas com blocos arrastáveis.",
    status: "Beta",
    path: "/journeys",
    accent: "oklch(0.6 0.2 310)",
  },
  {
    id: "crm",
    name: "CRM Imobiliário",
    description: "Pipeline de leads, propostas e contratos.",
    status: "Ativo",
    path: "/crm",
    accent: "oklch(0.55 0.18 230)",
  },
  {
    id: "omnihub",
    name: "OmniHub Conversas",
    description: "Caixa de entrada unificada com WhatsApp, Instagram e e-mail.",
    status: "Ativo",
    path: "/omnihub",
    accent: "oklch(0.65 0.15 170)",
  },
  {
    id: "ads",
    name: "Ads Manager · AdpilotAI",
    description: "Campanhas de mídia paga otimizadas por IA.",
    status: "Beta",
    path: "/ads",
    accent: "oklch(0.7 0.16 75)",
  },
  {
    id: "botify",
    name: "Botify",
    description: "Automações e fluxos de atendimento por bot.",
    status: "Beta",
    path: "/botify",
    accent: "oklch(0.6 0.2 290)",
  },
  {
    id: "insightai",
    name: "InsightAI",
    description: "Análise de conversas, objeções e oportunidades.",
    status: "Ativo",
    path: "/insightai",
    accent: "oklch(0.6 0.18 200)",
  },
  {
    id: "executive",
    name: "Painel Executivo",
    description: "Visão consolidada de VGV, ROI e performance.",
    status: "Ativo",
    path: "/executive",
    accent: "oklch(0.5 0.15 145)",
  },
];

export const INSIGHT_KPIS = [
  { label: "Conversas analisadas", value: "12.482", delta: "+8,4%" },
  { label: "Sentimento médio", value: "+0,42", delta: "+0,08" },
  { label: "Conversas com objeção", value: "38%", delta: "-2,1pp" },
  { label: "Motivo top de perda", value: "Preço alto", delta: "31%" },
  { label: "Palavra mais citada", value: "“parcelamento”", delta: "1.284" },
  { label: "Leads com urgência", value: "612", delta: "+12,4%" },
  { label: "Risco / Compliance", value: "27 alertas", delta: "+4" },
  { label: "Recomendações pendentes", value: "23", delta: "—" },
];

export const TOP_OBJECTIONS = [
  { label: "Preço acima do esperado", count: 312 },
  { label: "Prazo de entrega", count: 198 },
  { label: "Condições de pagamento", count: 174 },
  { label: "Localização", count: 121 },
  { label: "Já tem outra opção", count: 98 },
];

export const RANKING = [
  { name: "Marina Costa", score: 9.4, deals: 12 },
  { name: "Rafael Lima", score: 9.1, deals: 10 },
  { name: "Bianca Souza", score: 8.7, deals: 9 },
  { name: "Eduardo Pires", score: 8.3, deals: 7 },
  { name: "Helena Tavares", score: 7.9, deals: 6 },
];

// ============ Text Analytics (VoC) ============

export type SentimentKey = "positivo" | "neutro" | "negativo" | "frustrado";

export const VOC_SENTIMENT: { key: SentimentKey; label: string; pct: number; color: string }[] = [
  { key: "positivo", label: "Positivo", pct: 42, color: "bg-emerald-500" },
  { key: "neutro", label: "Neutro", pct: 31, color: "bg-slate-400" },
  { key: "negativo", label: "Negativo", pct: 18, color: "bg-orange-500" },
  { key: "frustrado", label: "Frustrado", pct: 9, color: "bg-red-500" },
];

export const VOC_TREND: number[] = [
  0.18, 0.22, 0.2, 0.25, 0.3, 0.27, 0.31, 0.28, 0.33, 0.35, 0.3, 0.36,
  0.4, 0.38, 0.42, 0.39, 0.44, 0.41, 0.46, 0.43, 0.48, 0.45, 0.5, 0.47,
  0.49, 0.44, 0.47, 0.42, 0.45, 0.42,
];

export const VOC_EMOTIONS = [
  { label: "Interesse", pct: 34, color: "bg-emerald-500" },
  { label: "Dúvida", pct: 22, color: "bg-sky-500" },
  { label: "Urgência", pct: 17, color: "bg-amber-500" },
  { label: "Satisfação", pct: 14, color: "bg-teal-500" },
  { label: "Irritação", pct: 9, color: "bg-orange-500" },
  { label: "Decepção", pct: 4, color: "bg-red-500" },
];

export const VOC_QUOTES: { text: string; sentiment: SentimentKey; lead: string; channel: string }[] = [
  { text: "Estou muito decepcionado com o prazo, já era pra ter entregue há 2 meses.", sentiment: "frustrado", lead: "Carlos Menezes", channel: "WhatsApp" },
  { text: "Adorei o apartamento! Quando posso assinar?", sentiment: "positivo", lead: "Patrícia Lopes", channel: "WhatsApp" },
  { text: "O valor ficou bem acima do que eu esperava, vou pensar.", sentiment: "negativo", lead: "André Faria", channel: "Email" },
  { text: "Vocês têm alguma simulação de financiamento pra eu ver?", sentiment: "neutro", lead: "Juliana Reis", channel: "WhatsApp" },
];

// ============ Motivos de Recusa / Perda ============

export type LossReason = {
  label: string;
  count: number;
  pct: number;
  delta: string;
  stage: string;
  snippet: string;
};

export const LOSS_REASONS: LossReason[] = [
  { label: "Preço acima do orçamento", count: 187, pct: 31, delta: "+4pp", stage: "Proposta", snippet: "Tá caro demais pra mim agora." },
  { label: "Prazo de entrega longo", count: 112, pct: 19, delta: "-1pp", stage: "Em atendimento", snippet: "Só em 2027? Não consigo esperar." },
  { label: "Fechou com concorrente", count: 96, pct: 16, delta: "+2pp", stage: "Proposta", snippet: "Já fechei com a construtora X." },
  { label: "Localização ruim", count: 71, pct: 12, delta: "—", stage: "Qualificado", snippet: "Muito longe do meu trabalho." },
  { label: "Andar/unidade indisponível", count: 54, pct: 9, delta: "+1pp", stage: "Proposta", snippet: "Eu queria do 10º pra cima." },
  { label: "Condição de pagamento", count: 42, pct: 7, delta: "-2pp", stage: "Proposta", snippet: "A entrada ficou inviável." },
  { label: "Sem retorno do cliente", count: 24, pct: 4, delta: "-3pp", stage: "Em atendimento", snippet: "(sem resposta após 5 tentativas)" },
  { label: "Fora do público-alvo", count: 12, pct: 2, delta: "—", stage: "Novo", snippet: "Era só curiosidade." },
];

// ============ Traços de Perfil ============

export type TraitGroup = {
  dimension: string;
  description: string;
  items: { label: string; pct: number }[];
};

export const CUSTOMER_TRAITS: TraitGroup[] = [
  {
    dimension: "Estilo de decisão",
    description: "Como o lead toma decisão de compra com base na linguagem usada.",
    items: [
      { label: "Analítico", pct: 38 },
      { label: "Emocional", pct: 27 },
      { label: "Pragmático", pct: 21 },
      { label: "Indeciso", pct: 14 },
    ],
  },
  {
    dimension: "Urgência",
    description: "Janela de decisão detectada.",
    items: [
      { label: "Imediata (≤7d)", pct: 24 },
      { label: "Curto prazo (≤30d)", pct: 41 },
      { label: "Pesquisando", pct: 35 },
    ],
  },
  {
    dimension: "Sensibilidade a preço",
    description: "Quanto o lead reage a valores e descontos.",
    items: [
      { label: "Alta", pct: 46 },
      { label: "Média", pct: 34 },
      { label: "Baixa", pct: 20 },
    ],
  },
  {
    dimension: "Maturidade de compra",
    description: "Em que momento da jornada o lead está.",
    items: [
      { label: "Explorando", pct: 39 },
      { label: "Comparando", pct: 37 },
      { label: "Pronto para fechar", pct: 24 },
    ],
  },
];

// ============ Keyword Spotting ============

export type KeywordSentiment = "pos" | "neu" | "neg";

export type KeywordTerm = {
  term: string;
  count: number;
  sentiment: KeywordSentiment;
  example: string;
};

export type KeywordCategory = {
  id: string;
  label: string;
  description: string;
  terms: KeywordTerm[];
};

export const KEYWORD_CATEGORIES: KeywordCategory[] = [
  {
    id: "money",
    label: "Dinheiro & preço",
    description: "Termos que indicam sensibilidade a preço, condição ou negociação.",
    terms: [
      { term: "caro", count: 842, sentiment: "neg", example: "Tá muito caro pra mim." },
      { term: "barato", count: 134, sentiment: "pos", example: "Achei o preço bem barato comparando." },
      { term: "desconto", count: 612, sentiment: "neu", example: "Consegue mais algum desconto?" },
      { term: "parcelamento", count: 1284, sentiment: "neu", example: "Em quantas vezes posso parcelar a entrada?" },
      { term: "entrada", count: 928, sentiment: "neu", example: "A entrada é parcelada?" },
      { term: "à vista", count: 217, sentiment: "pos", example: "Se for à vista tem desconto?" },
      { term: "financiamento", count: 1041, sentiment: "neu", example: "Posso fazer financiamento bancário?" },
    ],
  },
  {
    id: "time",
    label: "Tempo & urgência",
    description: "Sinais de janela de decisão e atrasos percebidos.",
    terms: [
      { term: "urgente", count: 412, sentiment: "neg", example: "Preciso resolver isso urgente." },
      { term: "amanhã", count: 287, sentiment: "neu", example: "Posso visitar amanhã?" },
      { term: "prazo", count: 524, sentiment: "neg", example: "Esse prazo tá muito longo." },
      { term: "atraso", count: 198, sentiment: "neg", example: "A obra tá em atraso de novo?" },
      { term: "demorou", count: 156, sentiment: "neg", example: "Vocês demoraram demais pra responder." },
    ],
  },
  {
    id: "competitor",
    label: "Concorrência",
    description: "Menções a marcas concorrentes.",
    terms: [
      { term: "Construtora X", count: 87, sentiment: "neg", example: "A Construtora X me ofereceu mais barato." },
      { term: "Cyrela", count: 64, sentiment: "neu", example: "Visitei um da Cyrela perto." },
      { term: "MRV", count: 41, sentiment: "neu", example: "O MRV tem entrada menor." },
      { term: "Tenda", count: 22, sentiment: "neu", example: "Vi um lançamento da Tenda também." },
    ],
  },
  {
    id: "risk",
    label: "Risco & compliance",
    description: "Termos que disparam alertas operacionais/jurídicos.",
    terms: [
      { term: "cancelar", count: 142, sentiment: "neg", example: "Quero cancelar minha proposta." },
      { term: "reclamar", count: 58, sentiment: "neg", example: "Vou reclamar disso." },
      { term: "Procon", count: 14, sentiment: "neg", example: "Vou abrir reclamação no Procon." },
      { term: "advogado", count: 9, sentiment: "neg", example: "Vou passar pro meu advogado." },
      { term: "processo", count: 6, sentiment: "neg", example: "Vamos pra processo se for o caso." },
    ],
  },
  {
    id: "opportunity",
    label: "Oportunidade",
    description: "Sinais fortes de intenção de fechamento.",
    terms: [
      { term: "fechar", count: 318, sentiment: "pos", example: "Quero fechar essa semana." },
      { term: "assinar", count: 174, sentiment: "pos", example: "Quando posso assinar o contrato?" },
      { term: "visita", count: 487, sentiment: "pos", example: "Consigo marcar uma visita?" },
      { term: "quando posso", count: 261, sentiment: "pos", example: "Quando posso ver o decorado?" },
    ],
  },
];

// ============ Tópicos emergentes ============

export const TRENDING_TOPICS = [
  { label: "Reajuste de INCC", delta: 84, dir: "up" as const, mentions: 142 },
  { label: "Atraso obra Vega Towers", delta: 52, dir: "up" as const, mentions: 98 },
  { label: "Campanha Black Imobi", delta: 41, dir: "up" as const, mentions: 76 },
  { label: "Taxa de juros Caixa", delta: 23, dir: "up" as const, mentions: 64 },
  { label: "Reforma do hall", delta: -18, dir: "down" as const, mentions: 28 },
];

// ============ Recomendações enriquecidas ============

export type RecommendationSeverity = "Alta" | "Média" | "Baixa";
export type RecommendationCategory = "Script" | "Treinamento" | "Operacional" | "Produto";

export type Recommendation = {
  title: string;
  severity: RecommendationSeverity;
  category: RecommendationCategory;
  rationale: string;
};

export const RECOMMENDATIONS: Recommendation[] = [
  { title: "Reabordar 14 leads frios da campanha 'Vega Towers'", severity: "Alta", category: "Operacional", rationale: "Leads com sentimento positivo na última interação e sem follow-up há 7+ dias." },
  { title: "Revisar script de contorno de objeção sobre prazo", severity: "Alta", category: "Script", rationale: "“Prazo” aparece em 19% das perdas — 2x acima da média de mercado." },
  { title: "Treinar equipe noturna em objeções de preço", severity: "Média", category: "Treinamento", rationale: "Conversas após 19h têm sentimento 28% pior quando o termo 'caro' aparece." },
  { title: "Investigar pico de menções a 'cancelar' na carteira Vega", severity: "Alta", category: "Operacional", rationale: "+42% em 7 dias, concentrado em leads da fase Proposta." },
  { title: "Pausar criativo com CTR abaixo de 0,7% no Meta Ads", severity: "Baixa", category: "Produto", rationale: "Leads gerados por esse criativo têm sensibilidade a preço alta e baixa maturidade." },
];

export const EXECUTIVE_KPIS = [
  { label: "VGV disponível", value: "R$ 482,1 Mi", delta: "+2,1%" },
  { label: "VGV vendido", value: "R$ 96,4 Mi", delta: "+12,8%" },
  { label: "Leads gerados", value: "8.420", delta: "+5,6%" },
  { label: "Leads qualificados", value: "2.108", delta: "+9,2%" },
  { label: "Taxa de conversão", value: "4,1%", delta: "+0,3pp" },
  { label: "Custo por lead", value: "R$ 18,40", delta: "-6,1%" },
  { label: "Custo por oportunidade", value: "R$ 74,20", delta: "-3,8%" },
  { label: "Oportunidades perdidas", value: "187", delta: "-3,1%" },
  { label: "ROI estimado", value: "5,8x", delta: "+0,4x" },
  { label: "Score médio atendimento", value: "8,2", delta: "+0,3" },
  { label: "Custo variável de IA", value: "R$ 6.214", delta: "+11,0%" },
  { label: "Margem operacional", value: "32,4%", delta: "+1,1pp" },
];

export const VGV_TREND = [
  { month: "Jan", vendido: 6.2, meta: 7 },
  { month: "Fev", vendido: 7.4, meta: 7.5 },
  { month: "Mar", vendido: 8.1, meta: 8 },
  { month: "Abr", vendido: 7.9, meta: 8.5 },
  { month: "Mai", vendido: 9.2, meta: 9 },
  { month: "Jun", vendido: 10.4, meta: 9.5 },
  { month: "Jul", vendido: 11.1, meta: 10 },
  { month: "Ago", vendido: 12.6, meta: 10.5 },
  { month: "Set", vendido: 11.8, meta: 11 },
  { month: "Out", vendido: 13.2, meta: 11.5 },
];

export const NOTIFICATIONS = [
  { title: "Nova proposta aprovada", time: "há 4 min", type: "success" },
  { title: "Lead quente sem retorno há 2h", time: "há 1 h", type: "warning" },
  { title: "Campanha 'Vega Towers' pausada", time: "há 3 h", type: "info" },
  { title: "Relatório semanal disponível", time: "ontem", type: "info" },
];
