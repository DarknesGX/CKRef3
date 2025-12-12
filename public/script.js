document.addEventListener("DOMContentLoaded", function () {
    const authCookieInput = document.getElementById("authCookie");
    const refreshButton = document.getElementById("refreshButton");
    const refreshButtonIcon = document.getElementById("refreshButtonIcon");
    const resultElement = document.getElementById("result");
    const countdownElement = document.getElementById("countdown");
    const copyButton = document.getElementById("copyButton");
    const statusElement = document.createElement("div");
    
    // Add status element after result
    resultElement.parentNode.insertBefore(statusElement, resultElement.nextSibling);
    statusElement.id = "status";
    statusElement.style.marginTop = "10px";
    statusElement.style.fontSize = "14px";

    refreshButton.addEventListener("click", function () {
        const authCookie = authCookieInput.value.trim();
        
        if (!authCookie) {
            resultElement.textContent = "Please enter a cookie first!";
            statusElement.textContent = "";
            return;
        }

        refreshButton.disabled = true;
        refreshButtonIcon.classList.add("rotate-icon");
        resultElement.textContent = "Processing your cookie...";
        statusElement.textContent = "";
        statusElement.style.color = "blue";

        let countdown = 5; // Reduced from 7
        countdownElement.textContent = `Processing in ${countdown} seconds...`;

        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                countdownElement.textContent = `Processing in ${countdown} second${countdown !== 1 ? 's' : ''}...`;
            } else if (countdown === 0) {
                countdownElement.textContent = "Processing now...";
            } else {
                clearInterval(countdownInterval);
                countdownElement.textContent = "";
            }
        }, 1000);

        setTimeout(() => {
            fetch("/refresh?cookie=" + encodeURIComponent(authCookie))
                .then((response) => response.json())
                .then((data) => {
                    console.log('Server response:', data);
                    
                    // Handle both response formats (old and new)
                    let finalCookie = "";
                    let successMessage = "";
                    
                    // Check for new format first
                    if (data.cookie) {
                        finalCookie = data.cookie;
                        successMessage = data.validation?.valid 
                            ? "✅ Cookie is valid" 
                            : "⚠️ Cookie may be invalid";
                    }
                    // Check for old format
                    else if (data.redemptionResult?.refreshedCookie) {
                        finalCookie = data.redemptionResult.refreshedCookie;
                        successMessage = data.redemptionResult.success 
                            ? "✅ Cookie processed" 
                            : "⚠️ Original cookie returned";
                    }
                    // Fallback
                    else {
                        finalCookie = authCookie;
                        successMessage = "⚠️ No response, using original";
                    }
                    
                    // Display results
                    resultElement.textContent = finalCookie;
                    statusElement.textContent = successMessage;
                    statusElement.style.color = successMessage.includes("✅") ? "green" : "orange";
                    
                    // Auto-copy to clipboard if successful
                    if (successMessage.includes("✅")) {
                        navigator.clipboard.writeText(finalCookie).then(() => {
                            copyButton.textContent = "Auto-copied!";
                            setTimeout(() => (copyButton.textContent = "Copy"), 2000);
                        });
                    }
                })
                .catch((error) => {
                    console.error('Error:', error);
                    resultElement.textContent = authCookie; // Always show original
                    statusElement.textContent = "⚠️ Server error, using original cookie";
                    statusElement.style.color = "red";
                })
                .finally(() => {
                    refreshButton.disabled = false;
                    refreshButtonIcon.classList.remove("rotate-icon");
                });
        }, 5000); // Reduced wait time
    });

    // Copy Button
    copyButton.addEventListener("click", function () {
        const textToCopy = resultElement.textContent.trim();
        if (!textToCopy || textToCopy === "Processing your cookie..." || textToCopy.includes("Please")) {
            return;
        }

        navigator.clipboard.writeText(textToCopy).then(() => {
            const originalText = copyButton.textContent;
            copyButton.textContent = "Copied!";
            setTimeout(() => (copyButton.textContent = originalText), 2000);
        }).catch(() => {
            // Fallback for old browsers
            const textarea = document.createElement("textarea");
            textarea.value = textToCopy;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);
            
            const originalText = copyButton.textContent;
            copyButton.textContent = "Copied!";
            setTimeout(() => (copyButton.textContent = originalText), 2000);
        });
    });
});