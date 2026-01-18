"""
Simple Server Profile Test - outputs to file
"""
import requests
import json
from datetime import datetime

API_BASE_URL = "http://localhost:8001"
API_KEY = "2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6"
HEADERS = {"Content-Type": "application/json", "x-api-key": API_KEY}

output_lines = []

def log(msg):
    print(msg)
    output_lines.append(msg)

def main():
    log(f"=== Server Profile Connection Test ===")
    log(f"Time: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    log(f"API: {API_BASE_URL}")
    log("")
    
    # 1. Health check
    try:
        r = requests.get(f"{API_BASE_URL}/health", timeout=5)
        if r.json().get("status") == "ok":
            log("[OK] API is healthy")
        else:
            log("[FAIL] API health check failed")
            return
    except Exception as e:
        log(f"[FAIL] Cannot connect to API: {e}")
        return
    
    # 2. Get servers
    try:
        r = requests.get(f"{API_BASE_URL}/v1/servers", headers=HEADERS, timeout=10)
        data = r.json()
        
        if not data.get("success"):
            log(f"[FAIL] Cannot get servers: {data.get('error')}")
            return
            
        servers = data["data"]["servers"]
        log(f"\n[INFO] Found {len(servers)} server profile(s):")
        log(f"[INFO] Default: {data['data']['defaultServer']}")
        log("")
        
        results = []
        
        for server in servers:
            name = server["name"]
            host = server["host"]
            port = server["port"]
            connected = server["connected"]
            healthy = server["healthy"]
            read_only = server["readOnly"]
            
            log(f"--- {name} ---")
            log(f"    Host: {host}:{port}")
            log(f"    Mode: {'READ-ONLY' if read_only else 'READ/WRITE'}")
            log(f"    Connected: {connected}")
            log(f"    Healthy: {healthy}")
            
            result = {"name": name, "connected": connected, "databases": [], "query_ok": False}
            
            if connected:
                # Get databases
                try:
                    r = requests.get(
                        f"{API_BASE_URL}/v1/databases",
                        params={"server": name},
                        headers=HEADERS,
                        timeout=15
                    )
                    db_data = r.json()
                    
                    if db_data.get("success"):
                        databases = db_data["data"]["databases"]
                        result["databases"] = databases
                        log(f"    Databases ({len(databases)}):")
                        for db in databases[:10]:  # Show max 10
                            log(f"      - {db}")
                        if len(databases) > 10:
                            log(f"      ... and {len(databases) - 10} more")
                    else:
                        log(f"    [FAIL] Get databases: {db_data.get('error')}")
                except Exception as e:
                    log(f"    [FAIL] Get databases error: {e}")
                
                # Test query
                try:
                    payload = {
                        "sql": "SELECT @@VERSION AS version",
                        "server": name,
                        "database": "master"
                    }
                    r = requests.post(
                        f"{API_BASE_URL}/v1/query",
                        json=payload,
                        headers=HEADERS,
                        timeout=15
                    )
                    q_data = r.json()
                    
                    if q_data.get("success"):
                        result["query_ok"] = True
                        exec_ms = q_data.get("execution_ms", 0)
                        log(f"    Query Test: OK ({exec_ms:.1f}ms)")
                    else:
                        log(f"    Query Test: FAIL - {q_data.get('error')}")
                except Exception as e:
                    log(f"    Query Test: ERROR - {e}")
            else:
                log(f"    [SKIP] Not connected")
            
            results.append(result)
            log("")
        
        # Summary
        log("=== SUMMARY ===")
        total = len(results)
        connected_count = sum(1 for r in results if r["connected"])
        query_ok_count = sum(1 for r in results if r["query_ok"])
        
        log(f"Total Profiles: {total}")
        log(f"Connected: {connected_count}/{total}")
        log(f"Query OK: {query_ok_count}/{total}")
        log("")
        
        for r in results:
            status = "OK" if r["query_ok"] else ("SKIP" if not r["connected"] else "FAIL")
            db_count = len(r["databases"])
            log(f"  [{status}] {r['name']}: {db_count} database(s)")
        
    except Exception as e:
        log(f"[FAIL] Error: {e}")
    
    # Save to file
    with open("test/test_results.txt", "w", encoding="utf-8") as f:
        f.write("\n".join(output_lines))
    
    log(f"\nResults saved to test/test_results.txt")

if __name__ == "__main__":
    main()
