import asyncio
import httpx
from app.core.config import settings

async def main():
    print(f"Testing Groq key: {settings.GROQ_API_KEY[:8]}...")
    async with httpx.AsyncClient(timeout=30.0, trust_env=True) as client:
        try:
            res = await client.post(
                f"{settings.GROQ_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": settings.GROQ_DEFAULT_MODEL,
                    "messages": [{"role": "user", "content": "Say hello in 5 words."}],
                },
            )
            print("Status Code:", res.status_code)
            print("Response:", res.text)
        except Exception as e:
            print("Error type:", type(e))
            print("Error str:", repr(str(e)))
            print("Error details:", repr(e))

if __name__ == "__main__":
    asyncio.run(main())
