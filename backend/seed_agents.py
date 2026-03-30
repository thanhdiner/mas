import asyncio
from datetime import datetime, timezone
from bson import ObjectId

# Local imports from MAS backend
from app.database import connect_db, get_db

async def seed_news_network():
    print("Connecting to MongoDB...")
    await connect_db()
    db = get_db()
    
    # Try to find the existing Agent Nhà báo to copy tool config
    old_agent = await db.agents.find_one({"name": "Agent Nhà báo"})
    gmail_config = {}
    if old_agent and "toolConfig" in old_agent:
        gmail_config = old_agent["toolConfig"].get("gmail", {})
        
    domains = [
        ("Công Nghệ", "ngành công nghệ, công nghệ mới nhất"),
        ("AI", "Trí Tuệ Nhân Tạo, AI, Machine Learning mới nhất"),
        ("Kinh Tế Vĩ Mô", "kinh tế vĩ mô, lạm phát, báo cáo kinh tế"),
        ("Chứng Khoán", "thị trường chứng khoán, cổ phiếu"),
        ("Xã Hội", "tin tức xã hội, đời sống"),
        ("Môi Trường", "tin tức môi trường, biến đổi khí hậu"),
        ("Giáo Dục", "tin tức giáo dục, tuyển sinh"),
        ("Y Tế", "tin tức y tế, sức khỏe"),
        ("Thể Thao", "tin tức thể thao, bóng đá, giải đấu"),
        ("Văn Hóa", "tin tức văn hóa, nghệ thuật, giải trí"),
    ]
    
    now = datetime.now(timezone.utc)
    sub_agent_ids = []
    
    # Create 10 Sub-Agents
    for title, search_keywords in domains:
        agent_doc = {
            "name": f"Phóng viên {title}",
            "role": f"Chuyên săn lùng tin tức mảng {title}",
            "description": f"Tìm kiếm thông tin nhanh về {title}.",
            "systemPrompt": f"Ngươi là một chuyên gia nghiên cứu độc lập. Nhiệm vụ của ngươi là dùng công cụ web_search để tìm kiếm các bài viết MỚI NHẤT, NÓNG NHẤT về chủ đề '{search_keywords}'. CHỈ CẦN tìm 1 đên 3 bài viết nổi bật. Sau đó tóm tắt ngắn gọn thành 2-3 câu báo cáo súc tích gửi về cho Tổng biên tập. Tuyệt đối không cần gọi thêm bất kỳ công cụ nào khác.",
            "allowedTools": ["web_search"],
            "toolConfig": {},
            "allowedSubAgents": [],
            "maxSteps": 5,
            "active": True,
            "createdAt": now,
            "updatedAt": now
        }
        res = await db.agents.insert_one(agent_doc)
        sub_agent_ids.append(str(res.inserted_id))
        print(f"Created sub-agent: Phóng viên {title} (ID: {res.inserted_id})")

    # Create 1 Manager Agent
    manager_doc = {
        "name": "Tổng Biên Tập Tòa Soạn",
        "role": "Người điều phối các phóng viên, tổng hợp tin tức và gửi báo cáo",
        "description": "Giao việc cho 10 phóng viên, chờ họ nộp bài rồi ghép lại gửi báo cáo cho Giám đốc.",
        "systemPrompt": ("Ngươi là Tổng Biên Tập của tòa soạn MAS. Nhiệm vụ của ngươi là GIAO VIỆC (Delegate) cho TẤT CẢ các phóng viên cấp dưới đi lùng tin tức.\n"
                         "Quy trình:\n"
                         "1. Giao việc cho các Phóng viên qua công cụ delegate. Yêu cầu họ: 'Hôm nay có biến gì hot, tìm về báo cho tôi lập tức'.\n"
                         "2. Chờ kết quả trả về từ tất cả các phóng viên.\n"
                         "3. Gộp toàn bộ bài viết của bọn họ thành 1 bản tổng hợp Tin Tức Hôm Nay định dạng sạch sẽ, chuyên nghiệp.\n"
                         "4. GỌI BẮT BUỘC công cụ gmail để GỬI BÁO CÁO DUY NHẤT VÀO EMAIL: thanhpro0922@gmail.com.\n"
                         "Chú ý: Khi gọi công cụ gmail, ngươi PHẢI TRUYỀN tham số action='send_email', kèm theo body_text và subject đầy đủ."),
        "allowedTools": ["gmail"],
        "toolConfig": {"gmail": gmail_config},
        "allowedSubAgents": sub_agent_ids,
        "maxSteps": 15,
        "active": True,
        "createdAt": now,
        "updatedAt": now
    }
    
    manager_res = await db.agents.insert_one(manager_doc)
    print(f"\nCreated MANAGER AGENT: Tổng Biên Tập Tòa Soạn (ID: {manager_res.inserted_id})")
    
    # Create Schedule
    schedule_doc = {
        "name": "Xuất bản Bản tin 8h Tối",
        "agentId": str(manager_res.inserted_id),
        "promptPayload": "Tới giờ xuất bản bản tin 8h tối rồi. Ngươi lập tức giao việc cho các phóng viên đi lùng tin về nộp bài ngay. Tổng hợp và gửi thẳng về mail thanhpro0922@gmail.com cho Sếp Tổng, nhớ gọi gmail dùng hành động action='send_email' nhé.",
        "scheduleType": "cron",
        "cronExpression": "0 20 * * *",
        "timezone": "Asia/Ho_Chi_Minh",
        "isActive": True,
        "totalRuns": 0,
        "lastRunAt": None,
        "createdAt": now,
        "updatedAt": now
    }
    
    await db.schedules.insert_one(schedule_doc)
    print("Created schedule automatically: 'Xuất bản Bản tin 8h Tối'")

    print("\nDONE!")

if __name__ == "__main__":
    asyncio.run(seed_news_network())
