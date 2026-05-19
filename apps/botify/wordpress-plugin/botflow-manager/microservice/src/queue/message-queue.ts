import { Queue, Worker, Job } from 'bullmq';
import Redis from 'ioredis';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { AIProcessor } from '../services/ai-processor.js';
import { WordPressClient } from '../services/wordpress-client.js';
import { SSEManager } from '../realtime/sse-manager.js';
import { FlowEngine } from '../engine/flow-engine.js';

export interface MessageJob {
  provider: 'meta' | 'evolution';
  accountId?: string;
  instance?: string;
  messageId: string;
  from: string;
  text: string;
  timestamp: number;
  flowId?: string;
  botId: string;
}

export class MessageQueue {
  private queue: Queue;
  private worker: Worker;
  private redisConnection: Redis;
  private static instance: MessageQueue;
  private wpClient: WordPressClient;
  private sseManager: SSEManager;
  private flowEngine: FlowEngine;

  private constructor() {
    this.wpClient = new WordPressClient();
    this.sseManager = SSEManager.getInstance();
    this.flowEngine = new FlowEngine();

    // Connect to Redis
    const redisUrl = config.REDIS_URL || 'redis://localhost:6379';
    this.redisConnection = new Redis(redisUrl, {
      maxRetriesPerRequest: null,
    });

    this.redisConnection.on('error', (err) => {
      logger.error('Redis connection error:', err);
    });

    // Initialize BullMQ Queue
    this.queue = new Queue('botflow-messages', {
      connection: this.redisConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 2000,
        },
        removeOnComplete: true,
        removeOnFail: false, // Keep failed jobs for inspection
      }
    });

    // Initialize BullMQ Worker
    this.worker = new Worker(
      'botflow-messages',
      async (job: Job) => {
        return this.processJob(job);
      },
      {
        connection: this.redisConnection,
        concurrency: 5 // Process 5 messages concurrently
      }
    );

    this.setupWorkerEvents();
  }

  public static getInstance(): MessageQueue {
    if (!MessageQueue.instance) {
      MessageQueue.instance = new MessageQueue();
    }
    return MessageQueue.instance;
  }

  private setupWorkerEvents() {
    this.worker.on('completed', (job) => {
      logger.info(`Job ${job.id} has completed successfully!`);
    });

    this.worker.on('failed', (job, err) => {
      logger.error(`Job ${job?.id} has failed with error:`, err);
    });

    this.worker.on('error', (err) => {
      logger.error('Worker error:', err);
    });
  }

  async addJob(type: string, data: any): Promise<string> {
    const job = await this.queue.add(type, data);
    logger.info(`Job added to Redis queue: ${job.id} (${type})`);
    return job.id!;
  }

  private async processJob(job: Job): Promise<void> {
    switch (job.name) {
      case 'process_message':
        await this.processMessage(job.data as MessageJob);
        break;
      default:
        logger.warn(`Unknown job type: ${job.name}`);
    }
  }

  private async processMessage(messageJob: MessageJob): Promise<void> {
    const { botId, from, text, provider, messageId, flowId } = messageJob;

    // Delegate processing to the new Flow Engine
    await this.flowEngine.processIncomingMessage({
      botId,
      from,
      text,
      provider,
      messageId,
      flowId
    });
  }

  async getQueueSize(): Promise<number> {
    return this.queue.count();
  }

  async close(): Promise<void> {
    logger.info('Closing message queue and worker...');
    await this.worker.close();
    await this.queue.close();
    await this.redisConnection.quit();
    logger.info('Message queue closed');
  }
}
