# SQL Gateway API - Endpoint Documentation

## Overview

SQL Gateway memungkinkan Anda mengeksekusi query SQL ke **berbagai database** di satu SQL Server melalui REST API.

**Koneksi default:**
- Server: `localhost:1433`
- User: `sa`
- Default DB: `db_ptrj`

---

## Authentication

```http
x-api-key: 2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6
```

---

## Endpoints

### 1. Health Check

```http
GET /health
```

---

### 2. List Databases

Lihat semua database yang tersedia di server.

```http
GET /v1/databases
```

**Response:**
```json
{
  "success": true,
  "data": {
    "databases": ["db_ptrj", "extend_db_ptrj", "master", "tempdb", "..."],
    "total": 10
  }
}
```

---

### 3. Execute Query

```http
POST /v1/query
```

**Request:**
```json
{
  "sql": "SELECT TOP 10 * FROM HR_EMPLOYEE",
  "database": "db_ptrj"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sql` | string | ✅ | Query SQL |
| `database` | string | ❌ | Nama database (opsional, default: db_ptrj) |
| `params` | object | ❌ | Parameter untuk prepared statement |

**Response:**
```json
{
  "success": true,
  "db": "db_ptrj",
  "execution_ms": 45,
  "data": {
    "recordset": [...],
    "rowsAffected": [10]
  }
}
```

---

### 4. Batch Query (Transaction)

```http
POST /v1/query/batch
```

**Request:**
```json
{
  "database": "extend_db_ptrj",
  "queries": [
    { "sql": "INSERT INTO logs (msg) VALUES ('Start')" },
    { "sql": "UPDATE users SET active = 1" }
  ]
}
```

---

## Contoh Penggunaan

### Query ke Database Default (db_ptrj)

```powershell
$body = '{"sql":"SELECT TOP 5 * FROM HR_EMPLOYEE"}'
Invoke-RestMethod -Uri "http://localhost:8001/v1/query" -Method POST -Headers @{
    "x-api-key"="2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6"
    "Content-Type"="application/json"
} -Body $body
```

### Query ke Database Lain

```powershell
$body = '{"sql":"SELECT TOP 5 * FROM some_table", "database":"extend_db_ptrj"}'
Invoke-RestMethod -Uri "http://localhost:8001/v1/query" -Method POST -Headers @{
    "x-api-key"="2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6"
    "Content-Type"="application/json"
} -Body $body
```

### cURL

```bash
# Default database
curl -X POST http://localhost:8001/v1/query \
  -H "Content-Type: application/json" \
  -H "x-api-key: 2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6" \
  -d '{"sql":"SELECT TOP 5 * FROM HR_EMPLOYEE"}'

# Specific database
curl -X POST http://localhost:8001/v1/query \
  -H "Content-Type: application/json" \
  -H "x-api-key: 2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6" \
  -d '{"sql":"SELECT TOP 5 * FROM users", "database":"extend_db_ptrj"}'
```

### Python

```python
import requests

# Query dengan database spesifik
response = requests.post(
    'http://localhost:8001/v1/query',
    json={
        'sql': 'SELECT TOP 5 * FROM HR_EMPLOYEE',
        'database': 'db_ptrj'  # opsional
    },
    headers={'x-api-key': '2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6'}
)
print(response.json())
```

---

## Swagger Documentation

```
http://localhost:8001/docs
```
