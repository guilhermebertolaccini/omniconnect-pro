export type Example = string;

export type {
  BotifyHandoffEventType,
  BotifyHandoffWebhookData,
  BotifyHandoffWebhookPayload,
  BotifyLeadSummary,
} from './botify-bridge';

export {
  BOTIFY_FLOW_GRAPH_SCHEMA_VERSION,
  normalizeBotifyFlowConnections,
} from './botify-flow-graph';
export type {
  BotifyAiNodePersistedConfig,
  BotifyFlowGraph,
  BotifyFlowGraphSchemaVersion,
  BotifyFlowNode,
  BotifyFlowNodeType,
  BotifyFlowNormalizedConnection,
  BotifyFlowStoredConnection,
} from './botify-flow-graph';
