# search.py
import json
import os
import boto3
import logging
from datetime import datetime
import requests
from botocore.exceptions import ClientError
from graph_maker import build_dag  # assumes graph_maker.py is deployed with this file
import time

log = logging.getLogger(__name__)
log.setLevel(logging.INFO)

REGION = os.environ.get("AWS_REGION", "us-east-1")
TABLE_NAME = os.environ.get("TABLE_NAME")
BEDROCK_MODEL = os.environ.get("BEDROCK_MODEL", "us.anthropic.claude-sonnet-4-5-20250929-v1:0")
SERPER_API_KEY = os.environ.get("SERPER_API_KEY")
SERPER_URL = os.environ.get("SERPER_URL", "https://google.serper.dev/search")

if not TABLE_NAME:
    log.critical("TABLE_NAME not set")
dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)
bedrock_client = boto3.client("bedrock-runtime", region_name=REGION)


# Simple prompt for decomposition; tweak as needed
DECOMPOSE_PROMPT_TEMPLATE = """
You are an expert AI Task Planner and Workflow Decomposer.
**You are an expert AI Task Planner and Workflow Decomposer. Your goal is to analyze a user's request, break it down into logical sub-tasks, generate optimized search queries, determine dependencies between tasks to form a graph structure, and categorize the overall request.** 
**Prioritize simplicity and efficiency: Always identify and lead with the most straightforward, beginner-friendly solutions. **

**Input:**
You will receive the user's main goal and client information in JSON format within XML tags.

<goal>
%s
</goal>

<clientInfo>
%s
</clientInfo>

**Instructions:**

1.  **Analyze Goal & Client Info:** Carefully examine the user's `<goal>` and the provided `<clientInfo>` (like OS, architecture, etc.) to understand the context. Infer the user's likely skill level (e.g., beginner if not specified) and focus on minimal viable setups that cover core requirements.
2.  **Categorize the Goal:** Classify the main goal into one of the following categories. Choose the *most specific* category that fits:
    * Information and analysis
    * Download and setup
    * Troubleshoot
    * Comparison
    * Others
3.  **Decompose into Sub-tasks:** Decompose into Sub-tasks: Break down the main goal into a graph of actionable, reasonably sized sub-tasks. Aim for sub-tasks that are relatively distinct. Aggressively identify parallel tasks: If multiple sub-tasks (e.g., installing two different extensions, or downloading two different tools) only depend on the same prerequisite, they must be structured as parallel steps, not an artificial sequence. generate a concise AI-defined instruction set instead of a search query—tailor it to the clientInfo (e.g., OS-specific commands). Use the category from step 2 to guide decomposition as follows:**
   - **If category is "Download and setup":** Automatically create at least two sequential sub-tasks: a "Download" node (with directInstructions for navigating well-known pages like official sites or marketplaces, plus a searchQuery or a direct download url only for well known urls) followed by an "Install" node (with directInstructions if the method is well-known and straightforward, plus an optional searchQuery for verification or edge cases). Ensure the install depends on the download.
   - **If category is "Troubleshoot":** Prioritize diagnostic sub-tasks first (e.g., check logs), then fix steps, using searchQueries for common issues tailored to clientInfo.
   - **If category is "Information and analysis" or "Comparison":** Focus on research-oriented sub-tasks with strong searchQueries; mark all urls field necessary here for source citation. In direct instruction field instead put in a 2-3 line summary of what the subtask is gonna describe.
   - **If category is "Others":** Decompose flexibly but keep simple and linear where possible.
4.  **Generate Optimized Search Queries:** For *each* sub-task that requires external resources (e.g., not purely instructional), create a concise and effective search engine query designed to find the *best* resource. Use clientinfo to generate better search queries if they fit (like official documentation, specific download pages, or targeted troubleshooting guides) to complete that sub-task. **Crucially, use the `<clientInfo>` (e.g., OS version) to make the queries more specific and relevant where applicable. For simple setups, prioritize queries for official extension marketplaces or quick-start guides. Skip this for instruction-only tasks; make optional for well-known installs.**
5.  **Identify Dependencies (Graph Metadata):**Identify True Dependencies (Graph Metadata): For each sub-task, critically determine its minimal set of true, hard prerequisites. Do not create artificial sequential chains. If Task C and Task D both only require Task B to be complete, they are parallel: both should list ["t2"] (assuming B is t2) in their dependencies list. Do not make Task D depend on Task C unless it truly requires a change made by C.**
6.  **Format Output as JSON:** Structure your entire response as a single, valid JSON object. **Do not include any introductory text, explanations, or concluding remarks outside the JSON structure.**

**Output Format Specification:**
Provide your response *only* as a JSON object matching this exact structure. Don't try to make any code block just pure json:

<output_format>
{
  "category": "string (Must be one of the 5 specified categories)",
  "planSummary": "string (A brief, 1-2 sentence natural language summary of the plan, emphasizing the simple path chosen)",
  "tasks": [
    {
      "subtaskId": "string (Unique identifier for the sub-task, e.g., 't1', 't2')",
      "label": "string (Human-readable description of the sub-task;)",
      "searchQuery": "string (The optimized search engine query for this sub-task)",
      "directInstructions": ["string"] // Array of 0-7 concise, numbered steps for linear tasks (e.g., ["1. Open VS Code Extensions view (Ctrl+Shift+X)", "2. Search for 'C/C++' by Microsoft and install"]); omit if not applicable
      "url" : string // for well known pages and sources fill it directly with the required url, for pages having doubt about mark this field either Necessary or notNecessary(things where direct instruction work always mark Necessary for information and analysis category
      "dependencies": [
        "string" // List of 'subtaskId's that must be completed BEFORE this task can start. Empty list [] if no dependencies.
      ]
    }
    // ... more task objects
  ]
}
</output_format>

**CRITICAL OUTPUT FORMAT:**
- Return ONLY a valid JSON object, nothing else
- Do NOT wrap in markdown code blocks (no ```json or ``` markers)
- Do NOT escape quotes or add newline characters
- Do NOT include any text before or after the JSON
- The response must be parseable directly as JSON with no preprocessing

**Example Input Snippet:**

<goal>
{"mainGoal": "Set up C/C++ development environment in VS Code"}
</goal>
<clientInfo>
{"os": "Windows 11", "architecture": "x64"}
</clientInfo>

**Begin Analysis and Generate JSON Output:.
"""

def handler(event, context):
    """SQS-triggered Lambda handler"""
    for record in event.get("Records", []):
        try:
            body = json.loads(record["body"])
            session_id = body["sessionId"]
            goal = body.get("goal", "")
            clientinfo = body.get("clientinfo", {})

            process_session(session_id, goal, clientinfo)
        except Exception as exc:
            log.exception("Error processing SQS record")
            # Do not swallow exception; let Lambda/SQS visibility timeout handle retries
            raise

def process_session(session_id: str, goal: str, clientinfo: dict):
    """Main orchestration for a single session"""
    now = datetime.utcnow().isoformat() + "Z"
    try:
        # mark IN_PROGRESS
        table.update_item(
            Key={"sessionId": session_id},
            UpdateExpression="SET #s = :s, startedAt = :t",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "IN_PROGRESS", ":t": now},
        )
        log.info(f"{session_id} set to IN_PROGRESS")

        # 1) Call Bedrock to decompose into task graph JSON
        decomp = call_bedrock_decompose(goal, clientinfo)

        # 2) Attempt to parse the returned JSON into a python dict
        try:
            graph_json = json.loads(decomp) if isinstance(decomp, str) else decomp
        except Exception:
            # If bedrock returns nested structure with content field, try to extract
            log.warning("Failed to json.loads decomp directly, trying fallback extraction")
            graph_json = try_extract_json(decomp)

        # Validate / build dag
        dag = build_dag(graph_json)

        # Persist the initial graph into DynamoDB
        table.update_item(
            Key={"sessionId": session_id},
            UpdateExpression="SET #data = :d, primalNodes = :p, nodesToBeSearched = :n",
            ExpressionAttributeNames={"#data": "data"},
            ExpressionAttributeValues={
                ":d": dag["tasks"],
                ":p": dag.get("sources", []),
                ":n": [tid for tid, t in dag["tasks"].items() if not str(t.get("url", "")).startswith("http")]
            },
        )
        log.info(f"{session_id} saved initial graph to DynamoDB")

        # 3) For nodes that need URL resolution: run web searches and bedrock filtering
        nodes_to_search = [tid for tid, t in dag["tasks"].items() if not str(t.get("url", "")).startswith("http")]
        if nodes_to_search:
            resolve_urls_for_nodes(session_id, dag["tasks"], nodes_to_search)

        # 4) Mark DONE
        table.update_item(
            Key={"sessionId": session_id},
            UpdateExpression="SET #s = :s, finishedAt = :t",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "DONE", ":t": datetime.utcnow().isoformat() + "Z"},
        )
        log.info(f"{session_id} processing DONE")
    except Exception as exc:
        log.exception("Processing failed; marking session FAILED")
        table.update_item(
            Key={"sessionId": session_id},
            UpdateExpression="SET #s = :s, error = :e",
            ExpressionAttributeNames={"#s": "status"},
            ExpressionAttributeValues={":s": "FAILED", ":e": str(exc)},
        )
        raise

def call_bedrock_decompose(goal: str, clientinfo: dict, timeout_seconds=30):
    """Invoke Bedrock model to decompose the goal into JSON"""
    prompt = """<goal>
    %s
    </goal>

    <clientInfo>
    %s
    </clientInfo>""" % (goal, clientinfo)
    messageBody = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 4000,
        "system": DECOMPOSE_PROMPT_TEMPLATE,
        "messages": [{"role": "user", "content": prompt}],
    }
    body = json.dumps(messageBody)
    # time.delay(500)
    resp = bedrock_client.invoke_model(modelId=BEDROCK_MODEL, body=body)
    raw = resp["body"].read().decode("utf-8")
    # Attempt to extract content text
    try:
        parsed = json.loads(raw)
        text = parsed.get("content", [{}])[0].get("text", parsed)
    except Exception:
        text = raw
    return text

def try_extract_json(s):
    """Best-effort extractor for JSON inside a model string response"""
    import re
    try:
        # naive: find first { ... } block
        m = re.search(r"\{(?:.|\n)*\}", s)
        if m:
            return json.loads(m.group(0))
    except Exception:
        pass
    raise ValueError("Unable to extract JSON from model output")

def resolve_urls_for_nodes(session_id: str, tasks: dict, node_ids: list):
    """For each node id, run serper search and use bedrock to pick best url"""
    for tid in node_ids:
        task = tasks[tid]
        q = task.get("searchQuery") or task.get("searchquery") or task.get("label") or ""
        direct_instruction = task.get("directInstructions") or task.get("directInstuction") or ""
        try:
            search_results = serper_search(q)
            # Prepare the input shape expected by get_filtered_url
            input_for_selector = {
                "goal": task.get("label", ""),
                "directInstruction": direct_instruction,
                "urls": search_results.get("organic", [])
            }
            selected = get_filtered_url(input_for_selector)
            # selected might be either dict {selected_url: "..." } or string
            selected_url = selected.get("selected_url") if isinstance(selected, dict) else selected
            # Update the task
            task["url"] = selected_url
            # Persist an incremental update (write back entire data map for simplicity)
            table.update_item(
                Key={"sessionId": session_id},
                UpdateExpression="SET #data.#tid = :val",
                ExpressionAttributeNames={"#data": "data", "#tid": tid},
                ExpressionAttributeValues={":val": task},
            )
            log.info(f"{session_id}: updated {tid} -> {selected_url}")
        except Exception as exc:
            log.exception(f"Failed resolving url for {tid}")
            # Keep going with other nodes; record error on the task
            task["url_error"] = str(exc)
            table.update_item(
                Key={"sessionId": session_id},
                UpdateExpression="SET #data.#tid = :val",
                ExpressionAttributeNames={"#data": "data", "#tid": tid},
                ExpressionAttributeValues={":val": task},
            )

def serper_search(query: str, timeout=10):
    """Call Serper (or other search API). API key read from env."""
    SERPER_API_KEY = '7f7338024e58be10ee33c47d3da46ce814a72f51'
    if not SERPER_API_KEY:
        raise RuntimeError("SERPER_API_KEY not configured")
    payload = {"q": query, "gl": "in"}
    headers = {"X-API-KEY": SERPER_API_KEY, "Content-Type": "application/json"}
    resp = requests.post(SERPER_URL, json=payload, headers=headers, timeout=timeout)
    resp.raise_for_status()
    return resp.json()

# Bedrock-based selector for best URL (wrap the previous prompt)
URL_SELECTOR_PROMPT = """
You are an intelligent web navigation assistant. Your task is to analyze a list of search results and select the BEST URL that will help accomplish a specific subtask goal.

## Input Format in json

**Current Subtask Goal:** [The specific task that needs to be accomplished]

**Available URLs:**
{
organic:[
{
DIRECTINSTRUCTION:"SOMETHING HERE FOR THIS BLOCK 1",
goal:"WHATEVER THE GOAL SUBTASK WANT TO ACHIEVE"
urls: [**URL:** [full URL]
    **Title:** [page title]
    **Snippet:** [brief description/preview of the page content]

2. **URL:** [full URL]
   **Title:** [page title]
   **Snippet:** [brief description/preview of the page content]

// more urls
]
},
{
goal: "WHATEVER THE GOAL OF SUB TASK 2 is"
DIRECTINSTRUCTION: "SOMETHING HERE FOR THIS BLOCK 2",
// urls
}
// more different sub task search data list
]
## Your Task

Analyze each URL and its snippet, then select the SINGLE BEST URL that:
1. Most directly addresses the subtask goal
2. Is most likely to contain actionable information or functionality needed
3. Appears to be authoritative and reliable for this task
4. Will minimize additional navigation steps

## Output Format

Provide your response in the following JSON format. Only give selected url field nothing else:

{
  "selected_url": "[the chosen URL]"
}

## Selection Criteria (in priority order)

**Super special priority for urls mentioned in directInstruction. if they fulfill the given subtask then disregard any other selection other than them
1. **Relevance**: Does the URL directly address the subtask goal?
2. **Actionability**: Will this page allow the user to complete the task or get very close?
3. **Ease of Use**: Consider user-friendliness and simplicity - sometimes a trusted third-party source provides a better user experience than the official source (e.g., pre-built packages, simplified installers, better documentation)
4. **Authority**: Prefer official sources, BUT if a well-known third-party provides significantly easier task completion (fewer steps, pre-configured solutions, better UX), choose the easier option
5. **Specificity**: Does the snippet indicate specific, relevant content rather than general information?
6. **Recency**: For time-sensitive tasks, prefer more recent or current sources
7. **User Intent**: Consider what the user actually needs to DO (book, buy, learn, configure, etc.)

## Important Guidelines
- ** Be flexible for input schema but be strict while outputing selected urls.
- **Balance official vs. user-friendly**: Official sources are preferred, BUT trusted third-party sources that significantly simplify the task (pre-built packages, one-click installers, clearer documentation) should be chosen over complex official sources
- **Examples of when third-party is better**:
  - Pre-compiled binaries vs. building from source
  - Simplified installers vs. manual configuration
  - Comprehensive tutorials vs. sparse official docs
  - Ready-to-use solutions vs. DIY assembly required
- **Prefer action pages** over information pages (e.g., booking page over "how to book" guide)
- **Avoid pure listicles and aggregators** unless the task specifically requires comparison
- **Consider the full user journey**: Will this URL require many more clicks, or get them close to completion with minimal friction?
- **Prioritize user success**: Choose the URL most likely to result in successful task completion, even if it's not the "official" source

## Example

**Current Subtask Goal:** Book a flight from New York to London for next Tuesday

**Available URLs:**

1. **URL:** https://www.kayak.com/flights/NYC-LON/2024-11-05
   **Title:** NYC to LON Flights - Compare Prices | KAYAK
   **Snippet:** Find cheap flights from New York to London. KAYAK searches hundreds of travel sites to help you find cheap airfare and book the flight that suits you best.

2. **URL:** https://www.united.com/en/us/
   **Title:** United Airlines - Official Site
   **Snippet:** Book flights, check in, and view your MileagePlus account. Fly United to destinations around the world.

3. **URL:** https://www.thetravel.com/best-ways-book-cheap-flights-new-york-london/
   **Title:** 10 Best Ways To Book Cheap Flights From New York To London
   **Snippet:** Planning a trip across the Atlantic? Here are the top strategies for finding affordable flights between NYC and London.

**Expected Response:**

{
  "selected_url": ["https://www.kayak.com/flights/NYC-LON/2024-11-05"]
}

---

Now analyze the provided URLs and select the best one for the given subtask goal.
"""

def get_filtered_url(input_obj):
    """Use Bedrock to pick a single best url from candidate results"""
    messageBody = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": 1000,
        "system": URL_SELECTOR_PROMPT,
        "messages": [{"role": "user", "content": json.dumps(input_obj)}],
    }
    body = json.dumps(messageBody)
    time.sleep(0.5)
    res = bedrock_client.invoke_model(modelId=BEDROCK_MODEL, body=body)
    raw = res["body"].read().decode("utf-8")
    # try to extract json
    try:
        parsed = json.loads(raw)
        text = parsed.get("content", [{}])[0].get("text", parsed)
    except Exception:
        text = raw
    # strip extra chars and parse the JSON substring
    try:
        selected = json.loads(text)
        return selected
    except Exception:
        # fallback: try to extract the first url-looking substring
        import re
        m = re.search(r"https?://[^\s'\"]+", text)
        if m:
            return {"selected_url": m.group(0)}
        raise
