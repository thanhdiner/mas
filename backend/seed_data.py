import asyncio
import os
import sys

# Add the current directory to PYTHONPATH so we can import app
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import connect_db, get_db
from app.services.agent_service import AgentService
from app.services.task_service import TaskService
from app.models.agent import AgentCreate
from app.models.task import TaskCreate

async def seed():
    print("Connecting to database...")
    await connect_db()
    
    db = get_db()
    
    # 1. Clean old data (optional)
    # await db.agents.delete_many({})
    # await db.tasks.delete_many({})
    
    print("Creating Demo Agents...")
    
    # Agent 1: Researcher
    researcher_data = AgentCreate(
        name="Nexus Researcher",
        role="Information Retrieval specialist",
        description="Scours various sources to find high-quality, relevant data.",
        systemPrompt="You are Nexus Researcher. Your goal is to find accurate and deep information about any topic.",
        maxSteps=15
    )
    researcher = await AgentService.create_agent(researcher_data)
    
    # Agent 2: Writer
    writer_data = AgentCreate(
        name="Scribe AI",
        role="Technical Content Creator",
        description="Transforms raw data into beautiful, readable documents.",
        systemPrompt="You are Scribe AI. You specialize in clear and concise technical writing.",
        maxSteps=10
    )
    writer = await AgentService.create_agent(writer_data)
    
    # Agent 3: Orchestrator
    orchestrator_data = AgentCreate(
        name="Lumina Manager",
        role="Multi-Agent Coordinator",
        description="Analyzes complex tasks and breaks them down for specialized agents.",
        systemPrompt="You are Lumina Manager. You delegate complex sub-tasks to specialists and combine their results into a final answer.",
        allowedSubAgents=[researcher.id, writer.id],
        maxSteps=20
    )
    orchestrator = await AgentService.create_agent(orchestrator_data)
    
    print(f"Created Agents: {researcher.name}, {writer.name}, {orchestrator.name}")
    
    print("Creating Demo Tasks...")
    
    # Task 1: Research (Queued)
    task1 = await TaskService.create_task(TaskCreate(
        title="Analyze Quantum Computing Progress",
        input="Find the latest breakthroughs in topological qubits from 2024 studies.",
        assignedAgentId=researcher.id,
        allowDelegation=True
    ))
    
    # Task 2: Writing (Requires Approval)
    task2 = await TaskService.create_task(TaskCreate(
        title="Draft System Architecture",
        input="Write a 3-page guide on building microservices with FastAPI and MongoDB based on current best practices.",
        assignedAgentId=writer.id,
        requiresApproval=True
    ))

    # Task 3: Orchestration (Complex)
    task3 = await TaskService.create_task(TaskCreate(
        title="Future City Infrastructure Report",
        input="Research sustainable urban planning and write a comprehensive report on 2050 infrastructure trends.",
        assignedAgentId=orchestrator.id,
        allowDelegation=True
    ))
    
    print(f"Created Tasks: {task1.title}, {task2.title}, {task3.title}")
    print("\nSeed completed successfully!")

if __name__ == "__main__":
    asyncio.run(seed())
