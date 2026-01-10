# SQL Gateway API - Complete Endpoint Documentation

## Overview

SQL Gateway API adalah REST API untuk mengeksekusi query SQL ke **multiple SQL Server** dengan dukungan multi-database. API ini menyediakan:

- **Multi-server support** - Pilih server target via parameter `server`
- **Multi-database support** - Pilih database target via parameter `database`
- **Read-only enforcement** - Server dengan flag `readOnly: true` menolak write operations
- **Connection pooling** - Robust connection pool dengan health checks
- **Batch transactions** - Execute multiple queries dalam satu transaction

---

## Server Configuration

API mendukung multiple server profiles yang dikonfigurasi via environment variables:

| Profile | Host | Port | Mode | Description |
|---------|------|------|------|-------------|
| `SERVER_PROFILE_1` | 10.0.0.110 | 1433 | **Read/Write** | Primary server, full access |
| `SERVER_PROFILE_2` | 10.0.0.2 | 1888 | **Read-Only** | Secondary server, SELECT only |

**Default Server:** `SERVER_PROFILE_1` (jika parameter `server` tidak diberikan)

---

## Security Rules

### Server-Level Permissions

| Server | Rule |
|--------|------|
| `readOnly: false` | Full SQL operations (SELECT, INSERT, UPDATE, DELETE) |
| `readOnly: true` | **SELECT only** - Write operations will return 403 Forbidden |

### Database-Level Permissions

| Database | Permissions |
|----------|-------------|
| `db_ptrj` | **READ-ONLY** (SELECT only) |
| `extend_db_ptrj` | **FULL ACCESS** (SELECT, INSERT, UPDATE, DELETE) |
| Other databases | SELECT only by default |

### Blocked Operations (Always)

```
DROP, TRUNCATE, ALTER, CREATE, GRANT, REVOKE
```

---

## Authentication

Semua request harus menyertakan API key di header:

```http
x-api-key: 2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6
```

**Response jika tidak ada API key:**
```json
{
  "success": false,
  "error": "Missing API key"
}
```

---

## Endpoints

---

### 1. Health Check

Check apakah server API berjalan.

```http
GET /health
```

**Authentication:** Tidak diperlukan

#### Response (200 OK)

```json
{
  "status": "ok",
  "timestamp": "2026-01-10T04:30:00.000Z"
}
```

---

### 2. List Server Profiles

Lihat semua server yang dikonfigurasi beserta status koneksi.

```http
GET /v1/servers
```

**Authentication:** Required

#### Response Schema

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Request berhasil atau tidak |
| `data.servers` | array | Daftar server profiles |
| `data.servers[].name` | string | Nama profile (untuk parameter `server`) |
| `data.servers[].host` | string | IP address server |
| `data.servers[].port` | number | Port SQL Server |
| `data.servers[].defaultDatabase` | string | Database default |
| `data.servers[].readOnly` | boolean | `true` = hanya SELECT yang diizinkan |
| `data.servers[].connected` | boolean | Status koneksi pool |
| `data.servers[].healthy` | boolean | Health check terakhir berhasil |
| `data.total` | number | Jumlah total server |
| `data.defaultServer` | string | Server default yang digunakan |

#### Response Example (200 OK)

```json
{
  "success": true,
  "data": {
    "servers": [
      {
        "name": "SERVER_PROFILE_1",
        "host": "10.0.0.110",
        "port": 1433,
        "defaultDatabase": "master",
        "readOnly": false,
        "connected": true,
        "healthy": true
      },
      {
        "name": "SERVER_PROFILE_2",
        "host": "10.0.0.2",
        "port": 1888,
        "defaultDatabase": "master",
        "readOnly": true,
        "connected": true,
        "healthy": true
      }
    ],
    "total": 2,
    "defaultServer": "SERVER_PROFILE_1"
  }
}
```

---

### 3. List Databases

Lihat semua database yang tersedia di server tertentu.

```http
GET /v1/databases?server={SERVER_PROFILE}
```

**Authentication:** Required

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `server` | string | ❌ | `SERVER_PROFILE_1` | Nama server profile |

#### Response Schema

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Request berhasil |
| `server` | string | Server yang diquery |
| `data.databases` | string[] | Daftar nama database |
| `data.total` | number | Jumlah database |

#### Response Example (200 OK)

```json
{
  "success": true,
  "server": "SERVER_PROFILE_1",
  "data": {
    "databases": [
      "db_ptrj",
      "extend_db_ptrj",
      "master",
      "model",
      "msdb",
      "tempdb"
    ],
    "total": 6
  },
  "error": null
}
```

#### Response Example (500 Error - Connection Failed)

```json
{
  "success": false,
  "server": "SERVER_PROFILE_2",
  "data": null,
  "error": "Failed to list databases: Connection timeout"
}
```

---

### 4. Execute Single Query

Execute satu SQL query ke server dan database tertentu.

```http
POST /v1/query
Content-Type: application/json
```

**Authentication:** Required

#### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `sql` | string | ✅ | - | SQL query yang akan dieksekusi |
| `server` | string | ❌ | `SERVER_PROFILE_1` | Target server profile |
| `database` | string | ❌ | Pool default | Target database name |
| `params` | object | ❌ | `{}` | Parameter untuk prepared statement |

#### Request Examples

**Simple SELECT:**
```json
{
  "sql": "SELECT TOP 10 EmpCode, EmpName FROM HR_EMPLOYEE"
}
```

**SELECT with specific server and database:**
```json
{
  "sql": "SELECT TOP 10 EmpCode, EmpName FROM HR_EMPLOYEE",
  "server": "SERVER_PROFILE_2",
  "database": "db_ptrj"
}
```

**INSERT with parameters (ke server Read/Write):**
```json
{
  "sql": "INSERT INTO extend_db_ptrj.dbo.logs (message, created_at) VALUES (@msg, @date)",
  "server": "SERVER_PROFILE_1",
  "database": "extend_db_ptrj",
  "params": {
    "msg": "User logged in",
    "date": "2026-01-10T04:30:00Z"
  }
}
```

#### Response Schema

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Query berhasil dieksekusi |
| `server` | string | Server yang digunakan |
| `db` | string | Database yang digunakan |
| `execution_ms` | number | Waktu eksekusi dalam milliseconds |
| `data.recordset` | array | Hasil query (untuk SELECT) |
| `data.rowsAffected` | number[] | Jumlah row yang terpengaruh |
| `error` | string\|null | Pesan error jika gagal |

#### Response Example (200 OK - SELECT)

```json
{
  "success": true,
  "server": "SERVER_PROFILE_1",
  "db": "db_ptrj",
  "execution_ms": 45.23,
  "data": {
    "recordset": [
      { "EmpCode": "E001", "EmpName": "John Doe" },
      { "EmpCode": "E002", "EmpName": "Jane Smith" }
    ],
    "rowsAffected": [2]
  },
  "error": null
}
```

#### Response Example (200 OK - INSERT/UPDATE/DELETE)

```json
{
  "success": true,
  "server": "SERVER_PROFILE_1",
  "db": "extend_db_ptrj",
  "execution_ms": 12.50,
  "data": {
    "recordset": [],
    "rowsAffected": [1]
  },
  "error": null
}
```

#### Response Example (400 Bad Request - Missing SQL)

```json
{
  "success": false,
  "error": "Missing required field: sql"
}
```

#### Response Example (403 Forbidden - Write to Read-Only Server)

```json
{
  "success": false,
  "server": "SERVER_PROFILE_2",
  "db": "db_ptrj",
  "execution_ms": 1.23,
  "data": null,
  "error": "Access denied: Server is READ-ONLY. Write operations (INSERT) not allowed."
}
```

#### Response Example (403 Forbidden - Write to Read-Only Database)

```json
{
  "success": false,
  "server": "SERVER_PROFILE_1",
  "db": "db_ptrj",
  "execution_ms": 0.85,
  "data": null,
  "error": "Access denied: Database 'db_ptrj' is READ-ONLY. Only SELECT queries allowed. Use 'extend_db_ptrj' for write operations."
}
```

#### Response Example (500 Internal Error - Query Failed)

```json
{
  "success": false,
  "server": "SERVER_PROFILE_1",
  "db": "db_ptrj",
  "execution_ms": 230.12,
  "data": null,
  "error": "Database error: Invalid object name 'nonexistent_table'."
}
```

---

### 5. Execute Batch Queries (Transaction)

Execute multiple SQL queries dalam satu transaction.
- **Semua query berhasil** → Transaction COMMIT
- **Salah satu query gagal** → Transaction ROLLBACK (semua dibatalkan)

```http
POST /v1/query/batch
Content-Type: application/json
```

**Authentication:** Required

#### Request Body

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `queries` | array | ✅ | - | Array of query objects |
| `queries[].sql` | string | ✅ | - | SQL query |
| `queries[].params` | object | ❌ | `{}` | Parameters for query |
| `server` | string | ❌ | `SERVER_PROFILE_1` | Target server |
| `database` | string | ❌ | Pool default | Target database |

#### Request Example

```json
{
  "server": "SERVER_PROFILE_1",
  "database": "extend_db_ptrj",
  "queries": [
    {
      "sql": "INSERT INTO logs (action, timestamp) VALUES (@action, GETDATE())",
      "params": { "action": "START_PROCESS" }
    },
    {
      "sql": "UPDATE counters SET value = value + 1 WHERE name = 'process_count'"
    },
    {
      "sql": "INSERT INTO logs (action, timestamp) VALUES ('END_PROCESS', GETDATE())"
    }
  ]
}
```

#### Response Schema

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Transaction berhasil |
| `server` | string | Server yang digunakan |
| `db` | string | Database yang digunakan |
| `execution_ms` | number | Total waktu eksekusi |
| `data.results` | array | Hasil per query |
| `data.results[].recordset` | array | Hasil query (untuk SELECT) |
| `data.results[].rowsAffected` | number[] | Rows affected per query |
| `data.transactionCommitted` | boolean | `true` jika transaction di-commit |
| `error` | string\|null | Pesan error jika gagal |

#### Response Example (200 OK - Transaction Committed)

```json
{
  "success": true,
  "server": "SERVER_PROFILE_1",
  "db": "extend_db_ptrj",
  "execution_ms": 156.78,
  "data": {
    "results": [
      { "recordset": [], "rowsAffected": [1] },
      { "recordset": [], "rowsAffected": [1] },
      { "recordset": [], "rowsAffected": [1] }
    ],
    "transactionCommitted": true
  },
  "error": null
}
```

#### Response Example (500 Error - Transaction Rolled Back)

```json
{
  "success": false,
  "server": "SERVER_PROFILE_1",
  "db": "extend_db_ptrj",
  "execution_ms": 89.45,
  "data": null,
  "error": "Transaction failed: Invalid column name 'nonexistent_column'."
}
```

---

## Parsing Response

### Cara Membaca Response

```javascript
const response = await fetch('http://localhost:8001/v1/query', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'x-api-key': 'YOUR_API_KEY'
  },
  body: JSON.stringify({
    sql: 'SELECT TOP 5 * FROM HR_EMPLOYEE',
    server: 'SERVER_PROFILE_1',
    database: 'db_ptrj'
  })
});

const result = await response.json();

// Check if successful
if (result.success) {
  // Get the data rows
  const rows = result.data.recordset;
  console.log(`Found ${rows.length} records`);
  
  // Process each row
  rows.forEach(row => {
    console.log(row.EmpCode, row.EmpName);
  });
  
  // Check rows affected (for INSERT/UPDATE/DELETE)
  const affected = result.data.rowsAffected[0];
  console.log(`Affected ${affected} rows`);
  
} else {
  // Handle error
  console.error('Query failed:', result.error);
}
```

### Python Example

```python
import requests

API_KEY = '2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6'
BASE_URL = 'http://localhost:8001'

def execute_query(sql, server=None, database=None, params=None):
    payload = {'sql': sql}
    if server:
        payload['server'] = server
    if database:
        payload['database'] = database
    if params:
        payload['params'] = params
    
    response = requests.post(
        f'{BASE_URL}/v1/query',
        json=payload,
        headers={'x-api-key': API_KEY}
    )
    
    result = response.json()
    
    if result['success']:
        return result['data']['recordset']
    else:
        raise Exception(result['error'])

# Usage
try:
    # Query ke read-only server
    employees = execute_query(
        sql='SELECT TOP 5 EmpCode, EmpName FROM HR_EMPLOYEE',
        server='SERVER_PROFILE_2',
        database='db_ptrj'
    )
    
    for emp in employees:
        print(f"{emp['EmpCode']}: {emp['EmpName']}")
        
except Exception as e:
    print(f"Error: {e}")
```

### PowerShell Example

```powershell
$headers = @{
    "x-api-key" = "2a993486e7a448474de66bfaea4adba7a99784defbcaba420e7f906176b94df6"
    "Content-Type" = "application/json"
}

# Query ke server tertentu
$body = @{
    sql = "SELECT TOP 5 EmpCode, EmpName FROM HR_EMPLOYEE"
    server = "SERVER_PROFILE_2"
    database = "db_ptrj"
} | ConvertTo-Json

$response = Invoke-RestMethod -Uri "http://localhost:8001/v1/query" -Method POST -Headers $headers -Body $body

if ($response.success) {
    # Akses recordset
    $response.data.recordset | ForEach-Object {
        Write-Host "$($_.EmpCode): $($_.EmpName)"
    }
    
    Write-Host "Query time: $($response.execution_ms)ms"
} else {
    Write-Error $response.error
}
```

---

## Error Handling

### HTTP Status Codes

| Code | Meaning | When |
|------|---------|------|
| 200 | OK | Query executed successfully |
| 400 | Bad Request | Missing required fields (sql, queries) |
| 401 | Unauthorized | Missing or invalid API key |
| 403 | Forbidden | Query blocked by security rules |
| 500 | Internal Error | Database error, connection failed |

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `Missing API key` | Header `x-api-key` tidak ada | Tambahkan header |
| `Invalid API key` | API key salah | Gunakan key yang valid |
| `Missing required field: sql` | Field `sql` tidak ada di body | Tambahkan field sql |
| `Server profile 'X' not found` | Server profile tidak ada | Cek `/v1/servers` untuk list |
| `Server is READ-ONLY` | Write ke server read-only | Gunakan server read/write |
| `Database 'X' is READ-ONLY` | Write ke database read-only | Gunakan `extend_db_ptrj` |
| `Blocked: DROP operations not allowed` | Query terlarang | Operasi tidak diizinkan |

---

## Swagger UI

Interactive API documentation tersedia di:

```
http://localhost:8001/docs
```

Swagger UI menyediakan:
- Test endpoint langsung dari browser
- Auto-generate request examples
- Response schema documentation
- Authentication via "Authorize" button

---

## Environment Variables

Konfigurasi server profiles di file `.env`:

```env
# Default server profile
DB_PROFILE=SERVER_PROFILE_1

# Server Profile 1 (Read/Write)
DATABASE_PROFILES_SERVER_PROFILE_1_SERVER=10.0.0.110
DATABASE_PROFILES_SERVER_PROFILE_1_PORT=1433
DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME=sa
DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD=your_password
DATABASE_PROFILES_SERVER_PROFILE_1_READ_ONLY=false

# Server Profile 2 (Read-Only)
DATABASE_PROFILES_SERVER_PROFILE_2_SERVER=10.0.0.2
DATABASE_PROFILES_SERVER_PROFILE_2_PORT=1888
DATABASE_PROFILES_SERVER_PROFILE_2_USERNAME=sa
DATABASE_PROFILES_SERVER_PROFILE_2_PASSWORD=your_password
DATABASE_PROFILES_SERVER_PROFILE_2_READ_ONLY=true
```
