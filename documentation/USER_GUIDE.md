# Panduan Lengkap Database Query Gateway

Dokumen ini menjelaskan cara menggunakan, mengonfigurasi, dan mengelola Database Query Gateway. Gateway ini berfungsi sebagai jembatan HTTP berkinerja tinggi untuk mengeksekusi query SQL ke berbagai database SQL Server.

## Daftar Isi
1. [Instalasi dan Menjalankan Aplikasi](#instalasi-dan-menjalankan-aplikasi)
2. [Autentikasi](#autentikasi)
3. [Konfigurasi Database](#konfigurasi-database)
    - [Menambah Koneksi Baru](#menambah-koneksi-baru)
    - [Mengubah Alias Database](#mengubah-alias-database)
4. [Penggunaan API (Endpoint)](#penggunaan-api-endpoint)
    - [Cek Status (Health Check)](#cek-status-health-check)
    - [List Database Tersedia](#list-database-tersedia)
    - [Eksekusi Query](#eksekusi-query)
    - [Eksekusi Batch Transaction](#eksekusi-batch-transaction)

---

## Instalasi dan Menjalankan Aplikasi

Pastikan Node.js sudah terinstal di sistem Anda.

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Setup Environment Variables**
   Salin file `.env.example` (jika ada) atau pastikan file `.env` sudah ada di root folder. Konfigurasi ini akan dijelaskan lebih detail di bagian [Konfigurasi Database](#konfigurasi-database).

3. **Jalankan Aplikasi**
   - **Mode Development** (auto-reload saat ada perubahan kode):
     ```bash
     npm run dev
     ```
   - **Mode Production**:
     ```bash
     npm run build
     npm start
     ```

Aplikasi biasanya berjalan di `http://0.0.0.0:8001` (tergantung setting `PORT` di `.env`).

---

## Autentikasi

Aplikasi ini menggunakan **Static API Token** untuk keamanan. Setiap request ke endpoint yang dilindungi (seperti query database) harus menyertakan header `x-api-key`.

### Mengatur Token
Buka file `.env` dan ubah nilai `API_TOKEN`:

```env
API_TOKEN=rahasia_super_aman_12345
```

### Menggunakan Token
Sertakan token tersebut di header request HTTP Anda:

```http
x-api-key: rahasia_super_aman_12345
```

Jika token salah atau tidak disertakan, server akan merespons dengan `401 Unauthorized`.

---

## Konfigurasi Database

Aplikasi ini menggunakan sistem **Dynamic Environment Variables** untuk mendeteksi profil database. Anda tidak perlu mengubah kode (TypeScript/JavaScript) untuk menambah atau mengubah koneksi database, cukup edit file `.env`.

Format penamaan variabel environment adalah:
`DATABASE_PROFILES_[ALIAS]_[PROPERTY]`

### Komponen Konfigurasi
- `ALIAS`: Nama unik untuk database (misal: `LOCAL`, `PROD_DB`, `GUDANG`). Ini akan digunakan saat memanggil API.
- `PROPERTY`:
  - `SERVER`: IP Address atau Hostname.
  - `PORT`: Port SQL Server (default 1433).
  - `DATABASE_NAME`: Nama database di SQL Server.
  - `USERNAME`: Username login SQL.
  - `PASSWORD`: Password login SQL.
  - `ENCRYPT`: `true` atau `false` (gunakan `false` untuk koneksi lokal/IP biasa).
  - `TRUSTED_CONNECTION`: `false` (untuk SQL Auth) atau `true`.

### Menambah Koneksi Baru
Misalkan Anda ingin menambahkan database gudang dengan alias `GUDANG_JKT`:

1. Buka `.env`.
2. Tambahkan baris berikut di bagian bawah:

```env
DATABASE_PROFILES_GUDANG_JKT_DRIVER="ODBC Driver 17 for SQL Server"
DATABASE_PROFILES_GUDANG_JKT_SERVER="192.168.1.50"
DATABASE_PROFILES_GUDANG_JKT_PORT=1433
DATABASE_PROFILES_GUDANG_JKT_USERNAME="sa"
DATABASE_PROFILES_GUDANG_JKT_PASSWORD="password_gudang"
DATABASE_PROFILES_GUDANG_JKT_DATABASE_NAME="db_inventory"
DATABASE_PROFILES_GUDANG_JKT_TRUSTED_CONNECTION=false
DATABASE_PROFILES_GUDANG_JKT_ENCRYPT=false
```

3. Restart aplikasi agar perubahan terdeteksi.
4. Anda sekarang bisa melakukan query dengan `db_alias: "GUDANG_JKT"`.

### Mengubah Alias Database
Untuk mengubah alias (misal dari `GUDANG_JKT` menjadi `MAIN_INVENTORY`), cukup ubah bagian nama di tengah variabel environment di `.env`:

**Dari:**
`DATABASE_PROFILES_GUDANG_JKT_SERVER=...`

**Menjadi:**
`DATABASE_PROFILES_MAIN_INVENTORY_SERVER=...`

Lakukan ini untuk semua properti yang terkait dengan koneksi tersebut.

---

## Penggunaan API (Endpoint)

Dokumentasi interaktif (Swagger UI) juga tersedia di: `http://localhost:8001/docs` saat aplikasi berjalan.

### 1. Cek Status (Health Check)
Memastikan server berjalan.

- **Endpoint:** `GET /health`
- **Auth:** Tidak perlu
- **Response:**
  ```json
  {
    "status": "ok",
    "timestamp": "2026-01-04T10:00:00.000Z"
  }
  ```

### 2. List Database Tersedia
Melihat daftar alias database yang sudah dikonfigurasi di `.env` dan status pool koneksinya.

- **Endpoint:** `GET /v1/databases`
- **Auth:** `x-api-key`
- **Response:**
  ```json
  {
    "success": true,
    "data": {
      "available": ["LOCAL", "GUDANG_JKT"],
      "connected": ["LOCAL"] 
    },
    "error": null
  }
  ```
  *Note: `connected` menampilkan database yang saat ini memiliki koneksi aktif di pool memori.*

### 3. Eksekusi Query
Menjalankan perintah SQL tunggal.

- **Endpoint:** `POST /v1/query`
- **Auth:** `x-api-key`
- **Body:**
  ```json
  {
    "db_alias": "LOCAL",
    "sql": "SELECT TOP 5 * FROM users WHERE active = @isActive",
    "params": {
      "isActive": 1
    }
  }
  ```
- **Response Sukses:**
  ```json
  {
    "success": true,
    "db": "LOCAL",
    "execution_ms": 15.4,
    "data": {
      "recordset": [
        { "id": 1, "username": "admin", "active": true },
        ...
      ],
      "rowsAffected": [5]
    },
    "error": null
  }
  ```
- **Response Error:**
  ```json
  {
    "success": false,
    "db": "LOCAL",
    "execution_ms": 5.2,
    "data": null,
    "error": "Database error: Invalid object name 'users'."
  }
  ```

### 4. Eksekusi Batch Transaction
Menjalankan beberapa query dalam satu transaksi database. Jika satu query gagal, semua perubahan akan dibatalkan (Rollback).

- **Endpoint:** `POST /v1/query/batch`
- **Auth:** `x-api-key`
- **Body:**
  ```json
  {
    "db_alias": "LOCAL",
    "queries": [
      {
        "sql": "INSERT INTO logs (message) VALUES (@msg)",
        "params": { "msg": "Start process" }
      },
      {
        "sql": "UPDATE inventory SET stock = stock - 1 WHERE id = @itemId",
        "params": { "itemId": 101 }
      }
    ]
  }
  ```
- **Response:**
  ```json
  {
    "success": true,
    "db": "LOCAL",
    "execution_ms": 45.2,
    "data": {
      "results": [
        { "recordset": [], "rowsAffected": [1] },
        { "recordset": [], "rowsAffected": [1] }
      ],
      "transactionCommitted": true
    },
    "error": null
  }
  ```
