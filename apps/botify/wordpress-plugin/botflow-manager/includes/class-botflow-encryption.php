<?php
/**
 * Encryption Helper for sensitive data
 */

if (!defined('ABSPATH')) {
    exit;
}

class BotFlow_Encryption {
    
    private $key;
    private $cipher = 'aes-256-gcm';
    
    public function __construct() {
        $this->key = $this->get_encryption_key();
    }
    
    /**
     * Get or generate encryption key
     */
    private function get_encryption_key() {
        $key = get_option('botflow_encryption_key');
        
        if (empty($key)) {
            if (function_exists('random_bytes')) {
                $key = base64_encode(random_bytes(32));
            } else {
                $key = base64_encode(wp_generate_password(32, true, true));
            }
            update_option('botflow_encryption_key', $key);
        }
        
        return base64_decode($key);
    }
    
    /**
     * Encrypt a string
     */
    public function encrypt($plaintext) {
        if (empty($plaintext)) {
            return '';
        }
        
        // Check if OpenSSL is available
        if (!function_exists('openssl_encrypt')) {
            // Fallback: base64 encode (not secure, but prevents plain text storage)
            return 'base64:' . base64_encode($plaintext);
        }
        
        $iv_length = openssl_cipher_iv_length($this->cipher);
        $iv = random_bytes($iv_length);
        $tag = '';
        
        $ciphertext = openssl_encrypt(
            $plaintext,
            $this->cipher,
            $this->key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag,
            '',
            16
        );
        
        if ($ciphertext === false) {
            return '';
        }
        
        // Combine IV + tag + ciphertext and encode
        return 'enc:' . base64_encode($iv . $tag . $ciphertext);
    }
    
    /**
     * Decrypt a string
     */
    public function decrypt($encrypted) {
        if (empty($encrypted)) {
            return '';
        }
        
        // Handle base64 fallback
        if (strpos($encrypted, 'base64:') === 0) {
            return base64_decode(substr($encrypted, 7));
        }
        
        // Handle encrypted data
        if (strpos($encrypted, 'enc:') !== 0) {
            // Not encrypted, return as is (for legacy data)
            return $encrypted;
        }
        
        if (!function_exists('openssl_decrypt')) {
            return '';
        }
        
        $data = base64_decode(substr($encrypted, 4));
        
        if ($data === false) {
            return '';
        }
        
        $iv_length = openssl_cipher_iv_length($this->cipher);
        $tag_length = 16;
        
        $iv = substr($data, 0, $iv_length);
        $tag = substr($data, $iv_length, $tag_length);
        $ciphertext = substr($data, $iv_length + $tag_length);
        
        $plaintext = openssl_decrypt(
            $ciphertext,
            $this->cipher,
            $this->key,
            OPENSSL_RAW_DATA,
            $iv,
            $tag
        );
        
        return $plaintext !== false ? $plaintext : '';
    }
    
    /**
     * Check if a string is encrypted
     */
    public function is_encrypted($data) {
        return strpos($data, 'enc:') === 0 || strpos($data, 'base64:') === 0;
    }
    
    /**
     * Rotate encryption key (re-encrypt all data with new key)
     */
    public function rotate_key($new_key = null) {
        global $wpdb;
        
        $old_key = $this->key;
        
        // Generate new key if not provided
        if ($new_key === null) {
            $new_key = random_bytes(32);
        }
        
        // Update key in database
        update_option('botflow_encryption_key', base64_encode($new_key));
        
        // Re-encrypt Meta accounts access tokens
        $accounts = $wpdb->get_results(
            "SELECT id, access_token_encrypted FROM {$wpdb->prefix}botflow_meta_accounts"
        );
        
        foreach ($accounts as $account) {
            if (!empty($account->access_token_encrypted)) {
                // Decrypt with old key
                $plaintext = $this->decrypt($account->access_token_encrypted);
                
                // Update key reference
                $this->key = $new_key;
                
                // Encrypt with new key
                $new_encrypted = $this->encrypt($plaintext);
                
                // Restore old key for next iteration
                $this->key = $old_key;
                
                // Update database
                $wpdb->update(
                    $wpdb->prefix . 'botflow_meta_accounts',
                    ['access_token_encrypted' => $new_encrypted],
                    ['id' => $account->id]
                );
            }
        }
        
        // Re-encrypt WhatsApp config access tokens
        $configs = $wpdb->get_results(
            "SELECT id, access_token, access_token_encrypted FROM {$wpdb->prefix}botflow_whatsapp_config WHERE access_token_encrypted = 1"
        );
        
        foreach ($configs as $config) {
            if (!empty($config->access_token)) {
                $plaintext = $this->decrypt($config->access_token);
                $this->key = $new_key;
                $new_encrypted = $this->encrypt($plaintext);
                $this->key = $old_key;
                
                $wpdb->update(
                    $wpdb->prefix . 'botflow_whatsapp_config',
                    ['access_token' => $new_encrypted],
                    ['id' => $config->id]
                );
            }
        }
        
        // Re-encrypt Evolution API keys
        $evolution_configs = $wpdb->get_results(
            "SELECT id, api_key_encrypted FROM {$wpdb->prefix}botflow_evolution_config"
        );
        
        foreach ($evolution_configs as $config) {
            if (!empty($config->api_key_encrypted)) {
                $plaintext = $this->decrypt($config->api_key_encrypted);
                $this->key = $new_key;
                $new_encrypted = $this->encrypt($plaintext);
                $this->key = $old_key;
                
                $wpdb->update(
                    $wpdb->prefix . 'botflow_evolution_config',
                    ['api_key_encrypted' => $new_encrypted],
                    ['id' => $config->id]
                );
            }
        }
        
        // Finally update the instance key
        $this->key = $new_key;
        
        return true;
    }
}
