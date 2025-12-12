const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { HttpsProxyAgent } = require('https-proxy-agent');

/**
 * Main Refresh Class with Proxy Support and Fallback Logic
 */
class CookieRefresher {
    /**
     * @param {string} cookie - Original .ROBLOSECURITY cookie
     * @param {Object} options - Configuration options
     */
    constructor(cookie, options = {}) {
        this.originalCookie = cookie;
        this.options = {
            proxy: options.proxy || null, // {host, port, type: 'socks5'|'http', username, password}
            timeout: options.timeout || 10000,
            userAgent: options.userAgent || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            maxRetries: options.maxRetries || 2,
            ...options
        };
        
        this.httpClient = this.createHttpClient();
        this.attemptLog = [];
    }

    /**
     * Creates HTTP client with proxy configuration
     */
    createHttpClient() {
        const config = {
            timeout: this.options.timeout,
            headers: {
                'User-Agent': this.options.userAgent
            }
        };

        // Configure proxy if provided
        if (this.options.proxy) {
            try {
                let proxyUrl;
                const { host, port, type, username, password } = this.options.proxy;
                
                if (type === 'socks5') {
                    if (username && password) {
                        proxyUrl = `socks5://${username}:${password}@${host}:${port}`;
                    } else {
                        proxyUrl = `socks5://${host}:${port}`;
                    }
                    config.httpsAgent = new SocksProxyAgent(proxyUrl);
                    config.httpAgent = new SocksProxyAgent(proxyUrl);
                } else if (type === 'http' || type === 'https') {
                    if (username && password) {
                        proxyUrl = `${type}://${username}:${password}@${host}:${port}`;
                    } else {
                        proxyUrl = `${type}://${host}:${port}`;
                    }
                    config.httpsAgent = new HttpsProxyAgent(proxyUrl);
                }
                
                this.log('Proxy configured', { type, host, port });
            } catch (error) {
                this.log('Proxy configuration failed', { error: error.message });
            }
        }

        return axios.create(config);
    }

    /**
     * Main function to attempt cookie refresh with fallbacks
     * @returns {Promise<Object>} {success, cookie, method, logs}
     */
    async refresh() {
        this.attemptLog = [];
        this.log('Starting cookie refresh process');
        
        const methods = [
            { name: 'apiRefresh', fn: () => this.apiRefresh() },
            { name: 'authTicketRefresh', fn: () => this.authTicketRefresh() },
            { name: 'legacyRefresh', fn: () => this.legacyRefresh() }
        ];

        // Try each method in order
        for (const method of methods) {
            this.log(`Attempting method: ${method.name}`);
            try {
                const result = await this.withRetry(method.fn, method.name);
                if (result.success) {
                    this.log(`Success with method: ${method.name}`);
                    return {
                        success: true,
                        cookie: result.cookie,
                        method: method.name,
                        logs: this.attemptLog,
                        details: { attempts: this.attemptLog.length }
                    };
                }
            } catch (error) {
                this.log(`Method ${method.name} failed`, { error: error.message });
            }
        }

        // All methods failed - fallback to original cookie
        this.log('All refresh methods failed, falling back to original cookie');
        return {
            success: false,
            cookie: this.originalCookie, // Return original as fallback
            method: 'fallback',
            logs: this.attemptLog,
            details: { 
                note: 'Original cookie returned - no refresh occurred',
                attempts: this.attemptLog.length 
            }
        };
    }

    /**
     * METHOD 1: API Refresh (Signout and Reauthenticate)
     * Most reliable when proxy works
     */
    async apiRefresh() {
        try {
            // Step 1: Get CSRF token
            const csrfResponse = await this.httpClient.post(
                'https://auth.roblox.com/v2/logout',
                {},
                {
                    headers: { 'Cookie': `.ROBLOSECURITY=${this.originalCookie}` },
                    validateStatus: () => true
                }
            );

            const csrfToken = csrfResponse.headers['x-csrf-token'];
            if (!csrfToken) {
                // If logout succeeded without 403, we might already have issues
                if (csrfResponse.status === 200) {
                    throw new Error('CSRF token not provided (unusual response)');
                }
                throw new Error('Failed to get CSRF token');
            }

            this.log('CSRF token obtained');

            // Step 2: Call refresh endpoint
            const refreshResponse = await this.httpClient.post(
                'https://www.roblox.com/authentication/signoutfromallsessionsandreauthenticate',
                {},
                {
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        'Cookie': `.ROBLOSECURITY=${this.originalCookie}`,
                        'Referer': 'https://www.roblox.com/'
                    },
                    validateStatus: () => true
                }
            );

            // Handle different responses
            if (refreshResponse.status === 403) {
                // Cloud IP block or invalid CSRF
                const isCloudBlock = refreshResponse.data?.toString().includes('cloud') || 
                                   refreshResponse.data?.toString().includes('block');
                throw new Error(isCloudBlock ? 'Cloud IP blocked' : 'CSRF rejected');
            }

            if (refreshResponse.status !== 200) {
                throw new Error(`HTTP ${refreshResponse.status}`);
            }

            // Extract new cookie
            const setCookieHeader = refreshResponse.headers['set-cookie'];
            if (!setCookieHeader) {
                throw new Error('No set-cookie header in response');
            }

            const cookieMatch = Array.isArray(setCookieHeader) 
                ? setCookieHeader.find(h => h.includes('.ROBLOSECURITY'))
                : setCookieHeader;
            
            const match = cookieMatch.match(/\.ROBLOSECURITY=([^;]+)/);
            if (!match) {
                throw new Error('Could not parse new cookie');
            }

            const newCookie = match[1];
            this.log('API refresh successful');
            
            return {
                success: true,
                cookie: newCookie,
                csrfToken: csrfToken,
                responseStatus: refreshResponse.status
            };

        } catch (error) {
            this.log('API refresh failed', { error: error.message });
            throw error;
        }
    }

    /**
     * METHOD 2: Auth Ticket Method (Your original bypass)
     * Alternative method if API refresh fails
     */
    async authTicketRefresh() {
        try {
            // Get CSRF token
            const csrfResponse = await this.httpClient.post(
                'https://auth.roblox.com/v2/logout',
                {},
                {
                    headers: { 'Cookie': `.ROBLOSECURITY=${this.originalCookie}` },
                    validateStatus: () => true
                }
            );

            const csrfToken = csrfResponse.headers['x-csrf-token'];
            if (!csrfToken) {
                throw new Error('No CSRF token for auth ticket method');
            }

            // Get authentication ticket
            const ticketResponse = await this.httpClient.post(
                'https://auth.roblox.com/v1/authentication-ticket',
                {},
                {
                    headers: {
                        'X-CSRF-TOKEN': csrfToken,
                        'RBXAuthenticationNegotiation': '1',
                        'Referer': 'https://www.roblox.com/camel',
                        'Content-Type': 'application/json',
                        'Cookie': `.ROBLOSECURITY=${this.originalCookie}`
                    },
                    validateStatus: () => true
                }
            );

            const authTicket = ticketResponse.headers['rbx-authentication-ticket'];
            if (!authTicket) {
                throw new Error('No authentication ticket received');
            }

            // Redeem ticket
            const redeemResponse = await this.httpClient.post(
                'https://auth.roblox.com/v1/authentication-ticket/redeem',
                { authenticationTicket: authTicket },
                {
                    headers: {
                        'RBXAuthenticationNegotiation': '1',
                        'Content-Type': 'application/json'
                    },
                    validateStatus: () => true
                }
            );

            // Extract cookie
            const setCookieHeader = redeemResponse.headers['set-cookie'];
            if (!setCookieHeader) {
                throw new Error('No cookie from ticket redemption');
            }

            const cookieMatch = Array.isArray(setCookieHeader) 
                ? setCookieHeader.find(h => h.includes('.ROBLOSECURITY'))
                : setCookieHeader;
            
            const match = cookieMatch.match(/\.ROBLOSECURITY=([^;]+)/);
            if (!match) {
                throw new Error('Could not parse cookie from ticket');
            }

            this.log('Auth ticket method successful');
            
            return {
                success: true,
                cookie: match[1],
                method: 'authTicket'
            };

        } catch (error) {
            this.log('Auth ticket method failed', { error: error.message });
            throw error;
        }
    }

    /**
     * METHOD 3: Legacy/Simple Validation Refresh
     * Sometimes just validating the cookie gets a fresh one
     */
    async legacyRefresh() {
        try {
            // Simple validation request that might refresh session
            const response = await this.httpClient.get(
                'https://users.roblox.com/v1/users/authenticated',
                {
                    headers: { 'Cookie': `.ROBLOSECURITY=${this.originalCookie}` },
                    validateStatus: () => true
                }
            );

            const setCookieHeader = response.headers['set-cookie'];
            if (setCookieHeader) {
                const cookieMatch = Array.isArray(setCookieHeader) 
                    ? setCookieHeader.find(h => h.includes('.ROBLOSECURITY'))
                    : setCookieHeader;
                
                const match = cookieMatch?.match(/\.ROBLOSECURITY=([^;]+)/);
                if (match && match[1] !== this.originalCookie) {
                    this.log('Legacy refresh got new cookie');
                    return {
                        success: true,
                        cookie: match[1],
                        method: 'legacy'
                    };
                }
            }

            // If no new cookie but request succeeded, return original
            if (response.status === 200) {
                this.log('Legacy method validated cookie (no refresh)');
                return {
                    success: true,
                    cookie: this.originalCookie,
                    method: 'legacy_original'
                };
            }

            throw new Error(`Validation failed: HTTP ${response.status}`);

        } catch (error) {
            this.log('Legacy refresh failed', { error: error.message });
            throw error;
        }
    }

    /**
     * Retry wrapper for methods
     */
    async withRetry(fn, methodName, retries = this.options.maxRetries) {
        let lastError;
        
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                this.log(`Retry attempt ${attempt}/${retries} for ${methodName}`);
                return await fn();
            } catch (error) {
                lastError = error;
                this.log(`Attempt ${attempt} failed`, { error: error.message });
                
                if (attempt < retries) {
                    // Exponential backoff
                    await new Promise(resolve => 
                        setTimeout(resolve, Math.pow(2, attempt) * 1000)
                    );
                }
            }
        }
        
        throw lastError;
    }

    /**
     * Logging utility
     */
    log(message, data = null) {
        const entry = {
            timestamp: new Date().toISOString(),
            message,
            ...(data && { data })
        };
        
        this.attemptLog.push(entry);
        console.log(`[${entry.timestamp}] ${message}`, data ? JSON.stringify(data) : '');
    }
}

/**
 * Convenience function for quick refresh
 */
async function refreshCookie(cookie, options = {}) {
    const refresher = new CookieRefresher(cookie, options);
    return await refresher.refresh();
}

/**
 * Validate if a cookie is still active
 */
async function validateCookie(cookie, options = {}) {
    const client = axios.create({
        timeout: options.timeout || 5000,
        headers: {
            'User-Agent': options.userAgent || 'Mozilla/5.0'
        }
    });

    try {
        const response = await client.get(
            'https://users.roblox.com/v1/users/authenticated',
            {
                headers: { 'Cookie': `.ROBLOSECURITY=${cookie}` },
                validateStatus: () => true
            }
        );

        return {
            valid: response.status === 200,
            status: response.status,
            userId: response.data?.id || null,
            username: response.data?.name || null,
            ...(response.status !== 200 && { error: response.data })
        };
    } catch (error) {
        return {
            valid: false,
            error: error.message
        };
    }
}

/**
 * Parse proxy string (supports multiple formats)
 */
function parseProxyString(proxyString) {
    if (!proxyString) return null;
    
    // Format: socks5://user:pass@host:port
    // Format: http://host:port
    // Format: host:port (defaults to http)
    
    try {
        let url;
        if (proxyString.includes('://')) {
            url = new URL(proxyString);
        } else {
            url = new URL(`http://${proxyString}`);
        }
        
        return {
            host: url.hostname,
            port: parseInt(url.port) || (url.protocol === 'https:' ? 443 : 80),
            type: url.protocol.replace(':', ''),
            username: url.username || null,
            password: url.password || null
        };
    } catch (error) {
        console.error('Failed to parse proxy string:', error.message);
        return null;
    }
}

// Export everything
module.exports = {
    CookieRefresher,
    refreshCookie,
    validateCookie,
    parseProxyString
};

/**
 * Example usage at the bottom (remove in production)
 */
if (require.main === module) {
    (async () => {
        console.log('=== Cookie Refresher Example ===\n');
        
        // Example 1: Basic usage
        const exampleCookie = 'YOUR_COOKIE_HERE'; // Replace with actual cookie
        
        // Example 2: With proxy
        const result = await refreshCookie(exampleCookie, {
            proxy: parseProxyString('socks5://user:pass@proxy-host:1080'),
            timeout: 15000
        });
        
        console.log('\n=== Result ===');
        console.log(`Success: ${result.success}`);
        console.log(`Method: ${result.method}`);
        console.log(`Cookie length: ${result.cookie?.length || 0} chars`);
        console.log(`Attempts: ${result.logs?.length || 0}`);
        
        // Example 3: Validate the result
        if (result.success) {
            const validation = await validateCookie(result.cookie);
            console.log(`\nValidation: ${validation.valid ? 'VALID' : 'INVALID'}`);
            if (validation.valid) {
                console.log(`User: ${validation.username} (ID: ${validation.userId})`);
            }
        }
    })();
}