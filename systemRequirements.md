📑 System Requirements: Node.js SQL Bridge Gateway1. High-Level ArchitectureSistem ini bertindak sebagai stateless proxy. Ia menerima request, memvalidasi identitas, memeriksa keamanan query, mengeksekusi query ke database yang dinamis, dan mengembalikan data dalam format standar.2. Technical StackRuntime: Node.js (v20+ recommended).Web Framework: Fastify (untuk kecepatan eksekusi tinggi).SQL Parser: node-sql-parser (untuk validasi keamanan level tabel).DB Drivers: pg (Postgres), mysql2 (MySQL).Config Management: JSON-based atau Database-based untuk penyimpanan kredensial DB.3. Core Modules (Logic Workflow)A. Connection Pool ManagerSistem tidak boleh membuat koneksi baru setiap kali ada request (agar tidak overhead).Gunakan Map Object untuk menyimpan Connection Pool berdasarkan db_alias.Jika db_alias belum ada di memori, ambil kredensial dari config, buat pool baru, simpan, lalu gunakan.B. Security & RBAC ModuleAPI Key Validation: Mengecek header x-api-key terhadap daftar key statis.Permission Mapping: Setiap API Key memiliki profil seperti:JSON{
  "key_123": {
    "allowed_dbs": ["prod_db", "test_db"],
    "read_only": false,
    "write_tables": ["logs", "orders"] // Tabel yang boleh di INSERT/UPDATE
  }
}
C. Query Validator (The Guard)Menggunakan node-sql-parser untuk mengubah string query menjadi AST (Abstract Syntax Tree).Langkah Validasi:Cek Tipe Query: Jika read_only: true tapi ada perintah selain SELECT, blokir.Cek Tabel: Jika melakukan UPDATE/INSERT, pastikan nama tabel ada di write_tables.Blacklist: Blokir jika mengandung DROP, TRUNCATE, ALTER, atau akses ke information_schema.🤖 Markdown untuk AI Agent (Prompt Ready)Salin kode di bawah ini ke AI Agent kamu:Markdown# Context
Build a high-performance SQL Bridge Gateway using Node.js and Fastify.

# Features to Implement
1. **Dynamic Connection Pooling**:
   - Create a singleton class `ConnectionManager`.
   - It should manage multiple pools for PostgreSQL and MySQL.
   - Credentials should be fetched from a local `config.json` based on `db_alias`.

2. **Security & Validation**:
   - Use `node-sql-parser` to analyze incoming raw SQL strings.
   - Implement an 'Access Control' middleware:
     - Check `x-api-key` header.
     - Block any destructive SQL (DROP, TRUNCATE).
     - If the user is marked 'read-only', only allow SELECT queries.
     - For UPDATE/INSERT, check if the table is in the user's `allowed_tables` list.

3. **Standardized Transformer**:
   - All responses must follow this format:
     {
       "success": true,
       "db": "alias_name",
       "execution_ms": 120,
       "data": [...],
       "error": null
     }

4. **Endpoint**:
   - POST `/v1/query`
   - Payload: { "db_alias": "db_a", "sql": "SELECT * FROM users", "params": [] }

# Requirements
- Use TypeScript.
- Use Fastify for the web server.
- Error handling must be robust (don't crash the server on DB connection failure).
🛠️ Contoh Struktur config.json yang DinamisAgar kamu bisa merubah host/port tanpa bongkar kode, gunakan struktur seperti ini:FieldDeskripsidb_aliasNama unik untuk dipanggil client (misal: inventory_db)dialectpostgres atau mysqlhost/portAlamat server databasecredentialsUsername & Password (disarankan pakai Env Variable)