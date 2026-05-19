<?php
/**
 * Webhook Handler for WhatsApp (Meta & Evolution)
 * Security enhanced with mandatory signature verification
 */

if (!defined('ABSPATH')) {
    exit;
}

class BotFlow_Webhook
{

    private $whatsapp;
    private $encryption;

    public function __construct()
    {
        $this->whatsapp = new BotFlow_WhatsApp();
        $this->encryption = new BotFlow_Encryption();
    }

    /**
     * Initialize webhook
     */
    public function init()
    {
        add_action('rest_api_init', [$this, 'register_webhooks']);
    }

    /**
     * Register webhook endpoints
     */
    public function register_webhooks()
    {
        // Meta WhatsApp webhook (per bot)
        register_rest_route('botflow/v1', '/webhook/(?P<bot_id>\d+)', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'verify_meta_webhook'],
                'permission_callback' => '__return_true',
            ],
            [
                'methods' => 'POST',
                'callback' => [$this, 'handle_meta_webhook'],
                'permission_callback' => '__return_true',
            ],
        ]);

        // Meta webhook for accounts (centralized)
        register_rest_route('botflow/v1', '/webhook/meta', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'verify_meta_account_webhook'],
                'permission_callback' => '__return_true',
            ],
            [
                'methods' => 'POST',
                'callback' => [$this, 'handle_meta_account_webhook'],
                'permission_callback' => '__return_true',
            ],
        ]);

        // Evolution API webhook
        register_rest_route('botflow/v1', '/webhook/evolution/(?P<bot_id>\d+)', [
            'methods' => 'POST',
            'callback' => [$this, 'handle_evolution_webhook'],
            'permission_callback' => '__return_true',
        ]);
    }

    /**
     * Verify Meta webhook (challenge from Meta)
     */
    public function verify_meta_webhook($request)
    {
        $bot_id = (int)$request->get_param('bot_id');
        $mode = $request->get_param('hub_mode');
        $token = $request->get_param('hub_verify_token');
        $challenge = $request->get_param('hub_challenge');

        // Get webhook secret for this bot
        global $wpdb;
        $config = $wpdb->get_row($wpdb->prepare(
            "SELECT webhook_secret FROM {$wpdb->prefix}botflow_whatsapp_config WHERE bot_id = %d",
            $bot_id
        ));

        if ($mode === 'subscribe' && $config && hash_equals($config->webhook_secret, $token)) {
            // Return challenge as plain text
            header('Content-Type: text/plain');
            echo intval($challenge);
            exit;
        }

        $this->log_webhook_error('meta', $bot_id, 'verification_failed', 'Webhook verification failed');

        return new WP_Error(
            'verification_failed',
            __('Webhook verification failed', 'botflow-manager'),
        ['status' => 403]
            );
    }

    /**
     * Verify Meta account webhook
     */
    public function verify_meta_account_webhook($request)
    {
        $mode = $request->get_param('hub_mode');
        $token = $request->get_param('hub_verify_token');
        $challenge = $request->get_param('hub_challenge');

        global $wpdb;

        // Find account by verify token
        $account = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}botflow_meta_accounts WHERE webhook_verify_token = %s AND is_active = 1",
            $token
        ));

        if ($mode === 'subscribe' && $account) {
            header('Content-Type: text/plain');
            echo intval($challenge);
            exit;
        }

        return new WP_Error(
            'verification_failed',
            __('Webhook verification failed', 'botflow-manager'),
        ['status' => 403]
            );
    }

    /**
     * Handle incoming Meta webhook
     */
    public function handle_meta_webhook($request)
    {
        $start_time = microtime(true);
        $bot_id = (int)$request->get_param('bot_id');
        $body = $request->get_json_params();

        // SECURITY: Validate webhook signature (MANDATORY)
        $signature = $request->get_header('X-Hub-Signature-256');
        if (!$this->verify_meta_signature($bot_id, $request->get_body(), $signature)) {
            $this->log_webhook_error('meta', $bot_id, 'invalid_signature', 'Invalid webhook signature');
            return new WP_Error(
                'invalid_signature',
                __('Invalid webhook signature', 'botflow-manager'),
            ['status' => 401]
                );
        }

        // Log webhook
        $log_id = $this->log_meta_webhook($bot_id, $body);

        // Process webhook
        try {
            if (isset($body['entry'])) {
                foreach ($body['entry'] as $entry) {
                    if (isset($entry['changes'])) {
                        foreach ($entry['changes'] as $change) {
                            $this->process_meta_change($bot_id, $change);
                        }
                    }
                }
            }

            $this->update_webhook_log($log_id, 'processed', null, $start_time);
        }
        catch (Exception $e) {
            $this->update_webhook_log($log_id, 'failed', $e->getMessage(), $start_time);
            error_log('BotFlow Webhook Error: ' . $e->getMessage());
        }

        // Always return 200 to acknowledge receipt
        return rest_ensure_response(['success' => true]);
    }

    /**
     * Handle Meta account webhook (centralized)
     */
    public function handle_meta_account_webhook($request)
    {
        $start_time = microtime(true);
        $body = $request->get_json_params();

        // Extract account info from payload
        $account_id = null;
        $waba_id = null;
        $phone_number_id = null;

        if (isset($body['entry'][0])) {
            $entry = $body['entry'][0];
            $account_id = $entry['id'] ?? null;

            if (isset($entry['changes'][0]['value'])) {
                $value = $entry['changes'][0]['value'];
                $waba_id = $value['metadata']['display_phone_number'] ?? null;
                $phone_number_id = $value['metadata']['phone_number_id'] ?? null;
            }
        }

        // Log webhook
        $log_id = $this->log_meta_account_webhook($account_id, $waba_id, $phone_number_id, $body);

        try {
            // Find associated bot by phone_number_id
            if ($phone_number_id) {
                global $wpdb;
                $config = $wpdb->get_row($wpdb->prepare(
                    "SELECT bot_id FROM {$wpdb->prefix}botflow_whatsapp_config WHERE phone_number_id = %s",
                    $phone_number_id
                ));

                if ($config) {
                    // Signature verification
                    $signature = $request->get_header('X-Hub-Signature-256');
                    if (!$this->verify_meta_signature($config->bot_id, $request->get_body(), $signature)) {
                        $this->update_webhook_log($log_id, 'failed', 'Invalid signature', $start_time);
                        return new WP_Error('invalid_signature', 'Invalid signature', ['status' => 401]);
                    }

                    // Process changes
                    if (isset($body['entry'])) {
                        foreach ($body['entry'] as $entry) {
                            if (isset($entry['changes'])) {
                                foreach ($entry['changes'] as $change) {
                                    $this->process_meta_change($config->bot_id, $change);
                                }
                            }
                        }
                    }
                }
            }

            $this->update_webhook_log($log_id, 'processed', null, $start_time);
        }
        catch (Exception $e) {
            $this->update_webhook_log($log_id, 'failed', $e->getMessage(), $start_time);
        }

        return rest_ensure_response(['success' => true]);
    }

    /**
     * Handle Evolution API webhook
     */
    public function handle_evolution_webhook($request)
    {
        $start_time = microtime(true);
        $bot_id = (int)$request->get_param('bot_id');
        $body = $request->get_json_params();

        // Verify API key header
        $api_key = $request->get_header('apikey');
        if (!$this->verify_evolution_api_key($bot_id, $api_key)) {
            $this->log_evolution_webhook($bot_id, $body, 'failed', 'Invalid API key');
            return new WP_Error(
                'invalid_api_key',
                __('Invalid API key', 'botflow-manager'),
            ['status' => 401]
                );
        }

        // Log webhook
        $log_id = $this->log_evolution_webhook($bot_id, $body);

        try {
            $event = $body['event'] ?? '';

            switch ($event) {
                case 'messages.upsert':
                    $this->process_evolution_message($bot_id, $body['data'] ?? []);
                    break;

                case 'messages.update':
                    $this->process_evolution_status($body['data'] ?? []);
                    break;

                case 'connection.update':
                    $this->process_evolution_connection($bot_id, $body['data'] ?? []);
                    break;

                case 'qrcode.updated':
                    $this->process_evolution_qrcode($bot_id, $body['data'] ?? []);
                    break;
            }

            $this->update_evolution_log($log_id, 'processed', null, $start_time);
        }
        catch (Exception $e) {
            $this->update_evolution_log($log_id, 'failed', $e->getMessage(), $start_time);
        }

        return rest_ensure_response(['success' => true]);
    }

    /**
     * Verify Meta webhook signature (MANDATORY - no bypass)
     */
    private function verify_meta_signature($bot_id, $payload, $signature)
    {
        if (empty($signature)) {
            return false; // Signature is REQUIRED
        }

        global $wpdb;
        $config = $wpdb->get_row($wpdb->prepare(
            "SELECT webhook_secret FROM {$wpdb->prefix}botflow_whatsapp_config WHERE bot_id = %d",
            $bot_id
        ));

        if (!$config || empty($config->webhook_secret)) {
            return false; // Secret must be configured
        }

        $expected = 'sha256=' . hash_hmac('sha256', $payload, $config->webhook_secret);

        return hash_equals($expected, $signature);
    }

    /**
     * Verify Evolution API key
     */
    private function verify_evolution_api_key($bot_id, $api_key)
    {
        if (empty($api_key)) {
            return false;
        }

        global $wpdb;
        $config = $wpdb->get_row($wpdb->prepare(
            "SELECT api_key_encrypted FROM {$wpdb->prefix}botflow_evolution_config WHERE bot_id = %d",
            $bot_id
        ));

        if (!$config || empty($config->api_key_encrypted)) {
            return false;
        }

        $stored_key = $this->encryption->decrypt($config->api_key_encrypted);

        return hash_equals($stored_key, $api_key);
    }

    /**
     * Process Meta webhook change
     */
    private function process_meta_change($bot_id, $change)
    {
        if ($change['field'] !== 'messages') {
            return;
        }

        $value = $change['value'];

        // Handle incoming messages
        if (isset($value['messages'])) {
            foreach ($value['messages'] as $message) {
                $this->process_incoming_message($bot_id, $message, $value['contacts'][0] ?? null);
            }
        }

        // Handle message status updates
        if (isset($value['statuses'])) {
            foreach ($value['statuses'] as $status) {
                $this->process_status_update($status);
            }
        }
    }

    /**
     * Process incoming message
     */
    private function process_incoming_message($bot_id, $message, $contact)
    {
        global $wpdb;

        $sender_phone = sanitize_text_field($message['from']);
        $sender_name = sanitize_text_field($contact['profile']['name'] ?? $sender_phone);
        $message_id = sanitize_text_field($message['id']);
        $timestamp = date('Y-m-d H:i:s', $message['timestamp']);

        // Get or create conversation
        $conversation = $this->whatsapp->get_or_create_conversation($bot_id, $sender_phone, $sender_name);

        // Parse message content based on type
        $content = '';
        $message_type = $message['type'];
        $media_url = null;

        switch ($message_type) {
            case 'text':
                $content = sanitize_textarea_field($message['text']['body']);
                break;

            case 'image':
                $content = sanitize_text_field($message['image']['caption'] ?? '[Imagem]');
                $media_url = $message['image']['id'];
                break;

            case 'document':
                $content = sanitize_text_field($message['document']['caption'] ?? '[Documento]');
                $media_url = $message['document']['id'];
                break;

            case 'audio':
                $content = '[Áudio]';
                $media_url = $message['audio']['id'];
                break;

            case 'video':
                $content = sanitize_text_field($message['video']['caption'] ?? '[Vídeo]');
                $media_url = $message['video']['id'];
                break;

            case 'location':
                $lat = floatval($message['location']['latitude']);
                $lng = floatval($message['location']['longitude']);
                $content = "[Localização: {$lat}, {$lng}]";
                break;

            case 'contacts':
                $content = '[Contato compartilhado]';
                break;

            case 'sticker':
                $content = '[Sticker]';
                $media_url = $message['sticker']['id'] ?? null;
                break;

            case 'button':
                $content = sanitize_text_field($message['button']['text']);
                break;

            case 'interactive':
                if (isset($message['interactive']['button_reply'])) {
                    $content = sanitize_text_field($message['interactive']['button_reply']['title']);
                }
                elseif (isset($message['interactive']['list_reply'])) {
                    $content = sanitize_text_field($message['interactive']['list_reply']['title']);
                }
                break;

            default:
                $content = '[Mensagem não suportada]';
        }

        // Store message
        $stored_message_id = $this->whatsapp->store_message(
            $bot_id,
            $conversation->id,
            'incoming',
            $content,
            $sender_name,
            $sender_phone,
            'read',
            $message_id,
            $message_type,
            $media_url
        );

        // Update conversation
        $wpdb->update(
            $wpdb->prefix . 'botflow_conversations',
        [
            'last_message' => $content,
            'last_message_time' => $timestamp,
            'unread_count' => $conversation->unread_count + 1,
            'contact_name' => $sender_name,
        ],
        ['id' => $conversation->id]
        );

        // Update bot stats
        $this->whatsapp->update_bot_stats($bot_id, 1, 0);

        // Trigger flow matching
        $this->trigger_flow($bot_id, $conversation->id, $content, $sender_phone, $stored_message_id);

        // Fire action for extensibility
        do_action('botflow_message_received', $bot_id, $conversation->id, $message, $stored_message_id);
    }

    /**
     * Process message status update
     */
    private function process_status_update($status)
    {
        global $wpdb;

        $message_id = sanitize_text_field($status['id']);
        $new_status = sanitize_text_field($status['status']); // sent, delivered, read, failed

        $wpdb->update(
            $wpdb->prefix . 'botflow_messages',
        ['status' => $new_status],
        ['whatsapp_message_id' => $message_id]
        );

        do_action('botflow_message_status_updated', $message_id, $new_status);
    }

    /**
     * Process Evolution message
     */
    private function process_evolution_message($bot_id, $data)
    {
        global $wpdb;

        if (!isset($data['key']) || !isset($data['message'])) {
            return;
        }

        $key = $data['key'];
        $message = $data['message'];

        // Skip outgoing messages
        if ($key['fromMe'] ?? false) {
            return;
        }

        $sender_phone = sanitize_text_field(str_replace('@s.whatsapp.net', '', $key['remoteJid'] ?? ''));
        $sender_name = sanitize_text_field($data['pushName'] ?? $sender_phone);
        $message_id = sanitize_text_field($key['id'] ?? '');

        // Get or create conversation
        $conversation = $this->whatsapp->get_or_create_conversation($bot_id, $sender_phone, $sender_name);

        // Parse message content
        $content = '';
        $message_type = 'text';
        $media_url = null;

        if (isset($message['conversation'])) {
            $content = sanitize_textarea_field($message['conversation']);
        }
        elseif (isset($message['extendedTextMessage'])) {
            $content = sanitize_textarea_field($message['extendedTextMessage']['text']);
        }
        elseif (isset($message['imageMessage'])) {
            $content = sanitize_text_field($message['imageMessage']['caption'] ?? '[Imagem]');
            $message_type = 'image';
        }
        elseif (isset($message['documentMessage'])) {
            $content = sanitize_text_field($message['documentMessage']['fileName'] ?? '[Documento]');
            $message_type = 'document';
        }
        elseif (isset($message['audioMessage'])) {
            $content = '[Áudio]';
            $message_type = 'audio';
        }
        elseif (isset($message['videoMessage'])) {
            $content = sanitize_text_field($message['videoMessage']['caption'] ?? '[Vídeo]');
            $message_type = 'video';
        }
        elseif (isset($message['stickerMessage'])) {
            $content = '[Sticker]';
            $message_type = 'sticker';
        }
        elseif (isset($message['buttonResponseMessage'])) {
            $content = sanitize_text_field($message['buttonResponseMessage']['selectedDisplayText'] ?? '');
        }
        elseif (isset($message['listResponseMessage'])) {
            $content = sanitize_text_field($message['listResponseMessage']['title'] ?? '');
        }

        // Store message
        $stored_message_id = $this->whatsapp->store_message(
            $bot_id,
            $conversation->id,
            'incoming',
            $content,
            $sender_name,
            $sender_phone,
            'read',
            $message_id,
            $message_type,
            $media_url
        );

        // Update conversation
        $wpdb->update(
            $wpdb->prefix . 'botflow_conversations',
        [
            'last_message' => $content,
            'last_message_time' => current_time('mysql'),
            'unread_count' => $conversation->unread_count + 1,
            'contact_name' => $sender_name,
        ],
        ['id' => $conversation->id]
        );

        // Update bot stats
        $this->whatsapp->update_bot_stats($bot_id, 1, 0);

        // Trigger flow
        $this->trigger_flow($bot_id, $conversation->id, $content, $sender_phone, $stored_message_id);

        do_action('botflow_evolution_message_received', $bot_id, $conversation->id, $data, $stored_message_id);
    }

    /**
     * Process Evolution status update
     */
    private function process_evolution_status($data)
    {
        global $wpdb;

        if (!isset($data['key']['id']) || !isset($data['status'])) {
            return;
        }

        $message_id = sanitize_text_field($data['key']['id']);
        $status_map = [
            'PENDING' => 'pending',
            'SERVER_ACK' => 'sent',
            'DELIVERY_ACK' => 'delivered',
            'READ' => 'read',
            'PLAYED' => 'read',
            'ERROR' => 'failed',
        ];

        $status = $status_map[$data['status']] ?? 'sent';

        $wpdb->update(
            $wpdb->prefix . 'botflow_messages',
        ['status' => $status],
        ['whatsapp_message_id' => $message_id]
        );
    }

    /**
     * Process Evolution connection update
     */
    private function process_evolution_connection($bot_id, $data)
    {
        global $wpdb;

        $state = $data['state'] ?? '';

        $status_map = [
            'open' => 'connected',
            'close' => 'disconnected',
            'connecting' => 'connecting',
        ];

        $connection_status = $status_map[$state] ?? 'disconnected';

        $wpdb->update(
            $wpdb->prefix . 'botflow_evolution_config',
        ['connection_status' => $connection_status],
        ['bot_id' => $bot_id]
        );

        // Update bot status
        $bot_status = $connection_status === 'connected' ? 'online' : 'offline';
        $line_health = $connection_status === 'connected' ? 'healthy' : 'disconnected';

        $wpdb->update(
            $wpdb->prefix . 'botflow_bots',
        [
            'status' => $bot_status,
            'line_health' => $line_health,
        ],
        ['id' => $bot_id]
        );
    }

    /**
     * Process Evolution QR code update
     */
    private function process_evolution_qrcode($bot_id, $data)
    {
        global $wpdb;

        $qr_code = $data['qrcode'] ?? null;

        if ($qr_code) {
            $wpdb->update(
                $wpdb->prefix . 'botflow_evolution_config',
            ['qr_code' => $qr_code],
            ['bot_id' => $bot_id]
            );
        }
    }

    /**
     * Trigger flow based on message content
     */
    private function trigger_flow($bot_id, $conversation_id, $content, $sender_phone, $message_id = null)
    {
        global $wpdb;

        // Get active flows for this bot
        $flows = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}botflow_flows 
             WHERE bot_id = %d AND is_active = 1",
            $bot_id
        ));

        $content_lower = strtolower(trim($content));

        foreach ($flows as $flow) {
            if (empty($flow->trigger_keyword)) {
                continue;
            }

            // Check if message matches any trigger keyword
            $keywords = array_map('trim', explode('|', strtolower($flow->trigger_keyword)));

            foreach ($keywords as $keyword) {
                if (strpos($content_lower, $keyword) !== false || preg_match('/^' . preg_quote($keyword, '/') . '$/i', $content_lower)) {
                    // Match found! Node.js handles the flow now.
                    // $this->execute_flow($bot_id, $conversation_id, $flow, $content, $message_id);
                    return; // Only execute first matching flow
                }
            }
        }
    }

    /**
     * Legacy execute_flow method removed.
     * The node execution is now fully handled by the Node.js Microservice (FlowEngine).
     */
    private function execute_flow($bot_id, $conversation_id, $flow, $trigger_message, $message_id = null)
    {
        // This function is kept empty as a stub if other parts of the system try to call it.
        error_log('BotFlow: execution transferred to Node.js microservice.');
    }

    /**
     * Execute a single flow node
     */
    private function execute_node($bot_id, $conversation_id, $node, $context, $user_id)
    {
        $node_type = $node['type'] ?? '';
        $data = $node['data'] ?? [];

        switch ($node_type) {
            case 'message':
                $content = $data['content'] ?? '';
                if ($content) {
                    $this->whatsapp->send_message($bot_id, $conversation_id, $content, $user_id);
                }
                return true;

            case 'delay':
                $delay_ms = intval($data['delayMs'] ?? 1000);
                $delay_ms = min($delay_ms, 30000); // Max 30 seconds
                usleep($delay_ms * 1000);
                return true;

            case 'condition':
                // TODO: Implement condition evaluation
                return true;

            case 'action':
                do_action('botflow_execute_action', $data, $bot_id, $conversation_id, $context);
                return true;

            case 'buttons':
                $this->send_buttons_message($bot_id, $conversation_id, $data, $user_id);
                return true;

            case 'list':
                $this->send_list_message($bot_id, $conversation_id, $data, $user_id);
                return true;

            case 'media':
                $this->send_media_message($bot_id, $conversation_id, $data, $user_id);
                return true;

            case 'ai':
                $this->queue_ai_processing($context['flow_id'], $node['id'], $conversation_id, $context['message_id']);
                return true;

            default:
                return false;
        }
    }

    /**
     * Send buttons message
     */
    private function send_buttons_message($bot_id, $conversation_id, $data, $user_id)
    {
        // TODO: Implement buttons via WhatsApp Cloud API
        $body = $data['body'] ?? '';
        $buttons = $data['buttons'] ?? [];

        $content = $body . "\n\n";
        foreach ($buttons as $i => $button) {
            $content .= ($i + 1) . ". " . ($button['text'] ?? '') . "\n";
        }

        $this->whatsapp->send_message($bot_id, $conversation_id, trim($content), $user_id);
    }

    /**
     * Send list message
     */
    private function send_list_message($bot_id, $conversation_id, $data, $user_id)
    {
        // TODO: Implement list via WhatsApp Cloud API
        $body = $data['body'] ?? '';
        $sections = $data['sections'] ?? [];

        $content = $body . "\n\n";
        foreach ($sections as $section) {
            $content .= "📋 " . ($section['title'] ?? '') . "\n";
            foreach ($section['rows'] ?? [] as $row) {
                $content .= "  • " . ($row['title'] ?? '') . "\n";
            }
        }

        $this->whatsapp->send_message($bot_id, $conversation_id, trim($content), $user_id);
    }

    /**
     * Send media message
     */
    private function send_media_message($bot_id, $conversation_id, $data, $user_id)
    {
        // TODO: Implement media via WhatsApp Cloud API
        $media_type = $data['mediaType'] ?? 'image';
        $media_url = $data['mediaUrl'] ?? '';
        $caption = $data['caption'] ?? '';

        $content = "[{$media_type}] " . ($caption ?: $media_url);
        $this->whatsapp->send_message($bot_id, $conversation_id, $content, $user_id);
    }

    /**
     * Queue AI processing
     */
    private function queue_ai_processing($flow_id, $node_id, $conversation_id, $message_id)
    {
        global $wpdb;

        $wpdb->insert(
            $wpdb->prefix . 'botflow_ai_queue',
        [
            'flow_id' => $flow_id,
            'node_id' => $node_id,
            'conversation_id' => $conversation_id,
            'message_id' => $message_id,
            'status' => 'pending',
        ]
        );

        // Fire action for microservice to pick up
        do_action('botflow_ai_queue_added', $wpdb->insert_id);
    }

    /**
     * Find entry node in flow
     */
    private function find_entry_node($nodes)
    {
        // Look for 'start' type node first
        foreach ($nodes as $node) {
            if (($node['type'] ?? '') === 'start') {
                // Return the first connected node
                $connections = $node['connections'] ?? [];
                if (!empty($connections)) {
                    return $this->find_node_by_id($nodes, $connections[0]);
                }
            }
        }

        // Fallback: find node without incoming connections
        $target_ids = [];
        foreach ($nodes as $node) {
            if (!empty($node['connections'])) {
                $target_ids = array_merge($target_ids, $node['connections']);
            }
        }

        foreach ($nodes as $node) {
            if (!in_array($node['id'] ?? '', $target_ids)) {
                return $node;
            }
        }

        return $nodes[0] ?? null;
    }

    /**
     * Find node by ID
     */
    private function find_node_by_id($nodes, $id)
    {
        foreach ($nodes as $node) {
            if (($node['id'] ?? '') === $id) {
                return $node;
            }
        }
        return null;
    }

    // === Logging methods ===

    private function log_meta_webhook($bot_id, $payload)
    {
        global $wpdb;

        $event_type = 'unknown';
        if (isset($payload['entry'][0]['changes'][0]['field'])) {
            $event_type = $payload['entry'][0]['changes'][0]['field'];
        }

        $wpdb->insert($wpdb->prefix . 'botflow_meta_webhook_logs', [
            'account_id' => (string)$bot_id,
            'event_type' => $event_type,
            'payload' => json_encode($payload),
            'status' => 'received',
        ]);

        return $wpdb->insert_id;
    }

    private function log_meta_account_webhook($account_id, $waba_id, $phone_number_id, $payload)
    {
        global $wpdb;

        $event_type = 'unknown';
        if (isset($payload['entry'][0]['changes'][0]['field'])) {
            $event_type = $payload['entry'][0]['changes'][0]['field'];
        }

        $wpdb->insert($wpdb->prefix . 'botflow_meta_webhook_logs', [
            'account_id' => (string)$account_id,
            'waba_id' => $waba_id,
            'phone_number_id' => $phone_number_id,
            'event_type' => $event_type,
            'payload' => json_encode($payload),
            'status' => 'received',
        ]);

        return $wpdb->insert_id;
    }

    private function update_webhook_log($log_id, $status, $error, $start_time)
    {
        global $wpdb;

        $processing_time = intval((microtime(true) - $start_time) * 1000);

        $wpdb->update($wpdb->prefix . 'botflow_meta_webhook_logs', [
            'status' => $status,
            'error_message' => $error,
            'processing_time_ms' => $processing_time,
        ], ['id' => $log_id]);
    }

    private function log_evolution_webhook($bot_id, $payload, $status = 'received', $error = null)
    {
        global $wpdb;

        $event_type = $payload['event'] ?? 'unknown';
        $instance_name = $payload['instance'] ?? '';

        $wpdb->insert($wpdb->prefix . 'botflow_evolution_webhook_logs', [
            'instance_name' => $instance_name,
            'event_type' => $event_type,
            'payload' => json_encode($payload),
            'status' => $status,
            'error_message' => $error,
        ]);

        return $wpdb->insert_id;
    }

    private function update_evolution_log($log_id, $status, $error, $start_time)
    {
        global $wpdb;

        $processing_time = intval((microtime(true) - $start_time) * 1000);

        $wpdb->update($wpdb->prefix . 'botflow_evolution_webhook_logs', [
            'status' => $status,
            'error_message' => $error,
            'processing_time_ms' => $processing_time,
        ], ['id' => $log_id]);
    }

    private function log_webhook_error($type, $bot_id, $event_type, $error)
    {
        global $wpdb;

        $table = $type === 'evolution'
            ? $wpdb->prefix . 'botflow_evolution_webhook_logs'
            : $wpdb->prefix . 'botflow_meta_webhook_logs';

        $data = [
            'event_type' => $event_type,
            'payload' => '{}',
            'status' => 'failed',
            'error_message' => $error,
        ];

        if ($type === 'evolution') {
            $data['instance_name'] = (string)$bot_id;
        }
        else {
            $data['account_id'] = (string)$bot_id;
        }

        $wpdb->insert($table, $data);
    }
}