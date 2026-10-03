from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..schemas import ChatRequest
from ..agent.orchestrator import chat, TOOLS
from ..services.dispatch_service import run_dispatch

router=APIRouter(prefix="/agent",tags=["agent"])
@router.get("/tools")
def agent_tools():
    return [{"name":item["function"]["name"],"description":item["function"]["description"],"parameters":item["function"]["parameters"]["properties"],"required":item["function"]["parameters"]["required"]} for item in TOOLS]
@router.post("/chat")
def agent_chat(body:ChatRequest,db:Session=Depends(get_db)): return chat(body.message,db)
@router.post("/dispatch")
def dispatch(db:Session=Depends(get_db)): return run_dispatch(db)
