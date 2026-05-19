<?php
/**
 * WhatsApp Business API Integration
 */

if (!defined('ABSPATH')) {
    exit;
}

class BotFlow_WhatsApp {
    
    private $api_version;
    private $api_base_url = 'https://graph.facebook.com';
    
    public function __construct() {
        $this->api_version = get_option('botflow_whatsapp_api_version', 'v18.0');
    }
    
    /**
     * Send a text message via WhatsApp
     */
    public function send_message($bot_id, $conversation_id, $content, $user_id) {
        global $wpdb;
        
        // Get WhatsApp config
        $config = $this->get_config($bot_id, $user_id);
        
        if (is_wp_error($config)) {
            return $config;
        }
        
        if (!$config->is_connected) {
            return new WP_Error(
                'not_connected',
                __('WhatsApp is not configured for this bot', 'botflow-manager'),
                ['status' => 400]
            );
        }
        
        // Get conversation to get recipient phone
        $conversation = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}botflow_conversations WHERE id = %d",
            $conversation_id
        ));
        
        if (!$conversation) {
            return new WP_Error(
                'conversation_not_found',
                __('Conversation not found', 'botflow-manager'),
                ['status' => 404]
            );
        }
        
        // Send message via WhatsApp API
        $result = $this->send_text_message(
            $config->phone_number_id,
            $config->access_token,
            $conversation->contact_phone,
            $content
        );
        
        if (is_wp_error($result)) {
            // Store failed message
            $this->store_message($bot_id, $conversation_id, 'outgoing', $content, 'Bot', '', 'failed');
            return $result;
        }
        
        // Store sent message
        $message = $this->store_message(
            $bot_id,
            $conversation_id,
            'outgoing',
            $content,
            'Bot',
            '',
            'sent',
            $result['messages'][0]['id'] ?? null
        );
        
        // Update bot stats
        $this->update_bot_stats($bot_id, 0, 1);
        
        // Update conversation
        $wpdb->update(
            $wpdb->prefix . 'botflow_conversations',
            [
                'last_message' => $content,
                'last_message_time' => current_time('mysql'),
            ],
            ['id' => $conversation_id]
        );
        
        return $message;
    }
    
    /**
     * Send text message via WhatsApp Cloud API
     */
    private function send_text_message($phone_number_id, $access_token, $recipient, $text) {
        $url = "{$this->api_base_url}/{$this->api_version}/{$phone_number_id}/messages";
        
        // Clean phone number (remove + and spaces)
        $recipient = preg_replace('/[^0-9]/', '', $recipient);
        
        $body = [
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => $recipient,
            'type' => 'text',
            'text' => [
                'preview_url' => false,
                'body' => $text,
            ],
        ];
        
        $response = wp_remote_post($url, [
            'headers' => [
                'Authorization' => "Bearer {$access_token}",
                'Content-Type' => 'application/json',
            ],
            'body' => json_encode($body),
            'timeout' => 30,
        ]);
        
        if (is_wp_error($response)) {
            return new WP_Error(
                'api_error',
                $response->get_error_message(),
                ['status' => 500]
            );
        }
        
        $response_code = wp_remote_retrieve_response_code($response);
        $response_body = json_decode(wp_remote_retrieve_body($response), true);
        
        if ($response_code !== 200) {
            $error_message = $response_body['error']['message'] ?? 'Unknown error';
            return new WP_Error(
                'whatsapp_api_error',
                $error_message,
                ['status' => $response_code]
            );
        }
        
        return $response_body;
    }
    
    /**
     * Send template message
     */
    public function send_template_message($bot_id, $recipient, $template_name, $language_code, $components = [], $user_id) {
        $config = $this->get_config($bot_id, $user_id);
        
        if (is_wp_error($config) || !$config->is_connected) {
            return new WP_Error('not_connected', __('WhatsApp not configured', 'botflow-manager'), ['status' => 400]);
        }
        
        $url = "{$this->api_base_url}/{$this->api_version}/{$config->phone_number_id}/messages";
        
        $recipient = preg_replace('/[^0-9]/', '', $recipient);
        
        $body = [
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => $recipient,
            'type' => 'template',
            'template' => [
                'name' => $template_name,
                'language' => [
                    'code' => $language_code,
                ],
            ],
        ];
        
        if (!empty($components)) {
            $body['template']['components'] = $components;
        }
        
        $response = wp_remote_post($url, [
            'headers' => [
                'Authorization' => "Bearer {$config->access_token}",
                'Content-Type' => 'application/json',
            ],
            'body' => json_encode($body),
            'timeout' => 30,
        ]);
        
        if (is_wp_error($response)) {
            return $response;
        }
        
        return json_decode(wp_remote_retrieve_body($response), true);
    }
    
    /**
     * Send media message (image, document, video, audio)
     */
    public function send_media_message($bot_id, $conversation_id, $media_type, $media_url, $caption = '', $user_id) {
        global $wpdb;
        
        $config = $this->get_config($bot_id, $user_id);
        
        if (is_wp_error($config) || !$config->is_connected) {
            return new WP_Error('not_connected', __('WhatsApp not configured', 'botflow-manager'), ['status' => 400]);
        }
        
        $conversation = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}botflow_conversations WHERE id = %d",
            $conversation_id
        ));
        
        if (!$conversation) {
            return new WP_Error('conversation_not_found', __('Conversation not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $url = "{$this->api_base_url}/{$this->api_version}/{$config->phone_number_id}/messages";
        $recipient = preg_replace('/[^0-9]/', '', $conversation->contact_phone);
        
        $media_object = ['link' => $media_url];
        if ($caption && in_array($media_type, ['image', 'video', 'document'])) {
            $media_object['caption'] = $caption;
        }
        
        $body = [
            'messaging_product' => 'whatsapp',
            'recipient_type' => 'individual',
            'to' => $recipient,
            'type' => $media_type,
            $media_type => $media_object,
        ];
        
        $response = wp_remote_post($url, [
            'headers' => [
                'Authorization' => "Bearer {$config->access_token}",
                'Content-Type' => 'application/json',
            ],
            'body' => json_encode($body),
            'timeout' => 30,
        ]);
        
        if (is_wp_error($response)) {
            return $response;
        }
        
        $result = json_decode(wp_remote_retrieve_body($response), true);
        
        // Store message
        $message = $this->store_message(
            $bot_id,
            $conversation_id,
            'outgoing',
            $caption ?: "[$media_type]",
            'Bot',
            '',
            'sent',
            $result['messages'][0]['id'] ?? null,
            $media_type,
            $media_url
        );
        
        return $message;
    }
    
    /**
     * Mark message as read
     */
    public function mark_as_read($bot_id, $message_id, $user_id) {
        $config = $this->get_config($bot_id, $user_id);
        
        if (is_wp_error($config) || !$config->is_connected) {
            return false;
        }
        
        $url = "{$this->api_base_url}/{$this->api_version}/{$config->phone_number_id}/messages";
        
        $response = wp_remote_post($url, [
            'headers' => [
                'Authorization' => "Bearer {$config->access_token}",
                'Content-Type' => 'application/json',
            ],
            'body' => json_encode([
                'messaging_product' => 'whatsapp',
                'status' => 'read',
                'message_id' => $message_id,
            ]),
            'timeout' => 10,
        ]);
        
        return !is_wp_error($response);
    }
    
    /**
     * Get WhatsApp config for a bot
     */
    private function get_config($bot_id, $user_id) {
        global $wpdb;
        
        // Verify bot ownership
        $bot = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}botflow_bots WHERE id = %d AND user_id = %d",
            $bot_id,
            $user_id
        ));
        
        if (!$bot) {
            return new WP_Error('not_found', __('Bot not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $config = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM {$wpdb->prefix}botflow_whatsapp_config WHERE bot_id = %d",
            $bot_id
        ));
        
        if (!$config) {
            return new WP_Error('not_configured', __('WhatsApp not configured', 'botflow-manager'), ['status' => 400]);
        }
        
        return $config;
    }
    
    /**
     * Store message in database
     */
    public function store_message($bot_id, $conversation_id, $direction, $content, $sender_name, $sender_phone, $status = 'sent', $whatsapp_id = null, $type = 'text', $media_url = null) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_messages';
        
        $data = [
            'bot_id' => $bot_id,
            'conversation_id' => $conversation_id,
            'direction' => $direction,
            'content' => $content,
            'sender_name' => $sender_name,
            'sender_phone' => $sender_phone,
            'message_type' => $type,
            'media_url' => $media_url,
            'whatsapp_message_id' => $whatsapp_id,
            'status' => $status,
            'timestamp' => current_time('mysql'),
        ];
        
        $wpdb->insert($table, $data);
        
        return [
            'id' => (string) $wpdb->insert_id,
            'botId' => (string) $bot_id,
            'conversationId' => (string) $conversation_id,
            'direction' => $direction,
            'content' => $content,
            'senderName' => $sender_name,
            'senderPhone' => $sender_phone,
            'messageType' => $type,
            'mediaUrl' => $media_url,
            'status' => $status,
            'timestamp' => current_time('mysql'),
        ];
    }
    
    /**
     * Update bot statistics
     */
    public function update_bot_stats($bot_id, $received = 0, $sent = 0) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_bots';
        
        $wpdb->query($wpdb->prepare(
            "UPDATE $table SET 
                messages_received = messages_received + %d,
                messages_sent = messages_sent + %d,
                last_activity = %s
            WHERE id = %d",
            $received,
            $sent,
            current_time('mysql'),
            $bot_id
        ));
    }
    
    /**
     * Get or create conversation
     */
    public function get_or_create_conversation($bot_id, $contact_phone, $contact_name = '') {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_conversations';
        
        $conversation = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE bot_id = %d AND contact_phone = %s",
            $bot_id,
            $contact_phone
        ));
        
        if ($conversation) {
            return $conversation;
        }
        
        // Create new conversation
        $wpdb->insert($table, [
            'bot_id' => $bot_id,
            'contact_name' => $contact_name ?: $contact_phone,
            'contact_phone' => $contact_phone,
            'status' => 'active',
        ]);
        
        return $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE id = %d",
            $wpdb->insert_id
        ));
    }
}
