# graph_maker.py
import json
from collections import defaultdict, deque

def build_dag(json_data):
    """
    Builds a DAG from the JSON data.
    Accepts either:
      - a dict matching {"tasks": [...] } where tasks is a list of task dicts
      - or tasks itself as a list
      - or data already keyed by subtaskId

    Returns:
      dict with 'tasks' (dict keyed by subtaskId), 'adjacency', 'sources', 'topological_order'
    """
    if isinstance(json_data, str):
        data = json.loads(json_data)
    else:
        data = json_data

    # Normalize tasks into a list of dicts
    if isinstance(data, dict):
        if "tasks" in data:
            tasks_list = data["tasks"]
        else:
            # maybe the user provided tasks keyed by id already
            if all(isinstance(v, dict) for v in data.values()):
                tasks_list = []
                for k, v in data.items():
                    task = v.copy()
                    task.setdefault("subtaskId", k)
                    tasks_list.append(task)
            else:
                raise ValueError("Unrecognized task structure")
    elif isinstance(data, list):
        tasks_list = data
    else:
        raise ValueError("Unrecognized input for build_dag")

    # Ensure each task has subtaskId
    tasks = {}
    for t in tasks_list:
        sid = t.get("subtaskId") or t.get("id") or t.get("taskId")
        if not sid:
            raise ValueError("Each task must include a 'subtaskId' (or 'id'/'taskId')")
        tasks[sid] = t

    graph = defaultdict(list)
    indegree = {tid: 0 for tid in tasks}

    for tid, task in tasks.items():
        deps = task.get("dependencies", []) or []
        for dep in deps:
            if dep not in tasks:
                # ignore missing dependency but log
                continue
            graph[dep].append(tid)
            indegree[tid] += 1

    sources = [tid for tid, deg in indegree.items() if deg == 0]

    # Kahn's algorithm
    topo_order = []
    queue = deque(sources)
    temp_indegree = indegree.copy()
    while queue:
        node = queue.popleft()
        topo_order.append(node)
        for succ in graph.get(node, []):
            temp_indegree[succ] -= 1
            if temp_indegree[succ] == 0:
                queue.append(succ)

    if len(topo_order) != len(tasks):
        raise ValueError("Graph contains a cycle! Cannot process as DAG.")

    return {
        "tasks": tasks,
        "adjacency": dict(graph),
        "sources": sources,
        "topological_order": topo_order,
    }


if __name__ == "__main__":
    # quick local test stub (not required in lambda)
    sample = {
        "tasks": [
            {"subtaskId":"t1", "label":"A", "dependencies":[]},
            {"subtaskId":"t2", "label":"B", "dependencies":["t1"]},
        ]
    }
    import pprint
    pprint.pprint(build_dag(sample))
