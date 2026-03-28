# MAS — Multi-Agent System Platform

MAS is a powerful workflow and orchestration platform designed for managing autonomous AI agents. Unlike simple chatbots, MAS allows you to build a fleet of specialized agents that can collaborate, delegate subtasks, and solve complex problems through a recursive execution engine.

## 🚀 Core Idea

MAS transforms individual LLMs into a structured organization. Users define agents with specific roles, system prompts, and toolsets. When a task is assigned, the "Assigned Agent" decides whether to handle it directly or delegate parts of it to other specialized sub-agents. The system tracks the entire delegation chain and provides real-time execution logs.

## ✨ Key Features

- **Multi-Agent Orchestration**: Create agents with distinct roles, goals, and system prompts.
- **Multi-Model AI Support**: 2026-Ready per-agent model selection across OpenAI (GPT-5.4), Anthropic (Claude 4.6), Groq (Grok 4), and Together AI (Llama 4).
- **Recursive Delegation**: Agents can dynamically create subtasks and assign them to other agents (with depth-limit safeguards).
- **Extreme Performance**: Ultra-fast PyTest suite (~0.7s), optimized MongoDB indexing, and stable CI/CD pipelines.
- **Distributed Task Queue**: Celery + Redis for horizontal scaling of agent workloads across multiple workers.
- **Knowledge Base (RAG)**: Upload documents, auto-chunk & embed via ChromaDB, and enable agents to search with semantic vector similarity.
- **Command Center**: Real-time dashboard showing system throughput, active runs, and agent performance.
- **Real-time Monitoring**: Follow execution steps via WebSocket-streamed logs with virtualized rendering and collapsible groups.
- **Tonal Design System**: A "Synthetic Intelligence" UI featuring deep obsidian surfaces, glassmorphism, and neon functional accents.
- **Robust Task States**: Full lifecycle tracking: `queued`, `running`, `waiting_approval`, `done`, `failed`, `cancelled`.
- **Human-in-the-Loop**: Approval workflow for sensitive agent tasks.
- **Webhooks & Schedules**: External trigger integration and automated scheduled executions.
- **CI/CD Pipeline**: GitHub Actions for automated testing, linting, and Docker image builds.

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.12+)
- **Database**: MongoDB (via Motor async driver)
- **Vector Store**: ChromaDB (semantic search for RAG)
- **AI Providers**: OpenAI, Anthropic, Groq, Together AI
- **Task Queue**: Celery + Redis (or FastAPI BackgroundTasks for development)
- **Real-time**: WebSockets
- **Scheduler**: APScheduler

### Frontend
- **Framework**: Next.js 15 (App Router)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui + Lucide Icons
- **Graph Viz**: React Flow (@xyflow/react)
- **Typography**: Space Grotesk (Headlines) & Inter (Body)

## 📂 Project Structure

```bash
mas/
├── .github/workflows/      # CI/CD Pipeline
│   ├── ci.yml              # Test, lint, build
│   └── docker.yml          # Docker image builds
├── backend/                # FastAPI Application
│   ├── app/
│   │   ├── models/         # Pydantic Schemas (Agent, Task, Execution)
│   │   ├── services/       # Orchestration, LLM Provider, Vector Store
│   │   ├── routes/         # REST & WebSocket Endpoints
│   │   ├── tools/          # Agent Tools (GitHub, Slack, Gmail, etc.)
│   │   ├── utils/          # Task Dispatcher, WebSocket Manager
│   │   └── worker/         # Celery Task Queue Workers
│   ├── tests/              # Unit & Integration Tests
│   └── Dockerfile
├── frontend/               # Next.js Application
│   ├── src/
│   │   ├── app/            # Pages & Routing
│   │   ├── components/     # shadcn/ui + Execution Timeline + Graph
│   │   └── lib/            # API Client (Typed)
│   └── Dockerfile
└── docker-compose.yml      # Full-stack Container Orchestration
```

## ⚙️ Getting Started

### 1. Prerequisites
- Python 3.12+
- Node.js 20+
- MongoDB instance (localhost:27017 or Docker)
- Redis (optional, for Celery task queue)

### 2. Backend Setup
```bash
cd backend
cp .env.example .env
# Edit .env: add OPENAI_API_KEY and optionally ANTHROPIC_API_KEY, GROQ_API_KEY
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Celery Worker (Optional — for distributed execution)
```bash
# In a separate terminal:
celery -A app.worker.celery_app worker --loglevel=info --pool=solo
# Set USE_CELERY=true in .env to enable
```

### 4. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

### 5. Docker Setup (All-in-one)
```bash
docker-compose up -d
```

## 🧠 Multi-Model Support

Each agent can be configured with a specific LLM model powered by top 2026 inference engines:

| Provider | Models | Use Case |
|----------|--------|----------|
| **OpenAI** | GPT-5.4, GPT-5.4 Mini, O4 Preview | General purpose, best tools support |
| **Anthropic** | Claude Sonnet 4.6, Claude Opus 4.6 | Excellent at coding and reasoning |
| **Groq (xAI)** | Grok 4.20, Grok 4.1 Fast, Grok Code | Ultra-fast Grok inference |
| **Together AI** | Llama 4 Scout, Llama 4 Maverick | Advanced open-source models |

Set the model per-agent in the Agent Setup panel, or globally via `LLM_MODEL` in `.env`.

## 🛡️ Safeguards
- **Delegation Depth**: Hard-coded limit (`MAX_DELEGATION_DEPTH=5`) to prevent infinite AI loops.
- **Max Steps**: Per-agent step limits to control API consumption and token usage.
- **Status Persistence**: Every execution step is logged to MongoDB for auditability and optimized with selective indexing (`status`, `role`, `assignedAgentId`) for maximum lookup velocity.

## 🎨 Design Philosophy
The UI follows the **"Synthetic Intelligence Interface"** strategy:
- **No-Line Rule**: Boundaries defined by tonal shifts rather than 1px borders.
- **Layering Principle**: Smokey glass effects and obsidian surfaces create depth.
- **Focus**: Asymmetric layouts guide the eye toward critical agent activity logs.

---
Built with ❤️ for AI Orchestration.
