import { InsightAiService } from './apps/omniconnect-backend/src/insight-ai/insight-ai.service';
import { Logger } from '@nestjs/common';

// Mock dependências
const mockPrisma = {
  conversationAIAnalysis: {
    findMany: async () => []
  }
};

const mockConfig = {
  get: (key: string) => {
    if (key === 'OPENAI_API_KEY') return null; // força fallback
    return null;
  }
};

async function run() {
  const aiService = new InsightAiService(mockPrisma as any, mockConfig as any);
  
  // Substitui logger para evitar poluição
  (aiService as any).logger = new Logger('Test');

  console.log('--- TESTANDO DASHBOARD EXECUTIVE ---');
  const summary = await aiService.getExecutiveSummary();
  console.log('Summary:', summary);

  console.log('\n--- TESTANDO HEURÍSTICA ---');
  const result = (aiService as any).heuristicAnalysis([
    { text: 'Olá, qual o valor?', sender: 'contact', datetime: new Date('2026-05-16T10:00:00Z') },
    { text: 'Custa 500 mil.', sender: 'operator', datetime: new Date('2026-05-16T10:05:00Z') },
    { text: 'Quais as condições de financiamento e entrada?', sender: 'contact', datetime: new Date('2026-05-16T10:10:00Z') },
  ]);
  console.log('Heuristic Result:', result);
}

run().catch(console.error);
