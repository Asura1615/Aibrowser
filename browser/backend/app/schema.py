from pydantic import BaseModel
from typing import Dict

class TaskPlannerRequest(BaseModel):
    goal:str
    clientinfo:Dict[str, str]
