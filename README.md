# MAS — Multi-Agent System Platform

MAS is a powerful workflow and orchestration platform designed for managing autonomous AI agents. Unlike simple chatbots, MAS allows you to build a fleet of specialized agents that can collaborate, delegate subtasks, and solve complex problems through a recursive execution engine.

## 🚀 Core Idea

MAS transforms individual LLMs into a structured organization. Users define agents with specific roles, system prompts, and toolsets. When a task is assigned, the "Assigned Agent" decides whether to handle it directly or delegate parts of it to other specialized sub-agents. The system tracks the entire delegation chain and provides real-time execution logs.

## ✨ Key Features

- **Multi-Agent Orchestration**: Create agents with distinct roles, goals, and system prompts.
- **Multi-Model AI Support**: 2026-Ready per-agent model selection across OpenAI, Anthropic, Google Gemini, DeepSeek, Groq, and Together AI.
- **Recursive Delegation**: Agents can dynamically create subtasks and assign them to other agents (with depth-limit safeguards).
- **Extreme Performance**: Ultra-fast PyTest suite (~0.7s), optimized MongoDB indexing, and stable CI/CD pipelines.
- **Distributed Task Queue**: Celery + Redis for horizontal scaling of agent workloads across multiple workers.
- **Knowledge Base (RAG)**: Upload documents, auto-chunk & embed via ChromaDB, and enable agents to search via **Hybrid Search** (Semantic Vector + MongoDB Keyword matching) for robust multi-lingual and exact-keyword support.
- **Command Center**: Real-time dashboard showing system throughput, active runs, and agent performance.
- **Real-time Monitoring**: Follow execution steps via WebSocket-streamed logs with virtualized rendering and collapsible groups.
- **Tonal Design System**: A "Synthetic Intelligence" UI featuring deep obsidian surfaces, glassmorphism, and neon functional accents.
- **Robust Task States**: Full lifecycle tracking: `queued`, `running`, `waiting_approval`, `done`, `failed`, `cancelled`.
- **Human-in-the-Loop**: Approval workflow for sensitive agent tasks, with native inline 1-click Approve/Reject controls directly on the Execution UI.
- **Webhooks & Schedules**: External trigger integration and automated scheduled executions.
- **Social Media Integration**: Dual-mode Facebook Fanpage management — **OAuth auto-connect** (sync all pages from any FB account in one click) and **Manual Token** entry. Real-time Graph API sync for page avatars, follower counts, and admin identity tracking.
- **CI/CD Pipeline**: GitHub Actions for automated testing, linting, and Docker image builds.

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.12+)
- **Database**: MongoDB (via Motor async driver)
- **Vector Store**: ChromaDB (semantic search for RAG)
- **AI Providers**: OpenAI, Anthropic, Groq, Together AI
- **Task Queue**: Celery + Redis (or FastAPI BackgroundTasks for development)
- **HTTP Client**: httpx (Facebook Graph API)
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
│   │   ├── models/         # Pydantic Schemas (Agent, Task, Execution, Facebook)
│   │   ├── services/       # Orchestration, LLM Provider, Vector Store, Facebook
│   │   ├── routes/         # REST & WebSocket Endpoints (incl. Social Media)
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
# For Facebook integration: add FACEBOOK_APP_ID and FACEBOOK_APP_SECRET
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
| **Google Gemini** | Gemini 3.1 Pro, Gemini 2.5 Flash, Deep Research | Deep reasoning and massive context windows |
| **DeepSeek** | DeepSeek V3 (Chat), DeepSeek R1 (Reasoner) | High-performance open-source models |
| **Groq** | Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B | Ultra-fast LPU inference engines |
| **Together AI** | Llama 3.1 405B, Qwen 2.5 | Advanced open weights models |

Set the model per-agent in the Agent Setup panel, or globally via the GUI Settings Dashboard.

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
