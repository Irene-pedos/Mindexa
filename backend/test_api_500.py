import asyncio
from httpx import AsyncClient
import uuid

async def main():
    async with AsyncClient(base_url="http://127.0.0.1:8000/api/v1") as client:
        # 1. Login to get token
        login_res = await client.post("/auth/login", json={"email": "lecturer@mindexa.edu", "password": "Password123!"})
        if login_res.status_code != 200:
            print("Login failed:", login_res.text)
            # Try to signup
            signup_res = await client.post("/auth/signup", json={"email": "lecturer@mindexa.edu", "password": "Password123!", "first_name": "Lecturer", "last_name": "One", "role": "LECTURER", "institution_id": str(uuid.uuid4())})
            print("Signup:", signup_res.text)
            login_res = await client.post("/auth/login", json={"email": "lecturer@mindexa.edu", "password": "Password123!"})
            if login_res.status_code != 200:
                print("Login failed again:", login_res.text)
                return
        
        token = login_res.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}
        
        # 2. Get assessments to see if the list endpoint fails
        list_res = await client.get("/assessments", headers=headers)
        print("GET /assessments status:", list_res.status_code)
        print("GET /assessments text:", list_res.text[:500])

if __name__ == "__main__":
    asyncio.run(main())
