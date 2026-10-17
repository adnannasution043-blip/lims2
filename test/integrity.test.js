const assert = require('assert');
const I = require('../lib/integrity.js');

// ---- penomoran ----
assert.strictEqual(I.maxSeq(['DE.1.26.0001', 'DE.1.26.0002', 'DE.1.26.0005', 'DE.1.25.0099', 'DE.1.26.ABC', 'DE.1.26.0003-rev', null], 'DE.1.26.'), 5);
assert.strictEqual(I.maxSeq([], 'X-'), 0);

const db = {
  requests: [], wos: [], tasks: [], coupons: [], reports: [], sheets: [], files: [], indexFails: false,
  async query(sql, p = []) {
    sql = sql.replace(/\s+/g, ' ').trim();
    if (/^SELECT job_number AS v FROM test_requests WHERE job_number LIKE \$1/.test(sql)) return { rows: this.requests.filter(r => r.job_number.startsWith(p[0].slice(0, -1))).map(r => ({ v: r.job_number })) };
    if (/^SELECT lhu_number AS v FROM work_orders WHERE lhu_number LIKE \$1/.test(sql)) return { rows: this.wos.filter(w => (w.lhu_number || '').startsWith(p[0].slice(0, -1))).map(w => ({ v: w.lhu_number })) };
    if (/^SELECT 1 FROM work_orders w JOIN work_order_tasks t/.test(sql)) {
      const ok = this.wos.some(w => w.test_request_id === Number(p[0]) && this.tasks.some(t => t.work_order_id === w.id && t.task_key === 'released' && t.status === 'final'));
      return { rows: ok ? [{}] : [] };
    }
    if (/^SELECT id FROM work_orders WHERE test_request_id = \$1/.test(sql)) return { rows: this.wos.filter(w => w.test_request_id === Number(p[0])).map(w => ({ id: w.id })) };
    if (/^SELECT row_no FROM coupon_tests WHERE test_request_id = \$1/.test(sql)) return { rows: this.coupons.filter(c => c.test_request_id === Number(p[0])).map(c => ({ row_no: c.row_no })) };
    if (/^SELECT coupon_row_no, test_name, 'Lembar Hasil Uji' AS kind/.test(sql)) {
      return { rows: [...this.reports.filter(r => r.test_request_id === Number(p[0])).map(r => ({ ...r, kind: 'Lembar Hasil Uji' })), ...this.sheets.filter(r => r.test_request_id === Number(p[0])).map(r => ({ ...r, kind: 'Pengecekan Spesimen' }))] };
    }
    if (/^SELECT test_request_id FROM work_orders WHERE id = \$1/.test(sql)) return { rows: this.wos.filter(w => w.id === Number(p[0])) };
    if (/^SELECT test_request_id FROM test_reports WHERE id = \$1/.test(sql)) return { rows: this.reports.filter(r => r.id === Number(p[0])) };
    if (/^SELECT test_request_id FROM specimen_inspections WHERE id = \$1/.test(sql)) return { rows: this.sheets.filter(r => r.id === Number(p[0])) };
    if (/^SELECT w\.test_request_id FROM work_order_files f JOIN work_orders w/.test(sql)) { const f = this.files.find(x => x.id === Number(p[0])); return { rows: f ? this.wos.filter(w => w.id === f.work_order_id) : [] }; }
    if (/^CREATE UNIQUE INDEX/.test(sql)) { if (this.indexFails) throw new Error('could not create unique index'); return { rows: [] }; }
    if (/^SELECT job_number AS v, COUNT\(\*\) AS n/.test(sql)) return { rows: [{ v: 'DE.1.26.0002', n: '2' }] };
    if (/^SELECT lhu_number AS v, COUNT\(\*\) AS n/.test(sql)) return { rows: [] };
    throw new Error('query tidak dikenal: ' + sql);
  }
};

(async () => {
  // nomor berikutnya = tertinggi + 1, tidak terpengaruh data yang dihapus
  db.requests = ['DE.1.26.0001', 'DE.1.26.0002', 'DE.1.26.0005'].map((job_number, i) => ({ id: i + 1, job_number }));
  assert.strictEqual(await I.nextNumber(db, 'test_requests', 'job_number', 'DE.1.26.', 4), 'DE.1.26.0006', 'jumlah 3 tapi tertinggi 5 -> 6 (cara lama memberi 0004)');
  db.wos = [{ id: 1, test_request_id: 1, lhu_number: 'LHU-26-00001' }, { id: 2, test_request_id: 2, lhu_number: 'LHU-26-00004' }, { id: 3, test_request_id: 3, lhu_number: null }];
  assert.strictEqual(await I.nextNumber(db, 'work_orders', 'lhu_number', 'LHU-26-', 5), 'LHU-26-00005');
  assert.strictEqual(await I.nextNumber(db, 'work_orders', 'lhu_number', 'LHU-27-', 5), 'LHU-27-00001', 'tahun baru mulai dari 1');
  assert.ok(I.isUniqueViolation({ code: '23505' }) && !I.isUniqueViolation({ code: '23503' }) && !I.isUniqueViolation(null));
  // indeks unik: berhasil diam; gagal -> log berisi nomor ganda, tidak melempar
  let logs = []; await I.ensureUniqueNumbers(db, m => logs.push(m)); assert.strictEqual(logs.length, 0);
  db.indexFails = true; logs = []; await I.ensureUniqueNumbers(db, m => logs.push(m)); db.indexFails = false;
  assert.ok(logs.some(l => l.includes('DE.1.26.0002 (2x)')) && logs.length === 2);

  // ---- coupon setelah Work Order dibuat ----
  db.coupons = [1, 2, 3].map(n => ({ test_request_id: 1, row_no: n }));
  db.reports = [{ id: 10, test_request_id: 1, coupon_row_no: 2, test_name: 'Tensile Test' }];
  db.sheets = [{ id: 20, test_request_id: 1, coupon_row_no: 3, test_name: 'Compression Test' }];
  const row = (row_no, tests = [], others = []) => ({ row_no, test_items: tests.map(t => ({ test_name: t, checked: true })), other_tests: others.map(t => ({ test_name: t, checked: true })) });
  const base = [row(1), row(2, ['Tensile Test']), row(3, [], ['Compression Test'])];
  assert.strictEqual(await I.couponChangeProblem(db, 1, base), null, 'tanpa perubahan struktur aman');
  assert.strictEqual(await I.couponChangeProblem(db, 1, [...base, row(undefined, ['Bend Root'])]), null, 'tambah coupon di bawah aman');
  let msg = await I.couponChangeProblem(db, 1, [base[0], base[2]]);
  assert.ok(/Coupon #2 tidak boleh dihapus/.test(msg), 'hapus coupon tengah ditolak');
  msg = await I.couponChangeProblem(db, 1, [base[1], base[0], base[2]]);
  assert.ok(/Coupon #1/.test(msg), 'tukar urutan ditolak');
  msg = await I.couponChangeProblem(db, 1, [base[0], base[1]]);
  assert.ok(/Coupon #3/.test(msg), 'hapus coupon terakhir ditolak');
  msg = await I.couponChangeProblem(db, 1, [row(1), row(2), base[2]]);
  assert.ok(/"Tensile Test" pada Coupon #2 sudah punya Lembar Hasil Uji/.test(msg), 'hapus centang yang punya sheet ditolak');
  msg = await I.couponChangeProblem(db, 1, [row(1), base[1], row(3, [], ['Compression test baru'])]);
  assert.ok(/Pengecekan Spesimen/.test(msg), 'ganti nama Other Test yang punya sheet ditolak');
  const unchecked = [row(1), { row_no: 2, test_items: [{ test_name: 'Tensile Test', checked: false }] }, base[2]];
  assert.ok(await I.couponChangeProblem(db, 1, unchecked));
  // belum ada Work Order: bebas
  assert.strictEqual(await I.couponChangeProblem(db, 99, []), null);

  // ---- penjaga kunci ----
  db.tasks = [];
  db.files = [{ id: 30, work_order_id: 1 }];
  const guard = I.lockGuard(db);
  const run = (method, path) => new Promise(resolve => {
    const res = { code: 200, status(c) { this.code = c; return this; }, json(o) { resolve({ status: this.code, body: o }); } };
    guard({ method, path }, res, () => resolve({ status: 'next' }));
  });
  // sebelum terbit: semua lewat, kecuali hapus Permintaan Uji yang punya Work Order
  for (const [m, p] of [['PUT', '/api/requests/1'], ['PUT', '/api/test-reports/10'], ['DELETE', '/api/work-orders/1']]) assert.strictEqual((await run(m, p)).status, 'next', m + p);
  let r = await run('DELETE', '/api/requests/1'); assert.strictEqual(r.status, 409); assert.strictEqual(r.body.code, 'HAS_WORK_ORDER');
  db.requests.push({ id: 4, job_number: 'DE.1.26.0007' });
  assert.strictEqual((await run('DELETE', '/api/requests/4')).status, 'next', 'tanpa Work Order boleh dihapus');
  // setelah terbit: semua jalur ubah/hapus milik Permintaan Uji 1 terkunci; GET tetap boleh; Permintaan lain tidak terpengaruh
  db.tasks = [{ work_order_id: 1, task_key: 'released', status: 'final' }];
  const lockedPaths = [['PUT', '/api/requests/1'], ['DELETE', '/api/requests/1'], ['POST', '/api/requests/1/specimen-inspections'],
    ['PUT', '/api/work-orders/1'], ['DELETE', '/api/work-orders/1'], ['POST', '/api/work-orders/1/test-reports'], ['POST', '/api/work-orders/1/files'],
    ['PUT', '/api/test-reports/10'], ['DELETE', '/api/test-reports/10'], ['POST', '/api/test-reports/10/photos'], ['DELETE', '/api/test-reports/10/photo'],
    ['PUT', '/api/specimen-inspections/20'], ['DELETE', '/api/specimen-inspections/20'], ['DELETE', '/api/work-order-files/30'], ['PUT', '/API/Requests/1']];
  db.sheets[0].test_request_id = 1;
  for (const [m, p] of lockedPaths) { r = await run(m, p); assert.strictEqual(r.status, 409, m + ' ' + p); assert.strictEqual(r.body.code, 'LHU_LOCKED'); }
  for (const [m, p] of [['GET', '/api/requests/1'], ['GET', '/api/test-reports/10'], ['PUT', '/api/requests/2'], ['PUT', '/api/work-orders/2'], ['POST', '/api/lhu-reports/1/attachments'], ['PUT', '/api/work-orders/1/tasks/released'], ['GET', '/index.html'], ['PUT', '/api/test-reports/999']]) {
    assert.strictEqual((await run(m, p)).status, 'next', m + ' ' + p);
  }
  console.log('INTEGRITY OK');
})().catch(e => { console.error(e); process.exit(1); });
