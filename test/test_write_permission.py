"""
Test Write Operations with detailed output to file
"""
import requests
import json

API_BASE_URL = "http://localhost:8001"
API_KEY = "2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6"
HEADERS = {"Content-Type": "application/json", "x-api-key": API_KEY}

output = []

def log(msg):
    print(msg)
    output.append(msg)

def test_write(server_profile, database, expected):
    log(f"\n--- {server_profile} ---")
    log(f"Database: {database}")
    log(f"Expected: {expected}")
    
    payload = {
        "sql": "INSERT INTO test_table (id) VALUES (1)",
        "server": server_profile,
        "database": database
    }
    
    r = requests.post(f"{API_BASE_URL}/v1/query", json=payload, headers=HEADERS, timeout=15)
    data = r.json()
    
    success = data.get("success", False)
    error = data.get("error", "")
    
    if success:
        log(f"Result: ALLOWED (write permitted)")
        return "allowed"
    elif "READ-ONLY" in error.upper():
        log(f"Result: BLOCKED (server is read-only)")
        return "blocked_readonly"
    elif "invalid object" in error.lower() or "not exist" in error.lower():
        log(f"Result: ALLOWED (permission OK, table doesn't exist)")
        return "allowed"
    else:
        log(f"Result: ERROR - {error}")
        return "error"

def main():
    log("=" * 50)
    log("WRITE PERMISSION TEST BY SERVER PROFILE")
    log("=" * 50)
    
    results = []
    
    # SERVER_PROFILE_1 - READ_ONLY=false, should ALLOW
    r1 = test_write("SERVER_PROFILE_1", "db_ptrj", "ALLOW")
    results.append(("SERVER_PROFILE_1", "ALLOW", r1))
    
    # SERVER_PROFILE_2 - READ_ONLY=true, should BLOCK
    r2 = test_write("SERVER_PROFILE_2", "db_ptrj", "BLOCK")
    results.append(("SERVER_PROFILE_2", "BLOCK", r2))
    
    # SERVER_PROFILE_3 - READ_ONLY=true, should BLOCK
    r3 = test_write("SERVER_PROFILE_3", "VenusHR14", "BLOCK")
    results.append(("SERVER_PROFILE_3", "BLOCK", r3))
    
    log("\n" + "=" * 50)
    log("SUMMARY")
    log("=" * 50)
    
    for profile, expected, actual in results:
        if expected == "ALLOW" and actual in ["allowed"]:
            status = "OK"
        elif expected == "BLOCK" and actual == "blocked_readonly":
            status = "OK"
        else:
            status = "UNEXPECTED"
        log(f"{profile}: Expected={expected}, Got={actual}, Status={status}")
    
    with open("test/write_test_results.txt", "w") as f:
        f.write("\n".join(output))
    
    log("\nSaved to test/write_test_results.txt")

if __name__ == "__main__":
    main()
