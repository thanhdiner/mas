import asyncio
from app.database import connect_db, get_db

async def fix_tasks():
    await connect_db()
    db = get_db()
    result = await db.tasks.update_many({"status": "pending"}, {"$set": {"status": "queued"}})
    print(f"Fixed {result.modified_count} tasks.")

    # Let's also verify if there are any other invalid statuses
    valid_statuses = ["queued", "running", "waiting_approval", "done", "failed", "cancelled"]
    cursor = db.tasks.find({"status": {"$nin": valid_statuses}})
    invalid_tasks = await cursor.to_list(length=100)
    for t in invalid_tasks:
        print(f"Invalid task status found: {t.get('status')} for task {t['_id']}")

if __name__ == "__main__":
    asyncio.run(fix_tasks())
