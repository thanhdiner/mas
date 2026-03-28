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
    await db.agents.create_index("role")
    await db.tasks.create_index("status")
    await db.tasks.create_index("assignedAgentId")
    await db.tasks.create_index("parentTaskId")
    await db.executions.create_index("taskId")
    await db.execution_steps.create_index("executionId")
    await db.approvals.create_index("taskId")
    await db.tool_settings.create_index("name", unique=True)
    await db.tool_credentials.create_index("name", unique=True)
    await db.tool_presets.create_index([("toolName", 1), ("name", 1)], unique=True)
    await db.tool_presets.create_index([("toolName", 1), ("createdAt", -1)])
    await db.webhooks.create_index("tokenHash", unique=True)
    await db.webhooks.create_index("agentId")
    await db.webhooks.create_index("active")
    await db.webhook_idempotency.create_index(
        [("webhookId", 1), ("idempotencyKeyHash", 1)],
        unique=True,
    )
    await db.webhook_idempotency.create_index("createdAt")
    await db.webhook_idempotency.create_index("updatedAt")
    await db.webhook_deliveries.create_index([("webhookId", 1), ("receivedAt", -1)])
    await db.webhook_deliveries.create_index([("webhookId", 1), ("status", 1), ("receivedAt", -1)])
    await db.webhook_deliveries.create_index("receivedAt")
    await db.webhook_runtime_state.create_index("type", unique=True)
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
