# MAS — Multi-Agent System Platform

MAS is a powerful workflow and orchestration platform designed for managing autonomous AI agents. Unlike simple chatbots, MAS allows you to build a fleet of specialized agents that can collaborate, delegate subtasks, and solve complex problems through a recursive execution engine.

![MAS Dashboard Preview](https://github.com/user-attachments/assets/PLACEHOLDER_FOR_IMAGE)

## 🚀 Core Idea

MAS transforms individual LLMs into a structured organization. Users define agents with specific roles, system prompts, and toolsets. When a task is assigned, the "Assigned Agent" decides whether to handle it directly or delegate parts of it to other specialized sub-agents. The system tracks the entire delegation chain and provides real-time execution logs.

## ✨ Key Features

- **Multi-Agent Orchestration**: Create agents with distinct roles, goals, and system prompts.
- **Recursive Delegation**: Agents can dynamically create subtasks and assign them to other agents (with depth-limit safeguards).
- **Command Center**: Real-time dashboard showing system throughput, active runs, and agent performance.
- **Real-time Monitoring**: Follow execution steps as they happen via WebSocket-streamed logs and timeline visualizations.
- **Tonal Design System**: A "Synthetic Intelligence" UI featuring deep obsidian surfaces, glassmorphism, and neon functional accents.
- **Robust Task States**: Full lifecycle tracking: `queued`, `running`, `waiting_approval`, `done`, `failed`, `cancelled`.

## 🛠️ Tech Stack

### Backend
- **Framework**: FastAPI (Python 3.12+)
- **Database**: MongoDB (via Motor async driver)
- **AI**: OpenAI GPT-4o-mini
- **Task Queue**: FastAPI BackgroundTasks (extensible to Celery/RQ)
- **Real-time**: WebSockets

### Frontend
- **Framework**: Next.js 16 (App Router)
- **Styling**: Tailwind CSS
- **Components**: shadcn/ui + Lucide Icons
- **Typography**: Space Grotesk (Headlines) & Inter (Body)

## 📂 Project Structure

```bash
mas/
├── backend/                # FastAPI Application
│   ├── app/
│   │   ├── models/         # Pydantic Schemas (Agent, Task, Execution)
│   │   ├── services/       # Orchestration & Business Logic
│   │   ├── routes/         # REST & WebSocket Endpoints
│   │   └── worker/         # Task Runtime Engine
│   └── Dockerfile
├── frontend/               # Next.js Application
│   ├── src/
│   │   ├── app/            # Pages & Routing
│   │   ├── components/     # shadcn/ui + Modular Components
│   │   └── lib/            # API Client (Typed)
│   └── Dockerfile
└── docker-compose.yml      # Full-stack Container Orchestration
```

## ⚙️ Getting Started

### 1. Prerequisites
- Python 3.12+
- Node.js 20+
- MongoDB instance (localhost:27017 or Docker)

### 2. Backend Setup
```bash
# Navigate to backend
cd backend

# Create and configure .env
cp .env.example .env
# Edit .env and add your OPENAI_API_KEY

# Install dependencies
pip install -r requirements.txt

# Run server
uvicorn app.main:app --reload --port 8000
```

### 3. Frontend Setup
```bash
# Navigate to frontend
cd frontend

# Install dependencies
npm install

# Run development server
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to access the dashboard.

### 4. Docker Setup (Alternative)
```bash
# From the root directory
docker-compose up -d
```

## 🛡️ Safeguards
- **Delegation Depth**: Hard-coded limit (`MAX_DELEGATION_DEPTH=5`) to prevent infinite AI loops.
- **Max Steps**: Per-agent step limits to control API consumption and token usage.
- **Status Persistence**: Every execution step is logged to MongoDB for auditability.

## 🎨 Design Philosophy
The UI follows the **"Synthetic Intelligence Interface"** strategy:
- **No-Line Rule**: Boundaries are defined by tonal shifts (background colors) rather than 1px borders.
- **Layering Principle**: Smokey glass effects and obsidian surfaces create a sense of professional, high-end "Editorial Authority."
- **Focus**: Asymmetric layouts guide the eye toward critical agent activity logs.

---
Built with ❤️ for AI Orchestration.
