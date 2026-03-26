from openai import AsyncOpenAI
try:
    client = AsyncOpenAI(api_key="test")
    print("AsyncOpenAI initialized successfully")
except Exception as e:
    print(f"Error: {e}")
    import traceback
    traceback.print_exc()
