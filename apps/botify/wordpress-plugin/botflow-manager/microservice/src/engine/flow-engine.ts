import { logger } from '../utils/logger.js';
import { WordPressClient } from '../services/wordpress-client.js';
import { AIProcessor } from '../services/ai-processor.js';
import { SSEManager } from '../realtime/sse-manager.js';
import {
    emitBotifyHandoffToOmniconnect,
    type BotifyLeadSummary,
} from '../services/omniconnect-bridge.js';
import { resolveNextNodeId } from './flow-engine-navigation.js';
import { wpMessagesToAiHistory } from './flow-engine-history.js';

export interface ProcessMessageArgs {
    botId: string;
    from: string;
    text: string;
    provider: 'meta' | 'evolution';
    messageId: string;
    flowId?: string;
}

export class FlowEngine {
    private wpClient: WordPressClient;
    private aiProcessor: AIProcessor;
    private sseManager: SSEManager;

    constructor() {
        this.wpClient = new WordPressClient();
        this.aiProcessor = new AIProcessor();
        this.sseManager = SSEManager.getInstance();
    }

    /**
     * Main entry point for processing a message from the queue
     */
    async processIncomingMessage(args: ProcessMessageArgs): Promise<void> {
        const { botId, from, text, provider, flowId } = args;

        // Resolve Conversation ID
        const normalizedPhone = from.replace('@s.whatsapp.net', '').replace(/\D/g, '');
        const conversationId = await this.wpClient.resolveConversation(
            botId,
            normalizedPhone || from
        );

        if (!conversationId) {
            logger.error(`Unable to resolve conversation for bot ${botId} and contact ${from}`);
            return;
        }
        
        // Always save incoming message first (ensures all messages are recorded regardless of flow type)
        await this.wpClient.saveMessage({
            botId,
            conversationId,
            role: 'user',
            content: text,
            metadata: { from: normalizedPhone || from, provider },
        });
        let targetFlowId = flowId;

        // If flowId was not provided, we need to check if there is an active flow for this user
        // or trigger word matching (to be implemented via cache/WP API call later)
        if (!targetFlowId) {
            logger.warn(`No specific flowId provided for conversation ${conversationId}, looking for active trigger.`);
            // TODO: Implement mechanism to detect which flow to run or resume
            return;
        }

        // Get Flow Configuration
        const flow = await this.wpClient.getFlowConfig(targetFlowId);
        if (!flow || !flow.nodes) {
            logger.error(`Flow ${targetFlowId} not found or has no nodes.`);
            return;
        }

        const startNode = this.findEntryNode(flow.nodes);

        if (!startNode) {
            logger.error(`Could not find entry point for flow ${targetFlowId}`);
            return;
        }

        // Begin iterative execution of nodes
        await this.executeNodeHierarchy(startNode, flow.nodes, {
            botId,
            conversationId,
            from: normalizedPhone || from,
            text,
            provider,
            flowId: targetFlowId
        });
    }

    /**
     * Traverse the nodes graph iteratively
     */
    private async executeNodeHierarchy(startNode: any, allNodes: any[], context: any): Promise<void> {
        let currentNode: any = startNode;

        while (currentNode) {
            logger.info(`Executing node type [${currentNode.type}] ID: ${currentNode.id}`);

            try {
                await this.executeSingleNode(currentNode, context);
            } catch (err) {
                logger.error(`Error executing node ${currentNode.id}:`, err);
                // Stop execution on error
                break;
            }

            const nextNodeId = resolveNextNodeId(currentNode, context);
            if (!nextNodeId) {
                logger.info('Node has no connections. Flow execution ended.');
                break;
            }

            currentNode = allNodes.find(n => n.id === nextNodeId);

            if (!currentNode) {
                logger.error(`Next node not found: ${nextNodeId}`);
                break;
            }
        }
    }

    /**
     * Executes logic for a singular node (Text, AI, Delay, etc...)
     */
    private async executeSingleNode(node: any, context: any): Promise<void> {
        const { botId, conversationId, from, provider, flowId, text } = context;
        const type = node.type;
        const data = node.data || {};

        switch (type) {
            case 'start':
                // start node is dummy node
                break;

            case 'message':
                // Output normal text message
                if (data.content) {
                    await this.wpClient.sendWhatsAppMessage({
                        botId,
                        conversationId,
                        message: data.content
                    });
                }
                break;

            case 'delay':
                // Add sleep mechanism
                const delayMs = parseInt(data.delayMs || 1000, 10);
                logger.info(`Waiting for ${delayMs}ms before continuing...`);
                await new Promise(res => setTimeout(res, delayMs));
                break;

            case 'ai':
                // Trigger AI processing
                await this.processAINode(node, context);
                break;

            case 'condition':
                // Branching is handled in resolveNextNodeId (yes/no handles).
                break;

            case 'buttons':
            case 'list':
            case 'media':
                logger.warn(
                    `Node type '${type}' is not supported in the microservice engine yet; configure with texto/mensagem or desative o nó no editor.`,
                );
                break;

            case 'action': {
                const actionType = data.actionType as string | undefined;
                if (actionType === 'transfer') {
                    const merged = this.mergeActionNodeConfig(node);
                    const message =
                        typeof merged.message === 'string' && merged.message.trim()
                            ? String(merged.message).trim()
                            : 'Handoff solicitado pelo Botify';
                    const name =
                        typeof merged.contactName === 'string' && merged.contactName.trim()
                            ? String(merged.contactName).trim()
                            : undefined;
                    const segment =
                        typeof merged.segment === 'number'
                            ? merged.segment
                            : typeof merged.segment === 'string' && /^\d+$/.test(merged.segment)
                              ? parseInt(String(merged.segment), 10)
                              : undefined;
                    const flowKey =
                        typeof context.flowId === 'string' && context.flowId.trim()
                            ? context.flowId.trim()
                            : 'unknown';
                    const externalId = `botify:flow:${flowKey}:conv:${conversationId}:transfer`;
                    const leadSummary = buildHandoffLeadSummary(merged, context);
                    await emitBotifyHandoffToOmniconnect({
                        phone: from,
                        name,
                        message,
                        segment,
                        externalId,
                        ...(leadSummary ? { leadSummary } : {}),
                    });
                } else {
                    logger.debug(`Action node '${actionType}' has no server-side handler yet.`);
                }
                break;
            }

            default:
                logger.warn(`Unknown node type: ${type}`);
                break;
        }
    }

    private async processAINode(aiNode: any, context: any): Promise<void> {
        const { flowId, botId, from, conversationId, text, provider } = context;

        const aiConfig = await this.wpClient.getAINodeConfig(flowId, aiNode.id);

        if (!aiConfig) {
            throw new Error(`AI config not found for node ${aiNode.id}`);
        }

        this.sseManager.broadcast('ai:processing_started', {
            conversationId,
            flowId,
            nodeId: aiNode.id,
        });

        try {
            const wpRows = await this.wpClient.listConversationMessages(conversationId, 50);
            const conversationHistory = wpMessagesToAiHistory(wpRows, text);

            const result = await this.aiProcessor.process({
                flowId,
                nodeId: aiNode.id,
                conversationId,
                userMessage: text,
                conversationHistory,
                variables: { user_phone: from },
                config: {
                    provider: aiConfig.provider || 'lovable',
                    model: aiConfig.model,
                    systemPrompt: aiConfig.system_prompt,
                    userPromptTemplate: aiConfig.user_prompt_template || '{{user_message}}',
                    temperature: aiConfig.temperature || 0.7,
                    maxTokens: aiConfig.max_tokens || 500,
                },
            });

            // Save assistant response (user message already saved at processIncomingMessage start)
            await this.wpClient.saveMessage({
                botId,
                conversationId,
                role: 'assistant',
                content: result.response,
                metadata: {
                    provider: result.provider,
                    model: result.model,
                    tokensUsed: result.tokensUsed,
                },
            });

            // Send the AI response generated
            await this.wpClient.sendWhatsAppMessage({
                botId,
                conversationId,
                message: result.response,
            });

            context.lastAssistantReply = result.response;

            this.sseManager.broadcast('ai:processing_completed', {
                conversationId,
                flowId,
                nodeId: aiNode.id,
                response: result.response,
            });

        } catch (error) {
            logger.error('AI processing failed:', error);
            this.sseManager.broadcast('ai:processing_error', {
                conversationId,
                flowId,
                nodeId: aiNode.id,
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw error; // Re-throw to Halt execution graph
        }
    }

    /**
     * Flatten `node.data` with optional nested `config` (WordPress / editor).
     */
    private mergeActionNodeConfig(node: any): Record<string, unknown> {
        const raw = node?.data && typeof node.data === 'object' ? node.data : {};
        const cfg =
            raw &&
            typeof (raw as { config?: unknown }).config === 'object' &&
            (raw as { config?: unknown }).config !== null &&
            !Array.isArray((raw as { config?: unknown }).config)
                ? ((raw as { config: Record<string, unknown> }).config as Record<string, unknown>)
                : {};
        return { ...(raw as Record<string, unknown>), ...cfg };
    }

    private findEntryNode(nodes: any[]): any {
        // Look for 'start' node first
        let entryNode = nodes.find(n => n.type === 'start');
        if (entryNode) {
            // Find the node connected TO start
            if (entryNode.connections && entryNode.connections.length > 0) {
                return nodes.find(n => n.id === entryNode.connections[0]);
            }
        }

        // Fallback logic, node without incoming connects
        const targetIds = new Set(nodes.flatMap(n => n.connections || []));
        for (const node of nodes) {
            if (!targetIds.has(node.id)) {
                return node;
            }
        }

        return nodes[0];
    }
}

function buildHandoffLeadSummary(
    merged: Record<string, unknown>,
    context: { flowId?: string; text?: string; lastAssistantReply?: string },
): BotifyLeadSummary | undefined {
    const pick = (key: string, max: number): string | undefined => {
        const v = merged[key];
        if (typeof v !== 'string') return undefined;
        const t = v.trim();
        if (!t) return undefined;
        return t.length > max ? `${t.slice(0, max - 1)}…` : t;
    };
    const summary: BotifyLeadSummary = {};
    const intent = pick('intent', 80);
    if (intent) summary.intent = intent;
    const urgency = pick('urgency', 32);
    if (urgency) summary.urgency = urgency;
    const budget = pick('budget', 120);
    if (budget) summary.budget = budget;
    const region = pick('region', 120);
    if (region) summary.region = region;
    const propertyInterest = pick('propertyInterest', 255);
    if (propertyInterest) summary.propertyInterest = propertyInterest;
    const notes = pick('notes', 500);
    if (notes) summary.notes = notes;
    const flowName = pick('flowName', 120);
    if (flowName) summary.flowName = flowName;

    if (context.flowId?.trim()) {
        summary.flowId = context.flowId.trim().slice(0, 120);
    }
    if (context.text?.trim()) {
        const t = context.text.trim();
        summary.lastUserMessage = t.length > 600 ? `${t.slice(0, 599)}…` : t;
    }
    if (context.lastAssistantReply?.trim()) {
        const t = context.lastAssistantReply.trim();
        summary.lastAssistantReply = t.length > 600 ? `${t.slice(0, 599)}…` : t;
    }
    return Object.keys(summary).length ? summary : undefined;
}
