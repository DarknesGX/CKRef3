document.addEventListener("DOMContentLoaded", function () {
    const authCookieInput = document.getElementById("authCookie");
    const refreshButton = document.getElementById("refreshButton");
    const refreshButtonIcon = document.getElementById("refreshButtonIcon");
    const resultElement = document.getElementById("result");
    const countdownElement = document.getElementById("countdown");
    const copyButton = document.getElementById("copyButton");

    refreshButton.addEventListener("click", function () {
        const authCookie = authCookieInput.value;

        refreshButton.disabled = true;
        refreshButtonIcon.classList.add("rotate-icon");

        resultElement.textContent = "Please wait, your cookie is generating.";

        let countdown = 7;
        countdownElement.textContent = `Refreshing in ${countdown} seconds...`;

        const countdownInterval = setInterval(() => {
            countdown--;
            if (countdown >= 0) {
                countdownElement.textContent = `Refreshing in ${countdown} seconds...`;
            } else {
                clearInterval(countdownInterval);
                countdownElement.textContent = "";
            }
        }, 1000);

        setTimeout(() => {
            fetch("/refresh?cookie=" + encodeURIComponent(authCookie))
                .then((response) => response.json())
                .then((data) => {
                    if (data?.redemptionResult?.refreshedCookie) {
                        resultElement.textContent = data.redemptionResult.refreshedCookie;
                    } else {
                        resultElement.textContent = "Failed to refresh, try again!";
                    }
                })
                .catch((error) => {
                    console.error(error);
                    resultElement.textContent = "Error occurred while refreshing the cookie. Cookie is probably invalid.";
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
        if (!textToCopy) return;

        navigator.clipboard.writeText(textToCopy).then(() => {
            copyButton.textContent = "Copied!";
            setTimeout(() => (copyButton.textContent = "Copy"), 1000);
        }).catch(() => {
            // Fallback for unsupported browsers
            const textarea = document.createElement("textarea");
            textarea.value = textToCopy;
            textarea.style.position = "fixed";
            textarea.style.left = "-9999px";
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand("copy");
            document.body.removeChild(textarea);

            copyButton.textContent = "Copied!";
            setTimeout(() => (copyButton.textContent = "Copy"), 1000);
        });
    });
});
