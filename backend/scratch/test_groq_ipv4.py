import asyncio
import socket
import httpx
from app.core.config import settings

# Force IPv4 socket creation for httpx / httpcore
old_getaddrinfo = socket.getaddrinfo

def ipv4_only_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    return old_getaddrinfo(host, port, socket.AF_INET, type, proto, flags)

socket.getaddrinfo = ipv4_only_getaddrinfo

async def main():
    print("Testing Groq API forcing IPv4...")
    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            res = await client.post(
                f"{settings.GROQ_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {settings.GROQ_API_KEY}"},
                json={
                    "model": settings.GROQ_DEFAULT_MODEL,
                    "messages": [{"role": "user", "content": "Hello in 3 words"}],
                },
            )
            print("Status Code:", res.status_code)
            print("Response:", res.text[:300])
        except Exception as e:
            print("Error type:", type(e))
            print("Error:", str(e) or repr(e))

if __name__ == "__main__":
    asyncio.run(main())
