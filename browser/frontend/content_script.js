// content_script.js - Enhanced with overlay helpers and key forwarding

(function () {
    'use strict';

    // Install overlay helpers once
    function installOverlayHelpers() {
        if (window.__taskNavOverlayInstalled) return;
        window.__taskNavOverlayInstalled = true;

        // Inject styles
        const style = document.createElement("style");
        style.id = "task-nav-overlay-style";
        style.textContent = `
            #task-nav-thinking-overlay {
                position: fixed;
                top: 0; left: 0; right: 0; bottom: 0;
                z-index: 2147483647;
                display: flex;
                align-items: center;
                justify-content: center;
                backdrop-filter: blur(4px);
                background: rgba(0, 0, 0, 0.4);
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            
            #task-nav-thinking-overlay .card {
                background: white;
                padding: 24px;
                border-radius: 12px;
                box-shadow: 0 10px 40px rgba(0, 0, 0, 0.3);
                max-width: 400px;
                text-align: center;
            }
            
            #task-nav-thinking-overlay .spinner {
                border: 3px solid #f3f3f3;
                border-top: 3px solid #667eea;
                border-radius: 50%;
                width: 40px;
                height: 40px;
                animation: task-nav-spin 1s linear infinite;
                margin: 0 auto 16px;
            }
            
            @keyframes task-nav-spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            #task-nav-thinking-overlay .text {
                font-size: 16px;
                font-weight: 600;
                color: #2c3e50;
                margin-bottom: 8px;
            }
            
            #task-nav-thinking-overlay .subtext {
                font-size: 14px;
                color: #6c757d;
            }
        `;
        document.head.appendChild(style);

        // Helper functions
        window.__showThinkingOverlay = function (text) {
            if (document.getElementById("task-nav-thinking-overlay")) return;

            const div = document.createElement("div");
            div.id = "task-nav-thinking-overlay";
            div.innerHTML = `
                <div class="card">
                    <div class="spinner"></div>
                    <div class="text">${text || "Processing..."}</div>
                    <div class="subtext">Please wait</div>
                </div>
            `;
            document.documentElement.appendChild(div);
        };

        window.__hideThinkingOverlay = function () {
            const el = document.getElementById("task-nav-thinking-overlay");
            if (el) el.remove();
        };
    }

    installOverlayHelpers();

    // Key forwarding for Ctrl+Alt+Arrow navigation
    document.addEventListener("keydown", (e) => {
        // Only forward Ctrl+Alt+Arrow keys
        if (e.ctrlKey && e.altKey && (e.key === "ArrowRight" || e.key === "ArrowLeft")) {
            // Forward to background/navigator
            chrome.runtime.sendMessage({
                action: "contentNavKey",
                key: e.key
            });

            e.preventDefault();
            e.stopPropagation();
            return false;
        }
    }, true); // Use capture phase to intercept early

    // Allow background script to control overlay
    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (msg?.action === "showOverlay") {
            if (window.__showThinkingOverlay) {
                window.__showThinkingOverlay(msg.text);
            }
            sendResponse({ success: true });
            return;
        }

        if (msg?.action === "hideOverlay") {
            if (window.__hideThinkingOverlay) {
                window.__hideThinkingOverlay();
            }
            sendResponse({ success: true });
            return;
        }
    });

    console.log("[Task Navigator] Content script loaded");
})();