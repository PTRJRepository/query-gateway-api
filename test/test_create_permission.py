"""
Test CREATE Permission
"""
import requests
import json
import random

API_BASE_URL = "http://localhost:8001"
API_KEY = "2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6"
HEADERS = {"Content-Type": "application/json", "x-api-key": API_KEY}

def log(msg):
    print(msg)

def test_create(server_profile, database, expect_success):
    # Use a random table name to avoid conflicts
    rand_id = random.randint(1000, 9999)
    table_name = f"test_create_{rand_id}"
    
    log(f"\n--- Testing {server_profile} ---")
    log(f"Target: CREATE TABLE {table_name}")
    
    payload = {
        "sql": f"CREATE TABLE {table_name} (id INT)",
        "server": server_profile,
        "database": database
    }
    
    try:
        r = requests.post(f"{API_BASE_URL}/v1/query", json=payload, headers=HEADERS, timeout=15)
        data = r.json()
        
        if data.get("success"):
            log(f"Result: SUCCESS (Table created)")
            actual_success = True
        else:
            error = data.get("error", "")
            log(f"Result: FAILED - {error}")
            actual_success = False
            
        status = "OK" if actual_success == expect_success else "FAIL"
        log(f"Status: {status} (Expected: {'Success' if expect_success else 'Fail'})")
        
        return actual_success
    except Exception as e:
        log(f"Error: {e}")
        return False

def main():
    log("=== CREATE PERMISSION TEST ===")
    
    # SERVER_PROFILE_1: Should ALLOW create
    test_create("SERVER_PROFILE_1", "db_ptrj", True)
    
    # SERVER_PROFILE_2: Should BLOCK create
    test_create("SERVER_PROFILE_2", "db_ptrj", False)

if __name__ == "__main__":
    main()
