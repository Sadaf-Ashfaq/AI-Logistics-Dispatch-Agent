from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import Base, engine
from .api import orders, drivers, operations, agent
from .seed import seed

app=FastAPI(title="RouteFlow AI",version="1.0.0",description="Logistics operations agent")
app.add_middleware(CORSMiddleware,allow_origins=["http://localhost:3000","http://127.0.0.1:3000"],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])
app.include_router(orders.router); app.include_router(drivers.router); app.include_router(operations.router); app.include_router(agent.router)
@app.on_event("startup")
def startup():
    Base.metadata.create_all(engine); seed()
@app.get("/health")
def health(): return {"status":"ok","service":"RouteFlow AI"}
