import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { AIProcessor } from '../services/ai-processor.js';
import { logger } from '../utils/logger.js';
import { AppError } from '../middleware/error-handler.js';

const router = Router();
const aiProcessor = new AIProcessor();

const processRequestSchema = z.object({
  flowId: z.string(),
  nodeId: z.string(),
  conversationId: z.string(),
  userMessage: z.string(),
  conversationHistory: z.array(z.object({
    role: z.enum(['user', 'assistant', 'system']),
    content: z.string(),
  })).optional().default([]),
  variables: z.record(z.string()).optional().default({}),
  config: z.object({
    provider: z.enum(['lovable', 'openai', 'gemini']).default('lovable'),
    model: z.string().optional(),
    systemPrompt: z.string().optional(),
    userPromptTemplate: z.string().default('{{user_message}}'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().min(1).max(8000).default(500),
  }),
});

// Non-streaming AI processing
router.post('/process', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const validation = processRequestSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new AppError(`Validation error: ${validation.error.message}`, 400);
    }

    const { flowId, nodeId, conversationId, userMessage, conversationHistory, variables, config } = validation.data;

    logger.info(`Processing AI request: flow=${flowId}, node=${nodeId}`);

    const result = await aiProcessor.process({
      flowId,
      nodeId,
      conversationId,
      userMessage,
      conversationHistory,
      variables,
      config,
    });

    res.json({
      success: true,
      data: {
        response: result.response,
        tokensUsed: result.tokensUsed,
        provider: result.provider,
        model: result.model,
      },
    });
  } catch (error) {
    logger.error('AI process error:', error);
    return next(
      error instanceof AppError
        ? error
        : new AppError(error instanceof Error ? error.message : 'AI processing failed', 500)
    );
  }
});

// Streaming AI processing via SSE
router.get('/stream', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const params = processRequestSchema.safeParse({
      flowId: req.query.flowId,
      nodeId: req.query.nodeId,
      conversationId: req.query.conversationId,
      userMessage: req.query.userMessage,
      conversationHistory: req.query.history ? JSON.parse(req.query.history as string) : [],
      variables: req.query.variables ? JSON.parse(req.query.variables as string) : {},
      config: req.query.config ? JSON.parse(req.query.config as string) : {},
    });

    if (!params.success) {
      throw new AppError(`Validation error: ${params.error.message}`, 400);
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    const { flowId, nodeId, conversationId, userMessage, conversationHistory, variables, config } = params.data;

    logger.info(`Starting AI stream: flow=${flowId}, node=${nodeId}`);

    await aiProcessor.processStream(
      {
        flowId,
        nodeId,
        conversationId,
        userMessage,
        conversationHistory,
        variables,
        config,
      },
      {
        onToken: (token) => {
          res.write(`event: token\ndata: ${JSON.stringify({ token })}\n\n`);
        },
        onComplete: (result) => {
          res.write(`event: done\ndata: ${JSON.stringify(result)}\n\n`);
          res.end();
        },
        onError: (error) => {
          res.write(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`);
          res.end();
        },
      }
    );
  } catch (error) {
    logger.error('AI stream error:', error);
    const hasSseHeaders = res.getHeader('Content-Type') === 'text/event-stream';
    if (hasSseHeaders) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: 'Stream initialization failed' })}\n\n`);
      res.end();
      return;
    }
    return next(
      error instanceof AppError
        ? error
        : new AppError(error instanceof Error ? error.message : 'Stream initialization failed', 500)
    );
  }
});

// Test AI configuration
router.post('/test', async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  try {
    const testSchema = z.object({
      provider: z.enum(['lovable', 'openai', 'gemini']),
      model: z.string().optional(),
      systemPrompt: z.string().optional(),
      testMessage: z.string().default('Olá, responda com "Configuração funcionando!"'),
    });

    const validation = testSchema.safeParse(req.body);
    
    if (!validation.success) {
      throw new AppError(`Validation error: ${validation.error.message}`, 400);
    }

    const { provider, model, systemPrompt, testMessage } = validation.data;

    const result = await aiProcessor.process({
      flowId: 'test',
      nodeId: 'test',
      conversationId: 'test',
      userMessage: testMessage,
      conversationHistory: [],
      variables: {},
      config: {
        provider,
        model,
        systemPrompt: systemPrompt || 'You are a helpful assistant.',
        userPromptTemplate: '{{user_message}}',
        temperature: 0.7,
        maxTokens: 100,
      },
    });

    res.json({
      success: true,
      data: {
        response: result.response,
        provider: result.provider,
        model: result.model,
      },
    });
  } catch (error) {
    logger.error('AI test error:', error);
    return next(
      error instanceof AppError
        ? error
        : new AppError(error instanceof Error ? error.message : 'AI test failed', 500)
    );
  }
});

export { router as aiRoutes };
