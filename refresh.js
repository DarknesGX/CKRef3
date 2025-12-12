const axios = require('axios');

async function fetchSessionCSRFToken(roblosecurityCookie) {
    try {
        const response = await axios.post(
            "https://auth.roblox.com/v2/logout",
            {},
            {
                headers: {
                    "Cookie": `.ROBLOSECURITY=${roblosecurityCookie}`,
                    "User-Agent": "Roblox/WinInet",
                }
            }
        );

        // Attempt to return CSRF token from response headers.
        return response.headers["x-csrf-token"] || null;
    } catch (error) {
        if (error.response) {
            console.error("Error fetching CSRF token:", error.response.status, error.response.data);
        } else {
            console.error("Network or unexpected error:", error.message);
        }
        return null; // Ensure we return null if there's an error
    }
}

async function generateAuthTicket(roblosecurityCookie) {
    try {
        const csrfToken = await fetchSessionCSRFToken(roblosecurityCookie);
        if (!csrfToken) {
            console.error("Failed to get CSRF token");
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
                }
            }
        );

        // Return the authentication ticket if present in the response
        return response.headers["rbx-authentication-ticket"] || null;
    } catch (error) {
        if (error.response) {
            console.error("Ticket Error:", error.response.status, error.response.data);
        } else {
            console.error("Network or unexpected error:", error.message);
        }
        return null; // Ensure null is returned if error occurs
    }
}

async function redeemAuthTicket(authTicket) {
    try {
        const response = await axios.post(
            "https://auth.roblox.com/v1/authentication-ticket/redeem",
            {
                authenticationTicket: authTicket
            },
            {
                headers: {
                    "User-Agent": "Roblox/WinInet",
                    "RBXAuthenticationNegotiation": "1",
                    "Content-Type": "application/json",
                }
            }
        );

        if (response.status === 200) {
            const cookies = response.headers["set-cookie"]?.join("; ") || "";
            const refreshed = cookies.match(/\.ROBLOSECURITY=([^;]+)/)?.[1] || null;

            return {
                success: true,
                refreshedCookie: refreshed
            };
        } else {
            console.error("Redeem Auth Ticket Failed, Unexpected Response:", response.status, response.data);
            return {
                success: false,
                robloxDebugResponse: response.data
            };
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
