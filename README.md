# RouteFlow AI

RouteFlow AI is a logistics operations agent and dashboard for small and medium-sized delivery businesses, with a focus on Egyptian SMEs. It helps dispatchers inspect orders and driver capacity, create a first-pass dispatch plan, and review assignments and activity. The agent connects operational requests to database-backed tools and supported actions, rather than only returning conversational advice.

## Problem

Small delivery teams often review pending orders, identify urgent or at-risk deliveries, check driver availability and capacity, estimate routes, assign work, and monitor exceptions by hand. Repeating these checks takes dispatcher time and makes consistent driver allocation harder.

## Solution

RouteFlow AI provides a dashboard and an operations agent that reads current order and driver data. Deterministic intent handling selects tools for supported requests. If configured, an OpenAI-compatible model can select tools through chat completions. The one-click dispatch endpoint applies the project's dispatch rules directly, with or without an LLM provider.

A dispatch request follows this path:

Business data -> Agent or dispatch request -> Tools and dispatch rules -> Database updates -> Operational result

## Key Agent Capabilities

The backend registers these tools in backend/app/agent/orchestrator.py:

| Capability | Tool names |
| --- | --- |
| Read orders and risk | get_pending_orders, get_today_orders, get_urgent_orders, get_at_risk_deliveries, get_order_details |
| Read drivers and assignments | get_available_drivers, calculate_driver_capacity, get_dispatch_plan, get_driver_workloads, explain_assignment |
| Read operations and estimates | get_operations_summary, get_dispatch_metrics, estimate_route |
| Perform supported actions | assign_order_to_driver, reassign_delayed_orders, run_dispatch |

The Orders page also lets an operator update an order status through the API; that is not an Agent tool. Dispatch does not reorder deliveries after assignment.

## How the Agent Works

1. A user sends a request from Agent or starts dispatch from the dashboard.
2. POST /agent/chat first checks supported operational intents using deterministic routing.
3. For a supported intent, the orchestrator selects and executes the matching tool against the current database session.
4. If no local intent matches and an OpenAI-compatible provider is configured, the backend sends the request and tool definitions to the provider and executes returned tool calls.
5. Without a provider, unmatched requests receive a database-backed operations snapshot.
6. Dispatch applies availability, capacity, priority, and estimated zone travel rules. Supported actions update the database and write activity records.
7. The backend returns a response and, when applicable, tool calls, actions, updated orders, assignments, and metrics.

The UI shows tool calls and operational results. It does not expose private model reasoning.

## Agent Workflow

The Agent Workflow page at /workflow shows a visual map of the request, API, agent, decisions, data, dispatch, and result steps. Tool availability comes from GET /agent/tools. Execution indicators use tool-call results from the current shared UI session and persisted dispatch/activity data. The diagram is a workflow map, not a live trace of every internal backend step.

## Main Application Pages

| Page | Purpose |
| --- | --- |
| Overview | Today's order, driver, dispatch, and activity summary. |
| Orders | Browse, create, assign, and update order status. |
| Drivers | Browse and create drivers; review availability and capacity. |
| Dispatch | Run dispatch and review assignments and estimated impact. |
| Agent | Ask supported natural-language operational questions and request actions. |
| Agent Workflow | Inspect the workflow map, available tools, and execution evidence. |
| Reports | Review order states, driver utilization, dispatch metrics, and time estimates. |
| Activity | Review recorded backend actions with category filters. |

## Example Agent Requests

These examples match deterministic intents implemented in the backend:

- "How many pending orders are there?"
- "Which drivers are available?"
- "Which orders are urgent?"
- "Which deliveries are at risk of being late?"
- "Show today's dispatch plan."
- "Plan today's deliveries."
- "How much time did the latest dispatch save?"
- "Give me today's operations summary."

Intent matching is phrase-based. With an optional LLM provider, other requests may be handled through tool calling. Without it, unmatched prompts receive an operations snapshot.

## Business Impact

The dashboard calculates counts and utilization from the current SQLite database. Dispatch results include orders considered and assigned, drivers used, urgent orders handled, and estimated manual, agent-assisted, and saved minutes.

For a completed dispatch run:

- Manual planning = 20 minutes per order considered.
- Agent-assisted planning = 5 minutes of review plus 1 minute per order left unassigned.
- Estimated time saved = manual estimate minus agent-assisted estimate, floored at zero.

Before a dispatch run is recorded, the summary estimates the current queue using available driver capacity. These are planning estimates, not measured labor savings. Reports also show delayed/failed order counts and driver utilization. No fixed demo result or improvement percentage is claimed.

## Architecture

~~~mermaid
flowchart LR
    U[Operator] --> F[Next.js frontend]
    F --> API[FastAPI API]
    API --> DB[(SQLite via SQLAlchemy)]
    API --> AG[Deterministic agent routing]
    AG --> TOOLS[Database-backed tools]
    TOOLS --> DB
    AG -. optional configured tool calling .-> LLM[OpenAI-compatible chat completions API]
    LLM -. tool calls .-> TOOLS
    API --> DS[Dispatch service]
    DS --> ROUTE[Predefined zone travel matrix]
    DS --> DB
    DB --> API
    API --> F
~~~

## Agent Tool Flow

The one-click dispatch endpoint calls the dispatch service directly. When a supported dispatch request comes through Agent chat, the orchestrator reads pending orders and available drivers, then calls run_dispatch.

~~~mermaid
flowchart TD
    U[Dispatch request] --> API[POST /agent/dispatch]
    API --> DS[Dispatch service]
    CHAT[Supported dispatch request in Agent chat] --> AG[Agent intent routing]
    AG --> P[get_pending_orders]
    AG --> D[get_available_drivers]
    P --> DS
    D --> DS
    API --> DS
    DS --> FILTER[Select today's unassigned pending or delayed orders]
    FILTER --> RULES[Prioritize; check availability and capacity]
    RULES --> ROUTE[Estimate travel using fixed zone matrix]
    ROUTE --> ASSIGN[Assign eligible orders]
    ASSIGN --> DB[(SQLite)]
    ASSIGN --> METRICS[Save DispatchRun and AgentAction records]
    DB --> RESULT[Return assignments and estimated metrics]
    METRICS --> RESULT
~~~

## Technology Stack

| Area | Technologies |
| --- | --- |
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, custom CSS and SVG workflow visualization |
| Backend | Python, FastAPI, Uvicorn, Pydantic, SQLAlchemy |
| Database | SQLite by default; database URL is configurable |
| Agent | Project-defined database tools; optional OpenAI-compatible chat completions with tool calling |
| Supporting libraries | HTTPX for provider requests; python-dotenv for environment loading |

The workflow visualization is implemented in the project UI; no external graph visualization library is used.

## Project Structure

~~~text
.
|-- README.md
|-- data/
|   `-- README.md
|-- backend/
|   |-- .env.example
|   |-- requirements.txt
|   |-- tests/test_workflow.py
|   `-- app/
|       |-- main.py
|       |-- database.py
|       |-- models.py
|       |-- schemas.py
|       |-- seed.py
|       |-- api/ (agent, drivers, operations, orders)
|       |-- agent/orchestrator.py
|       `-- services/ (dispatch_service.py, route_service.py)
`-- frontend/
    |-- .env.local.example
    |-- package.json
    |-- app/ (overview, agent, activity, dispatch, drivers, orders, reports, workflow)
    |-- components/ (shared shell, data provider, page components)
    `-- lib/ (api.ts, types.ts)
~~~

## Installation and Setup

### Requirements

- Python 3.11 or newer recommended.
- Node.js and npm installed; their versions are not pinned by the project.
- An LLM API key is optional. Deterministic dispatch and supported local intents work without one.

### Backend

In PowerShell, from the repository root:

~~~powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python -m app.seed
uvicorn app.main:app --reload --port 8000
~~~

The backend is at http://localhost:8000. Interactive API docs are at http://localhost:8000/docs and the health endpoint is http://localhost:8000/health. If PowerShell blocks activation, run Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass in that terminal, then activate again.

### Frontend

Open a second terminal in the repository root:

~~~powershell
cd frontend
Copy-Item .env.local.example .env.local
npm install
npm run dev
~~~

Open http://localhost:3000. NEXT_PUBLIC_API_URL defaults to http://localhost:8000.

## Environment Variables

| Variable | Used by | Required | Purpose |
| --- | --- | --- | --- |
| DATABASE_URL | Backend | No | SQLAlchemy URL; defaults to sqlite:///./routeflow.db. |
| LLM_PROVIDER | Backend | No | Use openai or openai_compatible to enable configured provider calls. |
| LLM_API_KEY | Backend | No | Provider key; used with a supported provider and model. |
| LLM_MODEL | Backend | No | Provider model name for tool calling. |
| LLM_BASE_URL | Backend | No | Provider API base URL; defaults to https://api.openai.com/v1. |
| NEXT_PUBLIC_API_URL | Frontend | No | Backend base URL; defaults to http://localhost:8000. |

The backend sample is backend/.env.example; the frontend sample is frontend/.env.local.example. They contain placeholders/defaults, not credentials. Keep local environment files and API keys out of version control.

## Demo Data and Database

The backend uses SQLite by default and creates tables at startup. On an empty database, startup seeds 20 deterministic Cairo-area orders and 8 drivers. Seed initialization skips insertion when the database already contains orders or drivers.

To explicitly reset the demo data, run from the backend directory:

~~~powershell
python -m app.seed --reset
~~~

This drops and recreates the local database and, if the database file exists, copies it to a .bak file first. Reset only when you intend to replace local database contents.

## API Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /health | Backend health check. |
| GET, POST | /orders | List orders; create an order. |
| POST | /orders/{order_id}/assign | Assign an order to a driver. |
| POST | /orders/{order_id}/status | Update an order status. |
| GET, POST | /drivers | List drivers; create a driver. |
| GET | /drivers/{driver_id} | Read driver details and remaining capacity. |
| GET | /operations/summary | Read current operational metrics. |
| GET | /operations/activity | Read recent recorded activity. |
| GET | /operations/assignments | List saved delivery assignments. |
| GET | /operations/latest-dispatch | Read the latest dispatch and its assignments. |
| GET | /agent/tools | Read Agent tool names and schemas. |
| POST | /agent/chat | Send an operational request as JSON, for example {"message":"Plan today's deliveries"}. |
| POST | /agent/dispatch | Run today's dispatch workflow. |

## Recommended Demo Flow

1. Open Overview and show the current order queue and available drivers.
2. Open Agent Workflow to introduce the request, tools, dispatch rules, and database path.
3. Open Agent and ask a supported question, such as "Which drivers are available?"
4. Run "Plan today's deliveries" in Agent or click Run AI Dispatch on Dispatch.
5. Show assignments and estimated time impact in Dispatch.
6. Open Reports to review updated operational metrics.
7. Open Activity to show recorded tool and assignment actions.

Use the current database state in the demo. To repeat a clean seeded run, reset the database before dispatch.

## Verification

Run the backend workflow tests from the backend directory:

~~~powershell
python -m unittest discover -s tests
~~~

Create a production frontend build from the frontend directory:

~~~powershell
npm run build
~~~
## Hackathon Context

RouteFlow AI was built for the Agents at Work AI-agent hackathon. It focuses on repetitive dispatch work for Egyptian SMEs in logistics and delivery, with operational visibility through database-backed results, recorded actions, and explicit time estimates.

## Security and Configuration Notes

- Store any provider API key in the backend environment file; never put it in frontend code.
- Do not commit local .env or .env.local files.
- Keep example environment files limited to non-secret defaults and placeholders.

## Limitations

- Route estimates use a predefined zone-to-zone time matrix, with a fixed fallback for unknown zones; there is no live maps or traffic integration.
- Demo data is local and deterministic. A reset replaces the current local database after making a .bak copy when a database file exists.
- Time-saving figures are estimated from dispatch workload using the assumptions above, not measured labor records.
- Without optional LLM settings, deterministic intent routing covers supported requests; unmatched prompts receive a database snapshot, not general-purpose conversational reasoning.
- The workflow diagram presents the architecture and highlights available execution evidence; it is not a full real-time trace of internal backend steps.

## Future Improvements

Possible future work includes live routing and driver-location integrations, production authentication and authorization, richer historical analytics, and deployment/scaling for a hosted environment.

## License

No license file was found in the repository.

