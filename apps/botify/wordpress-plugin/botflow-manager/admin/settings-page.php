<?php
/**
 * Settings Page
 */

if (!defined('ABSPATH')) {
    exit;
}

// Save settings
if (isset($_POST['botflow_save_settings']) && check_admin_referer('botflow_settings_nonce')) {
    update_option('botflow_jwt_secret', sanitize_text_field($_POST['botflow_jwt_secret']));
    update_option('botflow_jwt_expiration', absint($_POST['botflow_jwt_expiration']));
    update_option('botflow_whatsapp_api_version', sanitize_text_field($_POST['botflow_whatsapp_api_version']));
    update_option('botflow_allowed_origins', sanitize_text_field($_POST['botflow_allowed_origins']));
    
    echo '<div class="notice notice-success"><p>' . __('Settings saved successfully!', 'botflow-manager') . '</p></div>';
}

$jwt_secret = get_option('botflow_jwt_secret', '');
$jwt_expiration = get_option('botflow_jwt_expiration', 86400);
$api_version = get_option('botflow_whatsapp_api_version', 'v18.0');
$allowed_origins = get_option('botflow_allowed_origins', '');
?>

<div class="wrap">
    <h1><?php _e('BotFlow Settings', 'botflow-manager'); ?></h1>
    
    <form method="post" action="">
        <?php wp_nonce_field('botflow_settings_nonce'); ?>
        
        <h2><?php _e('JWT Authentication', 'botflow-manager'); ?></h2>
        <table class="form-table">
            <tr>
                <th scope="row">
                    <label for="botflow_jwt_secret"><?php _e('JWT Secret Key', 'botflow-manager'); ?></label>
                </th>
                <td>
                    <input type="text" id="botflow_jwt_secret" name="botflow_jwt_secret" 
                           value="<?php echo esc_attr($jwt_secret); ?>" class="regular-text" />
                    <p class="description">
                        <?php _e('Secret key used to sign JWT tokens. Keep this secure!', 'botflow-manager'); ?>
                    </p>
                    <button type="button" class="button" onclick="document.getElementById('botflow_jwt_secret').value = '<?php echo wp_generate_password(64, true, true); ?>'">
                        <?php _e('Generate New Secret', 'botflow-manager'); ?>
                    </button>
                </td>
            </tr>
            <tr>
                <th scope="row">
                    <label for="botflow_jwt_expiration"><?php _e('Token Expiration (seconds)', 'botflow-manager'); ?></label>
                </th>
                <td>
                    <input type="number" id="botflow_jwt_expiration" name="botflow_jwt_expiration" 
                           value="<?php echo esc_attr($jwt_expiration); ?>" class="small-text" min="3600" />
                    <p class="description">
                        <?php _e('How long access tokens remain valid. Default: 86400 (24 hours)', 'botflow-manager'); ?>
                    </p>
                </td>
            </tr>
        </table>
        
        <h2><?php _e('WhatsApp API', 'botflow-manager'); ?></h2>
        <table class="form-table">
            <tr>
                <th scope="row">
                    <label for="botflow_whatsapp_api_version"><?php _e('API Version', 'botflow-manager'); ?></label>
                </th>
                <td>
                    <select id="botflow_whatsapp_api_version" name="botflow_whatsapp_api_version">
                        <option value="v18.0" <?php selected($api_version, 'v18.0'); ?>>v18.0</option>
                        <option value="v19.0" <?php selected($api_version, 'v19.0'); ?>>v19.0</option>
                        <option value="v20.0" <?php selected($api_version, 'v20.0'); ?>>v20.0</option>
                    </select>
                    <p class="description">
                        <?php _e('WhatsApp Cloud API version to use.', 'botflow-manager'); ?>
                    </p>
                </td>
            </tr>
        </table>
        
        <h2><?php _e('CORS Settings', 'botflow-manager'); ?></h2>
        <table class="form-table">
            <tr>
                <th scope="row">
                    <label for="botflow_allowed_origins"><?php _e('Allowed Origins', 'botflow-manager'); ?></label>
                </th>
                <td>
                    <textarea id="botflow_allowed_origins" name="botflow_allowed_origins" 
                              class="large-text" rows="3"><?php echo esc_textarea($allowed_origins); ?></textarea>
                    <p class="description">
                        <?php _e('Comma-separated list of allowed origins for CORS. Leave empty to allow all origins.', 'botflow-manager'); ?>
                        <br>
                        <?php _e('Example: https://your-react-app.com, https://localhost:5173', 'botflow-manager'); ?>
                    </p>
                </td>
            </tr>
        </table>
        
        <p class="submit">
            <input type="submit" name="botflow_save_settings" class="button-primary" 
                   value="<?php _e('Save Settings', 'botflow-manager'); ?>" />
        </p>
    </form>
    
    <hr>
    
    <h2><?php _e('React Frontend Configuration', 'botflow-manager'); ?></h2>
    <p><?php _e('Add this environment variable to your React application:', 'botflow-manager'); ?></p>
    <pre style="background: #f0f0f0; padding: 15px; border-radius: 4px;">
VITE_WORDPRESS_API_URL=<?php echo esc_url(rest_url()); ?></pre>
</div>
