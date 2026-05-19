import { Response } from 'express';
import { logger } from '../utils/logger.js';

export class SSEManager {
  private static instance: SSEManager;
  private clients: Map<string, Response> = new Map();

  private constructor() {}

  static getInstance(): SSEManager {
    if (!SSEManager.instance) {
      SSEManager.instance = new SSEManager();
    }
    return SSEManager.instance;
  }

  addClient(clientId: string, response: Response): void {
    // Remove existing connection if any
    if (this.clients.has(clientId)) {
      this.removeClient(clientId);
    }

    this.clients.set(clientId, response);
    logger.debug(`SSE client added: ${clientId} (total: ${this.clients.size})`);
  }

  removeClient(clientId: string): void {
    const response = this.clients.get(clientId);
    
    if (response) {
      try {
        response.end();
      } catch {
        // Ignore errors when ending response
      }
      this.clients.delete(clientId);
      logger.debug(`SSE client removed: ${clientId} (total: ${this.clients.size})`);
    }
  }

  broadcast(event: string, data: any): void {
    const payload = JSON.stringify(data);
    
    for (const [clientId, response] of this.clients) {
      try {
        response.write(`event: ${event}\n`);
        response.write(`data: ${payload}\n\n`);
      } catch (error) {
        logger.error(`Failed to send to client ${clientId}:`, error);
        this.removeClient(clientId);
      }
    }
  }

  sendToUser(userId: string, event: string, data: any): void {
    const payload = JSON.stringify(data);
    
    // Send to all connections for this user
    for (const [clientId, response] of this.clients) {
      if (clientId === userId || clientId.startsWith(`${userId}:`)) {
        try {
          response.write(`event: ${event}\n`);
          response.write(`data: ${payload}\n\n`);
        } catch (error) {
          logger.error(`Failed to send to client ${clientId}:`, error);
          this.removeClient(clientId);
        }
      }
    }
  }

  sendToFlow(flowId: string, event: string, data: any): void {
    const payload = JSON.stringify(data);
    
    // Send to all connections subscribed to this flow
    for (const [clientId, response] of this.clients) {
      if (clientId.includes(`:flow:${flowId}`)) {
        try {
          response.write(`event: ${event}\n`);
          response.write(`data: ${payload}\n\n`);
        } catch (error) {
          logger.error(`Failed to send to client ${clientId}:`, error);
          this.removeClient(clientId);
        }
      }
    }
  }

  getActiveConnections(): Array<{ clientId: string; connectedAt: string }> {
    return Array.from(this.clients.keys()).map(clientId => ({
      clientId,
      connectedAt: new Date().toISOString(), // Ideally track this per connection
    }));
  }

  getClientCount(): number {
    return this.clients.size;
  }

  isConnected(clientId: string): boolean {
    return this.clients.has(clientId);
  }
}
