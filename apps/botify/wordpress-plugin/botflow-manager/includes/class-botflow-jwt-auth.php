<?php
/**
 * JWT Authentication Handler
 * Security enhanced version with rate limiting and proper token validation
 */

if (!defined('ABSPATH')) {
    exit;
}

class BotFlow_JWT_Auth {
    private function extract_token_from_request($request) {
        $auth_header = $request->get_header('Authorization');
        if ($auth_header && strpos($auth_header, 'Bearer ') === 0) {
            return substr($auth_header, 7);
        }

        $botflow_header = $request->get_header('X-BotFlow-Token');
        if (!empty($botflow_header)) {
            return strpos($botflow_header, 'Bearer ') === 0
                ? substr($botflow_header, 7)
                : $botflow_header;
        }

        return null;
    }

    
    private $secret_key;
    private $expiration;
    private $rate_limit_max = 60; // Max requests per minute
    private $rate_limit_window = 60; // Window in seconds
    
    public function __construct() {
        $this->secret_key = get_option('botflow_jwt_secret');
        $this->expiration = (int) get_option('botflow_jwt_expiration', 86400);
        
        // Ensure secret key is strong enough
        if (empty($this->secret_key) || strlen($this->secret_key) < 32) {
            $this->secret_key = $this->generate_secure_secret();
            update_option('botflow_jwt_secret', $this->secret_key);
        }
    }
    
    /**
     * Generate a cryptographically secure secret
     */
    private function generate_secure_secret() {
        if (function_exists('random_bytes')) {
            return bin2hex(random_bytes(32));
        }
        return wp_generate_password(64, true, true);
    }
    
    /**
     * Initialize JWT Auth
     */
    public function init() {
        add_action('rest_api_init', [$this, 'register_auth_endpoints']);
        add_filter('rest_pre_dispatch', [$this, 'validate_token'], 10, 3);
    }
    
    /**
     * Register authentication endpoints
     */
    public function register_auth_endpoints() {
        register_rest_route('botflow/v1', '/auth/login', [
            'methods' => 'POST',
            'callback' => [$this, 'login'],
            'permission_callback' => '__return_true',
            'args' => [
                'username' => [
                    'required' => true,
                    'type' => 'string',
                    'sanitize_callback' => 'sanitize_text_field',
                    'validate_callback' => function($value) {
                        return !empty($value) && strlen($value) <= 255;
                    }
                ],
                'password' => [
                    'required' => true,
                    'type' => 'string',
                    'validate_callback' => function($value) {
                        return !empty($value) && strlen($value) <= 1000;
                    }
                ],
            ],
        ]);
        
        register_rest_route('botflow/v1', '/auth/refresh', [
            'methods' => 'POST',
            'callback' => [$this, 'refresh_token'],
            'permission_callback' => '__return_true',
        ]);
        
        register_rest_route('botflow/v1', '/auth/logout', [
            'methods' => 'POST',
            'callback' => [$this, 'logout'],
            'permission_callback' => [$this, 'is_authenticated'],
        ]);
        
        register_rest_route('botflow/v1', '/auth/me', [
            'methods' => 'GET',
            'callback' => [$this, 'get_current_user'],
            'permission_callback' => [$this, 'is_authenticated'],
        ]);
    }
    
    /**
     * Check rate limit for an identifier
     */
    private function check_rate_limit($identifier) {
        $transient_key = 'botflow_rate_' . md5($identifier);
        $current = get_transient($transient_key);
        
        if ($current === false) {
            set_transient($transient_key, 1, $this->rate_limit_window);
            return true;
        }
        
        if ($current >= $this->rate_limit_max) {
            return false;
        }
        
        set_transient($transient_key, $current + 1, $this->rate_limit_window);
        return true;
    }
    
    /**
     * Get client IP address
     */
    private function get_client_ip() {
        $ip = '';
        
        // Check for proxy headers (in order of trust)
        $headers = [
            'HTTP_CF_CONNECTING_IP', // Cloudflare
            'HTTP_X_REAL_IP',
            'HTTP_X_FORWARDED_FOR',
            'REMOTE_ADDR',
        ];
        
        foreach ($headers as $header) {
            if (!empty($_SERVER[$header])) {
                $ip = $_SERVER[$header];
                // For X-Forwarded-For, take the first IP
                if ($header === 'HTTP_X_FORWARDED_FOR') {
                    $ips = explode(',', $ip);
                    $ip = trim($ips[0]);
                }
                break;
            }
        }
        
        return filter_var($ip, FILTER_VALIDATE_IP) ? $ip : 'unknown';
    }
    
    /**
     * Login endpoint with rate limiting
     */
    public function login($request) {
        $client_ip = $this->get_client_ip();
        
        // Rate limit by IP
        if (!$this->check_rate_limit('login_' . $client_ip)) {
            return new WP_Error(
                'rate_limit_exceeded',
                __('Too many login attempts. Please try again later.', 'botflow-manager'),
                ['status' => 429]
            );
        }
        
        $username = $request->get_param('username');
        $password = $request->get_param('password');
        
        // Authenticate user
        $user = wp_authenticate($username, $password);
        
        if (is_wp_error($user)) {
            // Log failed attempt
            error_log(sprintf(
                'BotFlow: Failed login attempt for user "%s" from IP %s',
                $username,
                $client_ip
            ));
            
            // Don't reveal whether username exists
            return new WP_Error(
                'invalid_credentials',
                __('Invalid username or password', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        // Check if user has required capabilities
        if (!user_can($user, 'read')) {
            return new WP_Error(
                'insufficient_permissions',
                __('User does not have sufficient permissions', 'botflow-manager'),
                ['status' => 403]
            );
        }
        
        // Generate tokens
        $access_token = $this->generate_token($user, 'access');
        $refresh_token = $this->generate_token($user, 'refresh');
        
        // Store refresh token hash
        $this->store_token($user->ID, $refresh_token);
        
        return rest_ensure_response([
            'success' => true,
            'data' => [
                'access_token' => $access_token,
                'refresh_token' => $refresh_token,
                'token_type' => 'Bearer',
                'expires_in' => $this->expiration,
                'user' => [
                    'id' => $user->ID,
                    'email' => $user->user_email,
                    'display_name' => $user->display_name,
                    'roles' => $user->roles,
                ],
            ],
        ]);
    }
    
    /**
     * Refresh token endpoint
     */
    public function refresh_token($request) {
        $client_ip = $this->get_client_ip();
        
        // Rate limit refresh attempts
        if (!$this->check_rate_limit('refresh_' . $client_ip)) {
            return new WP_Error(
                'rate_limit_exceeded',
                __('Too many refresh attempts. Please try again later.', 'botflow-manager'),
                ['status' => 429]
            );
        }
        
        $token = $this->extract_token_from_request($request);
        if (!$token) {
            // Compatibility fallback for clients that send refresh token in body
            $token = $request->get_param('refresh_token') ?: $request->get_param('refreshToken');
        }

        if (!$token) {
            return new WP_Error(
                'missing_token',
                __('Refresh token is required', 'botflow-manager'),
                ['status' => 401]
            );
        }

        $decoded = $this->decode_token($token);
        
        if (is_wp_error($decoded)) {
            return $decoded;
        }
        
        if ($decoded['type'] !== 'refresh') {
            return new WP_Error(
                'invalid_token_type',
                __('Invalid token type', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        // Check if token is revoked
        if ($this->is_token_revoked($token)) {
            return new WP_Error(
                'token_revoked',
                __('Token has been revoked', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        $user = get_user_by('id', $decoded['user_id']);
        
        if (!$user) {
            return new WP_Error(
                'user_not_found',
                __('User not found', 'botflow-manager'),
                ['status' => 404]
            );
        }
        
        // Revoke old refresh token (token rotation)
        $this->revoke_token($token);
        
        // Generate new tokens
        $access_token = $this->generate_token($user, 'access');
        $new_refresh_token = $this->generate_token($user, 'refresh');
        
        // Store new refresh token
        $this->store_token($user->ID, $new_refresh_token);
        
        return rest_ensure_response([
            'success' => true,
            'data' => [
                'access_token' => $access_token,
                'refresh_token' => $new_refresh_token,
                'token_type' => 'Bearer',
                'expires_in' => $this->expiration,
            ],
        ]);
    }
    
    /**
     * Logout endpoint
     */
    public function logout($request) {
        $token = $this->extract_token_from_request($request);
        if (!$token) {
            return new WP_Error(
                'missing_token',
                __('Authorization token is required', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        // Revoke both access and any associated refresh tokens
        $decoded = $this->decode_token($token);
        if (!is_wp_error($decoded)) {
            $this->revoke_all_user_tokens($decoded['user_id']);
        }
        
        return rest_ensure_response([
            'success' => true,
            'message' => __('Successfully logged out', 'botflow-manager'),
        ]);
    }
    
    /**
     * Get current user endpoint
     */
    public function get_current_user($request) {
        $user_id = $request->get_param('botflow_user_id');
        $user = get_user_by('id', $user_id);
        
        if (!$user) {
            return new WP_Error(
                'user_not_found',
                __('User not found', 'botflow-manager'),
                ['status' => 404]
            );
        }
        
        return rest_ensure_response([
            'success' => true,
            'data' => [
                'id' => $user->ID,
                'email' => $user->user_email,
                'display_name' => $user->display_name,
                'first_name' => $user->first_name,
                'last_name' => $user->last_name,
                'roles' => $user->roles,
                'avatar_url' => get_avatar_url($user->ID),
            ],
        ]);
    }
    
    /**
     * Generate JWT token with enhanced security
     */
    private function generate_token($user, $type = 'access') {
        $issued_at = time();
        $not_before = $issued_at;
        
        // Access token: standard expiration
        // Refresh token: 7x longer (but max 30 days)
        if ($type === 'refresh') {
            $expiration_time = min($issued_at + ($this->expiration * 7), $issued_at + (30 * 24 * 60 * 60));
        } else {
            $expiration_time = $issued_at + $this->expiration;
        }
        
        $payload = [
            'iss' => get_bloginfo('url'),
            'aud' => get_bloginfo('url'),
            'iat' => $issued_at,
            'nbf' => $not_before,
            'exp' => $expiration_time,
            'sub' => $user->ID,
            'type' => $type,
            'jti' => $this->generate_jti(), // Unique token ID
        ];
        
        return $this->encode_jwt($payload);
    }
    
    /**
     * Generate unique token identifier
     */
    private function generate_jti() {
        if (function_exists('random_bytes')) {
            return bin2hex(random_bytes(16));
        }
        return wp_generate_password(32, false);
    }
    
    /**
     * Encode JWT with HMAC-SHA256
     */
    private function encode_jwt($payload) {
        $header = $this->base64_url_encode(json_encode([
            'typ' => 'JWT',
            'alg' => 'HS256',
        ]));
        
        $payload_encoded = $this->base64_url_encode(json_encode($payload));
        
        $signature = hash_hmac('sha256', "$header.$payload_encoded", $this->secret_key, true);
        $signature_encoded = $this->base64_url_encode($signature);
        
        return "$header.$payload_encoded.$signature_encoded";
    }
    
    /**
     * Decode and validate JWT token
     */
    public function decode_token($token) {
        // Basic format validation
        if (empty($token) || !is_string($token)) {
            return new WP_Error(
                'invalid_token',
                __('Token is required', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        $parts = explode('.', $token);
        
        if (count($parts) !== 3) {
            return new WP_Error(
                'invalid_token',
                __('Invalid token format', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        list($header, $payload, $signature) = $parts;
        
        // Verify signature using timing-safe comparison
        $expected_signature = $this->base64_url_encode(
            hash_hmac('sha256', "$header.$payload", $this->secret_key, true)
        );
        
        if (!hash_equals($expected_signature, $signature)) {
            return new WP_Error(
                'invalid_signature',
                __('Invalid token signature', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        $payload_decoded = json_decode($this->base64_url_decode($payload), true);
        
        if (!$payload_decoded || !is_array($payload_decoded)) {
            return new WP_Error(
                'invalid_payload',
                __('Invalid token payload', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        // Validate required claims
        $required_claims = ['iss', 'exp', 'sub', 'type'];
        foreach ($required_claims as $claim) {
            if (!isset($payload_decoded[$claim])) {
                return new WP_Error(
                    'invalid_token',
                    __('Token is missing required claims', 'botflow-manager'),
                    ['status' => 401]
                );
            }
        }
        
        // Check issuer
        if ($payload_decoded['iss'] !== get_bloginfo('url')) {
            return new WP_Error(
                'invalid_issuer',
                __('Token issuer is invalid', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        // Check expiration
        if ($payload_decoded['exp'] < time()) {
            return new WP_Error(
                'token_expired',
                __('Token has expired', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        // Check not-before if present
        if (isset($payload_decoded['nbf']) && $payload_decoded['nbf'] > time()) {
            return new WP_Error(
                'token_not_valid_yet',
                __('Token is not yet valid', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        // Map 'sub' to 'user_id' for backward compatibility
        $payload_decoded['user_id'] = $payload_decoded['sub'];
        
        return $payload_decoded;
    }
    
    /**
     * Validate token on REST API requests
     */
    public function validate_token($result, $server, $request) {
        $route = $request->get_route();
        
        // Skip validation for non-botflow routes
        if (strpos($route, '/botflow/v1') !== 0) {
            return $result;
        }
        
        // Skip validation for public endpoints
        $public_routes = [
            '/botflow/v1/auth/login',
            '/botflow/v1/auth/refresh',
            '/botflow/v1/webhook',
            '/botflow/v1/health',
            '/botflow/v1/microservice/webhook', // Microservice webhook
            '/botflow/v1/microservice/', // Microservice API-key protected routes
        ];
        
        foreach ($public_routes as $public_route) {
            if (strpos($route, $public_route) === 0) {
                return $result;
            }
        }
        
        $token = $this->extract_token_from_request($request);

        if (!$token) {
            return new WP_Error(
                'missing_token',
                __('Authorization token is required', 'botflow-manager'),
                ['status' => 401]
            );
        }
        $decoded = $this->decode_token($token);
        
        if (is_wp_error($decoded)) {
            return $decoded;
        }
        
        // Check if token is revoked
        if ($this->is_token_revoked($token)) {
            return new WP_Error(
                'token_revoked',
                __('Token has been revoked', 'botflow-manager'),
                ['status' => 401]
            );
        }
        
        // Rate limit authenticated requests
        $client_ip = $this->get_client_ip();
        if (!$this->check_rate_limit('api_' . $decoded['user_id'] . '_' . $client_ip)) {
            return new WP_Error(
                'rate_limit_exceeded',
                __('Rate limit exceeded. Please slow down your requests.', 'botflow-manager'),
                ['status' => 429]
            );
        }
        
        // Add user ID to request for use in callbacks
        $request->set_param('botflow_user_id', $decoded['user_id']);
        
        return $result;
    }
    
    /**
     * Check if user is authenticated
     */
    public function is_authenticated($request) {
        return $request->get_param('botflow_user_id') !== null;
    }
    
    /**
     * Store token hash in database
     */
    private function store_token($user_id, $token) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_tokens';
        $decoded = $this->decode_token($token);
        
        if (is_wp_error($decoded)) {
            return;
        }
        
        // Clean up expired tokens for this user
        $this->cleanup_expired_tokens($user_id);
        
        $wpdb->insert($table, [
            'user_id' => $user_id,
            'token_hash' => hash('sha256', $token),
            'token_jti' => $decoded['jti'] ?? '',
            'expires_at' => date('Y-m-d H:i:s', $decoded['exp']),
        ]);
    }
    
    /**
     * Revoke token
     */
    private function revoke_token($token) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_tokens';
        $token_hash = hash('sha256', $token);
        
        $wpdb->update(
            $table,
            ['is_revoked' => 1],
            ['token_hash' => $token_hash]
        );
    }
    
    /**
     * Revoke all tokens for a user
     */
    private function revoke_all_user_tokens($user_id) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_tokens';
        
        $wpdb->update(
            $table,
            ['is_revoked' => 1],
            ['user_id' => $user_id, 'is_revoked' => 0]
        );
    }
    
    /**
     * Check if token is revoked
     */
    private function is_token_revoked($token) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_tokens';
        $token_hash = hash('sha256', $token);
        
        $result = $wpdb->get_var($wpdb->prepare(
            "SELECT is_revoked FROM $table WHERE token_hash = %s",
            $token_hash
        ));
        
        return $result === '1';
    }
    
    /**
     * Cleanup expired tokens
     */
    private function cleanup_expired_tokens($user_id) {
        global $wpdb;
        
        $table = $wpdb->prefix . 'botflow_tokens';
        
        $wpdb->query($wpdb->prepare(
            "DELETE FROM $table WHERE user_id = %d AND expires_at < NOW()",
            $user_id
        ));
    }
    
    /**
     * Base64 URL encode
     */
    private function base64_url_encode($data) {
        return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
    }
    
    /**
     * Base64 URL decode
     */
    private function base64_url_decode($data) {
        return base64_decode(strtr($data, '-_', '+/') . str_repeat('=', 3 - (3 + strlen($data)) % 4));
    }
}
