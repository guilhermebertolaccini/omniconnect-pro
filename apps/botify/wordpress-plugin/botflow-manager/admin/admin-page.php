<?php
/**
 * Admin Dashboard Page
 */

if (!defined('ABSPATH')) {
    exit;
}

global $wpdb;

// Get statistics
$total_bots = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}botflow_bots");
$online_bots = $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->prefix}botflow_bots WHERE status = 'online'");
$total_messages = $wpdb->get_var("SELECT SUM(messages_received + messages_sent) FROM {$wpdb->prefix}botflow_bots");
$active_conversations = $wpdb->get_var("SELECT SUM(active_conversations) FROM {$wpdb->prefix}botflow_bots");
?>

<div class="wrap">
    <h1><?php _e('BotFlow Manager', 'botflow-manager'); ?></h1>
    
    <div class="botflow-dashboard">
        <div class="botflow-stats">
            <div class="stat-card">
                <h3><?php echo esc_html($total_bots); ?></h3>
                <p><?php _e('Total Bots', 'botflow-manager'); ?></p>
            </div>
            <div class="stat-card">
                <h3><?php echo esc_html($online_bots); ?></h3>
                <p><?php _e('Online Bots', 'botflow-manager'); ?></p>
            </div>
            <div class="stat-card">
                <h3><?php echo esc_html(number_format($total_messages ?: 0)); ?></h3>
                <p><?php _e('Total Messages', 'botflow-manager'); ?></p>
            </div>
            <div class="stat-card">
                <h3><?php echo esc_html($active_conversations ?: 0); ?></h3>
                <p><?php _e('Active Conversations', 'botflow-manager'); ?></p>
            </div>
        </div>
        
        <div class="botflow-info">
            <h2><?php _e('API Endpoints', 'botflow-manager'); ?></h2>
            <p><?php _e('Use these endpoints to integrate with your React frontend:', 'botflow-manager'); ?></p>
            
            <table class="widefat">
                <thead>
                    <tr>
                        <th><?php _e('Endpoint', 'botflow-manager'); ?></th>
                        <th><?php _e('Methods', 'botflow-manager'); ?></th>
                        <th><?php _e('Description', 'botflow-manager'); ?></th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td><code>/wp-json/botflow/v1/auth/login</code></td>
                        <td>POST</td>
                        <td><?php _e('Authenticate and get JWT token', 'botflow-manager'); ?></td>
                    </tr>
                    <tr>
                        <td><code>/wp-json/botflow/v1/bots</code></td>
                        <td>GET, POST</td>
                        <td><?php _e('List or create bots', 'botflow-manager'); ?></td>
                    </tr>
                    <tr>
                        <td><code>/wp-json/botflow/v1/bots/{id}</code></td>
                        <td>GET, PUT, DELETE</td>
                        <td><?php _e('Get, update, or delete a specific bot', 'botflow-manager'); ?></td>
                    </tr>
                    <tr>
                        <td><code>/wp-json/botflow/v1/flows</code></td>
                        <td>GET, POST</td>
                        <td><?php _e('List or create conversation flows', 'botflow-manager'); ?></td>
                    </tr>
                    <tr>
                        <td><code>/wp-json/botflow/v1/conversations</code></td>
                        <td>GET</td>
                        <td><?php _e('List conversations', 'botflow-manager'); ?></td>
                    </tr>
                    <tr>
                        <td><code>/wp-json/botflow/v1/messages</code></td>
                        <td>GET, POST</td>
                        <td><?php _e('Get or send messages', 'botflow-manager'); ?></td>
                    </tr>
                    <tr>
                        <td><code>/wp-json/botflow/v1/whatsapp-config/{bot_id}</code></td>
                        <td>GET, PUT</td>
                        <td><?php _e('Manage WhatsApp configuration', 'botflow-manager'); ?></td>
                    </tr>
                    <tr>
                        <td><code>/wp-json/botflow/v1/webhook/{bot_id}</code></td>
                        <td>GET, POST</td>
                        <td><?php _e('WhatsApp webhook endpoint', 'botflow-manager'); ?></td>
                    </tr>
                </tbody>
            </table>
            
            <h3><?php _e('Authentication', 'botflow-manager'); ?></h3>
            <p><?php _e('All endpoints (except login and webhook) require a JWT token. Include it in the Authorization header:', 'botflow-manager'); ?></p>
            <code>Authorization: Bearer YOUR_JWT_TOKEN</code>
        </div>
    </div>
</div>

<style>
.botflow-dashboard {
    margin-top: 20px;
}
.botflow-stats {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
}
.stat-card {
    background: #fff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
    text-align: center;
}
.stat-card h3 {
    font-size: 36px;
    margin: 0 0 10px;
    color: #2271b1;
}
.stat-card p {
    margin: 0;
    color: #666;
}
.botflow-info {
    background: #fff;
    padding: 20px;
    border-radius: 8px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.botflow-info table code {
    background: #f0f0f0;
    padding: 2px 6px;
    border-radius: 3px;
}
</style>
