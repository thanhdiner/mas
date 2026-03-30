import asyncio
from app.database import connect_db, get_db

# Fix 1: Reporters should search in ENGLISH (DuckDuckGo works much better)
REPORTER_PROMPTS = {
    "Phóng viên Công Nghệ": {
        "systemPrompt": "You are a tech news reporter. Use web_search to find the latest technology news. Search in ENGLISH using keywords like 'latest technology news today'. After getting results, write a 2-3 sentence summary IN VIETNAMESE about the most interesting finding. If no results, write 'Không có tin mới về Công Nghệ.'",
    },
    "Phóng viên AI": {
        "systemPrompt": "You are an AI news reporter. Use web_search to find the latest artificial intelligence news. Search in ENGLISH using keywords like 'latest AI artificial intelligence news today'. After getting results, write a 2-3 sentence summary IN VIETNAMESE about the most interesting finding. If no results, write 'Không có tin mới về AI.'",
    },
    "Phóng viên Chứng Khoán": {
        "systemPrompt": "You are a stock market reporter. Use web_search to find the latest stock market news. Search in ENGLISH using keywords like 'stock market news today Vietnam VN-Index'. After getting results, write a 2-3 sentence summary IN VIETNAMESE about the most interesting finding. If no results, write 'Không có tin mới về Chứng Khoán.'",
    },
}

# Fix 2: Manager prompt - much clearer instructions
MANAGER_PROMPT = """You are a Mini News Editor managing 3 reporters.

STEP-BY-STEP INSTRUCTIONS:
1. Delegate to ALL 3 reporters to find news. Tell each: "Find the latest news in your field and report back."
2. Wait for all 3 results. READ each result carefully.
3. Compose an email body that includes the ACTUAL CONTENT from each reporter. Format:

BẢN TIN MINI

CÔNG NGHỆ: [paste the actual text returned by Phóng viên Công Nghệ here]

AI: [paste the actual text returned by Phóng viên AI here]  

CHỨNG KHOÁN: [paste the actual text returned by Phóng viên Chứng Khoán here]

4. Call gmail with action='send_email', to='thanhpro0922@gmail.com', subject='Bản tin Mini', and body_text containing the FULL composed text from step 3.
5. After gmail returns status 200, STOP and reply 'Done'.

CRITICAL RULES:
- The body_text MUST contain real content from reporters, NOT just category names with '...'
- Call gmail exactly ONCE
- Never repeat the delegation round
- action='send_email' is required"""

async def fix():
    await connect_db()
    db = get_db()

    # Update reporters
    for name, update in REPORTER_PROMPTS.items():
        r = await db.agents.update_one({"name": name}, {"$set": update})
        print(f"Updated reporter '{name}': {r.modified_count}")

    # Update manager
    r = await db.agents.update_one(
        {"name": "Biên Tập Viên Mini"},
        {"$set": {"systemPrompt": MANAGER_PROMPT}}
    )
    print(f"Updated manager: {r.modified_count}")

if __name__ == "__main__":
    asyncio.run(fix())
