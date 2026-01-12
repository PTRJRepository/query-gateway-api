# AI Agent Context: SQL Database Query Gateway

## System Role
This API acts as a secure, high-performance middleware gateway that allows authorized clients to execute SQL Server (T-SQL) queries against multiple configured database instances via HTTP/REST.

## Core Interface Specifications

### 1. Authentication
*   **Mechanism:** Static API Token.
*   **Header Required:** `x-api-key`
*   **Value:** Must match the `API_TOKEN` configured in the server's environment.
*   **Behavior:** Failure to provide a valid token results in `401 Unauthorized`.

### 2. Base Configuration
*   **Base URL:** Typically `http://localhost:8001` (configurable).
*   **Database Discovery:** Database connection profiles are dynamic. Always query `GET /v1/databases` first to discover available `db_alias` values before attempting to execute SQL.

### 3. Data Structures (TypeScript Interfaces)

Use these interfaces to construct requests and parse responses.

```typescript
// Standard Response Wrapper
interface ApiResponse<T> {
  success: boolean;
  db?: string;           // The alias of the database accessed
  execution_ms?: number; // Time taken to execute
  data: T | null;
  error: string | null;  // detailed error message if success is false
}

// Request: Single Query
interface QueryRequest {
  db_alias: string;      // Must be one of the values returned by /v1/databases
  sql: string;           // T-SQL syntax. Use @paramName for parameters.
  params?: Record<string, any>; // Key-value pairs matching @paramName
}

// Request: Batch Transaction
interface BatchQueryRequest {
  db_alias: string;
  queries: Array<{
    sql: string;
    params?: Record<string, any>;
  }>;
}

// Response: Database List
interface DatabaseList {
  available: string[];   // All configured aliases (e.g. ["LOCAL", "WAREHOUSE"])
  connected: string[];   // Aliases with currently active connection pools
}

// Response: Query Result
interface QueryResult {
  recordset: Array<Record<string, any>>; // The rows returned
  rowsAffected: number[];                // Count of modified rows
}

// Response: Batch Result
interface BatchResult {
  results: QueryResult[];
  transactionCommitted: boolean;
}
```

## Operational Constraints & Best Practices for Agents

1.  **Parameterization is Mandatory:**
    *   **Do not** concatenate strings into SQL (SQL Injection risk).
    *   **Do** use parameters.
    *   *Bad:* `sql: "SELECT * FROM users WHERE id = " + userId`
    *   *Good:* `sql: "SELECT * FROM users WHERE id = @id"`, `params: { id: userId }`

2.  **Date Handling:**
    *   SQL Server dates should be passed as ISO 8601 strings (YYYY-MM-DDTHH:mm:ss.sssZ) in the `params` object.

3.  **Discovery Flow:**
    *   Step 1: Check `GET /health` to ensure service is up.
    *   Step 2: `GET /v1/databases` to map available `db_alias` targets.
    *   Step 3: `POST /v1/query` to execute logic.

4.  **Error Handling:**
    *   If `success: false`, read the `error` field.
    *   Common errors:
        *   "Invalid object name": The table doesn't exist in the selected `db_alias`.
        *   "Login failed": The server configuration for that profile is incorrect (human intervention required).

## API Endpoints Reference

| Method | Endpoint | Description | Payload |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Server heartbeat. | None |
| `GET` | `/v1/databases` | List valid `db_alias` targets. | None |
| `POST` | `/v1/query` | Execute single SQL statement. | `QueryRequest` |
| `POST` | `/v1/query/batch` | Execute atomic transaction. | `BatchQueryRequest` |

## Example Usage (JSON)

**Objective:** Get active users from "PROD_DB"
**Request:**
```json
POST /v1/query
Headers: { "x-api-key": "YOUR_TOKEN" }
Body:
{
  "db_alias": "PROD_DB",
  "sql": "SELECT id, username FROM users WHERE status = @status",
  "params": {
    "status": "active"
  }
}
```
