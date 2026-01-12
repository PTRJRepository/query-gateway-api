# Dokumentasi Sistem API Key Dinamis

## Daftar Isi
1. [Pengenalan](#pengenalan)
2. [Arsitektur Sistem](#arsitektur-sistem)
3. [Inisialisasi Sistem](#inisialisasi-sistem)
4. [Pembuatan API Key Baru](#pembuatan-api-key-baru)
5. [Penggunaan API Key](#penggunaan-api-key)
6. [Manajemen API Key](#manajemen-api-key)
7. [Contoh Implementasi](#contoh-implementasi)
8. [Keamanan](#keamanan)

## Pengenalan

Sistem API key dinamis adalah pengganti dari sistem API key statis yang sebelumnya menggunakan environment variables. Sistem baru ini memungkinkan pembuatan, manajemen, dan validasi API key secara runtime tanpa perlu restart server atau mengedit file konfigurasi.

### Keunggulan Sistem Baru
- Pembuatan API key secara dinamis
- Manajemen API key melalui endpoint REST
- Penyimpanan aman di file JSON terenkripsi
- Sistem izin yang fleksibel
- Audit trail untuk penggunaan API key

## Arsitektur Sistem

### Struktur File
```
src/
├── utils/
│   └── apiKeyGenerator.ts    # Generator dan manajer API key
├── middleware/
│   └── auth.ts              # Middleware otentikasi
├── routes/
│   └── apiKeys.ts           # Endpoint manajemen API key
└── data/
    └── api_keys.json        # Penyimpanan API key (dihasilkan runtime)
```

### Struktur API Key
```typescript
interface ApiKeyRecord {
    id: string;              // ID unik untuk identifikasi
    key: string;             // Nilai API key (32-byte base64url)
    permissions: {
        description?: string;
        allowed_dbs: string[];   // Database yang diizinkan
        read_only: boolean;      // Mode read-only
        write_dbs: string[];     // Database yang bisa ditulis
        write_tables: string[];  // Tabel yang bisa ditulis
    };
    createdAt: Date;         // Waktu pembuatan
    lastUsed?: Date;         // Waktu terakhir digunakan
    expiresAt?: Date;        // Waktu kadaluarsa (opsional)
    isActive: boolean;       // Status aktif/non-aktif
}
```

## Inisialisasi Sistem

### 1. Konfigurasi Environment
Tambahkan ke file `.env`:
```env
# Kunci inisialisasi untuk membuat API key pertama
INIT_KEY=init_key_for_api_gateway_2026
```

### 2. Endpoint Inisialisasi
**URL**: `POST /admin/init`  
**Deskripsi**: Membuat API key default pertama kali  
**Headers**: Tidak diperlukan otentikasi  
**Body**:
```json
{
    "initKey": "init_key_for_api_gateway_2026"
}
```

**Contoh Request**:
```bash
curl -X POST http://localhost:8001/admin/init \
  -H "Content-Type: application/json" \
  -d '{
    "initKey": "init_key_for_api_gateway_2026"
  }'
```

**Response Sukses**:
```json
{
    "success": true,
    "message": "API key system initialized successfully"
}
```

**Catatan Penting**:
- Endpoint hanya bisa digunakan sekali (jika sudah ada API key, akan gagal)
- Harus menggunakan nilai `INIT_KEY` yang benar
- Membuat 3 API key default: default, admin, dan read-only

## Pembuatan API Key Baru

### Endpoint: Create API Key
**URL**: `POST /admin/api-keys`  
**Deskripsi**: Membuat API key baru dengan izin tertentu  
**Headers**: 
```
x-api-key: [API_KEY_DENGAN_HAK_ADMIN]
```
**Body**:
```json
{
    "description": "Deskripsi API key",
    "permissions": {
        "description": "Deskripsi izin",
        "allowed_dbs": ["db1", "db2"],
        "read_only": false,
        "write_dbs": ["db1"],
        "write_tables": ["table1", "table2"]
    },
    "expiresAt": "2024-12-31T23:59:59.000Z"  // Opsional
}
```

**Contoh Request**:
```bash
curl -X POST http://localhost:8001/admin/api-keys \
  -H "Content-Type: application/json" \
  -H "x-api-key: dqg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "description": "API key untuk aplikasi mobile",
    "permissions": {
      "description": "Akses read-write ke database mobile_app",
      "allowed_dbs": ["mobile_app_db"],
      "read_only": false,
      "write_dbs": ["mobile_app_db"],
      "write_tables": ["users", "orders", "products"]
    }
  }'
```

**Response Sukses**:
```json
{
    "success": true,
    "data": {
        "id": "key_1704123456789_abc123def",
        "key": "dqg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
        "createdAt": "2024-01-01T00:00:00.000Z",
        "permissions": {
            "description": "Akses read-write ke database mobile_app",
            "allowed_dbs": ["mobile_app_db"],
            "read_only": false,
            "write_dbs": ["mobile_app_db"],
            "write_tables": ["users", "orders", "products"]
        }
    }
}
```

**Catatan Penting**:
- Hanya API key dengan `read_only: false` yang bisa membuat API key baru
- API key hanya ditampilkan sekali saat pembuatan
- Simpan API key dengan aman karena tidak bisa diambil kembali

## Penggunaan API Key

### 1. Menggunakan API Key untuk Akses API
Setiap request ke endpoint yang dilindungi harus menyertakan header:
```
x-api-key: dqg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2. Contoh Penggunaan dengan Query API
```bash
curl -X POST http://localhost:8001/v1/query \
  -H "Content-Type: application/json" \
  -H "x-api-key: dqg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" \
  -d '{
    "dbAlias": "mobile_app_db",
    "sql": "SELECT * FROM users WHERE id = 1"
  }'
```

### 3. Validasi Otomatis
Sistem otomatis akan:
- Memvalidasi keberadaan API key
- Memeriksa apakah API key aktif
- Memeriksa apakah API key belum kadaluarsa
- Memvalidasi izin terhadap database dan operasi SQL

## Manajemen API Key

### 1. List Semua API Key
**URL**: `GET /admin/api-keys`  
**Deskripsi**: Menampilkan semua API key aktif (tanpa nilai sebenarnya)  
**Headers**:
```
x-api-key: [API_KEY_DENGAN_HAK_ADMIN]
```

**Contoh Request**:
```bash
curl -X GET http://localhost:8001/admin/api-keys \
  -H "x-api-key: dqg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Response**:
```json
{
    "success": true,
    "data": {
        "keys": [
            {
                "id": "key_1704123456789_abc123def",
                "permissions": {
                    "description": "Akses read-write ke database mobile_app",
                    "allowed_dbs": ["mobile_app_db"],
                    "read_only": false,
                    "write_dbs": ["mobile_app_db"],
                    "write_tables": ["users", "orders", "products"]
                },
                "createdAt": "2024-01-01T00:00:00.000Z",
                "lastUsed": "2024-01-02T10:30:00.000Z",
                "expiresAt": "2024-12-31T23:59:59.000Z",
                "isActive": true
            }
        ]
    }
}
```

### 2. Deaktivasi API Key
**URL**: `DELETE /admin/api-keys/:id`  
**Deskripsi**: Menonaktifkan API key (soft delete)  
**Headers**:
```
x-api-key: [API_KEY_DENGAN_HAK_ADMIN]
```

**Contoh Request**:
```bash
curl -X DELETE http://localhost:8001/admin/api-keys/key_1704123456789_abc123def \
  -H "x-api-key: dqg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

**Response**:
```json
{
    "success": true,
    "data": {
        "deleted": true
    }
}
```

## Contoh Implementasi

### 1. Inisialisasi Sistem
```javascript
// Langkah 1: Inisialisasi sistem
fetch('http://localhost:8001/admin/init', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        initKey: 'init_key_for_api_gateway_2026'
    })
})
.then(response => response.json())
.then(data => {
    if (data.success) {
        console.log('Sistem API key berhasil diinisialisasi');
    }
});
```

### 2. Membuat API Key Baru
```javascript
// Langkah 2: Buat API key untuk aplikasi tertentu
const adminApiKey = 'dqg_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'; // Dari inisialisasi

fetch('http://localhost:8001/admin/api-keys', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': adminApiKey
    },
    body: JSON.stringify({
        description: 'API key untuk aplikasi pelaporan',
        permissions: {
            "description": "Akses read-only untuk pelaporan",
            "allowed_dbs": ["reporting_db"],
            "read_only": true,
            "write_dbs": [],
            "write_tables": []
        }
    })
})
.then(response => response.json())
.then(data => {
    if (data.success) {
        console.log('API key baru dibuat:', data.data.key);
        // Simpan API key ini dengan aman
    }
});
```

### 3. Menggunakan API Key
```javascript
// Langkah 3: Gunakan API key untuk akses API
const reportingApiKey = data.data.key; // Dari langkah sebelumnya

fetch('http://localhost:8001/v1/query', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'x-api-key': reportingApiKey
    },
    body: JSON.stringify({
        dbAlias: 'reporting_db',
        sql: 'SELECT COUNT(*) as total_users FROM users'
    })
})
.then(response => response.json())
.then(data => {
    console.log('Hasil query:', data);
});
```

## Keamanan

### 1. Praktik Keamanan Terbaik
- **Jangan pernah menyimpan API key di client-side code**
- **API key hanya ditampilkan sekali saat pembuatan**
- **Gunakan HTTPS untuk semua komunikasi**
- **Rotasi API key secara berkala**
- **Gunakan API key dengan izin minimal (principle of least privilege)**

### 2. Perlindungan Sistem
- **Rate limiting** untuk endpoint manajemen API key
- **Audit trail** untuk pelacakan penggunaan
- **Validasi input** untuk mencegah injection
- **Pemeriksaan izin** sebelum operasi sensitif
- **Pembatasan IP** (opsional, bisa ditambahkan)

### 3. Manajemen Risiko
- **Endpoint `/admin/init`** hanya bisa digunakan sekali
- **Hanya API key admin** yang bisa membuat/menghapus API key
- **API key read-only** tidak bisa membuat API key baru
- **Sistem logging** untuk aktivitas penting
- **Fungsi pencarian API key** berdasarkan ID atau nilai

### 4. Penanganan Error
- **401 Unauthorized** untuk API key tidak valid
- **403 Forbidden** untuk izin tidak mencukupi
- **404 Not Found** untuk API key tidak ditemukan
- **500 Internal Server Error** untuk kesalahan sistem

---

**Catatan Penting**: Pastikan untuk menyimpan API key dengan aman dan tidak pernah menyertakannya dalam kode yang bisa diakses publik. API key hanya bisa diakses sekali saat pembuatan, jadi simpan dengan hati-hati.