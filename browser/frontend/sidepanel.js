// sidepanel.js - Side panel controller

let taskDag = null;
let sessionGoal = null;
let currentTaskId = null;
let dfsOrder = [];

// DOM elements
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error");
const errorMessageEl = document.getElementById("error-message");
const emptyEl = document.getElementById("empty");
const contentEl = document.getElementById("content");
const statusEl = document.getElementById("status");
const goalSectionEl = document.getElementById("goal-section");
const goalTextEl = document.getElementById("goal-text");
const taskLabelEl = document.getElementById("task-label");
const progressFillEl = document.getElementById("progress-fill");
const progressTextEl = document.getElementById("progress-text");
const instructionsCardEl = document.getElementById("instructions-card");
const instructionsListEl = document.getElementById("instructions-list");
const prevBtnEl = document.getElementById("prev-btn");
const nextBtnEl = document.getElementById("next-btn");
const prevPreviewEl = document.getElementById("prev-preview");
const nextPreviewEl = document.getElementById("next-preview");

async function init() {
    await loadState();

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;

        if (changes.taskDag || changes.sessionGoal || changes.sessionStatus || changes.errorMessage) {
            loadState();
        }
    });

    // Setup button listeners
    prevBtnEl.addEventListener("click", () => sendNavigationMessage("ArrowLeft"));
    nextBtnEl.addEventListener("click", () => sendNavigationMessage("ArrowRight"));

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.ctrlKey && e.altKey) {
            if (e.key === "ArrowRight") {
                e.preventDefault();
                sendNavigationMessage("ArrowRight");
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                sendNavigationMessage("ArrowLeft");
            }
        }
    });
}

async function loadState() {
    const storage = await chrome.storage.local.get([
        "taskDag",
        "sessionGoal",
        "sessionStatus",
        "errorMessage",
        "showThinking"
    ]);

    taskDag = storage.taskDag;
    sessionGoal = storage.sessionGoal;
    const status = storage.sessionStatus;
    const error = storage.errorMessage;
    const thinking = storage.showThinking;

    // Show appropriate view
    if (error) {
        showError(error);
    } else if (thinking || status === "PENDING" || status === "IN_PROGRESS") {
        showLoading(status);
    } else if (taskDag) {
        showContent();
    } else {
        showEmpty();
    }
}

function showLoading(status) {
    loadingEl.style.display = "block";
    errorEl.style.display = "none";
    emptyEl.style.display = "none";
    contentEl.style.display = "none";

    const message = status === "PENDING"
        ? "Creating task plan..."
        : status === "IN_PROGRESS"
            ? "Processing tasks..."
            : "Loading...";

    loadingEl.querySelector("p").textContent = message;
}

function showError(message) {
    loadingEl.style.display = "none";
    errorEl.style.display = "block";
    emptyEl.style.display = "none";
    contentEl.style.display = "none";

    errorMessageEl.textContent = message;
}

function showEmpty() {
    loadingEl.style.display = "none";
    errorEl.style.display = "none";
    emptyEl.style.display = "block";
    contentEl.style.display = "none";
}

function showContent() {
    loadingEl.style.display = "none";
    errorEl.style.display = "none";
    emptyEl.style.display = "none";
    contentEl.style.display = "block";

    // Show goal if available
    if (sessionGoal) {
        goalSectionEl.style.display = "block";
        goalTextEl.textContent = sessionGoal;
    }

    // Get current task from navigator page
    getCurrentTaskFromNavigator();
}

async function getCurrentTaskFromNavigator() {
    try {
        // Try to get navigator tab
        const tabs = await chrome.tabs.query({});
        const navigatorTab = tabs.find(tab =>
            tab.url && tab.url.includes(chrome.runtime.getURL("navigator.html"))
        );

        if (!navigatorTab) {
            // No navigator tab open, show first task
            computeDFSOrder();
            if (dfsOrder.length > 0) {
                const firstTask = taskDag.tasks[dfsOrder[0]];
                displayTask(firstTask, 0); // Pass object
            }
            return;
        }

        // Execute script in navigator to get current state
        const results = await chrome.scripting.executeScript({
            target: { tabId: navigatorTab.id },
            func: () => {
                if (window.taskNavigator) {
                    return {
                        currentTask: window.taskNavigator.getCurrentTask(),
                        dfsOrder: window.taskNavigator.getDfsOrder(),
                        currentIndex: window.taskNavigator.getCurrentIndex()
                    };
                }
                return null;
            }
        });

        if (results?.[0]?.result) {
            const { currentTask, dfsOrder: order, currentIndex: idx } = results[0].result;
            dfsOrder = order;
            if (currentTask) {
                displayTask(currentTask, idx); // Pass object for direct use
            }
        } else {
            // Fallback
            computeDFSOrder();
            if (dfsOrder.length > 0) {
                const firstTask = taskDag.tasks[dfsOrder[0]];
                displayTask(firstTask, 0);
            }
        }

    } catch (err) {
        console.error("Error getting navigator state:", err);
        // Fallback to first task
        computeDFSOrder();
        if (dfsOrder.length > 0) {
            const firstTask = taskDag.tasks[dfsOrder[0]];
            displayTask(firstTask, 0);
        }
    }
}

function computeDFSOrder() {
    if (!taskDag || !taskDag.tasks) {
        dfsOrder = [];
        return;
    }

    const tasks = taskDag.tasks;
    const adjacency = taskDag.adjacency || {};
    const roots = taskDag.sources || taskDag.primalNodes || [];
    const visited = new Set();
    dfsOrder = [];

    function dfs(nodeId) {
        if (!nodeId || visited.has(nodeId)) return;
        visited.add(nodeId);
        dfsOrder.push(nodeId);

        const children = adjacency[nodeId] || [];
        children.forEach(child => dfs(child));
    }

    roots.forEach(root => dfs(root));
}

function displayTask(taskIdOrObj, index) {
    let task, taskId;
    if (typeof taskIdOrObj === 'object') {
        task = taskIdOrObj;
        taskId = task.subtaskId || task.id || task.taskId;
    } else {
        taskId = taskIdOrObj;
        task = taskDag ? taskDag.tasks[taskId] : null;
    }

    if (!task) {
        taskLabelEl.textContent = "No task selected";
        return;
    }
    currentTaskId = taskId;

    // Update status
    statusEl.textContent = `Task ${index + 1} of ${dfsOrder.length}`;

    // Update task label
    taskLabelEl.textContent = task.label || taskId;

    // Update progress
    const progress = dfsOrder.length > 0 ? ((index + 1) / dfsOrder.length) * 100 : 0;
    progressFillEl.style.width = `${progress}%`;
    progressTextEl.textContent = `${index + 1} / ${dfsOrder.length}`;

    // Update instructions
    const instructions = task.directInstructions ||
        (task.directInstruction ? [task.directInstruction] : []);

    if (instructions.length > 0) {
        instructionsCardEl.style.display = "block";
        instructionsListEl.innerHTML = "";

        instructions.forEach(instr => {
            const li = document.createElement("li");
            li.textContent = instr;
            instructionsListEl.appendChild(li);
        });
    } else {
        instructionsCardEl.style.display = "none";
    }

    // Update navigation buttons
    prevBtnEl.disabled = index <= 0;
    nextBtnEl.disabled = index >= dfsOrder.length - 1;

    // Update previews
    if (index > 0) {
        const prevTask = taskDag.tasks[dfsOrder[index - 1]];
        prevPreviewEl.textContent = prevTask?.label || dfsOrder[index - 1];
    } else {
        prevPreviewEl.textContent = "Start";
    }

    if (index < dfsOrder.length - 1) {
        const nextTask = taskDag.tasks[dfsOrder[index + 1]];
        nextPreviewEl.textContent = nextTask?.label || dfsOrder[index + 1];
    } else {
        nextPreviewEl.textContent = "End";
    }
}

function sendNavigationMessage(key) {
    // Send message to content script which will forward to navigator
    chrome.runtime.sendMessage({
        action: "contentNavKey",
        key: key
    });

    // Update display after short delay
    setTimeout(() => getCurrentTaskFromNavigator(), 200);
}

// Refresh every 2 seconds if navigator is open
setInterval(() => {
    if (contentEl.style.display !== "none") {
        getCurrentTaskFromNavigator();
    }
}, 2000);

init();