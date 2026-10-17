// Integritas data dokumen: penomoran unik, perlindungan coupon setelah Work Order dibuat, dan kunci setelah LHU terbit.
//
// 1. Penomoran (No. Pekerjaan, No. LHU) = nomor urut TERTINGGI yang sudah ada + 1 (bukan jumlah baris + 1, yang bisa
//    menghasilkan nomor ganda setelah ada data dihapus). Indeks unik di database menolak nomor ganda bila dua orang
//    menyimpan bersamaan; pemanggil mencoba lagi dengan nomor berikutnya.
// 2. Coupon: nomor coupon (row_no) dihitung dari urutan baris setiap kali Permintaan Uji disimpan, dan Lembar Hasil Uji,
//    Pengecekan Spesimen, sample marking, serta data Receiving menautkan coupon lewat nomor itu. Setelah Work Order dibuat,
//    coupon lama tidak boleh dihapus atau dipindah urutannya (coupon baru hanya boleh ditambah di bawah), dan pengujian yang
//    sudah punya sheet tidak boleh dihapus centangnya.
// 3. Kunci: setelah LHU terbit (tahap Report Issued Final), Permintaan Uji, Work Order, Lembar Hasil Uji (termasuk foto),
//    Pengecekan Spesimen, dan file bukti tidak bisa diubah/dihapus. Membuka lagi hanya lewat "Cabut LHU" oleh Administrator.

// Tahun 2 digit menurut WIB (Asia/Jakarta). Server (Railway) berjalan di UTC, jadi 1 Januari pukul 00:00-07:00 WIB
// masih terbaca tahun lama bila memakai getFullYear().
function yearWIB(date = new Date()) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Jakarta', year: '2-digit' }).format(date);
}

// Nomor urut tertinggi untuk awalan tertentu (mis. "DE.1.26." -> 7 bila ada DE.1.26.0007). Nilai yang bukan angka diabaikan.
function maxSeq(values, prefix) {
  let max = 0;
  for (const v of values) {
    const s = String(v || '');
    if (!s.startsWith(prefix)) continue;
    const tail = s.slice(prefix.length);
    if (/^[0-9]+$/.test(tail)) max = Math.max(max, parseInt(tail, 10));
  }
  return max;
}

async function nextNumber(db, table, column, prefix, pad) {
  // Nama tabel/kolom berasal dari kode (bukan input pengguna).
  const { rows } = await db.query(`SELECT ${column} AS v FROM ${table} WHERE ${column} LIKE $1`, [prefix + '%']);
  return prefix + String(maxSeq(rows.map(r => r.v), prefix) + 1).padStart(pad, '0');
}

// Indeks unik dibuat saat start. Bila data lama sudah memuat nomor ganda, indeks gagal dibuat: server tetap jalan,
// nomor ganda dicatat di log supaya bisa dibereskan.
async function ensureUniqueNumbers(pool, log = console.log) {
  const specs = [
    { name: 'uq_test_requests_job_number', table: 'test_requests', column: 'job_number', where: `job_number IS NOT NULL AND job_number <> ''`, label: 'No. Pekerjaan' },
    { name: 'uq_work_orders_lhu_number', table: 'work_orders', column: 'lhu_number', where: `lhu_number IS NOT NULL AND lhu_number <> ''`, label: 'No. LHU' }
  ];
  for (const s of specs) {
    try {
      await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ${s.name} ON ${s.table} (${s.column}) WHERE ${s.where}`);
    } catch (err) {
      const { rows } = await pool.query(
        `SELECT ${s.column} AS v, COUNT(*) AS n FROM ${s.table} WHERE ${s.where} GROUP BY ${s.column} HAVING COUNT(*) > 1 ORDER BY ${s.column}`);
      log(`[integritas] ${s.label} ganda ditemukan, indeks unik belum bisa dibuat: ${rows.map(r => `${r.v} (${r.n}x)`).join(', ') || err.message}. Ubah salah satu nomornya lalu restart server.`);
    }
  }
}

const isUniqueViolation = err => err && err.code === '23505';

// ----- status kunci -----

async function lhuIssuedForRequest(db, requestId) {
  const { rows } = await db.query(
    `SELECT 1 FROM work_orders w JOIN work_order_tasks t ON t.work_order_id = w.id
     WHERE w.test_request_id = $1 AND t.task_key = 'released' AND t.status = 'final' LIMIT 1`, [requestId]);
  return rows.length > 0;
}

async function workOrderOfRequest(db, requestId) {
  const { rows } = await db.query('SELECT id FROM work_orders WHERE test_request_id = $1', [requestId]);
  return rows.length ? rows[0].id : null;
}

// ----- perubahan coupon setelah Work Order dibuat -----

const checkedNames = row => [...((row && row.test_items) || []), ...((row && row.other_tests) || [])]
  .filter(t => t && t.checked && String(t.test_name || '').trim()).map(t => String(t.test_name).trim());

// Mengembalikan pesan kesalahan (string) atau null bila perubahan aman.
async function couponChangeProblem(db, requestId, newRows) {
  if (!(await workOrderOfRequest(db, requestId))) return null;   // belum ada Work Order: bebas diubah
  const rows = Array.isArray(newRows) ? newRows : [];
  const { rows: old } = await db.query('SELECT row_no FROM coupon_tests WHERE test_request_id = $1 ORDER BY row_no', [requestId]);
  for (let i = 0; i < old.length; i++) {
    const r = rows[i];
    if (!r || Number(r.row_no) !== old[i].row_no) {
      return `Coupon #${old[i].row_no} tidak boleh dihapus atau dipindah urutannya karena Work Order sudah dibuat ` +
        '(hasil uji dan marking menempel pada nomor coupon). Coupon baru hanya boleh ditambahkan di bagian bawah.';
    }
  }
  const { rows: sheets } = await db.query(
    `SELECT coupon_row_no, test_name, 'Lembar Hasil Uji' AS kind FROM test_reports WHERE test_request_id = $1
     UNION ALL
     SELECT coupon_row_no, test_name, 'Pengecekan Spesimen' AS kind FROM specimen_inspections WHERE test_request_id = $1 AND test_name IS NOT NULL`,
    [requestId]);
  for (const s of sheets) {
    const row = rows[(s.coupon_row_no || 1) - 1];
    if (!checkedNames(row).includes(String(s.test_name).trim())) {
      return `Pengujian "${s.test_name}" pada Coupon #${s.coupon_row_no || 1} sudah punya ${s.kind}. ` +
        'Hapus sheet itu dulu sebelum menghapus centang atau mengganti nama pengujiannya.';
    }
  }
  return null;
}

// ----- penjaga kunci untuk jalur ubah/hapus -----

const LOCKED_MSG = 'Data ini terkunci karena LHU sudah diterbitkan. Minta Administrator mencabut LHU (tahap Report Issued) bila perlu revisi.';

// Untuk path + metode tertentu, cari Permintaan Uji yang terkait (null = path tidak dijaga).
async function requestIdFor(db, method, p) {
  let m;
  if (method === 'GET' || method === 'HEAD') return null;
  if ((m = /^\/api\/requests\/([0-9]+)(\/specimen-inspections)?$/.exec(p))) return Number(m[1]);
  if ((m = /^\/api\/work-orders\/([0-9]+)(\/test-reports|\/files)?$/.exec(p))) {
    const { rows } = await db.query('SELECT test_request_id FROM work_orders WHERE id = $1', [m[1]]);
    return rows.length ? rows[0].test_request_id : null;
  }
  if ((m = /^\/api\/test-reports\/([0-9]+)(\/photos|\/photo)?$/.exec(p))) {
    const { rows } = await db.query('SELECT test_request_id FROM test_reports WHERE id = $1', [m[1]]);
    return rows.length ? rows[0].test_request_id : null;
  }
  if ((m = /^\/api\/specimen-inspections\/([0-9]+)$/.exec(p))) {
    const { rows } = await db.query('SELECT test_request_id FROM specimen_inspections WHERE id = $1', [m[1]]);
    return rows.length ? rows[0].test_request_id : null;
  }
  if ((m = /^\/api\/work-order-files\/([0-9]+)$/.exec(p))) {
    const { rows } = await db.query(
      'SELECT w.test_request_id FROM work_order_files f JOIN work_orders w ON w.id = f.work_order_id WHERE f.id = $1', [m[1]]);
    return rows.length ? rows[0].test_request_id : null;
  }
  return null;
}

function lockGuard(pool) {
  return async (req, res, next) => {
    try {
      const p = req.path.toLowerCase();
      if (!p.startsWith('/api/')) return next();
      const requestId = await requestIdFor(pool, req.method, p);
      if (!requestId) return next();
      if (await lhuIssuedForRequest(pool, requestId)) return res.status(409).json({ error: LOCKED_MSG, code: 'LHU_LOCKED' });
      // Permintaan Uji yang sudah punya Work Order tidak dihapus langsung (ikut menghapus semua hasil uji di bawahnya)
      if (req.method === 'DELETE' && /^\/api\/requests\/[0-9]+$/.test(p) && (await workOrderOfRequest(pool, requestId))) {
        return res.status(409).json({ error: 'Permintaan Uji ini sudah punya Work Order. Hapus Work Order-nya dulu bila memang ingin menghapus.', code: 'HAS_WORK_ORDER' });
      }
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memeriksa kunci data' });
    }
  };
}

module.exports = { yearWIB, maxSeq, nextNumber, ensureUniqueNumbers, isUniqueViolation, lhuIssuedForRequest, couponChangeProblem, lockGuard, requestIdFor, LOCKED_MSG };
