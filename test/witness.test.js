// Witness client: sesi Daftar Hadir & Berita Acara, nomor BA otomatis, Witnessed By, cetak & lampiran LHU (pool palsu).
const assert = require('assert');
const { registerWitnessRoutes, cleanSession, witnessText, materialText, longDate } = require('../lib/witness');
const A = require('../lib/auth');

// ---- helper ----
const sigPng = 'data:image/png;base64,iVBORw0KGgo=';
const c = cleanSession({ session_date: '2026-10-15', coupon_rows: ['2', 1, 1, 'x'], attendees: [
  { name: ' Indra ', company: 'PT Teknik Jaya Sakti', phone: '0812', email: 'i@x.id', signature: sigPng, evil: 1 },
  { name: '', company: '' }, { name: 'Entis R.', company: 'PT Grundfos Pompa', signature: 'javascript:alert(1)' }],
  detech_signer: { name: 'Fajar', signature: 'data:image/svg+xml;base64,AA==' } });
assert.deepStrictEqual(c.coupon_rows, [1, 2]);
assert.strictEqual(c.attendees.length, 2, 'baris kosong dibuang');
assert.strictEqual(c.attendees[0].name, 'Indra');
assert.ok(!('evil' in c.attendees[0]));
assert.strictEqual(c.attendees[0].signature, sigPng);
assert.strictEqual(c.attendees[1].signature, '', 'tanda tangan bukan PNG ditolak');
assert.strictEqual(c.detech_signer.signature, '');
assert.ok(c.place.includes('Laboratorium'));
assert.strictEqual(witnessText(c.attendees), 'Indra of PT Teknik Jaya Sakti, Entis R. of PT Grundfos Pompa');
assert.strictEqual(materialText({ coupon_type: ['Plate'], material_type_grade: 'JIS G 3101 SS400', thickness: '12' }), 'Plate, JIS G 3101 SS400, 12 mm Thickness');
assert.strictEqual(materialText({ coupon_type: [], coupon_type_other: 'Pipe', thickness: '8 mm' }), 'Pipe, 8 mm Thickness');
assert.deepStrictEqual(longDate('2026-10-15'), { day: 'Kamis', date: 15, month: 'Oktober', year: 2026, short: '15/10/2026' });

// ---- hak akses ----
const tech = { permissions: { tasks: ['view', 'edit'] } };
const lhuViewer = { permissions: { 'hasil-laporan': ['view'] } };
const can = (u, m, p) => A.allowed(u, A.ruleFor(m, p), m);
assert.ok(can(tech, 'POST', '/api/work-orders/5/witness'));
assert.ok(can(tech, 'PUT', '/api/witness-sessions/3'));
assert.ok(can(lhuViewer, 'GET', '/witness-sessions/3/print'));
assert.ok(!can(lhuViewer, 'PUT', '/api/witness-sessions/3'));

// ---- route ----
const WO = {
  id: 5, test_request_id: 9,
  test_request: { job_number: 'DE.1.26.1191', company: 'PT GRUNDFOS POMPA', on_behalf_owner: '', po_number: 'PO-1', project_name: 'Pompa' },
  coupon_tests: [
    { row_no: 1, report_no: 'DE.1/1026/4470', sample_marking: 'GP.1', coupon_type: ['Plate'], material_type_grade: 'SS400', thickness: '12',
      test_items: [{ test_name: 'Tensile Test', checked: true, qty: '1' }, { test_name: 'Bend Root', checked: false, qty: '2' }], other_tests: [{ test_name: 'PMI', qty: '1' }] },
    { row_no: 2, report_no: 'DE.1/1026/4471', sample_marking: 'GP.2', coupon_type: ['Pipe'], test_items: [{ test_name: 'Hardness Test', checked: true, qty: '3' }], other_tests: [] }
  ]
};
let sessions = [];
let seq = 0;
const updates = [];
const pool = {
  async query(sql, p) {
    if (/SELECT COALESCE\(MAX\(ba_seq\)/.test(sql)) return { rows: [{ m: sessions.filter(s => s.ba_year === p[0]).reduce((m, s) => Math.max(m, s.ba_seq), 0) }] };
    if (/^INSERT INTO witness_sessions/.test(sql)) {
      const s = { id: ++seq, work_order_id: p[0], ba_no: p[1], ba_seq: p[2], ba_year: p[3], session_date: p[4], session_time: p[5], place: p[6], agenda: p[7], coupon_rows: p[8], attendees: p[9], detech_signer: p[10], notes: p[11] };
      sessions.push(s);
      return { rows: [s] };
    }
    if (/^UPDATE witness_sessions/.test(sql)) {
      const s = sessions.find(x => x.id === p[9]);
      Object.assign(s, { ba_no: p[0], session_date: p[1], session_time: p[2], place: p[3], agenda: p[4], coupon_rows: p[5], attendees: p[6], detech_signer: p[7], notes: p[8] });
      return { rows: [s] };
    }
    if (/^UPDATE test_reports SET witnessed_by/.test(sql)) { updates.push(p); return { rowCount: 2 }; }
    if (/FROM witness_sessions WHERE work_order_id/.test(sql)) return { rows: sessions.filter(s => s.work_order_id === Number(p[0])) };
    if (/^SELECT \* FROM witness_sessions WHERE id/.test(sql)) return { rows: sessions.filter(s => s.id === Number(p[0])) };
    if (/^DELETE FROM witness_sessions/.test(sql)) { const n = sessions.length; sessions = sessions.filter(s => s.id !== Number(p[0])); return { rowCount: n - sessions.length }; }
    throw new Error('unexpected sql ' + sql);
  }
};
const routes = {};
const app = {};
['get', 'post', 'put', 'delete'].forEach(m => { app[m] = (path, h) => { routes[m.toUpperCase() + ' ' + path] = h; }; });
const api = registerWitnessRoutes(app, { pool, getFullWorkOrder: async id => (Number(id) === 5 ? WO : null) });
const call = (key, params, body, query) => new Promise(resolve => {
  const res = { statusCode: 200, headers: {}, status(x) { this.statusCode = x; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); }, send(o) { resolve({ status: this.statusCode, body: o }); }, setHeader(k, v) { this.headers[k] = v; } };
  routes[key]({ params: params || {}, body, query: query || {} }, res);
});

(async () => {
  let r = await call('POST /api/work-orders/:id/witness', { id: '5' }, { session_date: '2026-10-15', session_time: '10.00 WIB', coupon_rows: [1],
    attendees: [{ name: 'Indra', company: 'PT Teknik Jaya Sakti', signature: sigPng }, { name: 'Entis R.', company: 'PT Grundfos Pompa' }] });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.ba_no, '0001/DPI/ADM-BA/X/2026');
  assert.strictEqual(r.body.agenda, 'Witness Pengujian Material PT GRUNDFOS POMPA', 'agenda bawaan');
  assert.strictEqual(r.body.filled_reports, 2);
  assert.deepStrictEqual(updates[0], ['Indra of PT Teknik Jaya Sakti, Entis R. of PT Grundfos Pompa', 9, [1]], 'Witnessed By hanya coupon yang disaksikan');
  const sid = r.body.id;
  r = await call('POST /api/work-orders/:id/witness', { id: '5' }, { session_date: '2026-11-02', attendees: [{ name: 'Nugraha U.', company: 'PT Rafa Karya Indonesia' }] });
  assert.strictEqual(r.body.ba_no, '0002/DPI/ADM-BA/XI/2026', 'urut per tahun, bulan Romawi dari tanggal witness');
  assert.deepStrictEqual(updates[1][2], [1, 2], 'tanpa pilihan coupon = semua coupon');
  assert.strictEqual((await call('POST /api/work-orders/:id/witness', { id: '77' }, {})).status, 404);

  r = await call('PUT /api/witness-sessions/:sid', { sid: String(sid) }, { ba_no: '0625/DPI/ADM-BA/X/2026', session_date: '2026-10-15', coupon_rows: [1], attendees: [{ name: 'Indra', company: 'PT Teknik Jaya Sakti', signature: sigPng }] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.ba_no, '0625/DPI/ADM-BA/X/2026', 'nomor BA bisa diubah');

  // cetak
  r = await call('GET /witness-sessions/:sid/print', { sid: String(sid) }, null, { doc: 'ba' });
  const ba = r.body;
  assert.ok(ba.includes('BERITA ACARA WITNESS') && ba.includes('0625/DPI/ADM-BA/X/2026'));
  assert.ok(ba.includes('Pada Hari Kamis, Tanggal 15 Bulan Oktober Tahun 2026'));
  assert.ok(ba.includes('DE.1/1026/4470') && !ba.includes('DE.1/1026/4471'), 'hanya coupon yang disaksikan');
  assert.ok(ba.includes('>Tensile Test<') && ba.includes('>PMI<') && !ba.includes('>Bend Root<'), 'hanya pengujian yang dicentang');
  assert.ok(ba.includes('Plate, SS400, 12 mm Thickness'));
  assert.ok(ba.includes('Fajar Pangestu, S.Tr.T.') && ba.includes('PT Teknik Jaya Sakti') && ba.includes(sigPng));
  assert.ok(ba.includes('DPI-LP-FR-39') && !ba.includes('DAFTAR KEHADIRAN'));
  r = await call('GET /witness-sessions/:sid/print', { sid: String(sid) }, null, { doc: 'dh' });
  assert.ok(r.body.includes('DAFTAR KEHADIRAN') && r.body.includes('ATTENDANCE LIST') && r.body.includes('DPI-LP-FR-63') && r.body.includes('15/10/2026'));
  assert.ok(!r.body.includes('BERITA ACARA WITNESS'));
  assert.strictEqual((await call('GET /witness-sessions/:sid/print', { sid: '999' })).status, 404);

  // lampiran LHU & Witnessed By Lembar baru
  const att1 = await api.witnessAttachment(WO, 1);
  assert.strictEqual(att1.pages.length, 4, 'coupon 1 disaksikan di 2 sesi: (Daftar Hadir + BA) x 2');
  const att2 = await api.witnessAttachment(WO, 2);
  assert.strictEqual(att2.pages.length, 2);
  assert.strictEqual(await api.witnessDefault(WO, 1), 'Indra of PT Teknik Jaya Sakti, Nugraha U. of PT Rafa Karya Indonesia');

  r = await call('GET /api/work-orders/:id/witness', { id: '5' });
  assert.strictEqual(r.body.sessions.length, 2);
  assert.strictEqual((await call('DELETE /api/witness-sessions/:sid', { sid: String(sid) })).status, 200);
  assert.strictEqual((await call('DELETE /api/witness-sessions/:sid', { sid: String(sid) })).status, 404);
  assert.strictEqual(await api.witnessAttachment(WO, 2) !== null, true);
  console.log('WITNESS OK');
})().catch(e => { console.error(e); process.exit(1); });
