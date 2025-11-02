// navigator.js — wired to session-polling background behavior

let taskDag = null;
let tasks = {};
let dfsOrder = [];
let currentIndex = 0;
let currentTaskId = null;
let childrenMap = {};
let actionHistory = [];
const MAX_RESOLVE_ATTEMPTS = 12;
const RESOLVE_WAIT_MS = 2000;

// DOM refs (assumes navigator.html contains these elements)
const taskContainer = document.getElementById("task-container");
const labelEl = document.getElementById("task-label");
const instructionsEl = document.getElementById("instructions");
const progressEl = document.getElementById("progress");
const thinkingEl = document.getElementById("thinking");
const errorMsgEl = document.getElementById("error-msg");
const navInfoEl = document.getElementById("navigation-info");

const navButtonsDiv = document.createElement("div");
navButtonsDiv.style.marginTop = "12px";
navButtonsDiv.style.display = "flex";
navButtonsDiv.style.gap = "8px";
navButtonsDiv.id = "nav-buttons";
navInfoEl.parentNode.insertBefore(navButtonsDiv, navInfoEl.nextSibling);

// get preloaded subtask param if page opened with ?subtask=
const params = new URLSearchParams(window.location.search);
const preloadedSubtaskId = params.get("subtask");

async function init() {
    await checkStorage();

    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== "local") return;
        if (changes.showThinking) {
            if (changes.showThinking.newValue) showThinking();
            else thinkingEl.style.display = "none";
        }
        if (changes.errorMessage && changes.errorMessage.newValue) {
            showError(changes.errorMessage.newValue);
        }
        if (changes.taskDag && changes.taskDag.newValue) {
            startWithDag(changes.taskDag.newValue);
        }
    });

    // listen for key messages (sent by content script)
    chrome.runtime.onMessage.addListener((msg) => {
        if (msg.action === "contentNavKey") {
            if (msg.key === "ArrowRight") moveForwardOneDFS();
            else if (msg.key === "ArrowLeft") backtrackOne();
        }
    });

    setupKeyListener();
}

async function checkStorage() {
    const res = await chrome.storage.local.get(["showThinking", "taskDag", "errorMessage", "sessionId", "sessionStatus"]);
    if (res.showThinking) {
        showThinking();
        return;
    }
    if (res.errorMessage) {
        showError(res.errorMessage);
        return;
    }
    if (res.taskDag) {
        startWithDag(res.taskDag);
        return;
    }
    // No dag yet — waiting for background poll to populate it
    showThinking();
}

function showThinking() {
    thinkingEl.style.display = "block";
    taskContainer.style.display = "none";
    errorMsgEl.style.display = "none";
    navInfoEl.style.display = "none";
}

function showError(msg) {
    thinkingEl.style.display = "none";
    taskContainer.style.display = "none";
    errorMsgEl.style.display = "block";
    errorMsgEl.textContent = msg;
    navInfoEl.style.display = "none";
}

function buildChildrenMap(dag) {
    tasks = dag.tasks || {};
    const map = {};
    Object.keys(tasks).forEach((id) => (map[id] = []));
    Object.values(tasks).forEach((t) => {
        const id = t.subtaskId || t.id || t.taskId;
        const deps = t.dependencies || [];
        deps.forEach((d) => {
            if (!map[d]) map[d] = [];
            map[d].push(id);
        });
    });
    return map;
}

function computeRoots(dag) {
    if (dag.primalNodes && dag.primalNodes.length) return dag.primalNodes.slice();
    // fallback: nodes with no incoming deps
    const all = new Set(Object.keys(tasks));
    Object.values(tasks).forEach((t) => (t.dependencies || []).forEach((d) => all.delete(d)));
    return Array.from(all);
}

function computeDFSOrder() {
    dfsOrder = [];
    const roots = computeRoots(taskDag);
    const visited = new Set();

    function dfs(u) {
        if (!u || visited.has(u)) return;
        visited.add(u);
        dfsOrder.push(u);
        const kids = (childrenMap[u] || []).slice();
        for (const c of kids) dfs(c);
    }

    // keep deterministic: iterate roots in topological order if available
    const topo = taskDag.topological_order || [];
    const orderedRoots = roots.filter((r) => topo.includes(r)).sort((a, b) => topo.indexOf(a) - topo.indexOf(b));
    const remaining = roots.filter((r) => !orderedRoots.includes(r));
    orderedRoots.concat(remaining).forEach((r) => dfs(r));
}

function startWithDag(dag) {
    const oldDag = taskDag;
    taskDag = dag;
    childrenMap = buildChildrenMap(dag);
    computeDFSOrder();

    if (!dfsOrder.length) {
        showError("Graph is empty.");
        return;
    }

    // NEW: Preserve position on partial updates
    let newIndex = 0;
    if (preloadedSubtaskId && taskDag.tasks && taskDag.tasks[preloadedSubtaskId]) {
        newIndex = dfsOrder.indexOf(preloadedSubtaskId);
    } else if (oldDag && currentTaskId && dfsOrder.includes(currentTaskId)) {
        // Stay on current if still valid
        newIndex = dfsOrder.indexOf(currentTaskId);
    } else if (actionHistory.length > 0) {
        // Advance to furthest valid in history
        const validHistory = actionHistory.filter(idx => idx < dfsOrder.length);
        newIndex = validHistory.length > 0 ? validHistory[validHistory.length - 1] : 0;
        actionHistory = validHistory; // Trim invalid
    }

    currentIndex = newIndex;
    currentTaskId = dfsOrder[currentIndex];
    if (actionHistory[actionHistory.length - 1] !== currentIndex) {
        actionHistory.push(currentIndex);
    }

    thinkingEl.style.display = "none";
    taskContainer.style.display = "block";
    navInfoEl.style.display = "block";

    renderNavButtons();
    displayCurrentTask();
}

async function displayCurrentTask() {
    instructionsEl.innerHTML = "";
    if (!currentTaskId) return;
    const task = taskDag.tasks[currentTaskId] || {};
    labelEl.textContent = task.label || currentTaskId;

    // handle 'necessary' url: wait until backend replaces it with real url
    const urlRaw = (task.url || "").toString();
    if (urlRaw.toLowerCase() === "necessary") {
        labelEl.textContent = `${task.label || currentTaskId} (waiting for resolved URL...)`;
        // show overlay on active tab while waiting
        const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (activeTab?.id) {
            chrome.runtime.sendMessage({ action: "openThinkingOverlay", tabId: activeTab.id, text: "Resolving URL..." });
        }

        let resolved = false;
        for (let attempt = 0; attempt < MAX_RESOLVE_ATTEMPTS; attempt++) {
            const response = await new Promise((resolve) => chrome.runtime.sendMessage({ action: "getUrlForTask", taskId: currentTaskId }, resolve));
            if (response && response.task) {
                const freshTask = response.task;
                if (freshTask && freshTask.url && freshTask.url.toString().toLowerCase() !== "necessary") {
                    // update local and proceed
                    taskDag.tasks[currentTaskId] = Object.assign({}, taskDag.tasks[currentTaskId], freshTask);
                    resolved = true;
                    break;
                }
            }
            await new Promise((r) => setTimeout(r, RESOLVE_WAIT_MS));
        }

        if (activeTab?.id) chrome.runtime.sendMessage({ action: "removeThinkingOverlay", tabId: activeTab.id });

        if (!resolved) {
            const li = document.createElement("li");
            li.textContent = "Failed to resolve URL after multiple attempts.";
            li.style.color = "red";
            instructionsEl.appendChild(li);
            renderNavButtons();
            return;
        }
    }

    // now work with possibly-updated task
    const currentTask = taskDag.tasks[currentTaskId] || {};
    const finalUrl = (currentTask.url || "").toString();

    if (finalUrl && (finalUrl.startsWith("http://") || finalUrl.startsWith("https://"))) {
        // open or focus the URL
        chrome.runtime.sendMessage({ action: "openUrl", url: finalUrl });
        const li = document.createElement("li");
        li.textContent = "Opening external page: " + finalUrl;
        instructionsEl.appendChild(li);
        renderNavButtons();
        return;
    }

    // if NotNecessary -> open instruction page locally (unless we are that page)
    if (finalUrl && (finalUrl === "NotNecessary" || finalUrl === "notNecessary")) {
        // if we are not already on subtask view, open it
        const currentSearch = new URL(window.location.href).searchParams.get("subtask");
        if (currentSearch !== currentTaskId) {
            chrome.runtime.sendMessage({ action: "openInstructionPage", taskId: currentTaskId });
            return;
        }
    }

    // show direct instructions or fallback
    if (currentTask.directInstructions && currentTask.directInstructions.length) {
        currentTask.directInstructions.forEach((instr) => {
            const li = document.createElement("li");
            li.textContent = instr;
            instructionsEl.appendChild(li);
        });
    } else if (currentTask.directInstruction) {
        const li = document.createElement("li");
        li.textContent = currentTask.directInstruction;
        instructionsEl.appendChild(li);
    } else {
        const li = document.createElement("li");
        li.textContent = "No instructions available.";
        instructionsEl.appendChild(li);
    }

    const idx = dfsOrder.indexOf(currentTaskId);
    progressEl.textContent = `Progress: ${idx >= 0 ? idx + 1 : "?"} / ${dfsOrder.length} (${currentTaskId})`;

    renderNavButtons();
}

function renderNavButtons() {
    navButtonsDiv.innerHTML = "";

    const prevBtn = document.createElement("button");
    prevBtn.textContent = "◀ Prev (Ctrl+Alt+Left)";
    prevBtn.onclick = () => backtrackOne();
    prevBtn.disabled = actionHistory.length <= 1;
    navButtonsDiv.appendChild(prevBtn);

    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next ▶ (Ctrl+Alt+Right)";
    nextBtn.onclick = () => moveForwardOneDFS();
    nextBtn.disabled = currentIndex >= dfsOrder.length - 1;
    navButtonsDiv.appendChild(nextBtn);

    // context labels
    const context = document.createElement("div");
    context.style.marginLeft = "12px";
    context.style.display = "flex";
    context.style.flexDirection = "column";
    context.style.justifyContent = "center";

    const prevIdx = actionHistory.length > 1 ? actionHistory[actionHistory.length - 2] : null;
    const prevLabel = document.createElement("div");
    prevLabel.textContent = prevIdx !== null ? `Prev: ${taskDag.tasks[dfsOrder[prevIdx]]?.label || dfsOrder[prevIdx]}` : "Prev: -";
    const nextIdx = currentIndex < dfsOrder.length - 1 ? currentIndex + 1 : null;
    const nextLabel = document.createElement("div");
    nextLabel.textContent = nextIdx !== null ? `Next: ${taskDag.tasks[dfsOrder[nextIdx]]?.label || dfsOrder[nextIdx]}` : "Next: -";

    context.appendChild(prevLabel);
    context.appendChild(nextLabel);
    navButtonsDiv.appendChild(context);
}

function moveForwardOneDFS() {
    if (!dfsOrder.length) return;
    if (currentIndex >= dfsOrder.length - 1) return;
    const newIndex = currentIndex + 1;
    actionHistory.push(newIndex);
    currentIndex = newIndex;
    currentTaskId = dfsOrder[currentIndex];
    displayCurrentTask();
}

function backtrackOne() {
    if (actionHistory.length <= 1) return;
    actionHistory.pop();
    const prevIndex = actionHistory[actionHistory.length - 1];
    currentIndex = prevIndex;
    currentTaskId = dfsOrder[currentIndex];
    displayCurrentTask();
}

function setupKeyListener() {
    document.addEventListener("keydown", (e) => {
        if (["INPUT", "TEXTAREA"].includes(e.target.tagName)) return;
        if (e.ctrlKey && e.altKey && e.key === "ArrowRight") {
            e.preventDefault();
            moveForwardOneDFS();
            return;
        }
        if (e.ctrlKey && e.altKey && e.key === "ArrowLeft") {
            e.preventDefault();
            backtrackOne();
            return;
        }
    });
}

// Expose programmatic navigation
window.taskNavigator = {
    jumpTo(subtaskId) {
        if (!taskDag || !taskDag.tasks || !taskDag.tasks[subtaskId]) return;
        const idx = dfsOrder.indexOf(subtaskId);
        if (idx === -1) return;
        actionHistory.push(idx);
        currentIndex = idx;
        currentTaskId = dfsOrder[currentIndex];
        displayCurrentTask();
    },
    getCurrentTask: () => {
        if (!currentTaskId || !taskDag) return null;
        return taskDag.tasks[currentTaskId];
    },
    getDfsOrder: () => dfsOrder,
    getCurrentIndex: () => currentIndex
};

init();