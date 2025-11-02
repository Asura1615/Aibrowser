# Apiagent.py
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import boto3
import json
import logging
import os
import uuid
from datetime import datetime

router = APIRouter()
log = logging.getLogger(__name__)
log.setLevel(logging.INFO)

TABLE_NAME = os.environ.get("TABLE_NAME")
SQS_QUEUE_URL = os.environ.get("SQS_QUEUE_URL")
REGION = os.environ.get("AWS_REGION", "us-east-1")

if not TABLE_NAME or not SQS_QUEUE_URL:
    log.critical("Missing required env vars TABLE_NAME or SQS_QUEUE_URL")

dynamodb = boto3.resource("dynamodb", region_name=REGION)
table = dynamodb.Table(TABLE_NAME)
sqs = boto3.client("sqs", region_name=REGION)


class TaskPlannerRequest(BaseModel):
    goal: str
    clientinfo: dict = {}


@router.post("/taskplanner")
def taskplanner(task: TaskPlannerRequest):
    """Create a session and enqueue a lightweight SQS message for background processing."""
    try:
        session_id = f"session_{uuid.uuid4().hex}"
        now = datetime.utcnow().isoformat() + "Z"

        initial_item = {
            "sessionId": session_id,
            "status": "PENDING",
            "createdAt": now,
            # keep the original request for later processing
            "request": {"goal": task.goal, "clientinfo": task.clientinfo},
            # placeholder for results / graph data
            "data": {},  
            "primalNodes": [],
            "nodesToBeSearched": []
        }

        # Save initial DynamoDB item (fast)
        table.put_item(Item=initial_item)
        log.info(f"Created session {session_id} in DynamoDB")

        # Enqueue message for the backend worker (search lambda)
        message = {
            "sessionId": session_id,
            "goal": task.goal,
            "clientinfo": task.clientinfo
        }

        sqs.send_message(
            QueueUrl=SQS_QUEUE_URL,
            MessageBody=json.dumps(message),
            MessageAttributes={
                "MessageType": {"DataType": "String", "StringValue": "TaskDecompose"}
            },
        )
        log.info(f"Enqueued SQS message for session {session_id}")

        return {"sessionId": session_id, "status": "PENDING"}
    except Exception as exc:
        log.exception("Failed to create session or enqueue")
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/{sessionId}")
def get_updated_graph(sessionId: str):
    """Return the DynamoDB item for the session (full item)."""
    try:
        res = table.get_item(Key={"sessionId": sessionId})
        item = res.get("Item")
        if not item:
            raise HTTPException(status_code=404, detail="Session not found")
        return item
    except HTTPException:
        raise
    except Exception as exc:
        log.exception("Error fetching session")
        raise HTTPException(status_code=500, detail=str(exc))
