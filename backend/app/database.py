from motor.motor_asyncio import AsyncIOMotorClient
from app.config import get_settings

settings = get_settings()

client: AsyncIOMotorClient = None
db = None


async def connect_db():
    global client, db
    client = AsyncIOMotorClient(settings.MONGODB_URL)
    db = client[settings.MONGODB_DB]

    # Create indexes
    await db.agents.create_index("name", unique=True)
    await db.tasks.create_index("status")
    await db.tasks.create_index("assignedAgentId")
    await db.tasks.create_index("parentTaskId")
    await db.executions.create_index("taskId")
    await db.execution_steps.create_index("executionId")
    await db.approvals.create_index("taskId")
    await db.tool_settings.create_index("name", unique=True)
    await db.schedules.create_index("isActive")
    await db.knowledge.create_index("name")

    print(f"Connected to MongoDB: {settings.MONGODB_DB}")


async def close_db():
    global client
    if client:
        client.close()
        print("MongoDB connection closed")


def get_db():
    return db
