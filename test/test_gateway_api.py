import requests
import json

API_URL = "http://localhost:8001"
API_KEY = "2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6"

headers = {
    "x-api-key": API_KEY,
    "Content-Type": "application/json"
}

# Test: Simple query - dump entire response
payload = {
    "db_alias": "LOCAL",
    "sql": "SELECT TOP 2 EmpCode, EmpName FROM HR_EMPLOYEE"
}
resp = requests.post(f"{API_URL}/v1/query", headers=headers, json=payload)

# Show raw response text
with open("gateway_raw_response.txt", "w", encoding="utf-8") as f:
    f.write("=== RAW RESPONSE TEXT ===\n")
    f.write(resp.text)
    f.write("\n\n=== PARSED JSON (all keys) ===\n")
    data = resp.json()
    for key in data:
        f.write(f"\nKey: {key}\n")
        f.write(f"Type: {type(data[key])}\n") 
        f.write(f"Value: {json.dumps(data[key], indent=2, default=str)}\n")

print("Results written to gateway_raw_response.txt")
