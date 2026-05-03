
import requests
import json

def test_dashboard():
    base_url = "http://localhost:8000/api/v1"
    
    # 1. Login
    login_data = {
        "email": "lecturer@mindexa.dev",
        "password": "Lecturer@123"
    }
    resp = requests.post(f"{base_url}/auth/login", json=login_data)
    if resp.status_code != 200:
        print(f"Login failed: {resp.status_code} - {resp.text}")
        return
    
    token = resp.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    # 2. Hit lecturer dashboard
    resp = requests.get(f"{base_url}/lecturers/me/dashboard", headers=headers)
    print(f"Dashboard Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Dashboard Error: {resp.text}")
        
    # 3. Hit assessments list
    resp = requests.get(f"{base_url}/assessments", headers=headers)
    print(f"Assessments Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Assessments Error: {resp.text}")

    # 4. Hit lecturer courses
    resp = requests.get(f"{base_url}/lecturers/me/courses", headers=headers)
    print(f"Courses Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Courses Error: {resp.text}")

    # 5. Hit integrity flags
    resp = requests.get(f"{base_url}/integrity/flags", headers=headers)
    print(f"Flags Status: {resp.status_code}")
    if resp.status_code != 200:
        print(f"Flags Error: {resp.text}")
    else:
        print(f"Flags Count: {len(resp.json()['flags'])}")

if __name__ == "__main__":
    test_dashboard()
