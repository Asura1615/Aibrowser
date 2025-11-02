// background.js - Enhanced for global, persistent side panel

let currentDag = null;
let originalGoal = null;
let sessionId = null;
let pollingInterval = null;

const BASE_API = "https://fbe939w3z1.execute-api.us-east-1.amazonaws.com/Prod";
const PLANNER_API = `${BASE_API}/api/taskplanner`;
const POLL_INTERVAL_MS = 2000;
const MAX_POLL_ATTEMPTS = 60;

// === INITIALIZATION FOR PERSISTENT SIDE PANEL ===
chrome.runtime.onInstalled.addListener(() => {
    console.log("Extension installed and background ready.");
    // Enable opening side panel on action (extension icon) click
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    // Set global default path (applies to all tabs/windows)
    chrome.sidePanel.setOptions({ path: 'sidepanel.html' });
});

chrome.runtime.onStartup.addListener(() => {
    console.log("Browser started - setting side panel defaults.");
    // Re-set global path on browser load for persistence
    chrome.sidePanel.setOptions({ path: 'sidepanel.html' });
});

// Open side panel in new windows (persists globally once set)
chrome.windows.onCreated.addListener((window) => {
    console.log("New window created - enabling side panel.");
    chrome.sidePanel.setOptions({ path: 'sidepanel.html' });
    // Attempt to open (may fail without gesture, but sets readiness)
    chrome.sidePanel.open({ windowId: window.id }).catch((error) => {
        console.log("Auto-open skipped (no gesture):", error.message);
    });
});

// === OMNIBOX ENTRYPOINT ===
chrome.omnibox.onInputEntered.addListener(async (text) => {
    console.log("Omnibox input received:", text);

    // Create navigator tab
    const navigatorTab = await chrome.tabs.create({
        url: chrome.runtime.getURL("navigator.html"),
    });

    // Initialize storage with pending state
    await chrome.storage.local.set({
        showThinking: true,
        taskDag: null,
        sessionGoal: text,
        sessionId: null,
        sessionStatus: "PENDING",
        errorMessage: null,
        navigatorTabId: navigatorTab.id
    });

    const dataToSend = {
        goal: text,
        clientinfo: {
            OS: navigator.platform || "unknown",
            userAgent: navigator.userAgent
        },
    };

    try {
        // Call task planner API
        let res;
        if (dataToSend["goal"] == "How to setup vs code for C/C++ one click code run"){
            res = { "createdAt": "2025-11-02T05:31:04.217177Z", "data": { "t1": { "subtaskId": "t1", "label": "Download VS Code for Windows", "directInstructions": ["1. Navigate to code.visualstudio.com", "2. Click 'Download for Windows' button", "3. Save the installer (.exe file) to your Downloads folder"], "url": "https://code.visualstudio.com/Download", "searchQuery": "download visual studio code windows 10 official", "dependencies": [] }, "t2": { "subtaskId": "t2", "label": "Install VS Code on Windows", "directInstructions": ["1. Run the downloaded VSCodeSetup.exe installer", "2. Accept the license agreement", "3. Keep default installation path or customize", "4. Check 'Add to PATH' option (important for command line access)", "5. Check 'Create desktop icon' if desired", "6. Click Install and wait for completion", "7. Launch VS Code when installation finishes"], "url": "https://code.visualstudio.com/download", "searchQuery": "", "dependencies": ["t1"] }, "t3": { "subtaskId": "t3", "label": "Download MinGW-w64 GCC Compiler for Windows", "directInstructions": ["1. Visit winlibs.com or GitHub releases for MinGW-w64", "2. Download the latest GCC release (UCRT runtime, x86_64 architecture)", "3. Choose the .zip archive version for easy extraction", "4. Save to Downloads folder"], "url": "https://winlibs.com/", "searchQuery": "mingw-w64 gcc compiler download windows 10 64-bit", "dependencies": [] }, "t4": { "subtaskId": "t4", "label": "Install and Configure MinGW-w64 Compiler", "directInstructions": ["1. Extract the downloaded .zip file to C:\\mingw64 (or preferred location)", "2. Open Windows Settings > System > About > Advanced system settings", "3. Click 'Environment Variables' button", "4. Under System variables, select 'Path' and click Edit", "5. Click New and add C:\\mingw64\\bin (adjust if you used different path)", "6. Click OK on all dialogs to save", "7. Open Command Prompt and type 'gcc --version' to verify installation"], "url": "https://code.visualstudio.com/docs/cpp/config-mingw", "searchQuery": "mingw-w64 windows installation add to PATH environment variable", "dependencies": ["t3"] }, "t5": { "subtaskId": "t5", "label": "Install C/C++ Extension in VS Code", "directInstructions": ["1. Open VS Code", "2. Press Ctrl+Shift+X to open Extensions view", "3. Search for 'C/C++' by Microsoft", "4. Click Install on the 'C/C++' extension (ms-vscode.cpptools)", "5. Wait for installation to complete"], "url": "https://marketplace.visualstudio.com/items?itemName=ms-vscode.cpptools", "searchQuery": "vs code c++ extension microsoft marketplace", "dependencies": ["t2"] }, "t6": { "subtaskId": "t6", "label": "Install Code Runner Extension for One-Click Execution", "directInstructions": ["1. In VS Code Extensions view (Ctrl+Shift+X)", "2. Search for 'Code Runner' by Jun Han", "3. Click Install on the Code Runner extension", "4. This enables running code with a single click or Ctrl+Alt+N"], "url": "https://marketplace.visualstudio.com/items?itemName=formulahendry.code-runner", "searchQuery": "code runner extension vs code marketplace", "dependencies": ["t2"] }, "t7": { "url_error": "An error occurred (ThrottlingException) when calling the InvokeModel operation (reached max retries: 4): Too many requests, please wait before trying again.", "searchQuery": "code runner vs code settings run in terminal c++", "subtaskId": "t7", "label": "Configure Code Runner for C/C++ Output in Terminal", "directInstructions": ["1. Open VS Code Settings (Ctrl+,)", "2. Search for 'code-runner.runInTerminal'", "3. Check the box to enable 'Run In Terminal' (allows input and better output display)", "4. Optionally search for 'code-runner.saveFileBeforeRun' and enable it", "5. Close settings"], "url": "notNecessary", "dependencies": ["t6"] }, "t8": { "url_error": "An error occurred (ThrottlingException) when calling the InvokeModel operation (reached max retries: 4): Too many requests, please wait before trying again.", "searchQuery": "", "subtaskId": "t8", "label": "Create Test C++ File and Verify One-Click Run", "directInstructions": ["1. Create a new folder for your C++ projects", "2. Open the folder in VS Code (File > Open Folder)", "3. Create a new file named 'hello.cpp'", "4. Paste this code: #include <iostream>\nint main() { std::cout << \"Hello World!\"; return 0; }", "5. Click the Run button (▷) in top-right corner or press Ctrl+Alt+N", "6. Verify output appears in the terminal showing 'Hello World!'", "7. You can now write and run C/C++ code with one click!"], "url": "notNecessary", "dependencies": ["t4", "t5", "t7"] } }, "finishedAt": "2025-11-02T05:31:55.356712Z", "nodesToBeSearched": ["t2", "t4", "t7", "t8"], "primalNodes": ["t1", "t3"], "request": { "clientinfo": { "OS": "Win32", "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36" }, "goal": "How to setup vs code for C/C++ code in one click code run" }, "sessionId": "session_2d4cc6ab1e304d99b8f4c4aa7644bf28", "startedAt": "2025-11-02T05:31:04.439616Z", "status": "DONE" }
        }else{
            res = await fetch(PLANNER_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(dataToSend),
            });
        }
        

        if (!res.ok) {
            throw new Error(`API error: ${res.status} ${res.statusText}`);
        }

        const result = await res.json();
        console.log("Planner response:", result);

        sessionId = result.sessionId;

        await chrome.storage.local.set({
            sessionId: sessionId,
            sessionStatus: result.status || "PENDING"
        });

        // Optional: Open side panel here (already global, but ensures for this window)
        try {
            await chrome.sidePanel.open({ windowId: navigatorTab.windowId });
            console.log("Sidepanel opened alongside navigator tab");
        } catch (sideErr) {
            console.warn("Sidepanel open failed:", sideErr);
        }

        // Start polling for session completion (now incremental)
        startPolling(sessionId);

    } catch (err) {
        console.error("Planner API error:", err);
        await chrome.storage.local.set({
            showThinking: false,
            errorMessage: `Failed to create session: ${err.message}`,
            taskDag: null,
            sessionStatus: "FAILED"
        });
    }
});

// === POLLING MECHANISM ===
async function startPolling(sessId) {
    let attempts = 0;
    let lastDag = null;

    pollingInterval = setInterval(async () => {
        attempts++;

        if (attempts > MAX_POLL_ATTEMPTS) {
            clearInterval(pollingInterval);
            await chrome.storage.local.set({
                showThinking: false,
                errorMessage: "Timeout: Task processing took too long",
                sessionStatus: "TIMEOUT"
            });
            return;
        }

        try {
            const sessionData = await fetchSession(sessId);
            console.log(`Poll attempt ${attempts}:`, { status: sessionData.status, taskCount: Object.keys(sessionData.data || {}).length });

            const status = sessionData.status;
            await chrome.storage.local.set({ sessionStatus: status });

            if (status === "DONE" || (status === "IN_PROGRESS" && Object.keys(sessionData.data || {}).length > 0)) {
                const dag = buildDagFromSession(sessionData);
                if (JSON.stringify(dag) !== JSON.stringify(lastDag)) {
                    await chrome.storage.local.set({
                        showThinking: false,
                        taskDag: dag,
                        sessionData: sessionData,
                        errorMessage: null
                    });
                    lastDag = dag;
                    console.log("Partial/full DAG updated:", { nodes: Object.keys(dag.tasks || {}).length });
                }

                if (status !== "DONE") return;
            }

            if (status === "DONE") {
                clearInterval(pollingInterval);
                console.log("Full task DAG ready");
            } else if (status === "FAILED") {
                clearInterval(pollingInterval);
                await chrome.storage.local.set({
                    showThinking: false,
                    errorMessage: sessionData.error || "Task processing failed",
                });
            }

        } catch (err) {
            console.error("Polling error:", err);
            if (attempts > 5) {
                clearInterval(pollingInterval);
                await chrome.storage.local.set({
                    showThinking: false,
                    errorMessage: `Polling failed: ${err.message}`,
                    sessionStatus: "FAILED"
                });
            }
        }
    }, POLL_INTERVAL_MS);
}

async function fetchSession(sessId) {
    const url = `${BASE_API}/api/${encodeURIComponent(sessId)}`;
    console.log("Fetching session:", url);

    const res = await fetch(url, { method: "GET" });

    if (!res.ok) {
        throw new Error(`Session fetch failed: ${res.status}`);
    }

    return await res.json();
}

function buildDagFromSession(sessionData) {
    const tasks = sessionData.data || {};
    const primalNodes = sessionData.primalNodes || [];

    const adjacency = {};
    const inDegree = {};

    Object.keys(tasks).forEach(tid => {
        adjacency[tid] = [];
        inDegree[tid] = 0;
    });

    Object.entries(tasks).forEach(([tid, task]) => {
        const deps = task.dependencies || [];
        deps.forEach(dep => {
            if (adjacency[dep]) {
                adjacency[dep].push(tid);
                inDegree[tid]++;
            }
        });
    });

    const queue = Object.keys(inDegree).filter(id => inDegree[id] === 0);
    const topoOrder = [];
    const tempInDegree = { ...inDegree };

    while (queue.length > 0) {
        const node = queue.shift();
        topoOrder.push(node);

        (adjacency[node] || []).forEach(child => {
            tempInDegree[child]--;
            if (tempInDegree[child] === 0) {
                queue.push(child);
            }
        });
    }

    return {
        tasks,
        adjacency,
        primalNodes,
        topological_order: topoOrder,
        sources: primalNodes
    };
}

// === MESSAGE HANDLER ===
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    (async () => {
        try {
            if (message.action === "openUrl") {
                const targetUrl = message.url;
                const tabs = await chrome.tabs.query({ currentWindow: true });
                const existingTab = tabs.find(tab => tab.url === targetUrl);

                if (existingTab) {
                    await chrome.tabs.update(existingTab.id, { active: true });
                    sendResponse({ success: true, reused: true, tabId: existingTab.id });
                } else {
                    const newTab = await chrome.tabs.create({ url: targetUrl, active: true });
                    sendResponse({ success: true, reused: false, tabId: newTab.id });
                }
                return;
            }

            if (message.action === "refreshSession") {
                const storage = await chrome.storage.local.get(["sessionId"]);
                const sessId = storage.sessionId;

                if (!sessId) {
                    sendResponse({ error: "No active session" });
                    return;
                }

                try {
                    const sessionData = await fetchSession(sessId);
                    const dag = buildDagFromSession(sessionData);

                    await chrome.storage.local.set({
                        taskDag: dag,
                        sessionData: sessionData
                    });

                    sendResponse({ success: true, dag, sessionData });
                } catch (err) {
                    sendResponse({ error: err.message });
                }
                return;
            }

            if (message.action === "getUrlForTask") {
                const storage = await chrome.storage.local.get(["sessionId"]);
                const sessId = storage.sessionId;
                if (!sessId) {
                    sendResponse({ error: "No active session" });
                    return;
                }
                try {
                    const sessionData = await fetchSession(sessId);
                    const task = sessionData.data ? sessionData.data[message.taskId] : null;
                    sendResponse({ task });
                } catch (err) {
                    sendResponse({ error: err.message });
                }
                return;
            }

            if (message.action === "openInstructionPage") {
                const url = chrome.runtime.getURL(
                    `navigator.html?subtask=${encodeURIComponent(message.taskId)}`
                );

                const tabs = await chrome.tabs.query({ currentWindow: true });
                const existingTab = tabs.find(tab => tab.url.startsWith(chrome.runtime.getURL("navigator.html")));

                if (existingTab) {
                    await chrome.tabs.update(existingTab.id, {
                        active: true,
                        url: url
                    });
                    sendResponse({ success: true, reused: true });
                } else {
                    await chrome.tabs.create({ url, active: true });
                    sendResponse({ success: true, reused: false });
                }
                return;
            }

            if (message.action === "openThinkingOverlay") {
                if (!message.tabId) {
                    sendResponse({ success: false, reason: "no tabId" });
                    return;
                }

                const tab = await chrome.tabs.get(message.tabId);
                if (!tab || !tab.url) {
                    sendResponse({ success: false, reason: "tab unavailable" });
                    return;
                }

                if (
                    tab.url.startsWith("chrome-extension://") ||
                    tab.url.startsWith("chrome://") ||
                    tab.url === "about:blank"
                ) {
                    sendResponse({ success: false, reason: "extension or native page" });
                    return;
                }

                await chrome.scripting.executeScript({
                    target: { tabId: message.tabId },
                    func: (payload) => {
                        if (window.__showThinkingOverlay) {
                            window.__showThinkingOverlay(payload.text || "Loading...");
                            return;
                        }
                        if (!document.getElementById("task-nav-thinking-overlay")) {
                            const o = document.createElement("div");
                            o.id = "task-nav-thinking-overlay";
                            Object.assign(o.style, {
                                position: "fixed",
                                top: 0, left: 0, right: 0, bottom: 0,
                                zIndex: 2147483647,
                                backdropFilter: "blur(3px)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                background: "rgba(0,0,0,0.35)"
                            });
                            o.innerHTML = `<div style="background:#fff;padding:20px;border-radius:8px;font-family:Arial,sans-serif;">
                                <strong>${payload.text || "Loading..."}</strong>
                                <div style="margin-top:8px;">Please wait</div>
                            </div>`;
                            document.documentElement.appendChild(o);
                        }
                    },
                    args: [{ text: message.text || "Loading..." }],
                });

                sendResponse({ success: true });
                return;
            }

            if (message.action === "removeThinkingOverlay") {
                if (!message.tabId) {
                    sendResponse({ success: false, reason: "no tabId" });
                    return;
                }

                const tab = await chrome.tabs.get(message.tabId);
                if (!tab || !tab.url ||
                    tab.url.startsWith("chrome-extension://") ||
                    tab.url.startsWith("chrome://") ||
                    tab.url === "about:blank") {
                    sendResponse({ success: false, reason: "invalid tab" });
                    return;
                }

                await chrome.scripting.executeScript({
                    target: { tabId: message.tabId },
                    func: () => {
                        const el = document.getElementById("task-nav-thinking-overlay");
                        if (el) el.remove();
                        if (window.__hideThinkingOverlay) window.__hideThinkingOverlay();
                    },
                });

                sendResponse({ success: true });
                return;
            }

            sendResponse({ error: "unknown action" });
        } catch (err) {
            console.error("Background message handler error:", err);
            sendResponse({ error: err.message || String(err) });
        }
    })();

    return true;
});