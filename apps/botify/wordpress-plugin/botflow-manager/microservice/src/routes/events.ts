import { Router, Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth.js';
import { SSEManager } from '../realtime/sse-manager.js';
import { logger } from '../utils/logger.js';

const router = Router();
const sseManager = SSEManager.getInstance();

// Subscribe to real-time events
router.get('/subscribe', (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  
  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, timestamp: Date.now() })}\n\n`);

  // Add client to SSE manager
  sseManager.addClient(userId, res);

  logger.info(`SSE client connected: ${userId}`);

  // Heartbeat to keep connection alive
  const heartbeatInterval = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseManager.removeClient(userId);
    logger.info(`SSE client disconnected: ${userId}`);
  });
});

// Subscribe to specific flow events
router.get('/subscribe/flow/:flowId', (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.userId;
  const { flowId } = req.params;
  
  if (!userId) {
    return res.status(401).json({ error: 'User ID required' });
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ userId, flowId, timestamp: Date.now() })}\n\n`);

  // Add client to SSE manager with flow context
  const clientId = `${userId}:flow:${flowId}`;
  sseManager.addClient(clientId, res);

  logger.info(`SSE client connected to flow: ${userId} -> ${flowId}`);

  // Heartbeat
  const heartbeatInterval = setInterval(() => {
    res.write(`event: heartbeat\ndata: ${JSON.stringify({ timestamp: Date.now() })}\n\n`);
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseManager.removeClient(clientId);
    logger.info(`SSE client disconnected from flow: ${userId} -> ${flowId}`);
  });
});

// Get active connections (admin only)
router.get('/connections', (req: AuthenticatedRequest, res: Response) => {
  if (req.user?.role !== 'admin' && req.user?.userId !== 'service') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const connections = sseManager.getActiveConnections();
  
  res.json({
    success: true,
    data: {
      totalConnections: connections.length,
      connections,
    },
  });
});

export { router as eventsRoutes };
