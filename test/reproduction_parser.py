import urllib.request
import json
import sys

BASE_URL = "http://localhost:8001/v1"
API_KEY = "2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6"

QUERY = """
SELECT TOP (10) [id]
      ,[period_month]
      ,[period_year]
      ,[division_code]
      ,[gang_code]
      ,[gang_description]
      ,[dynamic_premi_data]
      ,[total_koreksi]
  FROM [extend_db_ptrj].[dbo].[daftar_upah_aggregation_history]
"""

def make_request(endpoint, method="GET", payload=None):
    url = f"{BASE_URL}{endpoint}"
    headers = {
        "Content-Type": "application/json",
        "x-api-key": API_KEY
    }
    
    data = None
    if payload:
        data = json.dumps(payload).encode('utf-8')
        
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    
    try:
        with urllib.request.urlopen(req) as response:
            body = response.read().decode('utf-8')
            return response.status, body
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode('utf-8')
    except Exception as e:
        return 0, str(e)

def run_test():
    # 1. List Databases
    print("--- Listing Databases ---")
    status, body = make_request("/databases")
    print(f"Status: {status}")
    if status == 200:
        try:
            res = json.loads(body)
            print("Databases:", json.dumps(res.get("data", {}).get("databases", []), indent=2))
        except:
            print("Failed to parse DB list response")
    else:
        print("Error listing databases:", body)

    # 2. Run Query
    print("\n--- Running Query ---")
    # We omit 'database' param to rely on fully qualified name in SQL
    payload = {
        "sql": QUERY
    }
    
    status, body = make_request("/query", "POST", payload)
    print(f"Status: {status}")
    
    try:
        res_json = json.loads(body)
        if res_json.get("success"):
            data_rows = res_json.get("data", {}).get("recordset", [])
            print(f"Number of rows: {len(data_rows)}")
            
            if len(data_rows) > 0:
                row = data_rows[0]
                dynamic_data = row.get("dynamic_premi_data")
                print(f"\nType of 'dynamic_premi_data': {type(dynamic_data)}")
                print(f"Value of 'dynamic_premi_data': {dynamic_data}")
                
                if isinstance(dynamic_data, str):
                    if dynamic_data.strip().startswith('{') or dynamic_data.strip().startswith('['):
                        print("\n[CONFIRMED] 'dynamic_premi_data' is a JSON STRING. Needs parsing.")
                    else:
                        print("\n[INFO] 'dynamic_premi_data' is a string but might not be JSON.")
                elif isinstance(dynamic_data, dict):
                    print("\n[INFO] 'dynamic_premi_data' is already a DICT.")
        else:
            print("Query failed in backend.")
            print(f"Error: {res_json.get('error')}")
            # If error mentions specific syntax, print it
            if "Incorrect syntax" in res_json.get('error', ''):
                 print("Hint: Check if the database name in the query is correct.")

    except json.JSONDecodeError:
        print("Response is not JSON")
        print(body)

if __name__ == "__main__":
    run_test()
