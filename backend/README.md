# RouteFlow AI Backend

From this folder in Windows PowerShell:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m app.seed --reset
uvicorn app.main:app --reload --port 8000
```

`--reset` creates a backup of the configured SQLite database beside it (for example, `routeflow.db.bak`) before recreating the 20-order, 8-driver demo dataset. Normal backend startup is idempotent and does not add seed records to an existing database.

Open `/docs` for interactive API documentation. The SQLite file is created as `routeflow.db` in this directory. Optional LLM settings are documented in the root README; dispatch and chat remain available without a key.
