<?php
/**
 * REST API Endpoints
 * Security enhanced with strict CORS and input validation
 */

if (!defined('ABSPATH')) {
    exit;
}

class BotFlow_REST_API {
    
    private $namespace = 'botflow/v1';
    private $encryption;
    
    public function __construct() {
        $this->encryption = new BotFlow_Encryption();
    }
    
    /**
     * Initialize REST API
     */
    public function init() {
        add_action('rest_api_init', [$this, 'register_routes']);
        add_filter('rest_pre_serve_request', [$this, 'add_cors_headers'], 10, 4);
        add_action('init', [$this, 'handle_cors_preflight'], 1);
    }

    private function get_allowed_origins() {
        $allowed_origins = get_option('botflow_allowed_origins', '');
        if (empty($allowed_origins)) {
            $allowed_origins = home_url();
        }
        return array_filter(array_map('trim', explode(',', $allowed_origins)));
    }

    public function handle_cors_preflight() {
        if (!isset($_SERVER['REQUEST_METHOD']) || $_SERVER['REQUEST_METHOD'] !== 'OPTIONS') {
            return;
        }

        $request_uri = $_SERVER['REQUEST_URI'] ?? '';
        if (strpos($request_uri, '/wp-json/botflow/v1/') === false) {
            return;
        }

        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        $allowed_list = $this->get_allowed_origins();

        if (!empty($origin) && in_array($origin, $allowed_list, true)) {
            header("Access-Control-Allow-Origin: $origin");
            header('Access-Control-Allow-Credentials: true');
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With, X-API-Key, X-BotFlow-Token');
        header('Access-Control-Max-Age: 86400');
        status_header(200);
        exit;
    }
    
    /**
     * Add CORS headers with strict origin validation
     */
    public function add_cors_headers($served, $result, $request, $server) {
        $origin = isset($_SERVER['HTTP_ORIGIN']) ? $_SERVER['HTTP_ORIGIN'] : '';
        $allowed_list = $this->get_allowed_origins();
        
        // Only set CORS header if origin is explicitly allowed
        if (!empty($origin) && in_array($origin, $allowed_list, true)) {
            header("Access-Control-Allow-Origin: $origin");
            header('Access-Control-Allow-Credentials: true');
        }
        
        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type, X-Requested-With, X-API-Key, X-BotFlow-Token');
        header('Access-Control-Max-Age: 86400');
        
        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            header('HTTP/1.1 200 OK');
            exit();
        }
        
        return $served;
    }
    
    /**
     * Register all REST routes
     */
    public function register_routes() {
        // Health check
        register_rest_route($this->namespace, '/health', [
            'methods' => 'GET',
            'callback' => [$this, 'health_check'],
            'permission_callback' => '__return_true',
        ]);
        
        // === BOTS ===
        register_rest_route($this->namespace, '/bots', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_bots'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'POST',
                'callback' => [$this, 'create_bot'],
                'permission_callback' => [$this, 'check_permission'],
                'args' => $this->get_bot_args(),
            ],
        ]);
        
        register_rest_route($this->namespace, '/bots/(?P<id>\d+)', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_bot'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'PUT,PATCH',
                'callback' => [$this, 'update_bot'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'DELETE',
                'callback' => [$this, 'delete_bot'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
        
        // === FLOWS ===
        register_rest_route($this->namespace, '/flows', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_flows'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'POST',
                'callback' => [$this, 'create_flow'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
        
        register_rest_route($this->namespace, '/flows/(?P<id>\d+)', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_flow'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'PUT,PATCH',
                'callback' => [$this, 'update_flow'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'DELETE',
                'callback' => [$this, 'delete_flow'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
        
        // === AI CONFIG ===
        register_rest_route($this->namespace, '/ai-config/(?P<flow_id>\d+)', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_ai_configs'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
        
        register_rest_route($this->namespace, '/ai-config/(?P<flow_id>\d+)/(?P<node_id>[a-zA-Z0-9_-]+)', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_ai_config'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'PUT,POST',
                'callback' => [$this, 'save_ai_config'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'DELETE',
                'callback' => [$this, 'delete_ai_config'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
        
        // === META ACCOUNTS ===
        register_rest_route($this->namespace, '/meta-accounts', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_meta_accounts'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'POST',
                'callback' => [$this, 'create_meta_account'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
        
        register_rest_route($this->namespace, '/meta-accounts/(?P<id>\d+)', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_meta_account'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'PUT,PATCH',
                'callback' => [$this, 'update_meta_account'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'DELETE',
                'callback' => [$this, 'delete_meta_account'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
        
        // === WEBHOOK LOGS ===
        register_rest_route($this->namespace, '/webhook-logs', [
            'methods' => 'GET',
            'callback' => [$this, 'get_webhook_logs'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        
        register_rest_route($this->namespace, '/webhook-logs/meta', [
            'methods' => 'GET',
            'callback' => [$this, 'get_meta_webhook_logs'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        
        register_rest_route($this->namespace, '/webhook-logs/evolution', [
            'methods' => 'GET',
            'callback' => [$this, 'get_evolution_webhook_logs'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        
        // === MICROSERVICE PROXY ===
        register_rest_route($this->namespace, '/microservice/health', [
            'methods' => 'GET',
            'callback' => [$this, 'microservice_health'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        
        register_rest_route($this->namespace, '/microservice/process-ai', [
            'methods' => 'POST',
            'callback' => [$this, 'microservice_process_ai'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        
        register_rest_route($this->namespace, '/microservice/webhook', [
            'methods' => 'POST',
            'callback' => [$this, 'microservice_webhook_callback'],
            'permission_callback' => [$this, 'check_microservice_auth'],
        ]);

        register_rest_route($this->namespace, '/microservice/conversation/resolve', [
            'methods' => 'POST',
            'callback' => [$this, 'microservice_resolve_conversation'],
            'permission_callback' => [$this, 'check_microservice_auth'],
        ]);

        register_rest_route($this->namespace, '/microservice/messages', [
            'methods' => 'POST',
            'callback' => [$this, 'microservice_store_message'],
            'permission_callback' => [$this, 'check_microservice_auth'],
        ]);

        register_rest_route($this->namespace, '/microservice/send', [
            'methods' => 'POST',
            'callback' => [$this, 'microservice_send_message'],
            'permission_callback' => [$this, 'check_microservice_auth'],
        ]);

        register_rest_route($this->namespace, '/microservice/conversation/(?P<id>\d+)/messages', [
            'methods' => 'GET',
            'callback' => [$this, 'microservice_get_conversation_messages'],
            'permission_callback' => [$this, 'check_microservice_auth'],
            'args' => [
                'id' => [
                    'required' => true,
                    'sanitize_callback' => 'absint',
                ],
                'limit' => [
                    'default' => 40,
                    'sanitize_callback' => 'absint',
                ],
            ],
        ]);
        
        // === CONVERSATIONS ===
        register_rest_route($this->namespace, '/conversations', [
            'methods' => 'GET',
            'callback' => [$this, 'get_conversations'],
            'permission_callback' => [$this, 'check_permission'],
        ]);
        
        register_rest_route($this->namespace, '/conversations/(?P<id>\d+)', [
            'methods' => 'GET',
            'callback' => [$this, 'get_conversation'],
            'permission_callback' => [$this, 'check_permission'],
        ]);

        // Backward-compatible route used by frontend service
        register_rest_route($this->namespace, '/conversations/(?P<id>\d+)/messages', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_conversation_messages'],
                'permission_callback' => [$this, 'check_permission'],
                'args' => [
                    'page' => ['default' => 1, 'sanitize_callback' => 'absint'],
                    'per_page' => ['default' => 50, 'sanitize_callback' => 'absint'],
                ],
            ],
            [
                'methods' => 'POST',
                'callback' => [$this, 'send_conversation_message'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
        
        // === MESSAGES ===
        register_rest_route($this->namespace, '/messages', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_messages'],
                'permission_callback' => [$this, 'check_permission'],
                'args' => [
                    'conversation_id' => ['required' => true, 'sanitize_callback' => 'absint'],
                    'page' => ['default' => 1, 'sanitize_callback' => 'absint'],
                    'per_page' => ['default' => 50, 'sanitize_callback' => 'absint'],
                ],
            ],
            [
                'methods' => 'POST',
                'callback' => [$this, 'send_message'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
        
        // === WHATSAPP CONFIG ===
        register_rest_route($this->namespace, '/whatsapp-config/(?P<bot_id>\d+)', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_whatsapp_config'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'PUT,PATCH',
                'callback' => [$this, 'update_whatsapp_config'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
        
        // === EVOLUTION API CONFIG ===
        register_rest_route($this->namespace, '/evolution-config/(?P<bot_id>\d+)', [
            [
                'methods' => 'GET',
                'callback' => [$this, 'get_evolution_config'],
                'permission_callback' => [$this, 'check_permission'],
            ],
            [
                'methods' => 'PUT,PATCH',
                'callback' => [$this, 'update_evolution_config'],
                'permission_callback' => [$this, 'check_permission'],
            ],
        ]);
    }
    
    /**
     * Check if user has permission
     */
    public function check_permission($request) {
        return $request->get_param('botflow_user_id') !== null;
    }
    
    /**
     * Check microservice API key authentication
     */
    public function check_microservice_auth($request) {
        $api_key = $request->get_header('X-API-Key');
        if (empty($api_key)) {
            return false;
        }
        
        $stored_key = get_option('botflow_microservice_key');
        return hash_equals(hash('sha256', $stored_key), hash('sha256', $api_key));
    }
    
    /**
     * Get bot arguments schema with validation
     */
    private function get_bot_args() {
        return [
            'name' => [
                'required' => true,
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field',
                'validate_callback' => function($value) {
                    return !empty($value) && strlen($value) <= 255;
                }
            ],
            'description' => [
                'type' => 'string',
                'sanitize_callback' => 'sanitize_textarea_field',
                'validate_callback' => function($value) {
                    return strlen($value) <= 1000;
                }
            ],
            'phone_number' => [
                'required' => true,
                'type' => 'string',
                'sanitize_callback' => 'sanitize_text_field',
                'validate_callback' => function($value) {
                    return preg_match('/^\+?[1-9]\d{1,14}$/', $value);
                }
            ],
        ];
    }
    
    /**
     * Health check
     */
    public function health_check($request) {
        global $wpdb;
        
        // Check database connection
        $db_ok = $wpdb->get_var("SELECT 1") === '1';
        
        // Check microservice status
        $microservice = $wpdb->get_row(
            "SELECT status, last_health_check FROM {$wpdb->prefix}botflow_microservice_config LIMIT 1"
        );
        
        return rest_ensure_response([
            'status' => $db_ok ? 'healthy' : 'degraded',
            'timestamp' => current_time('c'),
            'version' => defined('BOTFLOW_VERSION') ? BOTFLOW_VERSION : '1.0.0',
            'components' => [
                'database' => $db_ok ? 'healthy' : 'error',
                'microservice' => $microservice ? $microservice->status : 'not_configured',
                'microservice_last_check' => $microservice ? $microservice->last_health_check : null,
            ],
        ]);
    }
    
    // === BOTS CRUD ===
    
    public function get_bots($request) {
        global $wpdb;
        
        $user_id = $request->get_param('botflow_user_id');
        $table = $wpdb->prefix . 'botflow_bots';
        
        $bots = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table WHERE user_id = %d ORDER BY created_at DESC",
            $user_id
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => array_map([$this, 'format_bot'], $bots),
        ]);
    }
    
    public function get_bot($request) {
        global $wpdb;
        
        $id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');
        $table = $wpdb->prefix . 'botflow_bots';
        
        $bot = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE id = %d AND user_id = %d",
            $id,
            $user_id
        ));
        
        if (!$bot) {
            return new WP_Error('not_found', __('Bot not found', 'botflow-manager'), ['status' => 404]);
        }
        
        return rest_ensure_response([
            'success' => true,
            'data' => $this->format_bot($bot),
        ]);
    }
    
    public function create_bot($request) {
        global $wpdb;
        
        $user_id = $request->get_param('botflow_user_id');
        $table = $wpdb->prefix . 'botflow_bots';
        
        $data = [
            'name' => $request->get_param('name'),
            'description' => $request->get_param('description') ?? '',
            'phone_number' => $request->get_param('phone_number'),
            'status' => 'offline',
            'line_health' => 'disconnected',
            'user_id' => $user_id,
        ];
        
        $result = $wpdb->insert($table, $data);
        
        if ($result === false) {
            return new WP_Error('create_failed', __('Failed to create bot', 'botflow-manager'), ['status' => 500]);
        }
        
        $bot = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE id = %d",
            $wpdb->insert_id
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => $this->format_bot($bot),
        ]);
    }
    
    public function update_bot($request) {
        global $wpdb;
        
        $id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');
        $table = $wpdb->prefix . 'botflow_bots';
        
        // Verify ownership
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM $table WHERE id = %d AND user_id = %d",
            $id,
            $user_id
        ));
        
        if (!$existing) {
            return new WP_Error('not_found', __('Bot not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $data = [];
        $allowed_fields = ['name', 'description', 'phone_number', 'status', 'line_health'];
        
        foreach ($allowed_fields as $field) {
            $value = $request->get_param($field);
            if ($value !== null) {
                $data[$field] = sanitize_text_field($value);
            }
        }
        
        if (!empty($data)) {
            $wpdb->update($table, $data, ['id' => $id]);
        }
        
        $bot = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE id = %d",
            $id
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => $this->format_bot($bot),
        ]);
    }
    
    public function delete_bot($request) {
        global $wpdb;
        
        $id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');
        $table = $wpdb->prefix . 'botflow_bots';
        
        $result = $wpdb->delete($table, [
            'id' => $id,
            'user_id' => $user_id,
        ]);
        
        if ($result === false || $result === 0) {
            return new WP_Error('delete_failed', __('Failed to delete bot', 'botflow-manager'), ['status' => 404]);
        }
        
        // Also delete related data (cascade)
        $wpdb->delete($wpdb->prefix . 'botflow_whatsapp_config', ['bot_id' => $id]);
        $wpdb->delete($wpdb->prefix . 'botflow_evolution_config', ['bot_id' => $id]);
        $wpdb->delete($wpdb->prefix . 'botflow_flows', ['bot_id' => $id]);
        $wpdb->delete($wpdb->prefix . 'botflow_conversations', ['bot_id' => $id]);
        $wpdb->delete($wpdb->prefix . 'botflow_messages', ['bot_id' => $id]);
        
        return rest_ensure_response([
            'success' => true,
            'message' => __('Bot deleted successfully', 'botflow-manager'),
        ]);
    }
    
    private function format_bot($bot) {
        return [
            'id' => (string) $bot->id,
            'name' => $bot->name,
            'description' => $bot->description,
            'phoneNumber' => $bot->phone_number,
            'status' => $bot->status,
            'lineHealth' => $bot->line_health,
            'messagesReceived' => (int) $bot->messages_received,
            'messagesSent' => (int) $bot->messages_sent,
            'activeConversations' => (int) $bot->active_conversations,
            'lastActivity' => $bot->last_activity,
            'createdAt' => $bot->created_at,
            'updatedAt' => $bot->updated_at,
        ];
    }
    
    // === FLOWS CRUD ===
    
    public function get_flows($request) {
        global $wpdb;
        
        $user_id = $request->get_param('botflow_user_id');
        $bot_id = $request->get_param('bot_id');
        
        $table_flows = $wpdb->prefix . 'botflow_flows';
        $table_bots = $wpdb->prefix . 'botflow_bots';
        
        $query = "SELECT f.* FROM $table_flows f 
                  INNER JOIN $table_bots b ON f.bot_id = b.id 
                  WHERE b.user_id = %d";
        $params = [$user_id];
        
        if ($bot_id) {
            $query .= " AND f.bot_id = %d";
            $params[] = (int) $bot_id;
        }
        
        $query .= " ORDER BY f.created_at DESC";
        
        $flows = $wpdb->get_results($wpdb->prepare($query, ...$params));
        
        return rest_ensure_response([
            'success' => true,
            'data' => array_map([$this, 'format_flow'], $flows),
        ]);
    }
    
    public function get_flow($request) {
        global $wpdb;
        
        $id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');
        
        $table_flows = $wpdb->prefix . 'botflow_flows';
        $table_bots = $wpdb->prefix . 'botflow_bots';
        
        $flow = $wpdb->get_row($wpdb->prepare(
            "SELECT f.* FROM $table_flows f 
             INNER JOIN $table_bots b ON f.bot_id = b.id 
             WHERE f.id = %d AND b.user_id = %d",
            $id,
            $user_id
        ));
        
        if (!$flow) {
            return new WP_Error('not_found', __('Flow not found', 'botflow-manager'), ['status' => 404]);
        }
        
        return rest_ensure_response([
            'success' => true,
            'data' => $this->format_flow($flow),
        ]);
    }
    
    public function create_flow($request) {
        global $wpdb;
        
        $user_id = $request->get_param('botflow_user_id');
        $bot_id = (int) $request->get_param('bot_id');
        
        // Verify bot ownership
        $bot = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}botflow_bots WHERE id = %d AND user_id = %d",
            $bot_id,
            $user_id
        ));
        
        if (!$bot) {
            return new WP_Error('not_found', __('Bot not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $table = $wpdb->prefix . 'botflow_flows';
        
        $nodes = $request->get_param('nodes');
        $edges = $request->get_param('edges');
        
        $data = [
            'bot_id' => $bot_id,
            'name' => sanitize_text_field($request->get_param('name')),
            'trigger_keyword' => sanitize_text_field($request->get_param('trigger_keyword') ?? ''),
            'nodes' => is_array($nodes) ? json_encode($nodes) : '[]',
            'edges' => is_array($edges) ? json_encode($edges) : '[]',
            'is_active' => $request->get_param('is_active') ?? true,
        ];
        
        $wpdb->insert($table, $data);
        
        $flow_id = $wpdb->insert_id;
        
        // Save AI configs for any AI nodes
        $this->save_flow_ai_configs($flow_id, $nodes);
        
        $flow = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE id = %d",
            $flow_id
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => $this->format_flow($flow),
        ]);
    }
    
    public function update_flow($request) {
        global $wpdb;
        
        $id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');
        
        $table_flows = $wpdb->prefix . 'botflow_flows';
        $table_bots = $wpdb->prefix . 'botflow_bots';
        
        // Verify ownership
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT f.id FROM $table_flows f 
             INNER JOIN $table_bots b ON f.bot_id = b.id 
             WHERE f.id = %d AND b.user_id = %d",
            $id,
            $user_id
        ));
        
        if (!$existing) {
            return new WP_Error('not_found', __('Flow not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $data = [];
        
        if ($request->get_param('name') !== null) {
            $data['name'] = sanitize_text_field($request->get_param('name'));
        }
        if ($request->get_param('trigger_keyword') !== null) {
            $data['trigger_keyword'] = sanitize_text_field($request->get_param('trigger_keyword'));
        }
        
        $nodes = $request->get_param('nodes');
        if ($nodes !== null) {
            $data['nodes'] = is_array($nodes) ? json_encode($nodes) : $nodes;
            // Update AI configs
            $this->save_flow_ai_configs($id, is_array($nodes) ? $nodes : json_decode($nodes, true));
        }
        
        $edges = $request->get_param('edges');
        if ($edges !== null) {
            $data['edges'] = is_array($edges) ? json_encode($edges) : $edges;
        }
        
        if ($request->get_param('is_active') !== null) {
            $data['is_active'] = (bool) $request->get_param('is_active');
        }
        
        if (!empty($data)) {
            $wpdb->update($table_flows, $data, ['id' => $id]);
        }
        
        $flow = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table_flows WHERE id = %d",
            $id
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => $this->format_flow($flow),
        ]);
    }
    
    /**
     * Save AI configs from flow nodes
     */
    private function save_flow_ai_configs($flow_id, $nodes) {
        global $wpdb;
        
        if (!is_array($nodes)) {
            return;
        }
        
        $table = $wpdb->prefix . 'botflow_ai_config';
        
        foreach ($nodes as $node) {
            if (!isset($node['type']) || $node['type'] !== 'ai') {
                continue;
            }
            
            $node_id = $node['id'] ?? '';
            $data = $node['data'] ?? [];
            
            if (empty($node_id)) {
                continue;
            }
            
            $config = [
                'flow_id' => $flow_id,
                'node_id' => sanitize_text_field($node_id),
                'provider' => sanitize_text_field($data['provider'] ?? 'lovable'),
                'model' => sanitize_text_field($data['model'] ?? 'google/gemini-3-flash-preview'),
                'system_prompt' => sanitize_textarea_field($data['systemPrompt'] ?? ''),
                'user_prompt_template' => sanitize_textarea_field($data['userPromptTemplate'] ?? '{{user_message}}'),
                'temperature' => floatval($data['temperature'] ?? 0.7),
                'max_tokens' => intval($data['maxTokens'] ?? 500),
                'label' => sanitize_text_field($data['label'] ?? ''),
            ];
            
            // Upsert
            $existing = $wpdb->get_var($wpdb->prepare(
                "SELECT id FROM $table WHERE flow_id = %d AND node_id = %s",
                $flow_id,
                $node_id
            ));
            
            if ($existing) {
                $wpdb->update($table, $config, ['id' => $existing]);
            } else {
                $wpdb->insert($table, $config);
            }
        }
    }
    
    public function delete_flow($request) {
        global $wpdb;
        
        $id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');
        
        $table_flows = $wpdb->prefix . 'botflow_flows';
        $table_bots = $wpdb->prefix . 'botflow_bots';
        
        $result = $wpdb->query($wpdb->prepare(
            "DELETE f FROM $table_flows f 
             INNER JOIN $table_bots b ON f.bot_id = b.id 
             WHERE f.id = %d AND b.user_id = %d",
            $id,
            $user_id
        ));
        
        if ($result === false || $result === 0) {
            return new WP_Error('delete_failed', __('Failed to delete flow', 'botflow-manager'), ['status' => 404]);
        }
        
        // Delete associated AI configs
        $wpdb->delete($wpdb->prefix . 'botflow_ai_config', ['flow_id' => $id]);
        
        return rest_ensure_response([
            'success' => true,
            'message' => __('Flow deleted successfully', 'botflow-manager'),
        ]);
    }
    
    private function format_flow($flow) {
        return [
            'id' => (string) $flow->id,
            'botId' => (string) $flow->bot_id,
            'name' => $flow->name,
            'triggerKeyword' => $flow->trigger_keyword,
            'nodes' => json_decode($flow->nodes, true) ?? [],
            'edges' => json_decode($flow->edges ?? '[]', true) ?? [],
            'isActive' => (bool) $flow->is_active,
            'createdAt' => $flow->created_at,
            'updatedAt' => $flow->updated_at,
        ];
    }
    
    // === AI CONFIG ===
    
    public function get_ai_configs($request) {
        global $wpdb;
        
        $flow_id = (int) $request->get_param('flow_id');
        $user_id = $request->get_param('botflow_user_id');
        
        // Verify flow ownership
        if (!$this->user_owns_flow($flow_id, $user_id)) {
            return new WP_Error('not_found', __('Flow not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $table = $wpdb->prefix . 'botflow_ai_config';
        $configs = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table WHERE flow_id = %d",
            $flow_id
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => array_map([$this, 'format_ai_config'], $configs),
        ]);
    }
    
    public function get_ai_config($request) {
        global $wpdb;
        
        $flow_id = (int) $request->get_param('flow_id');
        $node_id = sanitize_text_field($request->get_param('node_id'));
        $user_id = $request->get_param('botflow_user_id');
        
        if (!$this->user_owns_flow($flow_id, $user_id)) {
            return new WP_Error('not_found', __('Flow not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $table = $wpdb->prefix . 'botflow_ai_config';
        $config = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE flow_id = %d AND node_id = %s",
            $flow_id,
            $node_id
        ));
        
        if (!$config) {
            return new WP_Error('not_found', __('AI config not found', 'botflow-manager'), ['status' => 404]);
        }
        
        return rest_ensure_response([
            'success' => true,
            'data' => $this->format_ai_config($config),
        ]);
    }
    
    public function save_ai_config($request) {
        global $wpdb;
        
        $flow_id = (int) $request->get_param('flow_id');
        $node_id = sanitize_text_field($request->get_param('node_id'));
        $user_id = $request->get_param('botflow_user_id');
        
        if (!$this->user_owns_flow($flow_id, $user_id)) {
            return new WP_Error('not_found', __('Flow not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $table = $wpdb->prefix . 'botflow_ai_config';
        
        $config = [
            'flow_id' => $flow_id,
            'node_id' => $node_id,
            'provider' => sanitize_text_field($request->get_param('provider') ?? 'lovable'),
            'model' => sanitize_text_field($request->get_param('model') ?? 'google/gemini-3-flash-preview'),
            'system_prompt' => sanitize_textarea_field($request->get_param('systemPrompt') ?? ''),
            'user_prompt_template' => sanitize_textarea_field($request->get_param('userPromptTemplate') ?? '{{user_message}}'),
            'temperature' => floatval($request->get_param('temperature') ?? 0.7),
            'max_tokens' => intval($request->get_param('maxTokens') ?? 500),
            'label' => sanitize_text_field($request->get_param('label') ?? ''),
        ];
        
        $existing = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM $table WHERE flow_id = %d AND node_id = %s",
            $flow_id,
            $node_id
        ));
        
        if ($existing) {
            $wpdb->update($table, $config, ['id' => $existing]);
        } else {
            $wpdb->insert($table, $config);
        }
        
        $saved = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE flow_id = %d AND node_id = %s",
            $flow_id,
            $node_id
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => $this->format_ai_config($saved),
        ]);
    }
    
    public function delete_ai_config($request) {
        global $wpdb;
        
        $flow_id = (int) $request->get_param('flow_id');
        $node_id = sanitize_text_field($request->get_param('node_id'));
        $user_id = $request->get_param('botflow_user_id');
        
        if (!$this->user_owns_flow($flow_id, $user_id)) {
            return new WP_Error('not_found', __('Flow not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $table = $wpdb->prefix . 'botflow_ai_config';
        $result = $wpdb->delete($table, [
            'flow_id' => $flow_id,
            'node_id' => $node_id,
        ]);
        
        return rest_ensure_response([
            'success' => true,
            'message' => __('AI config deleted', 'botflow-manager'),
        ]);
    }
    
    private function format_ai_config($config) {
        return [
            'id' => (string) $config->id,
            'flowId' => (string) $config->flow_id,
            'nodeId' => $config->node_id,
            'provider' => $config->provider,
            'model' => $config->model,
            'systemPrompt' => $config->system_prompt,
            'userPromptTemplate' => $config->user_prompt_template,
            'temperature' => floatval($config->temperature),
            'maxTokens' => intval($config->max_tokens),
            'label' => $config->label,
        ];
    }
    
    private function user_owns_flow($flow_id, $user_id) {
        global $wpdb;
        
        return (bool) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->prefix}botflow_flows f 
             INNER JOIN {$wpdb->prefix}botflow_bots b ON f.bot_id = b.id 
             WHERE f.id = %d AND b.user_id = %d",
            $flow_id,
            $user_id
        ));
    }
    
    // === META ACCOUNTS ===
    
    public function get_meta_accounts($request) {
        global $wpdb;
        
        $user_id = $request->get_param('botflow_user_id');
        $table = $wpdb->prefix . 'botflow_meta_accounts';
        
        $accounts = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table WHERE user_id = %d ORDER BY created_at DESC",
            $user_id
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => array_map(function($account) {
                return [
                    'id' => (string) $account->id,
                    'accountName' => $account->account_name,
                    'businessId' => $account->business_id,
                    'webhookCallbackUrl' => $account->webhook_callback_url,
                    'webhookVerifyToken' => $account->webhook_verify_token,
                    'webhookEvents' => json_decode($account->webhook_events ?? '[]', true),
                    'isActive' => (bool) $account->is_active,
                    'lastSync' => $account->last_sync,
                    'createdAt' => $account->created_at,
                ];
            }, $accounts),
        ]);
    }
    
    public function create_meta_account($request) {
        global $wpdb;
        
        $user_id = $request->get_param('botflow_user_id');
        $table = $wpdb->prefix . 'botflow_meta_accounts';
        
        $access_token = $request->get_param('accessToken');
        if (empty($access_token)) {
            return new WP_Error('missing_token', __('Access token is required', 'botflow-manager'), ['status' => 400]);
        }
        
        // Generate webhook verify token
        $verify_token = wp_generate_password(32, false);
        
        $data = [
            'user_id' => $user_id,
            'account_name' => sanitize_text_field($request->get_param('accountName')),
            'business_id' => sanitize_text_field($request->get_param('businessId') ?? ''),
            'access_token_encrypted' => $this->encryption->encrypt($access_token),
            'token_expires_at' => $request->get_param('tokenExpiresAt'),
            'webhook_callback_url' => rest_url('botflow/v1/webhook/meta'),
            'webhook_verify_token' => $verify_token,
            'webhook_events' => json_encode($request->get_param('webhookEvents') ?? ['messages', 'messaging_postbacks']),
            'is_active' => 1,
        ];
        
        $wpdb->insert($table, $data);
        
        $account = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE id = %d",
            $wpdb->insert_id
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => [
                'id' => (string) $account->id,
                'accountName' => $account->account_name,
                'webhookCallbackUrl' => $account->webhook_callback_url,
                'webhookVerifyToken' => $account->webhook_verify_token,
            ],
        ]);
    }
    
    public function get_meta_account($request) {
        global $wpdb;
        
        $id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');
        $table = $wpdb->prefix . 'botflow_meta_accounts';
        
        $account = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE id = %d AND user_id = %d",
            $id,
            $user_id
        ));
        
        if (!$account) {
            return new WP_Error('not_found', __('Account not found', 'botflow-manager'), ['status' => 404]);
        }
        
        return rest_ensure_response([
            'success' => true,
            'data' => [
                'id' => (string) $account->id,
                'accountName' => $account->account_name,
                'businessId' => $account->business_id,
                'webhookCallbackUrl' => $account->webhook_callback_url,
                'webhookVerifyToken' => $account->webhook_verify_token,
                'webhookEvents' => json_decode($account->webhook_events ?? '[]', true),
                'isActive' => (bool) $account->is_active,
                'lastSync' => $account->last_sync,
            ],
        ]);
    }
    
    public function update_meta_account($request) {
        global $wpdb;
        
        $id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');
        $table = $wpdb->prefix . 'botflow_meta_accounts';
        
        $existing = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM $table WHERE id = %d AND user_id = %d",
            $id,
            $user_id
        ));
        
        if (!$existing) {
            return new WP_Error('not_found', __('Account not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $data = [];
        
        if ($request->get_param('accountName') !== null) {
            $data['account_name'] = sanitize_text_field($request->get_param('accountName'));
        }
        if ($request->get_param('accessToken') !== null) {
            $data['access_token_encrypted'] = $this->encryption->encrypt($request->get_param('accessToken'));
        }
        if ($request->get_param('isActive') !== null) {
            $data['is_active'] = (int) $request->get_param('isActive');
        }
        if ($request->get_param('webhookEvents') !== null) {
            $data['webhook_events'] = json_encode($request->get_param('webhookEvents'));
        }
        
        if (!empty($data)) {
            $wpdb->update($table, $data, ['id' => $id]);
        }
        
        return rest_ensure_response([
            'success' => true,
            'message' => __('Account updated', 'botflow-manager'),
        ]);
    }
    
    public function delete_meta_account($request) {
        global $wpdb;
        
        $id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');
        $table = $wpdb->prefix . 'botflow_meta_accounts';
        
        $result = $wpdb->delete($table, [
            'id' => $id,
            'user_id' => $user_id,
        ]);
        
        if ($result === false || $result === 0) {
            return new WP_Error('delete_failed', __('Failed to delete account', 'botflow-manager'), ['status' => 404]);
        }
        
        return rest_ensure_response([
            'success' => true,
            'message' => __('Account deleted', 'botflow-manager'),
        ]);
    }
    
    // === WEBHOOK LOGS ===
    
    public function get_webhook_logs($request) {
        global $wpdb;
        
        $limit = min((int) ($request->get_param('limit') ?? 50), 100);
        $offset = (int) ($request->get_param('offset') ?? 0);
        $status = sanitize_text_field($request->get_param('status') ?? '');
        
        $table_meta = $wpdb->prefix . 'botflow_meta_webhook_logs';
        $table_evolution = $wpdb->prefix . 'botflow_evolution_webhook_logs';
        
        $where = '';
        if (!empty($status)) {
            $where = $wpdb->prepare(" WHERE status = %s", $status);
        }
        
        // Combine logs from both sources
        $query = "
            (SELECT 'meta' as source, id, event_type, status, error_message, created_at FROM $table_meta $where)
            UNION ALL
            (SELECT 'evolution' as source, id, event_type, status, error_message, created_at FROM $table_evolution $where)
            ORDER BY created_at DESC
            LIMIT %d OFFSET %d
        ";
        
        $logs = $wpdb->get_results($wpdb->prepare($query, $limit, $offset));
        
        return rest_ensure_response([
            'success' => true,
            'data' => $logs,
        ]);
    }
    
    public function get_meta_webhook_logs($request) {
        global $wpdb;
        
        $limit = min((int) ($request->get_param('limit') ?? 50), 100);
        $offset = (int) ($request->get_param('offset') ?? 0);
        
        $table = $wpdb->prefix . 'botflow_meta_webhook_logs';
        
        $logs = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table ORDER BY created_at DESC LIMIT %d OFFSET %d",
            $limit,
            $offset
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => array_map(function($log) {
                return [
                    'id' => (string) $log->id,
                    'accountId' => $log->account_id,
                    'wabaId' => $log->waba_id,
                    'phoneNumberId' => $log->phone_number_id,
                    'eventType' => $log->event_type,
                    'payload' => json_decode($log->payload, true),
                    'status' => $log->status,
                    'errorMessage' => $log->error_message,
                    'processingTimeMs' => (int) $log->processing_time_ms,
                    'createdAt' => $log->created_at,
                ];
            }, $logs),
        ]);
    }
    
    public function get_evolution_webhook_logs($request) {
        global $wpdb;
        
        $limit = min((int) ($request->get_param('limit') ?? 50), 100);
        $offset = (int) ($request->get_param('offset') ?? 0);
        
        $table = $wpdb->prefix . 'botflow_evolution_webhook_logs';
        
        $logs = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table ORDER BY created_at DESC LIMIT %d OFFSET %d",
            $limit,
            $offset
        ));
        
        return rest_ensure_response([
            'success' => true,
            'data' => array_map(function($log) {
                return [
                    'id' => (string) $log->id,
                    'instanceName' => $log->instance_name,
                    'eventType' => $log->event_type,
                    'payload' => json_decode($log->payload, true),
                    'status' => $log->status,
                    'errorMessage' => $log->error_message,
                    'processingTimeMs' => (int) $log->processing_time_ms,
                    'createdAt' => $log->created_at,
                ];
            }, $logs),
        ]);
    }
    
    // === MICROSERVICE PROXY ===
    
    public function microservice_health($request) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_microservice_config';
        $config = $wpdb->get_row("SELECT * FROM $table LIMIT 1");
        
        if (!$config || empty($config->service_url)) {
            return rest_ensure_response([
                'success' => true,
                'data' => [
                    'status' => 'not_configured',
                    'message' => __('Microservice not configured', 'botflow-manager'),
                ],
            ]);
        }
        
        // Check microservice health
        $response = wp_remote_get($config->service_url . '/health', [
            'timeout' => 5,
            'headers' => [
                'X-API-Key' => get_option('botflow_microservice_key'),
            ],
        ]);
        
        $status = 'error';
        $health_result = null;
        
        if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
            $status = 'active';
            $health_result = json_decode(wp_remote_retrieve_body($response), true);
        }
        
        // Update status
        $wpdb->update($table, [
            'status' => $status,
            'last_health_check' => current_time('mysql'),
            'health_check_result' => json_encode($health_result),
        ], ['id' => $config->id]);
        
        return rest_ensure_response([
            'success' => true,
            'data' => [
                'status' => $status,
                'serviceUrl' => $config->service_url,
                'lastCheck' => current_time('c'),
                'result' => $health_result,
            ],
        ]);
    }
    
    public function microservice_process_ai($request) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_microservice_config';
        $config = $wpdb->get_row("SELECT * FROM $table WHERE status = 'active' LIMIT 1");
        
        if (!$config) {
            return new WP_Error('service_unavailable', __('Microservice not available', 'botflow-manager'), ['status' => 503]);
        }
        
        // Forward request to microservice
        $response = wp_remote_post($config->service_url . '/ai/process', [
            'timeout' => 30,
            'headers' => [
                'Content-Type' => 'application/json',
                'X-API-Key' => get_option('botflow_microservice_key'),
            ],
            'body' => json_encode($request->get_json_params()),
        ]);
        
        if (is_wp_error($response)) {
            return new WP_Error('service_error', $response->get_error_message(), ['status' => 502]);
        }
        
        $body = json_decode(wp_remote_retrieve_body($response), true);
        
        return rest_ensure_response([
            'success' => true,
            'data' => $body,
        ]);
    }
    
    public function microservice_webhook_callback($request) {
        global $wpdb;
        
        // This endpoint receives callbacks from the microservice
        $payload = $request->get_json_params();
        $event_type = $payload['event'] ?? 'unknown';
        
        // Process based on event type
        switch ($event_type) {
            case 'ai_complete':
                $this->handle_ai_complete($payload);
                break;
            case 'message_sent':
                $this->handle_message_sent($payload);
                break;
        }
        
        return rest_ensure_response(['success' => true]);
    }

    public function microservice_resolve_conversation($request) {
        $bot_id = (int) $request->get_param('bot_id');
        $contact_phone = sanitize_text_field($request->get_param('contact_phone'));
        $contact_name = sanitize_text_field($request->get_param('contact_name') ?? $contact_phone);

        if (!$bot_id || empty($contact_phone)) {
            return new WP_Error('missing_params', __('bot_id and contact_phone are required', 'botflow-manager'), ['status' => 400]);
        }

        $whatsapp = new BotFlow_WhatsApp();
        $conversation = $whatsapp->get_or_create_conversation($bot_id, $contact_phone, $contact_name);

        if (!$conversation) {
            return new WP_Error('conversation_error', __('Failed to resolve conversation', 'botflow-manager'), ['status' => 500]);
        }

        return rest_ensure_response([
            'success' => true,
            'data' => [
                'id' => (string) $conversation->id,
                'botId' => (string) $conversation->bot_id,
                'contactPhone' => $conversation->contact_phone,
                'contactName' => $conversation->contact_name,
            ],
        ]);
    }

    public function microservice_store_message($request) {
        $bot_id = (int) $request->get_param('bot_id');
        $conversation_id = (int) $request->get_param('conversation_id');
        $content = sanitize_textarea_field($request->get_param('content'));
        $role = sanitize_text_field($request->get_param('role') ?? 'user');
        $sender_name = sanitize_text_field($request->get_param('sender_name') ?? ($role === 'assistant' ? 'Bot' : 'User'));
        $sender_phone = sanitize_text_field($request->get_param('sender_phone') ?? '');

        if (!$bot_id || !$conversation_id || $content === '') {
            return new WP_Error('missing_params', __('bot_id, conversation_id and content are required', 'botflow-manager'), ['status' => 400]);
        }

        $direction = $role === 'assistant' ? 'outgoing' : 'incoming';
        $status = $direction === 'outgoing' ? 'sent' : 'read';

        $whatsapp = new BotFlow_WhatsApp();
        $message = $whatsapp->store_message(
            $bot_id,
            $conversation_id,
            $direction,
            $content,
            $sender_name,
            $sender_phone,
            $status
        );

        return rest_ensure_response([
            'success' => true,
            'data' => $message,
        ]);
    }

    public function microservice_send_message($request) {
        global $wpdb;

        $bot_id = (int) $request->get_param('bot_id');
        $conversation_id = (int) $request->get_param('conversation_id');
        $content = sanitize_textarea_field($request->get_param('content'));

        if (!$bot_id || !$conversation_id || $content === '') {
            return new WP_Error('missing_params', __('bot_id, conversation_id and content are required', 'botflow-manager'), ['status' => 400]);
        }

        $user_id = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT user_id FROM {$wpdb->prefix}botflow_bots WHERE id = %d",
            $bot_id
        ));

        if (!$user_id) {
            return new WP_Error('not_found', __('Bot not found', 'botflow-manager'), ['status' => 404]);
        }

        $whatsapp = new BotFlow_WhatsApp();
        $result = $whatsapp->send_message($bot_id, $conversation_id, $content, $user_id);

        if (is_wp_error($result)) {
            return $result;
        }

        return rest_ensure_response([
            'success' => true,
            'data' => $result,
        ]);
    }

    /**
     * List messages for AI context (microservice API key). No end-user tenant check — key is server-only.
     */
    public function microservice_get_conversation_messages($request) {
        global $wpdb;

        $conversation_id = (int) $request->get_param('id');
        $limit = (int) $request->get_param('limit');
        $limit = min(80, max(1, $limit > 0 ? $limit : 40));

        if (!$conversation_id) {
            return new WP_Error('missing_param', __('conversation id is required', 'botflow-manager'), ['status' => 400]);
        }

        $exists = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}botflow_conversations WHERE id = %d",
            $conversation_id
        ));

        if (!$exists) {
            return new WP_Error('not_found', __('Conversation not found', 'botflow-manager'), ['status' => 404]);
        }

        $table_msg = $wpdb->prefix . 'botflow_messages';
        $messages = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table_msg WHERE conversation_id = %d ORDER BY timestamp DESC LIMIT %d",
            $conversation_id,
            $limit
        ));

        if (!is_array($messages)) {
            $messages = [];
        }

        // Return chronological order for LLM readability
        $messages = array_reverse($messages);

        return rest_ensure_response([
            'success' => true,
            'data' => array_map(static function ($msg) {
                return [
                    'id' => (string) $msg->id,
                    'botId' => (string) $msg->bot_id,
                    'conversationId' => (string) $msg->conversation_id,
                    'direction' => $msg->direction,
                    'content' => $msg->content,
                    'senderName' => $msg->sender_name,
                    'senderPhone' => $msg->sender_phone,
                    'messageType' => $msg->message_type,
                    'mediaUrl' => $msg->media_url,
                    'status' => $msg->status,
                    'timestamp' => $msg->timestamp,
                ];
            }, $messages),
        ]);
    }
    
    private function handle_ai_complete($payload) {
        global $wpdb;
        
        $message_id = (int) ($payload['messageId'] ?? 0);
        $ai_response = $payload['response'] ?? '';
        
        if ($message_id && $ai_response) {
            $wpdb->update(
                $wpdb->prefix . 'botflow_messages',
                [
                    'ai_processed' => 1,
                    'ai_response' => $ai_response,
                ],
                ['id' => $message_id]
            );
        }
    }
    
    private function handle_message_sent($payload) {
        global $wpdb;
        
        $message_id = (int) ($payload['messageId'] ?? 0);
        $whatsapp_id = sanitize_text_field($payload['whatsappMessageId'] ?? '');
        $status = sanitize_text_field($payload['status'] ?? 'sent');
        
        if ($message_id) {
            $wpdb->update(
                $wpdb->prefix . 'botflow_messages',
                [
                    'whatsapp_message_id' => $whatsapp_id,
                    'status' => $status,
                ],
                ['id' => $message_id]
            );
        }
    }
    
    // === CONVERSATIONS & MESSAGES ===
    
    public function get_conversations($request) {
        global $wpdb;
        
        $user_id = $request->get_param('botflow_user_id');
        $bot_id = $request->get_param('bot_id');
        
        $table_conv = $wpdb->prefix . 'botflow_conversations';
        $table_bots = $wpdb->prefix . 'botflow_bots';
        
        $query = "SELECT c.* FROM $table_conv c 
                  INNER JOIN $table_bots b ON c.bot_id = b.id 
                  WHERE b.user_id = %d";
        $params = [$user_id];
        
        if ($bot_id) {
            $query .= " AND c.bot_id = %d";
            $params[] = (int) $bot_id;
        }
        
        $query .= " ORDER BY c.last_message_time DESC";
        
        $conversations = $wpdb->get_results($wpdb->prepare($query, ...$params));
        
        return rest_ensure_response([
            'success' => true,
            'data' => array_map(function($conv) {
                return [
                    'id' => (string) $conv->id,
                    'botId' => (string) $conv->bot_id,
                    'contactName' => $conv->contact_name,
                    'contactPhone' => $conv->contact_phone,
                    'lastMessage' => $conv->last_message,
                    'lastMessageTime' => $conv->last_message_time,
                    'unreadCount' => (int) $conv->unread_count,
                    'status' => $conv->status,
                ];
            }, $conversations),
        ]);
    }
    
    public function get_conversation($request) {
        global $wpdb;
        
        $id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');
        
        $table_conv = $wpdb->prefix . 'botflow_conversations';
        $table_bots = $wpdb->prefix . 'botflow_bots';
        
        $conversation = $wpdb->get_row($wpdb->prepare(
            "SELECT c.* FROM $table_conv c 
             INNER JOIN $table_bots b ON c.bot_id = b.id 
             WHERE c.id = %d AND b.user_id = %d",
            $id,
            $user_id
        ));
        
        if (!$conversation) {
            return new WP_Error('not_found', __('Conversation not found', 'botflow-manager'), ['status' => 404]);
        }
        
        // Mark as read
        $wpdb->update($table_conv, ['unread_count' => 0], ['id' => $id]);
        
        return rest_ensure_response([
            'success' => true,
            'data' => [
                'id' => (string) $conversation->id,
                'botId' => (string) $conversation->bot_id,
                'contactName' => $conversation->contact_name,
                'contactPhone' => $conversation->contact_phone,
                'lastMessage' => $conversation->last_message,
                'lastMessageTime' => $conversation->last_message_time,
                'unreadCount' => 0,
                'status' => $conversation->status,
            ],
        ]);
    }
    
    public function get_messages($request) {
        global $wpdb;
        
        $user_id = $request->get_param('botflow_user_id');
        $conversation_id = (int) $request->get_param('conversation_id');
        $page = max(1, (int) $request->get_param('page'));
        $per_page = min(100, max(1, (int) $request->get_param('per_page')));
        
        if (!$conversation_id) {
            return new WP_Error('missing_param', __('conversation_id is required', 'botflow-manager'), ['status' => 400]);
        }
        
        $table_msg = $wpdb->prefix . 'botflow_messages';
        $table_conv = $wpdb->prefix . 'botflow_conversations';
        $table_bots = $wpdb->prefix . 'botflow_bots';
        
        // Verify access
        $has_access = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM $table_conv c 
             INNER JOIN $table_bots b ON c.bot_id = b.id 
             WHERE c.id = %d AND b.user_id = %d",
            $conversation_id,
            $user_id
        ));
        
        if (!$has_access) {
            return new WP_Error('not_found', __('Conversation not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $total = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM $table_msg WHERE conversation_id = %d",
            $conversation_id
        ));
        
        $offset = ($page - 1) * $per_page;
        $messages = $wpdb->get_results($wpdb->prepare(
            "SELECT * FROM $table_msg WHERE conversation_id = %d ORDER BY timestamp ASC LIMIT %d OFFSET %d",
            $conversation_id,
            $per_page,
            $offset
        ));
        
        $total_pages = $total > 0 ? (int) ceil($total / $per_page) : 1;
        
        return rest_ensure_response([
            'success' => true,
            'data' => array_map(function($msg) {
                return [
                    'id' => (string) $msg->id,
                    'botId' => (string) $msg->bot_id,
                    'conversationId' => (string) $msg->conversation_id,
                    'direction' => $msg->direction,
                    'content' => $msg->content,
                    'senderName' => $msg->sender_name,
                    'senderPhone' => $msg->sender_phone,
                    'messageType' => $msg->message_type,
                    'mediaUrl' => $msg->media_url,
                    'status' => $msg->status,
                    'aiProcessed' => (bool) $msg->ai_processed,
                    'aiResponse' => $msg->ai_response,
                    'timestamp' => $msg->timestamp,
                ];
            }, $messages),
            'pagination' => [
                'page' => $page,
                'perPage' => $per_page,
                'total' => $total,
                'totalPages' => $total_pages,
            ],
        ]);
    }

    public function get_conversation_messages($request) {
        $request->set_param('conversation_id', (int) $request->get_param('id'));
        return $this->get_messages($request);
    }
    
    public function send_message($request) {
        $user_id = $request->get_param('botflow_user_id');
        $bot_id = (int) $request->get_param('bot_id');
        $conversation_id = (int) $request->get_param('conversation_id');
        $content = sanitize_textarea_field($request->get_param('content'));
        
        if (!$bot_id || !$conversation_id || !$content) {
            return new WP_Error('missing_params', __('bot_id, conversation_id and content are required', 'botflow-manager'), ['status' => 400]);
        }
        
        // Get WhatsApp config
        $whatsapp = new BotFlow_WhatsApp();
        $result = $whatsapp->send_message($bot_id, $conversation_id, $content, $user_id);
        
        if (is_wp_error($result)) {
            return $result;
        }
        
        return rest_ensure_response([
            'success' => true,
            'data' => $result,
        ]);
    }

    public function send_conversation_message($request) {
        global $wpdb;

        $conversation_id = (int) $request->get_param('id');
        $user_id = $request->get_param('botflow_user_id');

        if (!$conversation_id) {
            return new WP_Error('missing_params', __('conversation_id is required', 'botflow-manager'), ['status' => 400]);
        }

        $bot_id = $wpdb->get_var($wpdb->prepare(
            "SELECT c.bot_id
             FROM {$wpdb->prefix}botflow_conversations c
             INNER JOIN {$wpdb->prefix}botflow_bots b ON c.bot_id = b.id
             WHERE c.id = %d AND b.user_id = %d",
            $conversation_id,
            $user_id
        ));

        if (!$bot_id) {
            return new WP_Error('not_found', __('Conversation not found', 'botflow-manager'), ['status' => 404]);
        }

        $request->set_param('conversation_id', $conversation_id);
        $request->set_param('bot_id', (int) $bot_id);

        return $this->send_message($request);
    }
    
    // === WHATSAPP CONFIG ===
    
    public function get_whatsapp_config($request) {
        global $wpdb;
        
        $bot_id = (int) $request->get_param('bot_id');
        $user_id = $request->get_param('botflow_user_id');
        
        // Verify bot ownership
        $bot = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}botflow_bots WHERE id = %d AND user_id = %d",
            $bot_id,
            $user_id
        ));
        
        if (!$bot) {
            return new WP_Error('not_found', __('Bot not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $table = $wpdb->prefix . 'botflow_whatsapp_config';
        $config = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE bot_id = %d",
            $bot_id
        ));
        
        $webhook_url = rest_url("botflow/v1/webhook/{$bot_id}");
        
        if (!$config) {
            return rest_ensure_response([
                'success' => true,
                'data' => [
                    'botId' => (string) $bot_id,
                    'businessAccountId' => '',
                    'phoneNumberId' => '',
                    'accessToken' => '',
                    'webhookUrl' => $webhook_url,
                    'webhookSecret' => '',
                    'isConnected' => false,
                ],
            ]);
        }
        
        return rest_ensure_response([
            'success' => true,
            'data' => [
                'botId' => (string) $config->bot_id,
                'businessAccountId' => $config->business_account_id,
                'phoneNumberId' => $config->phone_number_id,
                'accessToken' => '••••••••', // Masked for security
                'webhookUrl' => $webhook_url,
                'webhookSecret' => $config->webhook_secret,
                'isConnected' => (bool) $config->is_connected,
            ],
        ]);
    }
    
    public function update_whatsapp_config($request) {
        global $wpdb;
        
        $bot_id = (int) $request->get_param('bot_id');
        $user_id = $request->get_param('botflow_user_id');
        
        // Verify bot ownership
        $bot = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}botflow_bots WHERE id = %d AND user_id = %d",
            $bot_id,
            $user_id
        ));
        
        if (!$bot) {
            return new WP_Error('not_found', __('Bot not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $table = $wpdb->prefix . 'botflow_whatsapp_config';
        
        $data = [
            'business_account_id' => sanitize_text_field($request->get_param('businessAccountId') ?? ''),
            'phone_number_id' => sanitize_text_field($request->get_param('phoneNumberId') ?? ''),
            'webhook_secret' => sanitize_text_field($request->get_param('webhookSecret') ?? ''),
        ];
        
        // Only update access token if provided and not masked
        $access_token = $request->get_param('accessToken');
        if ($access_token && $access_token !== '••••••••') {
            $data['access_token'] = $this->encryption->encrypt($access_token);
            $data['access_token_encrypted'] = 1;
        }
        
        // Check if config exists
        $existing = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM $table WHERE bot_id = %d",
            $bot_id
        ));
        
        if ($existing) {
            $data['is_connected'] = !empty($data['phone_number_id']) && !empty($data['business_account_id']);
            $wpdb->update($table, $data, ['bot_id' => $bot_id]);
        } else {
            $data['bot_id'] = $bot_id;
            $data['is_connected'] = !empty($data['phone_number_id']) && !empty($data['business_account_id']);
            $data['webhook_url'] = rest_url("botflow/v1/webhook/{$bot_id}");
            $wpdb->insert($table, $data);
        }
        
        // Update bot status if connected
        if ($data['is_connected']) {
            $wpdb->update(
                $wpdb->prefix . 'botflow_bots',
                ['status' => 'online', 'line_health' => 'healthy'],
                ['id' => $bot_id]
            );
        }
        
        return rest_ensure_response([
            'success' => true,
            'message' => __('WhatsApp configuration updated successfully', 'botflow-manager'),
        ]);
    }
    
    // === EVOLUTION CONFIG ===
    
    public function get_evolution_config($request) {
        global $wpdb;
        
        $bot_id = (int) $request->get_param('bot_id');
        $user_id = $request->get_param('botflow_user_id');
        
        // Verify bot ownership
        $bot = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}botflow_bots WHERE id = %d AND user_id = %d",
            $bot_id,
            $user_id
        ));
        
        if (!$bot) {
            return new WP_Error('not_found', __('Bot not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $table = $wpdb->prefix . 'botflow_evolution_config';
        $config = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table WHERE bot_id = %d",
            $bot_id
        ));
        
        if (!$config) {
            return rest_ensure_response([
                'success' => true,
                'data' => [
                    'botId' => (string) $bot_id,
                    'instanceName' => '',
                    'apiUrl' => '',
                    'apiKey' => '',
                    'qrCode' => null,
                    'connectionStatus' => 'disconnected',
                    'webhookUrl' => rest_url("botflow/v1/webhook/evolution/{$bot_id}"),
                ],
            ]);
        }
        
        return rest_ensure_response([
            'success' => true,
            'data' => [
                'botId' => (string) $config->bot_id,
                'instanceName' => $config->instance_name,
                'apiUrl' => $config->api_url,
                'apiKey' => '••••••••',
                'qrCode' => $config->qr_code,
                'connectionStatus' => $config->connection_status,
                'webhookUrl' => $config->webhook_url,
            ],
        ]);
    }
    
    public function update_evolution_config($request) {
        global $wpdb;
        
        $bot_id = (int) $request->get_param('bot_id');
        $user_id = $request->get_param('botflow_user_id');
        
        // Verify bot ownership
        $bot = $wpdb->get_row($wpdb->prepare(
            "SELECT id FROM {$wpdb->prefix}botflow_bots WHERE id = %d AND user_id = %d",
            $bot_id,
            $user_id
        ));
        
        if (!$bot) {
            return new WP_Error('not_found', __('Bot not found', 'botflow-manager'), ['status' => 404]);
        }
        
        $table = $wpdb->prefix . 'botflow_evolution_config';
        
        $data = [
            'instance_name' => sanitize_text_field($request->get_param('instanceName') ?? ''),
            'api_url' => esc_url_raw($request->get_param('apiUrl') ?? ''),
            'webhook_url' => rest_url("botflow/v1/webhook/evolution/{$bot_id}"),
        ];
        
        $api_key = $request->get_param('apiKey');
        if ($api_key && $api_key !== '••••••••') {
            $data['api_key_encrypted'] = $this->encryption->encrypt($api_key);
        }
        
        $existing = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM $table WHERE bot_id = %d",
            $bot_id
        ));
        
        if ($existing) {
            $wpdb->update($table, $data, ['bot_id' => $bot_id]);
        } else {
            $data['bot_id'] = $bot_id;
            if (empty($data['api_key_encrypted'])) {
                $data['api_key_encrypted'] = '';
            }
            $wpdb->insert($table, $data);
        }
        
        return rest_ensure_response([
            'success' => true,
            'message' => __('Evolution API configuration updated', 'botflow-manager'),
        ]);
    }
}
