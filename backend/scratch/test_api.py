
import requests
import json

def test_api():
    try:
        # Assuming we can hit the endpoint without a token if we are lucky, or just see the 500 error.
        # Actually, it will probably return 401. 
        # But if it returns 500 even without a token (due to some middleware), we'll see it.
        # However, the subagent said it returned 500 in the console.
        
        # Let's try to hit it.
        resp = requests.get("http://localhost:8000/api/v1/assessments")
        print(f"Status: {resp.status_code}")
        print(f"Response: {resp.text}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    test_api()
