# DETECH LIMS — Tahap 1: Permintaan Uji

Halaman pertama dari project LIMS DETECH: replika digital form **DPI-LP-FR-24 Rev.4
— Tinjauan Permintaan Pengujian (Testing Requirements Review)**.

## Stack

- **Backend:** Node.js + Express, single-file (`server.js`) — monolith, satu service
- **Database:** PostgreSQL (`pg`), koneksi lewat `DATABASE_URL`. Schema (`CREATE TABLE IF NOT EXISTS ...`) dijalankan otomatis saat start, jadi tidak perlu migration terpisah untuk tahap ini
- **Frontend:** vanilla HTML/CSS/JS, single page, tanpa framework — di-serve langsung oleh Express (`public/`), jadi tetap satu service untuk frontend + backend + DB

## Menjalankan

1. Siapkan Postgres (lokal, Docker, atau Railway) dan set `DATABASE_URL`:
   ```bash
   cp .env.example .env
   # lalu isi DATABASE_URL sesuai koneksi Postgres kamu
   ```
2. Install & jalankan:
   ```bash
   npm install
   npm start
   ```

Buka http://localhost:3000

## Deploy ke Railway (satu service)

1. Push project ini ke repo, buat service baru di Railway dari repo tersebut.
2. Tambahkan plugin **PostgreSQL** di project yang sama, lalu attach ke service ini —
   Railway otomatis inject env var `DATABASE_URL` ke service Node-nya.
3. Tidak perlu setting tambahan; saat container start, `initSchema()` di `server.js`
   akan otomatis membuat tabel kalau belum ada.
4. `PORT` otomatis di-set Railway lewat env var, sudah dihandle di `server.js`.

## Struktur

```
detech-lims/
├── server.js           # Express app + semua REST API (async, pakai pg Pool)
├── db/
│   ├── init.js          # Pool koneksi Postgres + schema (test_requests, coupon_tests, test_items)
│   └── testTypes.js      # 13 jenis pengujian tetap sesuai form asli
├── .env.example
└── public/
    ├── index.html
    ├── css/style.css     # Tema warna mengikuti mockup dashboard (gold/amber + navy)
    └── js/app.js         # List view + form view, semua logic di sisi client
```

## Fitur tahap ini

- Daftar semua Tinjauan Permintaan Pengujian yang tersimpan (draft/final)
- Form baru / edit, mengikuti seluruh field form asli:
  - Informasi umum (No. Pekerjaan otomatis ter-generate `DE.yymmdd.seq`, Perusahaan, PO, dll)
  - Tinjauan & deskripsi (4 item Y/N, status witness, specimen, target LHU, penanganan LHU)
  - Coupon Test — bisa tambah/hapus baris; tiap baris punya detail material +
    tabel 13 jenis pengujian (checkbox, jumlah, metode tes), termasuk field
    tambahan Charpy (T°, WM, BM, HAZ)
  - Tanda tangan pelanggan & penerima
- Simpan sebagai Draft atau Finalisasi
- Hapus permintaan

## Belum dikerjakan (menyusul di tahap berikutnya)

- Halaman Work Order (sengaja dilewati sesuai instruksi)
- Export/print ke PDF yang match layout form asli
- Menu-menu lain di sidebar (Dashboard, Penerimaan Sampel, dst.) — saat ini
  tampil tapi non-aktif sebagai placeholder
- Autentikasi/login

## Catatan desain

Tema warna (gold/amber `#F5A623`, merah DETECH `#D32F2F`, navy `#1B2A4A`,
background cream `#FAF7F2`) mengikuti referensi mockup dashboard yang diberikan,
supaya nanti halaman-halaman berikutnya bisa nyambung satu tema.
"# lims2" 
