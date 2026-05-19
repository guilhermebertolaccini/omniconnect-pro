import { useEffect, useCallback, useRef } from 'react';
import { microserviceApi } from '@/services/microservice-api';
import type { SSEEvent, SSEEventType, MessageReceivedEvent } from '@/types/api';

interface UseRealtimeEventsOptions {
  userId?: string;
  autoConnect?: boolean;
  onMessageReceived?: (event: MessageReceivedEvent) => void;
  onAIResponse?: (response: string) => void;
  onWebhookReceived?: (data: unknown) => void;
  onError?: (error: unknown) => void;
}

export function useRealtimeEvents(options: UseRealtimeEventsOptions = {}) {
  const {
    userId,
    autoConnect = true,
    onMessageReceived,
    onAIResponse,
    onWebhookReceived,
    onError,
  } = options;

  const unsubscribersRef = useRef<Array<() => void>>([]);

  const connect = useCallback(() => {
    if (!microserviceApi.isConfigured()) {
      console.warn('Microservice not configured, skipping SSE connection');
      return;
    }

    microserviceApi.connectToEvents(userId);

    // Subscribe to events
    if (onMessageReceived) {
      const unsub = microserviceApi.on<MessageReceivedEvent>('message_received', (event) => {
        onMessageReceived(event.data as MessageReceivedEvent);
      });
      unsubscribersRef.current.push(unsub);
    }

    if (onAIResponse) {
      const unsub = microserviceApi.on('ai_response', (event: SSEEvent) => {
        onAIResponse(event.data as string);
      });
      unsubscribersRef.current.push(unsub);
    }

    if (onWebhookReceived) {
      const unsub = microserviceApi.on('webhook_received', (event: SSEEvent) => {
        onWebhookReceived(event.data);
      });
      unsubscribersRef.current.push(unsub);
    }

    if (onError) {
      const unsub = microserviceApi.on('error', (event: SSEEvent) => {
        onError(event.data);
      });
      unsubscribersRef.current.push(unsub);
    }
  }, [userId, onMessageReceived, onAIResponse, onWebhookReceived, onError]);

  const disconnect = useCallback(() => {
    unsubscribersRef.current.forEach((unsub) => unsub());
    unsubscribersRef.current = [];
    microserviceApi.disconnectFromEvents();
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    connect,
    disconnect,
    isConnected: microserviceApi.isConnected(),
    isConfigured: microserviceApi.isConfigured(),
  };
}

// Hook for AI streaming
interface UseAIStreamOptions {
  onToken?: (token: string) => void;
  onComplete?: (response: string, tokensUsed: number) => void;
  onError?: (error: Error) => void;
}

export function useAIStream() {
  const abortRef = useRef<(() => void) | null>(null);

  const startStream = useCallback(
    (
      params: {
        flowId: string;
        nodeId: string;
        conversationId: string;
        userMessage: string;
        conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
      },
      callbacks: UseAIStreamOptions
    ) => {
      // Cancel any existing stream
      if (abortRef.current) {
        abortRef.current();
      }

      abortRef.current = microserviceApi.processAIStream(params, {
        onToken: callbacks.onToken,
        onComplete: callbacks.onComplete,
        onError: callbacks.onError,
      });
    },
    []
  );

  const cancelStream = useCallback(() => {
    if (abortRef.current) {
      abortRef.current();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelStream();
    };
  }, [cancelStream]);

  return {
    startStream,
    cancelStream,
  };
}
