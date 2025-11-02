# main.py
from fastapi import FastAPI
from Apiagent import router as rt1
from mangum import Mangum
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

log = logging.getLogger("uvicorn")
log.setLevel(logging.INFO)

app = FastAPI()

@app.options("/{full_path:path}")
async def preflight_handler(full_path: str):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET,POST,OPTIONS,PUT,DELETE",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
    }
    return JSONResponse(status_code=200, content={}, headers=headers)

app.include_router(rt1, prefix="/api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # change to your extension origin(s) for tighter security
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/api/home")
def home():
    return {"msg": "Aws system running"}

handler = Mangum(app)
