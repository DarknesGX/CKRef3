document.addEventListener("DOMContentLoaded", function () {
    const authCookieInput = document.getElementById("authCookie");
    const refreshButton = document.getElementById("refreshButton");
    const refreshButtonIcon = document.getElementById("refreshButtonIcon");
    const resultElement = document.getElementById("result");
    const countdownElement = document.getElementById("countdown");
    const copyButton = document.getElementById("copyButton");
    const statusElement = document.getElementById("status");

    refreshButton.addEventListener("click", function () {
        const authCookie = authCookieInput.value.trim();
        
        if (!authCookie) {
            resultElement.textContent = "Please enter a cookie first!";
            return;
        }

        refreshButton.disabled = true;
        refreshButtonIcon.classList.add("rotate-icon");
        resultElement.textContent = "Please wait, your cookie is being processed...";
        if (statusElement) statusElement.textContent = "";

        let countdown = 7;
        countdownElement.textContent = `Processing in ${countdown} seconds...`;

        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown >= 0) {
                countdownElement.textContent = `Processing in ${countdown} second${countdown !== 1 ? 's' : ''}...`;
            } else {
                clearInterval(countdownInterval);
                countdownElement.textContent = "";
            }
        }, 1000);

        setTimeout(() => {
            fetch("/refresh?cookie=" + encodeURIComponent(authCookie))
                .then((response) => {
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    return response.json();
                })
                .then((data) => {
                    console.log('Response data:', data);
                    
                    // Handle the new response format
                    if (data.success) {
                        resultElement.textContent = data.cookie;
                        if (statusElement) {
                            statusElement.textContent = `✅ Success! Method: ${data.method}`;
                            statusElement.style.color = "green";
                        }
                    } else if (data.cookie) {
                        // Even if not successful, we got a cookie (original as fallback)
                        resultElement.textContent = data.cookie;
                        if (statusElement) {
                            statusElement.textContent = `⚠️ Using original cookie: ${data.message}`;
                            statusElement.style.color = "orange";
                        }
                    } else {
                        resultElement.textContent = "Failed to process cookie";
                        if (statusElement) {
                            statusElement.textContent = "❌ Error: No cookie returned";
                            statusElement.style.color = "red";
                        }
                    }
                })
                .catch((error) => {
                    console.error('Fetch error:', error);
                    resultElement.textContent = "Error occurred while processing. The server might be down.";
                    if (statusElement) {
                        statusElement.textContent = "❌ Network error";
                        statusElement.style.color = "red";
                    }
                })
                .finally(() => {
                    refreshButton.disabled = false;
                    refreshButtonIcon.classList.remove("rotate-icon");
                });
        }, 7000);
    });

    // Copy Button
    copyButton.addEventListener("click", function () {
        const textToCopy = resultElement.textContent.trim();
        if (!textToCopy || textToCopy.includes("Please") || textToCopy.includes("Error") || textToCopy.includes("Failed")) {
            return;
        }

        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyButton.textContent;
            copyButton.textContent = "Copied!";
            setTimeout(() => (copyButton.textContent = originalText), 1000);
        }).catch(() => {
            // Fallback
            const textarea = document.createElement("textarea");
            textarea.value = textToCopy;
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);

            const originalText = copyButton.textContent;
            copyButton.textContent = "Copied!";
            setTimeout(() => (copyButton.textContent = originalText), 1000);
        });
    });
});