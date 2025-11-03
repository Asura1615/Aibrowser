# AI Browser

A keyboard-first browser extension that turns a user goal into a navigable task graph, backed by a small AWS SAM backend that decomposes goals, runs searches, and incrementally fills the session graph.

---

## Quick overview

You provide a `goal` via the extension's entry (`task goal` search box). The front-facing API creates a `sessionId` and a DB record for the session. A separate worker lambda expands the session into subtasks (a graph), issues search queries for each generated node, enriches nodes with results, and writes them back. The extension continuously polls the `sessionId` and — when a node becomes the "next logical" one — previews / redirects to the node's `url`. The UI includes keyboard-first navigation and a side panel that shows what you are doing and the provenance of the results.

---

## Key features (what you’ll notice)

* **Goal → Subtask Graph**: Natural decomposition of a goal into navigable nodes.
* **Session-driven UX**: State survives refreshes; client polls a `sessionId` endpoint for updates.
* **Keyboard-first navigation**: Can navigate between subtask by assigned keys (left/right navigation to sweep branches and depths).
* **Side panel**: Shows current sub task detail.
* **Responsive feel through split backend**: Front API returns quickly; a worker fills graph depth and search results.

---

## Architecture (brief)

1. **Frontend (Browser extension)**

   * UI: overlay + side panel for context.
   * Behaviour: posts the goal, receives `sessionId`, and polls for session updates. When next logical nodes appear (and include `url`), the extension previews/opens them. Navigation is keyboard-first.

2. **Backend (AWS SAM)**

   * **Front Lambda**: Accepts a goal, creates `sessionId`, persists initial DB entry, and returns `sessionId` immediately.
   * **Worker Lambda**: Triggered (SQS/event or invoked locally during development) to generate subtasks, call search providers, and update the DB nodes with results.
   * **DB**: Stores session graph / node state (the client polls this via `sessionId`).

The separation between the light front endpoint and the asynchronous worker is purpose-built: it keeps the client responsive while allowing deeper enrichment to happen without blocking the user.

---

## Installation

Prerequisites:

* AWS SAM CLI and AWS credentials set up locally to run SAM for deployment
* A search API or mock search provider for the worker to call (worker issues generated queries; replacing this is easy).

Typical local workflow (commands used while developing):

```bash
# build and run the front API locally
git clone https://github.com/Asura1615/Aibrowser/
cd Aibrowser/browser/backend
sam build && sam deploy

# Copy the url for ApiAgentfunction2 and edit the baseurl in background.js
```

Loading the extension during local development:

1. Open your browser's extensions page enable Developer Mode.
2. Load the `Browser/Frontend` folder as an unpacked extension.

---

## Usage / UX expectations

* Enter a goal in the local searchbox with the keyword Default:`task`; the extension receives a `sessionId` and starts polling.
* Thinking page loads give some time
* The required web pages will load by themselve navigate via side panel or shortcut keys.

---

## Contributing

* The core places to work on: `Frontend` (keyboard / UI behaviour), `Backend` (session creation and worker logic), and the worker's search provider adapters. The `sessionId` polling and DB schema are the contract between client and backend — keep changes coordinated.

---

## License

Pick a license that matches how you want this repo used. `MIT` is a common, permissive default and works well for experiments and hackathon projects.

---

## Authors

1. Abhay Upadhyay
2. Sameer Thakur
3. Arpita Gupta

---
