<?php
/**
 * Plugin Name: BotFlow Manager
 * Plugin URI: https://github.com/your-repo/botflow-manager
 * Description: Complete WhatsApp bot management system with REST API endpoints, AI processing, and real-time webhooks
 * Version: 2.0.0
 * Author: Your Company
 * Author URI: https://your-company.com
 * License: GPL v2 or later
 * Text Domain: botflow-manager
 * Requires at least: 5.8
 * Requires PHP: 7.4
 */

if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('BOTFLOW_VERSION', '2.0.0');
define('BOTFLOW_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('BOTFLOW_PLUGIN_URL', plugin_dir_url(__FILE__));
define('BOTFLOW_PLUGIN_BASENAME', plugin_basename(__FILE__));

// Minimum requirements
define('BOTFLOW_MIN_PHP_VERSION', '7.4');
define('BOTFLOW_MIN_WP_VERSION', '5.8');

/**
 * Check minimum requirements before loading plugin
 */
function botflow_check_requirements() {
    $errors = [];
    
    if (version_compare(PHP_VERSION, BOTFLOW_MIN_PHP_VERSION, '<')) {
        $errors[] = sprintf(
            __('BotFlow Manager requires PHP %s or higher. You are running PHP %s.', 'botflow-manager'),
            BOTFLOW_MIN_PHP_VERSION,
            PHP_VERSION
        );
    }
    
    if (version_compare(get_bloginfo('version'), BOTFLOW_MIN_WP_VERSION, '<')) {
        $errors[] = sprintf(
            __('BotFlow Manager requires WordPress %s or higher.', 'botflow-manager'),
            BOTFLOW_MIN_WP_VERSION
        );
    }
    
    return $errors;
}

/**
 * Display admin notice for requirement errors
 */
function botflow_requirements_notice() {
    $errors = botflow_check_requirements();
    if (!empty($errors)) {
        foreach ($errors as $error) {
            echo '<div class="notice notice-error"><p>' . esc_html($error) . '</p></div>';
        }
    }
}

// Check requirements before proceeding
$requirement_errors = botflow_check_requirements();
if (!empty($requirement_errors)) {
    add_action('admin_notices', 'botflow_requirements_notice');
    return;
}

// ============= Include Required Files =============

// Core utilities (load first - no dependencies)
require_once BOTFLOW_PLUGIN_DIR . 'includes/class-botflow-encryption.php';

// Activator (database setup)
require_once BOTFLOW_PLUGIN_DIR . 'includes/class-botflow-activator.php';

// Authentication
require_once BOTFLOW_PLUGIN_DIR . 'includes/class-botflow-jwt-auth.php';

// API and Handlers
require_once BOTFLOW_PLUGIN_DIR . 'includes/class-botflow-rest-api.php';
require_once BOTFLOW_PLUGIN_DIR . 'includes/class-botflow-whatsapp.php';
require_once BOTFLOW_PLUGIN_DIR . 'includes/class-botflow-webhook.php';

// ============= Activation/Deactivation Hooks =============

register_activation_hook(__FILE__, ['BotFlow_Activator', 'activate']);
register_deactivation_hook(__FILE__, ['BotFlow_Activator', 'deactivate']);

// ============= Plugin Initialization =============

/**
 * Main plugin class
 */
class BotFlow_Manager {
    
    /**
     * Singleton instance
     */
    private static $instance = null;
    
    /**
     * Plugin components
     */
    private $jwt_auth;
    private $rest_api;
    private $webhook;
    private $encryption;
    
    /**
     * Get singleton instance
     */
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    /**
     * Constructor
     */
    private function __construct() {
        $this->init_components();
        $this->init_hooks();
    }
    
    /**
     * Initialize plugin components
     */
    private function init_components() {
        // Initialize encryption first (used by other components)
        $this->encryption = new BotFlow_Encryption();
        
        // Initialize authentication
        $this->jwt_auth = new BotFlow_JWT_Auth();
        $this->jwt_auth->init();
        
        // Initialize REST API
        $this->rest_api = new BotFlow_REST_API();
        $this->rest_api->init();
        
        // Initialize Webhook Handler
        $this->webhook = new BotFlow_Webhook();
        $this->webhook->init();
    }
    
    /**
     * Initialize WordPress hooks
     */
    private function init_hooks() {
        // Admin hooks
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('admin_init', [$this, 'register_settings']);
        add_action('admin_enqueue_scripts', [$this, 'enqueue_admin_assets']);
        
        // Plugin action links
        add_filter('plugin_action_links_' . BOTFLOW_PLUGIN_BASENAME, [$this, 'add_action_links']);
        
        // Cron jobs for maintenance
        add_action('botflow_cleanup_expired_tokens', [$this, 'cleanup_expired_tokens']);
        add_action('botflow_health_check', [$this, 'run_health_check']);
        
        // Schedule cron jobs if not already scheduled
        if (!wp_next_scheduled('botflow_cleanup_expired_tokens')) {
            wp_schedule_event(time(), 'hourly', 'botflow_cleanup_expired_tokens');
        }
        
        if (!wp_next_scheduled('botflow_health_check')) {
            wp_schedule_event(time(), 'twicedaily', 'botflow_health_check');
        }
    }
    
    /**
     * Add admin menu pages
     */
    public function add_admin_menu() {
        add_menu_page(
            __('BotFlow Manager', 'botflow-manager'),
            __('BotFlow', 'botflow-manager'),
            'manage_options',
            'botflow-manager',
            [$this, 'render_admin_page'],
            'dashicons-format-chat',
            30
        );
        
        add_submenu_page(
            'botflow-manager',
            __('Dashboard', 'botflow-manager'),
            __('Dashboard', 'botflow-manager'),
            'manage_options',
            'botflow-manager',
            [$this, 'render_admin_page']
        );
        
        add_submenu_page(
            'botflow-manager',
            __('Settings', 'botflow-manager'),
            __('Settings', 'botflow-manager'),
            'manage_options',
            'botflow-settings',
            [$this, 'render_settings_page']
        );
        
        add_submenu_page(
            'botflow-manager',
            __('Microservice', 'botflow-manager'),
            __('Microservice', 'botflow-manager'),
            'manage_options',
            'botflow-microservice',
            [$this, 'render_microservice_page']
        );
    }
    
    /**
     * Register plugin settings
     */
    public function register_settings() {
        // JWT Settings
        register_setting('botflow_settings', 'botflow_jwt_secret', [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ]);
        
        register_setting('botflow_settings', 'botflow_jwt_expiration', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 3600,
        ]);
        
        register_setting('botflow_settings', 'botflow_refresh_token_expiration', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 604800, // 7 days
        ]);
        
        // API Settings
        register_setting('botflow_settings', 'botflow_whatsapp_api_version', [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => 'v18.0',
        ]);
        
        register_setting('botflow_settings', 'botflow_allowed_origins', [
            'type' => 'string',
            'sanitize_callback' => [$this, 'sanitize_origins'],
            'default' => '',
        ]);
        
        // Microservice Settings
        register_setting('botflow_settings', 'botflow_microservice_url', [
            'type' => 'string',
            'sanitize_callback' => 'esc_url_raw',
            'default' => '',
        ]);
        
        register_setting('botflow_settings', 'botflow_microservice_key', [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => '',
        ]);
        
        // AI Provider Settings
        register_setting('botflow_settings', 'botflow_default_ai_provider', [
            'type' => 'string',
            'sanitize_callback' => 'sanitize_text_field',
            'default' => 'gemini',
        ]);
        
        // Rate Limiting
        register_setting('botflow_settings', 'botflow_rate_limit_requests', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 100,
        ]);
        
        register_setting('botflow_settings', 'botflow_rate_limit_window', [
            'type' => 'integer',
            'sanitize_callback' => 'absint',
            'default' => 60,
        ]);
    }
    
    /**
     * Sanitize allowed origins
     */
    public function sanitize_origins($value) {
        if (empty($value)) {
            return '';
        }
        
        $origins = array_map('trim', explode(',', $value));
        $sanitized = [];
        
        foreach ($origins as $origin) {
            $origin = esc_url_raw($origin);
            if (!empty($origin)) {
                $sanitized[] = $origin;
            }
        }
        
        return implode(',', $sanitized);
    }
    
    /**
     * Enqueue admin assets
     */
    public function enqueue_admin_assets($hook) {
        if (strpos($hook, 'botflow') === false) {
            return;
        }
        
        wp_enqueue_style(
            'botflow-admin',
            BOTFLOW_PLUGIN_URL . 'admin/css/admin.css',
            [],
            BOTFLOW_VERSION
        );
        
        wp_enqueue_script(
            'botflow-admin',
            BOTFLOW_PLUGIN_URL . 'admin/js/admin.js',
            ['jquery'],
            BOTFLOW_VERSION,
            true
        );
        
        wp_localize_script('botflow-admin', 'botflowAdmin', [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('botflow_admin_nonce'),
            'apiBase' => rest_url('botflow/v1'),
            'i18n' => [
                'confirmDelete' => __('Are you sure you want to delete this?', 'botflow-manager'),
                'saving' => __('Saving...', 'botflow-manager'),
                'saved' => __('Saved!', 'botflow-manager'),
                'error' => __('An error occurred', 'botflow-manager'),
            ],
        ]);
    }
    
    /**
     * Add plugin action links
     */
    public function add_action_links($links) {
        $plugin_links = [
            '<a href="' . admin_url('admin.php?page=botflow-settings') . '">' . __('Settings', 'botflow-manager') . '</a>',
            '<a href="' . admin_url('admin.php?page=botflow-manager') . '">' . __('Dashboard', 'botflow-manager') . '</a>',
        ];
        
        return array_merge($plugin_links, $links);
    }
    
    /**
     * Render admin page
     */
    public function render_admin_page() {
        if (file_exists(BOTFLOW_PLUGIN_DIR . 'admin/admin-page.php')) {
            include BOTFLOW_PLUGIN_DIR . 'admin/admin-page.php';
        } else {
            $this->render_default_admin_page();
        }
    }
    
    /**
     * Render settings page
     */
    public function render_settings_page() {
        if (file_exists(BOTFLOW_PLUGIN_DIR . 'admin/settings-page.php')) {
            include BOTFLOW_PLUGIN_DIR . 'admin/settings-page.php';
        } else {
            $this->render_default_settings_page();
        }
    }
    
    /**
     * Render microservice page
     */
    public function render_microservice_page() {
        if (file_exists(BOTFLOW_PLUGIN_DIR . 'admin/microservice-page.php')) {
            include BOTFLOW_PLUGIN_DIR . 'admin/microservice-page.php';
        } else {
            $this->render_default_microservice_page();
        }
    }
    
    /**
     * Default admin page content
     */
    private function render_default_admin_page() {
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('BotFlow Manager', 'botflow-manager'); ?></h1>
            
            <div class="botflow-dashboard">
                <div class="botflow-card">
                    <h2><?php echo esc_html__('Quick Stats', 'botflow-manager'); ?></h2>
                    <p><?php echo esc_html__('Dashboard coming soon...', 'botflow-manager'); ?></p>
                </div>
                
                <div class="botflow-card">
                    <h2><?php echo esc_html__('API Status', 'botflow-manager'); ?></h2>
                    <p>
                        <strong><?php echo esc_html__('REST API:', 'botflow-manager'); ?></strong>
                        <span class="status-ok"><?php echo esc_html__('Active', 'botflow-manager'); ?></span>
                    </p>
                    <p>
                        <strong><?php echo esc_html__('Microservice:', 'botflow-manager'); ?></strong>
                        <?php 
                        $microservice_url = get_option('botflow_microservice_url');
                        if ($microservice_url) {
                            echo '<span class="status-ok">' . esc_html__('Configured', 'botflow-manager') . '</span>';
                        } else {
                            echo '<span class="status-warning">' . esc_html__('Not configured', 'botflow-manager') . '</span>';
                        }
                        ?>
                    </p>
                </div>
                
                <div class="botflow-card">
                    <h2><?php echo esc_html__('Quick Links', 'botflow-manager'); ?></h2>
                    <ul>
                        <li><a href="<?php echo esc_url(admin_url('admin.php?page=botflow-settings')); ?>"><?php echo esc_html__('Plugin Settings', 'botflow-manager'); ?></a></li>
                        <li><a href="<?php echo esc_url(admin_url('admin.php?page=botflow-microservice')); ?>"><?php echo esc_html__('Microservice Config', 'botflow-manager'); ?></a></li>
                        <li><a href="<?php echo esc_url(rest_url('botflow/v1/health')); ?>" target="_blank"><?php echo esc_html__('API Health Check', 'botflow-manager'); ?></a></li>
                    </ul>
                </div>
            </div>
        </div>
        
        <style>
            .botflow-dashboard {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
                margin-top: 20px;
            }
            .botflow-card {
                background: #fff;
                border: 1px solid #ccd0d4;
                border-radius: 4px;
                padding: 20px;
            }
            .botflow-card h2 {
                margin-top: 0;
                border-bottom: 1px solid #eee;
                padding-bottom: 10px;
            }
            .status-ok { color: #00a32a; font-weight: bold; }
            .status-warning { color: #dba617; font-weight: bold; }
            .status-error { color: #d63638; font-weight: bold; }
        </style>
        <?php
    }
    
    /**
     * Default settings page content
     */
    private function render_default_settings_page() {
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('BotFlow Settings', 'botflow-manager'); ?></h1>
            
            <form method="post" action="options.php">
                <?php settings_fields('botflow_settings'); ?>
                
                <h2><?php echo esc_html__('Authentication', 'botflow-manager'); ?></h2>
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php echo esc_html__('JWT Secret', 'botflow-manager'); ?></th>
                        <td>
                            <input type="password" name="botflow_jwt_secret" 
                                   value="<?php echo esc_attr(get_option('botflow_jwt_secret')); ?>" 
                                   class="regular-text" />
                            <p class="description"><?php echo esc_html__('Leave empty to auto-generate a secure secret.', 'botflow-manager'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php echo esc_html__('Token Expiration (seconds)', 'botflow-manager'); ?></th>
                        <td>
                            <input type="number" name="botflow_jwt_expiration" 
                                   value="<?php echo esc_attr(get_option('botflow_jwt_expiration', 3600)); ?>" 
                                   class="small-text" min="300" />
                        </td>
                    </tr>
                </table>
                
                <h2><?php echo esc_html__('API Configuration', 'botflow-manager'); ?></h2>
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php echo esc_html__('Allowed Origins', 'botflow-manager'); ?></th>
                        <td>
                            <textarea name="botflow_allowed_origins" rows="3" 
                                      class="large-text"><?php echo esc_textarea(get_option('botflow_allowed_origins')); ?></textarea>
                            <p class="description"><?php echo esc_html__('Comma-separated list of allowed origins for CORS.', 'botflow-manager'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php echo esc_html__('WhatsApp API Version', 'botflow-manager'); ?></th>
                        <td>
                            <input type="text" name="botflow_whatsapp_api_version" 
                                   value="<?php echo esc_attr(get_option('botflow_whatsapp_api_version', 'v18.0')); ?>" 
                                   class="regular-text" />
                        </td>
                    </tr>
                </table>
                
                <h2><?php echo esc_html__('Rate Limiting', 'botflow-manager'); ?></h2>
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php echo esc_html__('Max Requests', 'botflow-manager'); ?></th>
                        <td>
                            <input type="number" name="botflow_rate_limit_requests" 
                                   value="<?php echo esc_attr(get_option('botflow_rate_limit_requests', 100)); ?>" 
                                   class="small-text" min="10" />
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php echo esc_html__('Window (seconds)', 'botflow-manager'); ?></th>
                        <td>
                            <input type="number" name="botflow_rate_limit_window" 
                                   value="<?php echo esc_attr(get_option('botflow_rate_limit_window', 60)); ?>" 
                                   class="small-text" min="10" />
                        </td>
                    </tr>
                </table>
                
                <?php submit_button(); ?>
            </form>
        </div>
        <?php
    }
    
    /**
     * Default microservice page content
     */
    private function render_default_microservice_page() {
        ?>
        <div class="wrap">
            <h1><?php echo esc_html__('Microservice Configuration', 'botflow-manager'); ?></h1>
            
            <form method="post" action="options.php">
                <?php settings_fields('botflow_settings'); ?>
                
                <table class="form-table">
                    <tr>
                        <th scope="row"><?php echo esc_html__('Microservice URL', 'botflow-manager'); ?></th>
                        <td>
                            <input type="url" name="botflow_microservice_url" 
                                   value="<?php echo esc_attr(get_option('botflow_microservice_url')); ?>" 
                                   class="regular-text" placeholder="https://your-microservice.com" />
                            <p class="description"><?php echo esc_html__('URL where the Node.js microservice is running.', 'botflow-manager'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php echo esc_html__('API Key', 'botflow-manager'); ?></th>
                        <td>
                            <input type="password" name="botflow_microservice_key" 
                                   value="<?php echo esc_attr(get_option('botflow_microservice_key', get_option('botflow_microservice_api_key'))); ?>" 
                                   class="regular-text" />
                            <button type="button" class="button" id="generate-api-key">
                                <?php echo esc_html__('Generate New Key', 'botflow-manager'); ?>
                            </button>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php echo esc_html__('Default AI Provider', 'botflow-manager'); ?></th>
                        <td>
                            <select name="botflow_default_ai_provider">
                                <option value="openai" <?php selected(get_option('botflow_default_ai_provider'), 'openai'); ?>>OpenAI</option>
                                <option value="gemini" <?php selected(get_option('botflow_default_ai_provider'), 'gemini'); ?>>Google Gemini</option>
                            </select>
                        </td>
                    </tr>
                </table>
                
                <?php submit_button(); ?>
            </form>
            
            <hr />
            
            <h2><?php echo esc_html__('Microservice Status', 'botflow-manager'); ?></h2>
            <div id="microservice-status">
                <button type="button" class="button" id="check-microservice-status">
                    <?php echo esc_html__('Check Status', 'botflow-manager'); ?>
                </button>
                <div id="status-result" style="margin-top: 10px;"></div>
            </div>
            
            <hr />
            
            <h2><?php echo esc_html__('Deployment Instructions', 'botflow-manager'); ?></h2>
            <div class="botflow-card">
                <p><?php echo esc_html__('The microservice can be deployed using Docker:', 'botflow-manager'); ?></p>
                <pre style="background: #f1f1f1; padding: 15px; overflow-x: auto;">
cd wp-content/plugins/botflow-manager/microservice
docker-compose up -d</pre>
                
                <p><?php echo esc_html__('Or using Node.js directly:', 'botflow-manager'); ?></p>
                <pre style="background: #f1f1f1; padding: 15px; overflow-x: auto;">
cd wp-content/plugins/botflow-manager/microservice
npm install
npm run build
npm start</pre>
            </div>
        </div>
        
        <script>
            jQuery(document).ready(function($) {
                $('#generate-api-key').on('click', function() {
                    var key = '';
                    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
                    for (var i = 0; i < 32; i++) {
                        key += chars.charAt(Math.floor(Math.random() * chars.length));
                    }
                    $('input[name="botflow_microservice_key"]').val(key);
                });
                
                $('#check-microservice-status').on('click', function() {
                    var btn = $(this);
                    var resultDiv = $('#status-result');
                    var url = $('input[name="botflow_microservice_url"]').val();
                    
                    if (!url) {
                        resultDiv.html('<span style="color: #d63638;">Please enter a microservice URL first.</span>');
                        return;
                    }
                    
                    btn.prop('disabled', true).text('Checking...');
                    
                    $.ajax({
                        url: url + '/health',
                        method: 'GET',
                        timeout: 5000,
                        success: function(response) {
                            resultDiv.html('<span style="color: #00a32a;">✓ Microservice is online</span>');
                        },
                        error: function() {
                            resultDiv.html('<span style="color: #d63638;">✗ Cannot connect to microservice</span>');
                        },
                        complete: function() {
                            btn.prop('disabled', false).text('Check Status');
                        }
                    });
                });
            });
        </script>
        <?php
    }
    
    /**
     * Cleanup expired tokens (cron job)
     */
    public function cleanup_expired_tokens() {
        global $wpdb;
        $table_name = $wpdb->prefix . 'botflow_tokens';
        
        // Check if table exists
        if ($wpdb->get_var("SHOW TABLES LIKE '$table_name'") !== $table_name) {
            return;
        }
        
        // Delete expired tokens
        $wpdb->query(
            $wpdb->prepare(
                "DELETE FROM $table_name WHERE expires_at < %s",
                current_time('mysql')
            )
        );
        
        // Log cleanup
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log(sprintf(
                '[BotFlow] Cleaned up %d expired tokens',
                $wpdb->rows_affected
            ));
        }
    }
    
    /**
     * Run health check (cron job)
     */
    public function run_health_check() {
        $microservice_url = get_option('botflow_microservice_url');
        
        if (empty($microservice_url)) {
            return;
        }
        
        $response = wp_remote_get($microservice_url . '/health', [
            'timeout' => 10,
        ]);
        
        $status = 'error';
        if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
            $status = 'ok';
        }
        
        update_option('botflow_microservice_last_health_check', [
            'status' => $status,
            'timestamp' => current_time('mysql'),
        ]);
    }
    
    /**
     * Get encryption instance
     */
    public function get_encryption() {
        return $this->encryption;
    }
    
    /**
     * Get JWT auth instance
     */
    public function get_jwt_auth() {
        return $this->jwt_auth;
    }
    
    /**
     * Get REST API instance
     */
    public function get_rest_api() {
        return $this->rest_api;
    }
}

// ============= Initialize Plugin =============

function botflow_manager() {
    return BotFlow_Manager::get_instance();
}

// Initialize on plugins_loaded
add_action('plugins_loaded', 'botflow_manager');

// ============= Helper Functions =============

/**
 * Get plugin encryption instance
 */
function botflow_encryption() {
    return botflow_manager()->get_encryption();
}

/**
 * Encrypt sensitive data
 */
function botflow_encrypt($data) {
    return botflow_encryption()->encrypt($data);
}

/**
 * Decrypt sensitive data
 */
function botflow_decrypt($encrypted_data) {
    return botflow_encryption()->decrypt($encrypted_data);
}
