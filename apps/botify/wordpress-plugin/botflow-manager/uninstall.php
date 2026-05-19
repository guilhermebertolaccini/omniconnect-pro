<?php
/**
 * BotFlow Manager Uninstall
 * 
 * This file runs when the plugin is uninstalled (deleted) via WordPress admin.
 * It cleans up all plugin data from the database.
 */

// Exit if not called by WordPress
if (!defined('WP_UNINSTALL_PLUGIN')) {
    exit;
}

// Check if we should preserve data
$preserve_data = get_option('botflow_preserve_data_on_uninstall', false);

if ($preserve_data) {
    // User opted to keep data, just return
    return;
}

global $wpdb;

// Stop any running microservice
do_action('botflow_stop_microservice');

// Drop all plugin tables
$tables = [
    $wpdb->prefix . 'botflow_bots',
    $wpdb->prefix . 'botflow_whatsapp_config',
    $wpdb->prefix . 'botflow_flows',
    $wpdb->prefix . 'botflow_conversations',
    $wpdb->prefix . 'botflow_messages',
    $wpdb->prefix . 'botflow_tokens',
    $wpdb->prefix . 'botflow_ai_config',
    $wpdb->prefix . 'botflow_meta_webhook_logs',
    $wpdb->prefix . 'botflow_meta_accounts',
    $wpdb->prefix . 'botflow_microservice_config',
    $wpdb->prefix . 'botflow_evolution_config',
    $wpdb->prefix . 'botflow_evolution_webhook_logs',
    $wpdb->prefix . 'botflow_ai_queue',
];

foreach ($tables as $table) {
    $wpdb->query("DROP TABLE IF EXISTS $table");
}

// Remove all plugin options
$options = [
    'botflow_jwt_secret',
    'botflow_jwt_expiration',
    'botflow_whatsapp_api_version',
    'botflow_allowed_origins',
    'botflow_microservice_key',
    'botflow_microservice_url',
    'botflow_encryption_key',
    'botflow_rate_limit_max',
    'botflow_default_ai_provider',
    'botflow_default_ai_model',
    'botflow_preserve_data_on_uninstall',
    'botflow_version',
];

foreach ($options as $option) {
    delete_option($option);
}

// Clean up transients
$wpdb->query(
    "DELETE FROM {$wpdb->options} WHERE option_name LIKE '_transient_botflow_%' OR option_name LIKE '_transient_timeout_botflow_%'"
);

// Remove any scheduled cron events
$cron_hooks = [
    'botflow_health_check',
    'botflow_cleanup_expired_tokens',
    'botflow_process_ai_queue',
];

foreach ($cron_hooks as $hook) {
    $timestamp = wp_next_scheduled($hook);
    if ($timestamp) {
        wp_unschedule_event($timestamp, $hook);
    }
}

// Flush rewrite rules
flush_rewrite_rules();
