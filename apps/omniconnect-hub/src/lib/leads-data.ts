export type LeadStage =
  | "Novo"
  | "Qualificado"
  | "Em atendimento"
  | "Proposta"
  | "Fechado"
  | "Perdido";

export type LeadChannel =
  | "whatsapp"
  | "email"
  | "instagram"
  | "facebook"
  | "site"
  | "telefone"
  | "rcs"
  | "sms";

export type LeadInteractionType =
  | "form"
  | "whatsapp"
  | "email"
  | "call"
  | "sms"
  | "rcs"
  | "visit"
  | "note"
  | "ad"
  | "journey";

export type LeadInteraction = {
  id: string;
  type: LeadInteractionType;
  title: string;
  preview?: string;
  at: string;
  by?: string;
  channel?: LeadChannel;
};

export type ChannelTier =
  | "Altíssima"
  | "Alta"
  | "Média"
  | "Baixa"
  | "Não recomendado";

export type ChannelScoreKey = "whatsapp" | "email" | "sms" | "rcs";

export type ChannelScores = Record<ChannelScoreKey, ChannelTier>;

export const CHANNEL_TIER_RANK: Record<ChannelTier, number> = {
  "Altíssima": 4,
  "Alta": 3,
  "Média": 2,
  "Baixa": 1,
  "Não recomendado": 0,
};

export const CHANNEL_TIER_COLOR: Record<ChannelTier, string> = {
  "Altíssima": "bg-emerald-500",
  "Alta": "bg-teal-500",
  "Média": "bg-amber-500",
  "Baixa": "bg-orange-500",
  "Não recomendado": "bg-slate-400",
};

export type Lead = {
  id: string;
  name: string;
  email: string;
  phone: string;
  city: string;
  source: string;
  campaign?: string;
  interest: string;
  budget: string;
  stage: LeadStage;
  score: number;
  temperature: "Quente" | "Morno" | "Frio";
  owner: string;
  createdAt: string;
  lastTouch: string;
  channels: LeadChannel[];
  tags: string[];
  activeJourney?: { name: string; step: string; nextAt: string };
  attribution: { firstTouch: string; lastTouch: string; cost: string };
  consents: { whatsapp: boolean; email: boolean; sms: boolean };
  channelScores: ChannelScores;
  accumulatedCost: string;
  timeline: LeadInteraction[];
};

export const LEADS: Lead[] = [
  {
    id: "lead-001",
    name: "Camila Rezende",
    email: "camila.rezende@email.com",
    phone: "+55 11 98821-4422",
    city: "São Paulo, SP",
    source: "Meta Ads",
    campaign: "Vega Towers — Lançamento",
    interest: "Apartamento 3 dorm. — Vega Towers",
    budget: "R$ 850k – R$ 1,1Mi",
    stage: "Em atendimento",
    score: 87,
    temperature: "Quente",
    owner: "Marina Costa",
    createdAt: "12/05/2026",
    lastTouch: "há 38 min",
    channels: ["whatsapp", "email", "instagram"],
    tags: ["VIP", "Investidor", "Pronto p/ visita"],
    activeJourney: {
      name: "Reengajamento Formulário 7d",
      step: "Aguardando resposta WhatsApp",
      nextAt: "amanhã 09:00",
    },
    attribution: {
      firstTouch: "Instagram Ad · Vega Towers",
      lastTouch: "WhatsApp inbound",
      cost: "R$ 38,20",
    },
    consents: { whatsapp: true, email: true, sms: false },
    channelScores: { whatsapp: "Altíssima", email: "Alta", sms: "Baixa", rcs: "Média" },
    accumulatedCost: "R$ 38,20",
    timeline: [
      {
        id: "i1",
        type: "whatsapp",
        title: "Mensagem recebida via WhatsApp",
        preview: "Bom dia! Ainda há unidades disponíveis no 12º andar?",
        at: "Hoje, 09:12",
        channel: "whatsapp",
      },
      {
        id: "i2",
        type: "journey",
        title: "Jornada: e-mail 'Reabordagem 3d' enviado",
        at: "Ontem, 08:00",
        channel: "email",
      },
      {
        id: "i3",
        type: "email",
        title: "E-mail aberto — Vega Towers Catálogo",
        at: "Ontem, 08:14",
        channel: "email",
      },
      {
        id: "i4",
        type: "call",
        title: "Ligação realizada por Marina Costa (2m 41s)",
        at: "2 dias atrás",
      },
      {
        id: "i5",
        type: "form",
        title: "Preencheu formulário — landing Vega Towers",
        preview: "Origem: Meta Ads · UTM: vega_towers_launch",
        at: "12/05/2026",
        channel: "site",
      },
      {
        id: "i6",
        type: "ad",
        title: "Clicou no anúncio — Instagram Stories",
        at: "12/05/2026",
      },
    ],
  },
  {
    id: "lead-002",
    name: "Rodrigo Almeida",
    email: "rodrigo.almeida@email.com",
    phone: "+55 21 99443-1109",
    city: "Rio de Janeiro, RJ",
    source: "Google Ads",
    campaign: "Aurora Beach — Search",
    interest: "Cobertura — Aurora Beach",
    budget: "R$ 2,4Mi – R$ 3,2Mi",
    stage: "Proposta",
    score: 92,
    temperature: "Quente",
    owner: "Rafael Lima",
    createdAt: "02/05/2026",
    lastTouch: "há 2 h",
    channels: ["whatsapp", "email", "telefone"],
    tags: ["Alto ticket", "Decisor"],
    attribution: {
      firstTouch: "Google Search · 'cobertura barra'",
      lastTouch: "E-mail outbound",
      cost: "R$ 112,80",
    },
    consents: { whatsapp: true, email: true, sms: true },
    channelScores: { whatsapp: "Alta", email: "Altíssima", sms: "Média", rcs: "Baixa" },
    accumulatedCost: "R$ 112,80",
    timeline: [
      {
        id: "i1",
        type: "email",
        title: "Proposta comercial enviada",
        at: "Hoje, 11:40",
        channel: "email",
      },
      {
        id: "i2",
        type: "visit",
        title: "Visita presencial confirmada",
        at: "Ontem, 16:00",
      },
      {
        id: "i3",
        type: "whatsapp",
        title: "WhatsApp — Rafael Lima",
        preview: "Confirmando visita amanhã 16h. Posso te buscar no hotel?",
        at: "2 dias atrás",
        channel: "whatsapp",
      },
    ],
  },
  {
    id: "lead-003",
    name: "Beatriz Nogueira",
    email: "bia.nog@email.com",
    phone: "+55 11 97122-3380",
    city: "Campinas, SP",
    source: "Site orgânico",
    interest: "Studio — Aurora Park",
    budget: "R$ 320k – R$ 420k",
    stage: "Qualificado",
    score: 61,
    temperature: "Morno",
    owner: "Bianca Souza",
    createdAt: "08/05/2026",
    lastTouch: "há 1 dia",
    channels: ["whatsapp", "email"],
    tags: ["Primeira compra"],
    activeJourney: {
      name: "Nutrição Studio 14d",
      step: "E-mail #2 agendado",
      nextAt: "em 3 dias",
    },
    attribution: {
      firstTouch: "SEO · 'studio para investir campinas'",
      lastTouch: "Formulário site",
      cost: "R$ 0,00",
    },
    consents: { whatsapp: true, email: true, sms: false },
    channelScores: { whatsapp: "Média", email: "Alta", sms: "Não recomendado", rcs: "Baixa" },
    accumulatedCost: "R$ 0,00",
    timeline: [
      {
        id: "i1",
        type: "journey",
        title: "Jornada iniciada: Nutrição Studio 14d",
        at: "Ontem",
      },
      {
        id: "i2",
        type: "form",
        title: "Preencheu formulário — Aurora Park",
        at: "08/05/2026",
      },
    ],
  },
  {
    id: "lead-004",
    name: "Felipe Tanaka",
    email: "f.tanaka@email.com",
    phone: "+55 11 99012-7765",
    city: "São Paulo, SP",
    source: "Indicação",
    interest: "Sala comercial — Vega Office",
    budget: "R$ 1,2Mi",
    stage: "Novo",
    score: 34,
    temperature: "Frio",
    owner: "—",
    createdAt: "Hoje",
    lastTouch: "há 12 min",
    channels: ["email"],
    tags: ["B2B"],
    attribution: {
      firstTouch: "Indicação cliente #842",
      lastTouch: "Formulário site",
      cost: "R$ 0,00",
    },
    consents: { whatsapp: false, email: true, sms: false },
    channelScores: { whatsapp: "Não recomendado", email: "Média", sms: "Baixa", rcs: "Baixa" },
    accumulatedCost: "R$ 0,00",
    timeline: [
      { id: "i1", type: "form", title: "Preencheu formulário — Vega Office", at: "Hoje, 14:02" },
    ],
  },
];

export const LEAD_LIST_KPIS = [
  { label: "Leads ativos", value: "1.284", delta: "+6,2%" },
  { label: "Leads quentes", value: "186", delta: "+12,1%" },
  { label: "Sem retorno > 24h", value: "47", delta: "+3" },
  { label: "Score médio", value: "68", delta: "+1,8" },
];

// Journey Builder ---------------------------------------------------------

export type JourneyNodeType =
  | "trigger"
  | "delay"
  | "condition"
  | "pacing"
  | "email"
  | "sms"
  | "rcs"
  | "hsm"
  | "bot"
  | "stage"
  | "notify";

export type JourneyNodeData = {
  id: string;
  type: JourneyNodeType;
  title: string;
  description?: string;
  position: { x: number; y: number };
};

export type JourneyCampaign = {
  id: string;
  name: string;
  trigger: string;
  status: "Ativa" | "Pausada" | "Rascunho";
  audience: number;
  inJourney: number;
  conversion: string;
  updatedAt: string;
  sent: number;
  totalCost: string;
  avgCost: string;
};

export const JOURNEYS: JourneyCampaign[] = [
  {
    id: "j1",
    name: "Reengajamento Formulário 7d",
    trigger: "Lead preencheu formulário e não respondeu em 24h",
    status: "Ativa",
    audience: 1284,
    inJourney: 218,
    conversion: "11,4%",
    updatedAt: "há 2 h",
    sent: 4820,
    totalCost: "R$ 1.842,60",
    avgCost: "R$ 0,38",
  },
  {
    id: "j2",
    name: "Nutrição Studio 14d",
    trigger: "Lead entrou no CRM com interesse 'Studio'",
    status: "Ativa",
    audience: 642,
    inJourney: 134,
    conversion: "7,9%",
    updatedAt: "ontem",
    sent: 2104,
    totalCost: "R$ 612,40",
    avgCost: "R$ 0,29",
  },
  {
    id: "j3",
    name: "Resgate Proposta Sem Resposta",
    trigger: "Proposta enviada há 5 dias sem retorno",
    status: "Pausada",
    audience: 87,
    inJourney: 0,
    conversion: "—",
    updatedAt: "3 dias atrás",
    sent: 312,
    totalCost: "R$ 198,20",
    avgCost: "R$ 0,64",
  },
  {
    id: "j4",
    name: "Boas-vindas Aurora Beach",
    trigger: "Lead entrou no CRM via campanha 'Aurora Beach'",
    status: "Rascunho",
    audience: 0,
    inJourney: 0,
    conversion: "—",
    updatedAt: "há 1 h",
    sent: 0,
    totalCost: "R$ 0,00",
    avgCost: "R$ 0,00",
  },
];

export const JOURNEY_SAMPLE_NODES: JourneyNodeData[] = [
  {
    id: "n1",
    type: "trigger",
    title: "Lead preencheu formulário",
    description: "Formulário 'Vega Towers' e sem contato em 24h",
    position: { x: 320, y: 40 },
  },
  {
    id: "n2",
    type: "delay",
    title: "Aguardar 2 dias",
    description: "Janela de respiro antes do 1º toque",
    position: { x: 320, y: 200 },
  },
  {
    id: "n3",
    type: "email",
    title: "E-mail — Reabordagem 3d",
    description: "Template: 'Ainda tem interesse?'",
    position: { x: 320, y: 360 },
  },
  {
    id: "n4",
    type: "condition",
    title: "Abriu o e-mail?",
    description: "Sim → continua | Não → próximo canal",
    position: { x: 320, y: 520 },
  },
  {
    id: "n5",
    type: "rcs",
    title: "RCS — Catálogo interativo",
    description: "Cartão com fotos do empreendimento",
    position: { x: 320, y: 680 },
  },
  {
    id: "n6",
    type: "sms",
    title: "SMS — Lembrete",
    description: "'Temos novidades sobre Vega Towers.'",
    position: { x: 320, y: 840 },
  },
  {
    id: "n7",
    type: "hsm",
    title: "HSM WhatsApp — Convite",
    description: "Template aprovado · CTA: falar com corretor",
    position: { x: 320, y: 1000 },
  },
  {
    id: "n8",
    type: "bot",
    title: "Fluxo Botify — Qualificação",
    description: "Pergunta orçamento, prazo, interesse",
    position: { x: 320, y: 1160 },
  },
  {
    id: "n9",
    type: "notify",
    title: "Notificar corretor responsável",
    description: "Marina Costa · alta prioridade",
    position: { x: 320, y: 1320 },
  },
];

export const JOURNEY_KPIS = [
  { label: "Total enviados", value: "7.236", delta: "+8,4%", hint: "últimos 30d" },
  { label: "Valor total", value: "R$ 2.653,20", delta: "+5,1%", hint: "todas as jornadas" },
  { label: "Custo médio/envio", value: "R$ 0,37", delta: "-2,3%", hint: "vs. mês anterior" },
  { label: "CAC", value: "R$ 184,90", delta: "-6,8%", hint: "leads convertidos" },
];

// Templates ----------------------------------------------------------------

export type MessageTemplate = {
  id: string;
  name: string;
  objective: "Boas-vindas" | "Reengajamento" | "Proposta" | "Resgate";
  preview: string;
  cta: string;
};

export const EMAIL_TEMPLATES: MessageTemplate[] = [
  { id: "et1", name: "Boas-vindas — Tour Virtual", objective: "Boas-vindas", preview: "Que bom ter você por aqui! Veja o tour 360° do empreendimento.", cta: "Iniciar tour" },
  { id: "et2", name: "Reengajamento 3d — Ainda interessado?", objective: "Reengajamento", preview: "Notei que você se interessou pelo Vega Towers. Posso te ajudar?", cta: "Falar agora" },
  { id: "et3", name: "Proposta — Condições Especiais", objective: "Proposta", preview: "Preparei uma simulação personalizada com entrada facilitada.", cta: "Ver proposta" },
  { id: "et4", name: "Resgate — Última chance", objective: "Resgate", preview: "Restam poucas unidades na planta que combinam com seu perfil.", cta: "Garantir unidade" },
];

export const HSM_TEMPLATES: MessageTemplate[] = [
  { id: "ht1", name: "Boas-vindas WhatsApp", objective: "Boas-vindas", preview: "Olá {{1}}! Aqui é a {{2}} da OmniconnectPRO. Posso te enviar o catálogo?", cta: "Sim, quero receber" },
  { id: "ht2", name: "Reengajamento — Catálogo", objective: "Reengajamento", preview: "{{1}}, separei opções alinhadas ao seu interesse em {{2}}.", cta: "Ver opções" },
  { id: "ht3", name: "Convite Visita", objective: "Proposta", preview: "Que tal conhecer o decorado neste sábado às {{1}}h?", cta: "Confirmar visita" },
  { id: "ht4", name: "Resgate Proposta", objective: "Resgate", preview: "Sua proposta ainda está válida por 48h. Posso reservar?", cta: "Quero reservar" },
];

// Brokers ------------------------------------------------------------------

export type BrokerChannel = "sms" | "email" | "whatsapp" | "rcs";

export type BrokerStatusMap = {
  sent: string;
  invalid: string;
  duplicated: string;
  spam: string;
  bounced: string;
};

export type Broker = {
  id: string;
  name: string;
  channel: BrokerChannel;
  vendor: string;
  status: "Conectado" | "Atenção" | "Desconectado";
  fallback?: string;
  statusMap: BrokerStatusMap;
  autoDisableOnBounce: boolean;
  monthlyCost: string;
};

export const BROKERS: Broker[] = [
  {
    id: "br-sms-1",
    name: "Zenvia SMS",
    channel: "sms",
    vendor: "Zenvia",
    status: "Conectado",
    fallback: "TotalVoice",
    statusMap: { sent: "Enviado", invalid: "Inválido", duplicated: "Duplicado", spam: "SPAM", bounced: "Bounced" },
    autoDisableOnBounce: true,
    monthlyCost: "R$ 642,30",
  },
  {
    id: "br-email-1",
    name: "Lovable Email Gateway",
    channel: "email",
    vendor: "Lovable Cloud",
    status: "Conectado",
    fallback: "—",
    statusMap: { sent: "Enviado", invalid: "Inválido", duplicated: "Duplicado", spam: "SPAM", bounced: "Bounced" },
    autoDisableOnBounce: true,
    monthlyCost: "R$ 188,40",
  },
  {
    id: "br-wa-1",
    name: "Meta Cloud API",
    channel: "whatsapp",
    vendor: "Meta",
    status: "Atenção",
    fallback: "Twilio WhatsApp",
    statusMap: { sent: "Enviado", invalid: "Inválido", duplicated: "Duplicado", spam: "SPAM", bounced: "Bounced" },
    autoDisableOnBounce: false,
    monthlyCost: "R$ 1.420,00",
  },
  {
    id: "br-rcs-1",
    name: "Google RCS Business",
    channel: "rcs",
    vendor: "Google",
    status: "Desconectado",
    fallback: "SMS Zenvia",
    statusMap: { sent: "Enviado", invalid: "Inválido", duplicated: "Duplicado", spam: "SPAM", bounced: "Bounced" },
    autoDisableOnBounce: true,
    monthlyCost: "R$ 0,00",
  },
];

// Anti-fatigue & Budget -----------------------------------------------------

export type AntiFatigueRule = {
  enabled: boolean;
  windowHours: number;
  appliesTo: "telefone" | "cpf" | "ambos";
  scope: "global" | "por_carteira";
  scopedTenantIds: string[];
  allowBypassForUrgent: boolean;
  bypassJourneyIds: string[];
  businessHours: { start: string; end: string };
  blocklistCount: number;
};

export const ANTI_FATIGUE_DEFAULT: AntiFatigueRule = {
  enabled: true,
  windowHours: 24,
  appliesTo: "ambos",
  scope: "global",
  scopedTenantIds: ["vega", "aurora"],
  allowBypassForUrgent: true,
  bypassJourneyIds: ["j3"],
  businessHours: { start: "08:00", end: "20:00" },
  blocklistCount: 1284,
};

export type WalletBudget = {
  totalBudget: number;
  usedBudget: number;
  resetCycle: "mensal" | "semanal";
  costPerChannel: Record<BrokerChannel, number>;
  blockOnInsufficient: boolean;
  realtimeDebit: boolean;
};

export const WALLET_BUDGET_DEFAULT: WalletBudget = {
  totalBudget: 12000,
  usedBudget: 7430.18,
  resetCycle: "mensal",
  costPerChannel: { sms: 0.08, email: 0.02, whatsapp: 0.18, rcs: 0.12 },
  blockOnInsufficient: true,
  realtimeDebit: true,
};

// Guard audit ---------------------------------------------------------------

export type GuardReason =
  | "anti_fatigue"
  | "insufficient_balance"
  | "missing_template"
  | "line_health";

export type GuardEvent = {
  id: string;
  reason: GuardReason;
  leadName: string;
  leadContact: string;
  journeyId: string;
  journeyName: string;
  nodeId?: string;
  nodeLabel?: string;
  channel: BrokerChannel;
  tenantId: string;
  tenantName: string;
  timestamp: string;
  occurredAt?: string;
  detail: string;
  bypassable: boolean;
  rule?: {
    name: string;
    summary: string;
    params: { label: string; value: string }[];
  };
  guardData?: { label: string; value: string }[];
  context?: { label: string; value: string }[];
  brokerResponse?: { code: string; message: string };
  suggestedActions?: string[];
};

export const GUARD_EVENTS: GuardEvent[] = [
  {
    id: "g1",
    reason: "anti_fatigue",
    leadName: "Marina Costa",
    leadContact: "+55 11 98231-4521",
    journeyId: "j1",
    journeyName: "Reengajamento Formulário 7d",
    nodeId: "n-hsm-2",
    nodeLabel: "HSM • Lembrete proposta",
    channel: "whatsapp",
    tenantId: "vega",
    tenantName: "Construtora Vega",
    timestamp: "há 12 min",
    occurredAt: "2026-05-19 14:48:12",
    detail: "Mesmo telefone recebeu disparo da jornada 'Nutrição Studio 14d' há 6h (janela 24h).",
    bypassable: true,
    rule: {
      name: "Anti-fadiga global",
      summary: "Bloquear por 24h usando telefone + CPF, escopo global, horário útil 08–20h.",
      params: [
        { label: "Janela", value: "24h" },
        { label: "Dedupe", value: "Telefone + CPF" },
        { label: "Escopo", value: "Global" },
        { label: "Horário útil", value: "08:00 – 20:00" },
      ],
    },
    guardData: [
      { label: "Último contato", value: "há 6h • Nutrição Studio 14d" },
      { label: "Próxima liberação", value: "em 17h 48min" },
      { label: "Matches", value: "Telefone (E.164)" },
    ],
    context: [
      { label: "Origem", value: "Formulário site • UTM=meta_ads" },
      { label: "Score", value: "72 (Quente)" },
      { label: "Responsável", value: "—" },
    ],
    suggestedActions: ["Liberar bypass único", "Reenfileirar após janela", "Trocar canal para Email"],
  },
  {
    id: "g2",
    reason: "insufficient_balance",
    leadName: "Lote 'Aurora Beach #318'",
    leadContact: "318 leads",
    journeyId: "j4",
    journeyName: "Boas-vindas Aurora Beach",
    nodeId: "n-start",
    nodeLabel: "Gatilho • Ativação manual",
    channel: "whatsapp",
    tenantId: "aurora",
    tenantName: "Imobiliária Aurora",
    timestamp: "há 32 min",
    occurredAt: "2026-05-19 14:28:00",
    detail: "Estimativa R$ 57,24 excede o saldo restante R$ 42,18. Guard pré-disparo bloqueou aprovação.",
    bypassable: false,
    rule: {
      name: "Guard de saldo (carteira Aurora)",
      summary: "Bloquear ativação quando estimativa > saldo disponível.",
      params: [
        { label: "Política", value: "Bloquear aprovação" },
        { label: "Limite mínimo", value: "5% do orçamento" },
        { label: "Reserva", value: "Em tempo real" },
      ],
    },
    guardData: [
      { label: "Estimativa", value: "318 × R$ 0,18 = R$ 57,24" },
      { label: "Saldo carteira", value: "R$ 42,18" },
      { label: "Déficit", value: "R$ 15,06" },
    ],
    context: [
      { label: "Carteira", value: "Aurora Beach" },
      { label: "Ciclo", value: "Maio/2026" },
      { label: "Aprovador", value: "guilherme@aurora.com" },
    ],
    suggestedActions: ["Recarregar carteira", "Reduzir audiência", "Mudar canal (SMS)"],
  },
  {
    id: "g3",
    reason: "missing_template",
    leadName: "Carlos Mendes",
    leadContact: "+55 21 99812-7733",
    journeyId: "j2",
    journeyName: "Nutrição Studio 14d",
    nodeId: "n-hsm-1",
    nodeLabel: "HSM • Boas-vindas",
    channel: "whatsapp",
    tenantId: "vega",
    tenantName: "Construtora Vega",
    timestamp: "há 1 h",
    occurredAt: "2026-05-19 13:58:00",
    detail: "Nó HSM sem template aprovado pela Meta — envio fora da janela de 24h exige template.",
    bypassable: false,
    rule: {
      name: "Validador de template HSM",
      summary: "Bloquear disparo HSM/RCS sem template aprovado ou variáveis ausentes.",
      params: [
        { label: "Janela WhatsApp", value: "> 24h sem interação" },
        { label: "Política", value: "Exigir template aprovado" },
      ],
    },
    guardData: [
      { label: "Última interação", value: "há 3 dias" },
      { label: "Template vinculado", value: "— (vazio)" },
      { label: "Status broker", value: "Template not found" },
    ],
    brokerResponse: { code: "131026", message: "Message template not found" },
    context: [
      { label: "Jornada", value: "Nutrição Studio 14d" },
      { label: "Nó", value: "HSM • Boas-vindas" },
    ],
    suggestedActions: ["Vincular template aprovado", "Submeter novo HSM à Meta"],
  },
  {
    id: "g4",
    reason: "anti_fatigue",
    leadName: "Juliana Reis",
    leadContact: "CPF 412.***.***-09",
    journeyId: "j3",
    journeyName: "Resgate Proposta Sem Resposta",
    nodeId: "n-sms-1",
    nodeLabel: "SMS • Lembrete",
    channel: "sms",
    tenantId: "aurora",
    tenantName: "Imobiliária Aurora",
    timestamp: "há 2 h",
    occurredAt: "2026-05-19 12:58:00",
    detail: "CPF recebeu mensagem cross-carteira na janela de 24h (dedupe ambos).",
    bypassable: true,
    rule: {
      name: "Anti-fadiga global",
      summary: "Dedupe por telefone + CPF, escopo global.",
      params: [
        { label: "Janela", value: "24h" },
        { label: "Dedupe", value: "Telefone + CPF" },
        { label: "Escopo", value: "Global" },
      ],
    },
    guardData: [
      { label: "Match", value: "CPF" },
      { label: "Conflito", value: "Construtora Vega • há 9h" },
      { label: "Próxima liberação", value: "em 15h" },
    ],
    suggestedActions: ["Liberar bypass único", "Mover para Email"],
  },
  {
    id: "g5",
    reason: "missing_template",
    leadName: "Lote RCS 'Studio'",
    leadContact: "84 leads",
    journeyId: "j2",
    journeyName: "Nutrição Studio 14d",
    nodeId: "n-rcs-1",
    nodeLabel: "RCS • Card Studio",
    channel: "rcs",
    tenantId: "vega",
    tenantName: "Construtora Vega",
    timestamp: "há 3 h",
    occurredAt: "2026-05-19 11:58:00",
    detail: "Variável {{1}}=nome ausente em 12 leads. Status do broker: 'Missing Template Variables'.",
    bypassable: false,
    rule: {
      name: "Validador de template HSM/RCS",
      summary: "Exigir todas as variáveis preenchidas antes do envio.",
      params: [
        { label: "Variáveis obrigatórias", value: "{{1}} nome, {{2}} cidade" },
      ],
    },
    guardData: [
      { label: "Leads sem {{1}}", value: "12 de 84" },
      { label: "Status broker", value: "Missing Template Variables" },
    ],
    brokerResponse: { code: "RCS-422", message: "Missing template variables" },
    suggestedActions: ["Mapear campo 'nome'", "Excluir 12 leads do lote"],
  },
  {
    id: "g6",
    reason: "insufficient_balance",
    leadName: "Reativação SMS lote 4",
    leadContact: "1.420 leads",
    journeyId: "j1",
    journeyName: "Reengajamento Formulário 7d",
    nodeId: "n-sms-2",
    nodeLabel: "SMS • Reativação",
    channel: "sms",
    tenantId: "vega",
    tenantName: "Construtora Vega",
    timestamp: "há 5 h",
    occurredAt: "2026-05-19 09:58:00",
    detail: "Débito em tempo real pausou após R$ 113,60. Carteira ficou abaixo de 5%.",
    bypassable: false,
    rule: {
      name: "Guard de saldo (carteira Vega)",
      summary: "Pausar fila quando saldo cair abaixo do limite mínimo.",
      params: [
        { label: "Limite mínimo", value: "5% do orçamento" },
        { label: "Política", value: "Pausar fila e notificar" },
      ],
    },
    guardData: [
      { label: "Gastos no envio", value: "R$ 113,60 (1.262 SMS)" },
      { label: "Saldo restante", value: "R$ 18,40 (4,1%)" },
      { label: "Não enviados", value: "158 leads" },
    ],
    suggestedActions: ["Recarregar carteira", "Retomar fila manualmente"],
  },
  {
    id: "g7",
    reason: "anti_fatigue",
    leadName: "Pedro Almeida",
    leadContact: "+55 31 99654-2210",
    journeyId: "j1",
    journeyName: "Reengajamento Formulário 7d",
    nodeId: "n-email-1",
    nodeLabel: "Email • Reengajamento",
    channel: "email",
    tenantId: "vega",
    tenantName: "Construtora Vega",
    timestamp: "há 6 h",
    occurredAt: "2026-05-19 08:58:00",
    detail: "Fora do horário útil (08–20h). Reenfileirado para 08:00 do próximo dia útil.",
    bypassable: false,
    rule: {
      name: "Janela de horário útil",
      summary: "Não disparar entre 20h e 08h ou em fins de semana.",
      params: [
        { label: "Horário útil", value: "08:00 – 20:00" },
        { label: "Dias", value: "Seg–Sex" },
      ],
    },
    guardData: [
      { label: "Tentativa", value: "07:42" },
      { label: "Reenfileirado para", value: "08:00 do próximo dia útil" },
    ],
    suggestedActions: ["Aguardar reenfileiramento", "Marcar como urgente (bypass)"],
  },
  {
    id: "g8",
    reason: "line_health",
    leadName: "Lote HSM 'Aurora Beach #401'",
    leadContact: "401 leads",
    journeyId: "j4",
    journeyName: "Boas-vindas Aurora Beach",
    nodeId: "n-hsm-3",
    nodeLabel: "HSM • Boas-vindas Aurora",
    channel: "whatsapp",
    tenantId: "aurora",
    tenantName: "Imobiliária Aurora",
    timestamp: "há 18 min",
    occurredAt: "2026-05-19 14:42:00",
    detail:
      "Linha +55 11 4040-2210 caiu para qualidade MEDIUM na Meta. Política bloqueia HSM em massa até reavaliação.",
    bypassable: true,
    rule: {
      name: "Guard de saúde da linha (Meta)",
      summary:
        "Bloquear HSM quando quality_rating retornado pela Meta for diferente de HIGH.",
      params: [
        { label: "Limiar mínimo", value: "HIGH" },
        { label: "Ação em MEDIUM", value: "Bloquear lotes > 50 leads" },
        { label: "Ação em LOW", value: "Bloquear todo HSM" },
        { label: "Reavaliação", value: "A cada 30 min via Graph API" },
      ],
    },
    guardData: [
      { label: "Número", value: "Aurora Oficial · +55 11 4040-2210" },
      { label: "Qualidade atual", value: "MEDIUM (caiu de HIGH há 2h)" },
      { label: "Messaging limit", value: "TIER_10K" },
      { label: "Status WABA", value: "FLAGGED" },
      { label: "Última verificação", value: "há 4 min" },
      { label: "Sinalizações Meta", value: "Bloqueios por usuários ↑ 38% em 24h" },
    ],
    context: [
      { label: "Jornada", value: "Boas-vindas Aurora Beach" },
      { label: "Nó", value: "HSM • Boas-vindas Aurora" },
      { label: "WABA ID", value: "1023******8821" },
      { label: "Audiência", value: "401 leads" },
    ],
    brokerResponse: {
      code: "QUALITY_MEDIUM",
      message: "Phone number quality rating degraded — HSM throttled by policy",
    },
    suggestedActions: [
      "Trocar para número HIGH do pool",
      "Pausar campanhas HSM por 24h",
      "Reduzir frequência e revisar copy",
      "Forçar bypass (sob risco de rebaixamento)",
    ],
  },
  {
    id: "g9",
    reason: "line_health",
    leadName: "Lote HSM 'Vega Reativação'",
    leadContact: "1.180 leads",
    journeyId: "j1",
    journeyName: "Reengajamento Formulário 7d",
    nodeId: "n-hsm-4",
    nodeLabel: "HSM • Reativação Vega",
    channel: "whatsapp",
    tenantId: "vega",
    tenantName: "Construtora Vega",
    timestamp: "há 1 h",
    occurredAt: "2026-05-19 13:58:00",
    detail:
      "Linha +55 11 3322-9001 em qualidade LOW e status RESTRICTED. Todo envio HSM bloqueado.",
    bypassable: false,
    rule: {
      name: "Guard de saúde da linha (Meta)",
      summary:
        "Bloquear 100% dos HSM quando linha estiver em LOW ou RESTRICTED.",
      params: [
        { label: "Limiar mínimo", value: "HIGH" },
        { label: "Ação em LOW", value: "Bloquear todo HSM" },
        { label: "Bypass", value: "Não permitido" },
      ],
    },
    guardData: [
      { label: "Número", value: "Vega Vendas · +55 11 3322-9001" },
      { label: "Qualidade atual", value: "LOW" },
      { label: "Qualidade anterior", value: "MEDIUM (há 6h)" },
      { label: "Messaging limit", value: "TIER_1K (rebaixado de TIER_10K)" },
      { label: "Status WABA", value: "RESTRICTED" },
      { label: "Sinalizações Meta", value: "Marcações como spam ↑ 64%" },
    ],
    context: [
      { label: "Jornada", value: "Reengajamento Formulário 7d" },
      { label: "Nó", value: "HSM • Reativação Vega" },
      { label: "WABA ID", value: "9847******1102" },
    ],
    brokerResponse: {
      code: "131049",
      message: "This message was not delivered due to phone number quality issues",
    },
    suggestedActions: [
      "Mover tráfego para número HIGH do pool",
      "Abrir chamado no broker / suporte Meta",
      "Pausar jornadas HSM desta linha por 7 dias",
      "Revisar opt-in e segmentação antes de retomar",
    ],
  },
  {
    id: "g10",
    reason: "line_health",
    leadName: "Lote HSM 'Studio Premium'",
    leadContact: "212 leads",
    journeyId: "j2",
    journeyName: "Nutrição Studio 14d",
    nodeId: "n-hsm-5",
    nodeLabel: "HSM • Convite visita",
    channel: "whatsapp",
    tenantId: "vega",
    tenantName: "Construtora Vega",
    timestamp: "há 4 h",
    occurredAt: "2026-05-19 10:58:00",
    detail:
      "Linha em PENDING_REVIEW após rebaixamento recente. Disparo HSM suspenso preventivamente.",
    bypassable: true,
    rule: {
      name: "Guard de saúde da linha (Meta)",
      summary: "Suspender HSM durante reavaliação da Meta para não acelerar rebaixamento.",
      params: [
        { label: "Status monitorado", value: "PENDING_REVIEW" },
        { label: "Janela de espera", value: "24h ou até qualidade retornar a HIGH" },
      ],
    },
    guardData: [
      { label: "Número", value: "Vega Studio · +55 11 4044-1717" },
      { label: "Qualidade atual", value: "MEDIUM" },
      { label: "Status WABA", value: "PENDING_REVIEW" },
      { label: "Tempo em revisão", value: "5h 12min" },
    ],
    context: [
      { label: "Jornada", value: "Nutrição Studio 14d" },
      { label: "Audiência", value: "212 leads" },
    ],
    suggestedActions: [
      "Aguardar fim da reavaliação",
      "Trocar para número HIGH do pool",
      "Bypass para amostra ≤ 20 leads",
    ],
  },
];

// WhatsApp line health history -------------------------------------------

export type LineQuality = "HIGH" | "MEDIUM" | "LOW";

export const LINE_QUALITY_SCORE: Record<LineQuality, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 3,
};

export type LineHealthLine = {
  id: string;
  displayName: string;
  phone: string;
  tenantId: string;
  tenantName: string;
  wabaId: string;
  tier: "TIER_250" | "TIER_1K" | "TIER_10K" | "TIER_100K" | "UNLIMITED";
  current: LineQuality;
  status: "CONNECTED" | "FLAGGED" | "RESTRICTED" | "PENDING_REVIEW";
  /** 30 days of daily quality readings, oldest first */
  history: { date: string; quality: LineQuality }[];
};

// deterministic 30-day series helper (oldest → newest)
const days = (offsets: LineQuality[]): { date: string; quality: LineQuality }[] => {
  const base = new Date("2026-05-19T00:00:00Z");
  return offsets.map((q, i) => {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() - (offsets.length - 1 - i));
    return { date: d.toISOString().slice(0, 10), quality: q };
  });
};

export const LINE_HEALTH_LINES: LineHealthLine[] = [
  {
    id: "ln-aurora-1",
    displayName: "Aurora Oficial",
    phone: "+55 11 4040-2210",
    tenantId: "aurora",
    tenantName: "Imobiliária Aurora",
    wabaId: "1023******8821",
    tier: "TIER_10K",
    current: "MEDIUM",
    status: "FLAGGED",
    history: days([
      "HIGH","HIGH","HIGH","HIGH","HIGH","HIGH","HIGH",
      "HIGH","HIGH","HIGH","HIGH","HIGH","HIGH","HIGH",
      "HIGH","HIGH","HIGH","HIGH","HIGH","HIGH","HIGH",
      "HIGH","HIGH","HIGH","HIGH","HIGH","HIGH","HIGH",
      "HIGH","MEDIUM",
    ]),
  },
  {
    id: "ln-vega-1",
    displayName: "Vega Vendas",
    phone: "+55 11 3322-9001",
    tenantId: "vega",
    tenantName: "Construtora Vega",
    wabaId: "9847******1102",
    tier: "TIER_1K",
    current: "LOW",
    status: "RESTRICTED",
    history: days([
      "HIGH","HIGH","HIGH","HIGH","HIGH","HIGH","HIGH",
      "HIGH","HIGH","HIGH","HIGH","HIGH","HIGH","HIGH",
      "HIGH","HIGH","HIGH","MEDIUM","HIGH","HIGH","MEDIUM",
      "MEDIUM","HIGH","MEDIUM","MEDIUM","MEDIUM","MEDIUM",
      "LOW","MEDIUM","LOW",
    ]),
  },
  {
    id: "ln-vega-2",
    displayName: "Vega Studio",
    phone: "+55 11 4044-1717",
    tenantId: "vega",
    tenantName: "Construtora Vega",
    wabaId: "9847******2245",
    tier: "TIER_10K",
    current: "MEDIUM",
    status: "PENDING_REVIEW",
    history: days([
      "HIGH","HIGH","HIGH","HIGH","HIGH","HIGH","HIGH",
      "HIGH","HIGH","HIGH","HIGH","HIGH","HIGH","HIGH",
      "HIGH","HIGH","HIGH","HIGH","HIGH","HIGH","HIGH",
      "HIGH","HIGH","HIGH","MEDIUM","HIGH","MEDIUM",
      "MEDIUM","MEDIUM","MEDIUM",
    ]),
  },
  {
    id: "ln-aurora-2",
    displayName: "Aurora SDR",
    phone: "+55 11 4040-7788",
    tenantId: "aurora",
    tenantName: "Imobiliária Aurora",
    wabaId: "1023******9914",
    tier: "TIER_100K",
    current: "HIGH",
    status: "CONNECTED",
    history: days(Array(30).fill("HIGH") as LineQuality[]),
  },
];


