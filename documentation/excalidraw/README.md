# Dokumentasi Database Query Gateway

## 1. Diagram Arsitektur Keseluruhan Sistem

![Diagram Arsitektur](./excalidraw/architecture_overview.excalidraw)

Diagram ini menunjukkan arsitektur keseluruhan dari Database Query Gateway. Sistem ini berfungsi sebagai perantara antara aplikasi klien dan database SQL Server. Berikut adalah komponen utamanya:

- **Client Application**: Aplikasi yang ingin mengakses database melalui gateway
- **Gateway (Node.js)**: Inti dari sistem yang menangani permintaan HTTP dan mengelola koneksi ke database
- **SQL Server DB**: Database tujuan yang akan diakses melalui gateway

Alur kerja:
1. Client mengirimkan permintaan HTTP dengan API key ke gateway
2. Gateway memvalidasi API key dan permintaan
3. Gateway meneruskan query ke SQL Server
4. Hasil dikembalikan ke client dalam format JSON

## 2. Diagram Alur Query dari Pengguna ke Database

![Diagram Alur Query](./excalidraw/query_flow.excalidraw)

Diagram ini menunjukkan proses langkah-demi-langkah saat pengguna mengirimkan query ke database:

1. **Send Query**: Client mengirimkan query SQL beserta API key
2. **Receive Request**: Gateway menerima permintaan HTTP
3. **Validate API Key**: Middleware otentikasi memverifikasi keabsahan API key
4. **Validate Query**: Validator memeriksa apakah query aman dan sesuai izin
5. **Execute Query**: Query dieksekusi pada database

## 3. Diagram Komponen Utama Sistem

![Diagram Komponen](./excalidraw/system_components.excalidraw)

Diagram ini menunjukkan komponen-komponen utama dalam sistem:

### Layer Keamanan:
- **Auth Middleware**: Memvalidasi API key dan izin akses

### Layer Validasi:
- **Query Validator**: Memvalidasi sintaks dan izin operasi SQL
- **Query Routes**: Menangani endpoint-endpoint permintaan

### Layer Koneksi:
- **Connection Manager**: Mengelola koneksi ke berbagai server database
- **SQL Server**: Database yang dituju

### Komponen Pendukung:
- **DB Config**: Konfigurasi koneksi database

## 4. Diagram Alur Data dan Hubungan Komponen

![Diagram Alur Data](./excalidraw/data_flow_relationships.excalidraw)

Diagram ini menunjukkan bagaimana data mengalir melalui sistem dan bagaimana komponen-komponen saling berinteraksi:

1. **Permintaan Masuk**: Client mengirimkan query dan API key
2. **Validasi**: Melibatkan validasi otentikasi dan izin
3. **Eksekusi**: Query dieksekusi di SQL Server
4. **Respons**: Hasil dikembalikan dalam format JSON

## Fitur Utama Sistem

### Otentikasi
- Menggunakan API key untuk otentikasi
- Mendukung izin berbasis peran

### Validasi Query
- Mencegah operasi berbahaya seperti DROP, TRUNCATE, ALTER
- Membatasi akses ke tabel sistem
- Memvalidasi izin berdasarkan database dan operasi

### Manajemen Koneksi
- Pool koneksi untuk kinerja optimal
- Mendukung beberapa profil server
- Mode baca-tulis dan hanya-baca

### Endpoint API
- `/v1/query`: Eksekusi query SQL tunggal
- `/v1/query/batch`: Eksekusi query batch dalam transaksi
- `/v1/servers`: Daftar server yang tersedia
- `/v1/databases`: Daftar database pada server

## Konfigurasi

Sistem dikonfigurasi melalui variabel lingkungan:

```env
API_TOKEN=your_api_token
DATABASE_PROFILES_SERVER_PROFILE_1_SERVER=localhost
DATABASE_PROFILES_SERVER_PROFILE_1_PORT=1433
DATABASE_PROFILES_SERVER_PROFILE_1_USERNAME=sa
DATABASE_PROFILES_SERVER_PROFILE_1_PASSWORD=your_password
DATABASE_PROFILES_SERVER_PROFILE_1_DATABASE_NAME=your_database
DATABASE_PROFILES_SERVER_PROFILE_1_READ_ONLY=false
```

## Keamanan

- Semua permintaan harus menyertakan header `x-api-key`
- Query divalidasi untuk mencegah SQL injection dan operasi berbahaya
- Pembatasan akses berdasarkan database dan izin operasi
- Mode hanya-baca untuk database sensitif