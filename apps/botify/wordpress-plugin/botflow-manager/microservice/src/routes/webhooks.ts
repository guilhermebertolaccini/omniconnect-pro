import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { config } from '../config.js';
import { WebhookHandler } from '../services/webhook-handler.js';
import { logger } from '../utils/logger.js';

const router = Router();
const webhookHandler = new WebhookHandler();

// Meta webhook verification (GET)
router.get('/meta', (req: Request, res: Response) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  logger.info('Meta webhook verification request received');

  const verifyToken = config.META_WEBHOOK_VERIFY_TOKEN?.trim();
  if (mode === 'subscribe' && token && challenge) {
    if (verifyToken && token !== verifyToken) {
      logger.warn('Meta webhook verification: invalid verify token');
      return res.status(403).json({ error: 'Verification failed' });
    }
    if (!verifyToken) {
      logger.warn(
        'Meta webhook verification: META_WEBHOOK_VERIFY_TOKEN not set — accepting challenge (dev only)',
      );
    }
    return res.status(200).send(challenge);
  }
  res.status(403).json({ error: 'Verification failed' });
});

// Meta webhook events (POST)
router.post('/meta', async (req: Request, res: Response) => {
  try {
    const signature = req.headers['x-hub-signature-256'] as string;
    
    if (!signature) {
      logger.warn('Meta webhook: Missing signature');
      return res.status(401).json({ error: 'Missing signature' });
    }

    // Signature will be verified by the handler
    const rawBody = JSON.stringify(req.body);
    
    // Respond immediately to avoid timeout
    res.status(200).json({ received: true });

    // Process asynchronously
    setImmediate(async () => {
      try {
        await webhookHandler.handleMeta(req.body, signature, rawBody);
      } catch (error) {
        logger.error('Meta webhook processing error:', error);
      }
    });
  } catch (error) {
    logger.error('Meta webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Evolution API webhook
router.post('/evolution', async (req: Request, res: Response) => {
  try {
    const apiKey = req.headers['x-api-key'] as string;
    
    if (!apiKey) {
      logger.warn('Evolution webhook: Missing API key');
      return res.status(401).json({ error: 'Missing API key' });
    }

    // Respond immediately
    res.status(200).json({ received: true });

    // Process asynchronously
    setImmediate(async () => {
      try {
        await webhookHandler.handleEvolution(req.body, apiKey);
      } catch (error) {
        logger.error('Evolution webhook processing error:', error);
      }
    });
  } catch (error) {
    logger.error('Evolution webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Evolution API specific event types
const evolutionEventSchema = z.object({
  event: z.string(),
  instance: z.string(),
  data: z.any(),
  destination: z.string().optional(),
  date_time: z.string().optional(),
  sender: z.string().optional(),
  server_url: z.string().optional(),
  apikey: z.string().optional(),
});

router.post('/evolution/:instanceName', async (req: Request, res: Response) => {
  try {
    const { instanceName } = req.params;
    const apiKey = req.headers['apikey'] as string || req.headers['x-api-key'] as string;

    logger.info(`Evolution webhook for instance: ${instanceName}`);

    // Respond immediately
    res.status(200).json({ received: true });

    // Process asynchronously
    setImmediate(async () => {
      try {
        const payload = {
          ...req.body,
          instance: instanceName,
        };
        await webhookHandler.handleEvolution(payload, apiKey);
      } catch (error) {
        logger.error('Evolution webhook processing error:', error);
      }
    });
  } catch (error) {
    logger.error('Evolution webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Generic webhook (for testing or custom integrations)
router.post('/generic', async (req: Request, res: Response) => {
  try {
    const source = req.headers['x-webhook-source'] as string || 'unknown';
    
    logger.info(`Generic webhook received from: ${source}`);

    res.status(200).json({ 
      received: true,
      source,
      timestamp: new Date().toISOString(),
    });

    // Log to WordPress
    setImmediate(async () => {
      try {
        await webhookHandler.logGenericWebhook(source, req.body);
      } catch (error) {
        logger.error('Generic webhook logging error:', error);
      }
    });
  } catch (error) {
    logger.error('Generic webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

export { router as webhookRoutes };
