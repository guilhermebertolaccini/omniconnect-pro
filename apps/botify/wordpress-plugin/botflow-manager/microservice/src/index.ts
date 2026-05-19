import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/error-handler.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimiter } from './middleware/rate-limiter.js';
import { healthRoutes } from './routes/health.js';
import { aiRoutes } from './routes/ai.js';
import { webhookRoutes } from './routes/webhooks.js';
import { eventsRoutes } from './routes/events.js';
import { MessageQueue } from './queue/message-queue.js';

const app = express();

// Security middleware
app.use(helmet());
app.use(compression());

// CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (config.ALLOWED_ORIGINS.includes(origin) || config.ALLOWED_ORIGINS.includes('*')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key', 'X-Webhook-Signature'],
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
app.use(rateLimiter);

// Routes
app.use('/health', healthRoutes);
app.use('/webhooks', webhookRoutes); // No auth for webhooks (signature verified)
app.use('/ai', authMiddleware, aiRoutes);
app.use('/events', authMiddleware, eventsRoutes);

// Error handler
app.use(errorHandler);

// Initialize message queue
const messageQueue = MessageQueue.getInstance();

// Graceful shutdown
const gracefulShutdown = async () => {
  logger.info('Shutting down gracefully...');
  await messageQueue.close();
  process.exit(0);
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server
const server = app.listen(config.PORT, () => {
  logger.info(`🚀 BotFlow Microservice running on port ${config.PORT}`);
  logger.info(`📍 Environment: ${config.NODE_ENV}`);
});

export { app, server, messageQueue };
