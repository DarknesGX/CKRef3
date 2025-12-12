const axios = require('axios');

// Fetch CSRF token with retries and detailed logging
async function fetchSessionCSRFToken(roblosecurityCookie, retries = 3) {
    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            await axios.post(
                "https://auth.roblox.com/v2/logout",
                {},
                {
                    headers: {
                        "Cookie": `.ROBLOSECURITY=${roblosecurityCookie}`,
                        "User-Agent": "Roblox/WinInet",
                    },
                    validateStatus: () => true // allow handling of 403 manually
                }
            );

            // If request succeeds without 403, CSRF token may not be needed (rare)
            console.warn("Logout succeeded without needing CSRF. Returning null.");
            return null;
        } catch (error) {
            if (error.response) {
                const status = error.response.status;
                const data = error.response.data;

                // If 403, Roblox usually sends CSRF token in header
                if (status === 403) {
                    const csrfToken = error.response.headers['x-csrf-token'];
                    if (csrfToken) {
                        console.log(`CSRF token fetched on attempt ${attempt}:`, csrfToken);
                        return csrfToken;
                    } else {
                        console.warn(`Attempt ${attempt}: 403 received but no CSRF token in headers.`);
                    }
                } else {
                    console.warn(`Attempt ${attempt}: Received unexpected status ${status}:`, data);
                }
            } else {
                console.error(`Attempt ${attempt}: Network error while fetching CSRF:`, error.message);
            }

            // Retry if not last attempt
            if (attempt < retries) {
                console.log(`Retrying CSRF fetch... (${attempt + 1}/${retries})`);
            }
        }
    }

    console.error("Failed to fetch CSRF token after multiple attempts. Check .ROBLOSECURITY cookie and network.");
    return null;
}

// Generate Authentication Ticket with detailed logging
async function generateAuthTicket(roblosecurityCookie) {
    try {
        const csrfToken = await fetchSessionCSRFToken(roblosecurityCookie);
        if (!csrfToken) {
            console.error("Failed to get CSRF token. Your .ROBLOSECURITY cookie may be invalid, expired, or blocked by Roblox.");
            return null;
        }

        const response = await axios.post(
            "https://auth.roblox.com/v1/authentication-ticket",
            {},
            {
                headers: {
                    "x-csrf-token": csrfToken,
                    "User-Agent": "Roblox/WinInet",
                    "Referer": "https://www.roblox.com/",
                    "Content-Type": "application/json",
                    "Cookie": `.ROBLOSECURITY=${roblosecurityCookie}`,
                    "Origin": "https://www.roblox.com"
                },
                validateStatus: () => true // handle 403 manually
            }
        );

        if (response.status === 200) {
            const ticket = response.headers["rbx-authentication-ticket"];
            if (!ticket) {
                console.error("Authentication ticket not found in response headers. Roblox may be blocking cloud IPs or cookie may be invalid.");
                return null;
            }
            console.log("Authentication ticket generated successfully:", ticket);
            return ticket;
        } else if (response.status === 403) {
            console.error("Authentication ticket request blocked (403). Possible causes:\n- Invalid/expired .ROBLOSECURITY cookie\n- Roblox blocking cloud server IP\n- CSRF token rejected");
            return null;
        } else {
            console.error(`Unexpected response ${response.status}:`, response.data);
            return null;
        }

    } catch (error) {
        if (error.response) {
            console.error("Ticket Error:", error.response.status, error.response.data);
        } else {
            console.error("Network or unexpected error:", error.message);
        }
        return null;
    }
}

// Redeem Authentication Ticket with detailed logging
async function redeemAuthTicket(authTicket) {
    try {
        const response = await axios.post(
            "https://auth.roblox.com/v1/authentication-ticket/redeem",
            { authenticationTicket: authTicket },
            {
                headers: {
                    "User-Agent": "Roblox/WinInet",
                    "RBXAuthenticationNegotiation": "1",
                    "Content-Type": "application/json"
                },
                validateStatus: () => true // handle 403 manually
            }
        );

        if (response.status === 200) {
            const cookies = response.headers["set-cookie"]?.join("; ") || "";
            const refreshed = cookies.match(/\.ROBLOSECURITY=([^;]+)/)?.[1] || null;
            if (!refreshed) {
                console.warn("No refreshed .ROBLOSECURITY cookie returned. The session may not have been refreshed.");
            } else {
                console.log("Successfully redeemed auth ticket. Refreshed cookie:", refreshed);
            }

            return {
                success: true,
                refreshedCookie: refreshed
            };
        } else if (response.status === 403) {
            console.error("Redeem Auth Ticket Failed (403). Possible causes:\n- Invalid/expired auth ticket\n- Roblox blocking cloud server IP\n- Cookie or CSRF token issues");
            return { success: false, robloxDebugResponse: response.data };
        } else {
            console.error("Redeem Auth Ticket Unexpected Response:", response.status, response.data);
            return { success: false, robloxDebugResponse: response.data };
        }

    } catch (error) {
        if (error.response) {
            console.error("Redeem Error:", error.response.status, error.response.data);
        } else {
            console.error("Network or unexpected error:", error.message);
        }

        return {
            success: false,
            robloxDebugResponse: error.response || error.message
        };
    }
}

module.exports = {
    generateAuthTicket,
    redeemAuthTicket
};
