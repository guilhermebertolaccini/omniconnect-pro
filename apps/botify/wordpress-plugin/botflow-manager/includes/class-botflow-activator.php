<?php
/**
 * Plugin Activator - Creates database tables and deploys microservice
 */

if (!defined('ABSPATH')) {
    exit;
}

class BotFlow_Activator {
    
    /**
     * Run on plugin activation
     */
    public static function activate() {
        self::create_tables();
        self::ensure_messages_index();
        self::set_default_options();
        self::deploy_microservice();
        flush_rewrite_rules();
    }
    
    /**
     * Run on plugin deactivation
     */
    public static function deactivate() {
        self::stop_microservice();
        flush_rewrite_rules();
    }
    
    /**
     * Create database tables
     */
    private static function create_tables() {
        global $wpdb;
        
        $charset_collate = $wpdb->get_charset_collate();
        
        // Bots table
        $table_bots = $wpdb->prefix . 'botflow_bots';
        $sql_bots = "CREATE TABLE $table_bots (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            name varchar(255) NOT NULL,
            description text,
            phone_number varchar(50) NOT NULL,
            status enum('online','offline','error','connecting') DEFAULT 'offline',
            line_health enum('healthy','degraded','disconnected') DEFAULT 'disconnected',
            messages_received bigint(20) DEFAULT 0,
            messages_sent bigint(20) DEFAULT 0,
            active_conversations int(11) DEFAULT 0,
            last_activity datetime DEFAULT NULL,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            user_id bigint(20) unsigned NOT NULL,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            KEY status (status)
        ) $charset_collate;";
        
        // WhatsApp Config table
        $table_whatsapp = $wpdb->prefix . 'botflow_whatsapp_config';
        $sql_whatsapp = "CREATE TABLE $table_whatsapp (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            bot_id bigint(20) unsigned NOT NULL,
            business_account_id varchar(100),
            phone_number_id varchar(100),
            access_token text,
            access_token_encrypted tinyint(1) DEFAULT 0,
            webhook_url varchar(500),
            webhook_secret varchar(255),
            is_connected tinyint(1) DEFAULT 0,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY bot_id (bot_id)
        ) $charset_collate;";
        
        // Flows table
        $table_flows = $wpdb->prefix . 'botflow_flows';
        $sql_flows = "CREATE TABLE $table_flows (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            bot_id bigint(20) unsigned NOT NULL,
            name varchar(255) NOT NULL,
            trigger_keyword varchar(500),
            nodes longtext,
            edges longtext,
            is_active tinyint(1) DEFAULT 1,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY bot_id (bot_id),
            KEY is_active (is_active)
        ) $charset_collate;";
        
        // Conversations table
        $table_conversations = $wpdb->prefix . 'botflow_conversations';
        $sql_conversations = "CREATE TABLE $table_conversations (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            bot_id bigint(20) unsigned NOT NULL,
            contact_name varchar(255),
            contact_phone varchar(50) NOT NULL,
            last_message text,
            last_message_time datetime,
            unread_count int(11) DEFAULT 0,
            status enum('active','archived','blocked') DEFAULT 'active',
            context longtext,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY bot_id (bot_id),
            KEY contact_phone (contact_phone),
            KEY status (status)
        ) $charset_collate;";
        
        // Messages table
        $table_messages = $wpdb->prefix . 'botflow_messages';
        $sql_messages = "CREATE TABLE $table_messages (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            bot_id bigint(20) unsigned NOT NULL,
            conversation_id bigint(20) unsigned NOT NULL,
            direction enum('incoming','outgoing') NOT NULL,
            content text NOT NULL,
            sender_name varchar(255),
            sender_phone varchar(50),
            message_type enum('text','image','document','audio','video','location','buttons','list','sticker','contact') DEFAULT 'text',
            media_url varchar(500),
            whatsapp_message_id varchar(100),
            status enum('pending','sent','delivered','read','failed') DEFAULT 'pending',
            ai_processed tinyint(1) DEFAULT 0,
            ai_response text,
            timestamp datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY bot_id (bot_id),
            KEY conversation_id (conversation_id),
            KEY idx_conv_timestamp (conversation_id, timestamp),
            KEY whatsapp_message_id (whatsapp_message_id),
            KEY timestamp (timestamp),
            KEY ai_processed (ai_processed)
        ) $charset_collate;";
        
        // JWT Tokens table (for token blacklisting/refresh)
        $table_tokens = $wpdb->prefix . 'botflow_tokens';
        $sql_tokens = "CREATE TABLE $table_tokens (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            user_id bigint(20) unsigned NOT NULL,
            token_hash varchar(255) NOT NULL,
            token_jti varchar(64),
            expires_at datetime NOT NULL,
            is_revoked tinyint(1) DEFAULT 0,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            KEY token_hash (token_hash),
            KEY token_jti (token_jti),
            KEY expires_at (expires_at)
        ) $charset_collate;";
        
        // AI Config table (per flow node)
        $table_ai_config = $wpdb->prefix . 'botflow_ai_config';
        $sql_ai_config = "CREATE TABLE $table_ai_config (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            flow_id bigint(20) unsigned NOT NULL,
            node_id varchar(100) NOT NULL,
            provider enum('lovable','gemini','openai') DEFAULT 'lovable',
            model varchar(100) NOT NULL DEFAULT 'google/gemini-3-flash-preview',
            system_prompt text,
            user_prompt_template text,
            temperature decimal(3,2) DEFAULT 0.70,
            max_tokens int DEFAULT 500,
            label varchar(255),
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY flow_node (flow_id, node_id),
            KEY flow_id (flow_id)
        ) $charset_collate;";
        
        // Meta Webhook Logs table
        $table_meta_logs = $wpdb->prefix . 'botflow_meta_webhook_logs';
        $sql_meta_logs = "CREATE TABLE $table_meta_logs (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            account_id varchar(100),
            waba_id varchar(100),
            phone_number_id varchar(100),
            event_type varchar(100) NOT NULL,
            payload longtext NOT NULL,
            status enum('received','processing','processed','failed') DEFAULT 'received',
            error_message text,
            processing_time_ms int,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY account_id (account_id),
            KEY event_type (event_type),
            KEY status (status),
            KEY created_at (created_at)
        ) $charset_collate;";
        
        // Meta Accounts table
        $table_meta_accounts = $wpdb->prefix . 'botflow_meta_accounts';
        $sql_meta_accounts = "CREATE TABLE $table_meta_accounts (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            user_id bigint(20) unsigned NOT NULL,
            account_name varchar(255) NOT NULL,
            business_id varchar(100),
            access_token_encrypted text NOT NULL,
            token_expires_at datetime,
            webhook_callback_url varchar(500),
            webhook_verify_token varchar(255),
            webhook_events text,
            is_active tinyint(1) DEFAULT 1,
            last_sync datetime,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY user_id (user_id),
            KEY business_id (business_id),
            KEY is_active (is_active)
        ) $charset_collate;";
        
        // Microservice Config table
        $table_microservice = $wpdb->prefix . 'botflow_microservice_config';
        $sql_microservice = "CREATE TABLE $table_microservice (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            service_url varchar(500) NOT NULL,
            api_key_hash varchar(255) NOT NULL,
            status enum('active','inactive','error','starting') DEFAULT 'inactive',
            last_health_check datetime,
            health_check_result text,
            version varchar(50),
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id)
        ) $charset_collate;";
        
        // Evolution API Config table
        $table_evolution = $wpdb->prefix . 'botflow_evolution_config';
        $sql_evolution = "CREATE TABLE $table_evolution (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            bot_id bigint(20) unsigned NOT NULL,
            instance_name varchar(255) NOT NULL,
            api_url varchar(500) NOT NULL,
            api_key_encrypted text NOT NULL,
            qr_code text,
            connection_status enum('disconnected','connecting','connected','error') DEFAULT 'disconnected',
            webhook_url varchar(500),
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            updated_at datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY bot_id (bot_id),
            KEY instance_name (instance_name)
        ) $charset_collate;";
        
        // Evolution Webhook Logs table
        $table_evolution_logs = $wpdb->prefix . 'botflow_evolution_webhook_logs';
        $sql_evolution_logs = "CREATE TABLE $table_evolution_logs (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            instance_name varchar(255),
            event_type varchar(100) NOT NULL,
            payload longtext NOT NULL,
            status enum('received','processing','processed','failed') DEFAULT 'received',
            error_message text,
            processing_time_ms int,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            KEY instance_name (instance_name),
            KEY event_type (event_type),
            KEY status (status),
            KEY created_at (created_at)
        ) $charset_collate;";
        
        // AI Processing Queue table
        $table_ai_queue = $wpdb->prefix . 'botflow_ai_queue';
        $sql_ai_queue = "CREATE TABLE $table_ai_queue (
            id bigint(20) unsigned NOT NULL AUTO_INCREMENT,
            conversation_id bigint(20) unsigned NOT NULL,
            message_id bigint(20) unsigned NOT NULL,
            flow_id bigint(20) unsigned NOT NULL,
            node_id varchar(100) NOT NULL,
            status enum('pending','processing','completed','failed') DEFAULT 'pending',
            attempts int DEFAULT 0,
            max_attempts int DEFAULT 3,
            result text,
            error_message text,
            created_at datetime DEFAULT CURRENT_TIMESTAMP,
            started_at datetime,
            completed_at datetime,
            PRIMARY KEY (id),
            KEY conversation_id (conversation_id),
            KEY status (status),
            KEY created_at (created_at)
        ) $charset_collate;";
        
        require_once(ABSPATH . 'wp-admin/includes/upgrade.php');
        
        dbDelta($sql_bots);
        dbDelta($sql_whatsapp);
        dbDelta($sql_flows);
        dbDelta($sql_conversations);
        dbDelta($sql_messages);
        dbDelta($sql_tokens);
        dbDelta($sql_ai_config);
        dbDelta($sql_meta_logs);
        dbDelta($sql_meta_accounts);
        dbDelta($sql_microservice);
        dbDelta($sql_evolution);
        dbDelta($sql_evolution_logs);
        dbDelta($sql_ai_queue);
    }
    
    /**
     * Ensure composite index exists for message queries (conversation_id + timestamp)
     */
    private static function ensure_messages_index() {
        global $wpdb;
        $table = $wpdb->prefix . 'botflow_messages';
        $index_exists = $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM information_schema.statistics 
             WHERE table_schema = %s AND table_name = %s AND index_name = 'idx_conv_timestamp'",
            DB_NAME,
            $table
        ));
        if (!$index_exists) {
            $wpdb->query("ALTER TABLE `$table` ADD INDEX idx_conv_timestamp (conversation_id, timestamp)");
        }
    }
    
    /**
     * Set default options
     */
    private static function set_default_options() {
        // Generate a cryptographically secure JWT secret if not exists
        if (!get_option('botflow_jwt_secret')) {
            if (function_exists('random_bytes')) {
                $secret = bin2hex(random_bytes(32));
            } else {
                $secret = wp_generate_password(64, true, true);
            }
            update_option('botflow_jwt_secret', $secret);
        }
        
        // Set default JWT expiration (24 hours)
        if (!get_option('botflow_jwt_expiration')) {
            update_option('botflow_jwt_expiration', 86400);
        }
        
        // Set default WhatsApp API version
        if (!get_option('botflow_whatsapp_api_version')) {
            update_option('botflow_whatsapp_api_version', 'v21.0');
        }
        
        // Set allowed origins (require explicit configuration - NO wildcard by default)
        if (!get_option('botflow_allowed_origins')) {
            update_option('botflow_allowed_origins', home_url());
        }
        
        // Microservice API key
        if (!get_option('botflow_microservice_key')) {
            if (function_exists('random_bytes')) {
                $key = bin2hex(random_bytes(32));
            } else {
                $key = wp_generate_password(64, false);
            }
            update_option('botflow_microservice_key', $key);
        }
        
        // Encryption key for sensitive data
        if (!get_option('botflow_encryption_key')) {
            if (function_exists('random_bytes')) {
                $key = base64_encode(random_bytes(32));
            } else {
                $key = base64_encode(wp_generate_password(32, true, true));
            }
            update_option('botflow_encryption_key', $key);
        }
        
        // Rate limiting defaults
        if (!get_option('botflow_rate_limit_max')) {
            update_option('botflow_rate_limit_max', 60); // requests per minute
        }
        
        // Default AI provider
        if (!get_option('botflow_default_ai_provider')) {
            update_option('botflow_default_ai_provider', 'lovable');
        }
        
        // Default AI model
        if (!get_option('botflow_default_ai_model')) {
            update_option('botflow_default_ai_model', 'google/gemini-3-flash-preview');
        }
    }
    
    /**
     * Deploy microservice (stub - actual deployment depends on hosting environment)
     */
    private static function deploy_microservice() {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_microservice_config';
        
        // Check if already configured
        $existing = $wpdb->get_var("SELECT COUNT(*) FROM $table");
        
        if (!$existing) {
            // Default microservice URL (to be configured by admin)
            $service_url = get_option('botflow_microservice_url', '');
            $api_key = get_option('botflow_microservice_key');
            
            $wpdb->insert($table, [
                'service_url' => $service_url,
                'api_key_hash' => hash('sha256', $api_key),
                'status' => 'inactive',
            ]);
        }
        
        // Fire action for custom deployment logic
        do_action('botflow_deploy_microservice');
    }
    
    /**
     * Stop microservice
     */
    private static function stop_microservice() {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_microservice_config';
        
        $wpdb->update(
            $table,
            ['status' => 'inactive'],
            ['status' => 'active']
        );
        
        // Fire action for custom stop logic
        do_action('botflow_stop_microservice');
    }
}
