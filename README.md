# DETECH LIMS — Tahap 1: Permintaan Uji & Work Order

Halaman pertama dari project LIMS DETECH: replika digital form **DPI-LP-FR-24 Rev.4
— Tinjauan Permintaan Pengujian (Testing Requirements Review)**, dilanjutkan dengan
**DPI-LP-FR-25 Rev.3 — Work Order** yang dibuat per permintaan (1 permintaan final = 1 Work Order).

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
├── server.js               # Express app + semua REST API (async, pakai pg Pool)
├── db/
│   ├── init.js              # Pool koneksi Postgres + schema (test_requests, coupon_tests,
│   │                         # test_items, work_orders, work_order_sample_marks)
│   ├── testTypes.js         # 13 jenis pengujian tetap sesuai form Tinjauan Permintaan Pengujian
│   └── workOrderSteps.js    # 6 tahapan proses tetap (Receiving..Doc. Checked) untuk Work Order
├── lib/
│   ├── printCommon.js       # Helper bersama: logo DETECH (data URI), esc(), format tanggal
│   ├── printView.js         # HTML cetak Tinjauan Permintaan Pengujian (DPI-LP-FR-24)
│   └── workOrderPrintView.js# HTML cetak Work Order (DPI-LP-FR-25)
├── .env.example
└── public/
    ├── index.html
    ├── img/detech-logo.png  # Logo asli, diekstrak dari contoh PDF
    ├── css/style.css        # Tema warna mengikuti mockup dashboard (gold/amber + navy)
    └── js/app.js            # List/form view Permintaan Uji & Work Order, semua logic di client
```

## Fitur tahap ini

**Tinjauan Permintaan Pengujian (DPI-LP-FR-24)**
- Daftar semua Tinjauan Permintaan Pengujian yang tersimpan (draft/final)
- Form baru / edit, mengikuti seluruh field form asli:
  - Informasi umum (No. Pekerjaan otomatis ter-generate `DE.yymmdd.seq`, Perusahaan, PO, dll)
  - Tinjauan & deskripsi (4 item Y/N, status witness, specimen, target LHU, penanganan LHU)
  - Coupon Test — bisa tambah/hapus baris; tiap baris punya detail material +
    tabel 13 jenis pengujian (checkbox, jumlah, metode tes), termasuk field
    tambahan Charpy (T°, WM, BM, HAZ)
  - Tanda tangan pelanggan & penerima
- Simpan sebagai Draft atau Finalisasi, atau hapus permintaan
- Export ke PDF: buka halaman cetak HTML (`/requests/:id/print`) yang niru layout form asli,
  lalu print/simpan-sebagai-PDF lewat browser

**Work Order (DPI-LP-FR-25)**
- Dibuat per permintaan yang sudah **Final** (tombol "+ Work Order" di daftar Permintaan Uji) —
  relasi 1:1, info pelanggan & coupon test otomatis diambil dari permintaan terkait
- Field khas Work Order: Tgl. Testing, Our Reference, Contact Person, Sample Marking per
  coupon test, PIC tiap tahap proses (Receiving/Machining/Inspection/Testing/Reporting/Doc.
  Checked), dan approval (Prepared by/Checked by/Approved by)
- Tabel jenis pengujian pada Work Order hanya menampilkan yang sudah dicentang di permintaan
  asal (bukan semua 13 baris seperti form Tinjauan Permintaan Pengujian)
- Daftar Work Order sendiri di menu sidebar, simpan Draft/Final, hapus, dan export PDF
  (`/work-orders/:id/print`) dengan pendekatan cetak yang sama

## Belum dikerjakan (menyusul di tahap berikutnya)

- Menu-menu lain di sidebar (Dashboard, Penerimaan Sampel, dst.) — saat ini
  tampil tapi non-aktif sebagai placeholder
- Autentikasi/login

## Catatan desain

Tema warna (gold/amber `#F5A623`, merah DETECH `#D32F2F`, navy `#1B2A4A`,
background cream `#FAF7F2`) mengikuti referensi mockup dashboard yang diberikan,
supaya nanti halaman-halaman berikutnya bisa nyambung satu tema.
"# lims2" 
