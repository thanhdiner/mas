import asyncio
from datetime import datetime, timezone
from app.database import connect_db, get_db

async def create_light_schedule():
    await connect_db()
    db = get_db()

    # Find the 3 sub-agents we want to use
    agent_cn = await db.agents.find_one({"name": "Phóng viên Công Nghệ"})
    agent_ai = await db.agents.find_one({"name": "Phóng viên AI"})
    agent_ck = await db.agents.find_one({"name": "Phóng viên Chứng Khoán"})

    if not all([agent_cn, agent_ai, agent_ck]):
        print("ERROR: Missing sub-agents!")
        return

    sub_ids = [str(agent_cn["_id"]), str(agent_ai["_id"]), str(agent_ck["_id"])]

    # Find existing gmail config from Tổng Biên Tập
    old_manager = await db.agents.find_one({"name": "Tổng Biên Tập Tòa Soạn"})
    gmail_config = {}
    if old_manager and "toolConfig" in old_manager:
        gmail_config = old_manager.get("toolConfig", {}).get("gmail", {})

    now = datetime.now(timezone.utc)

    # Create a lightweight manager
    manager_doc = {
        "name": "Biên Tập Viên Mini",
        "role": "Tổng hợp 3 mảng tin tức và gửi báo cáo",
        "description": "Phiên bản nhẹ: chỉ dùng 3 phóng viên (Công nghệ, AI, Chứng khoán).",
        "systemPrompt": (
            "Ngươi là Biên Tập Viên Mini. Nhiệm vụ: giao việc cho 3 phóng viên, tổng hợp kết quả, gửi 1 email duy nhất.\n\n"
            "QUY TRÌNH:\n"
            "1. Delegate cho 3 phóng viên (Công Nghệ, AI, Chứng Khoán) đi tìm tin.\n"
            "2. Nhận kết quả, gộp thành 1 bản tin ngắn gọn.\n"
            "3. Gọi gmail ĐÚNG 1 LẦN với action='send_email', gửi tới thanhpro0922@gmail.com, tiêu đề 'Bản tin Mini'.\n"
            "4. Sau khi gmail trả về 200 OK → DỪNG NGAY, trả lời 'Đã gửi thành công'.\n\n"
            "⚠️ TUYỆT ĐỐI: Chỉ gọi gmail 1 lần. Không lặp lại vòng delegate. Không gửi email lần 2."
        ),
        "allowedTools": ["gmail"],
        "toolConfig": {"gmail": gmail_config},
        "allowedSubAgents": sub_ids,
        "maxSteps": 12,
        "active": True,
        "createdAt": now,
        "updatedAt": now,
    }

    res = await db.agents.insert_one(manager_doc)
    manager_id = str(res.inserted_id)
    print(f"Created agent: Biên Tập Viên Mini (ID: {manager_id})")

    # Create schedule that runs 2 minutes from now for testing
    schedule_doc = {
        "name": "Bản tin Mini (3 lĩnh vực)",
        "agentId": manager_id,
        "promptPayload": (
            "Giao việc cho 3 phóng viên Công Nghệ, AI, Chứng Khoán đi lùng tin. "
            "Tổng hợp kết quả và gửi email tới thanhpro0922@gmail.com bằng gmail với action='send_email', "
            "tiêu đề 'Bản tin Mini'. Chỉ gửi 1 email duy nhất."
        ),
        "scheduleType": "cron",
        "cronExpression": "0 20 * * *",
        "timezone": "Asia/Ho_Chi_Minh",
        "isActive": True,
        "totalRuns": 0,
        "lastRunAt": None,
        "createdAt": now,
        "updatedAt": now,
    }
    await db.schedules.insert_one(schedule_doc)
    print("Created schedule: 'Bản tin Mini (3 lĩnh vực)' - Cron: 0 20 * * *")
    print("\nDONE! Bạn có thể test ngay bằng cách tạo New Task giao cho 'Biên Tập Viên Mini'.")

if __name__ == "__main__":
    asyncio.run(create_light_schedule())
