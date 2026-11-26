// Label Coupon / kertas penanda material (permintaan klien 2026-11-25, contoh "Kertas Kecil.xlsx"): isi bawaan Weld &
// Material dari data coupon, sanitasi label tersimpan, halaman cetak, dan route simpan (pool palsu).
const assert = require('assert');
const { registerCouponLabelRoutes, defaultLabel, sanitizeLabel, renderCouponLabelsHtml } = require('../lib/couponLabels');

const weldCoupon = { row_no: 1, sample_marking: 'SKK.11.7', no_wps: 'SEK-GT-P-10H10H-N24', pqr_no: 'PQR-24B/ASME/SEK/26', material_size: 'Joint Pipe, 2" Sch 10 to 10 mm thk',
  material_type_grade: 'A790 UNS S31803', welding_position: '2F', welding_process: 'GTAW', welder_name: '' };
const matCoupon = { row_no: 2, sample_marking: 'AVI.8.1', material_type_grade: 'SCM440H', material_size: 'Sample, Dia. 25 mm', heat_number: 'J29571' };
const request = { job_number: 'DE.1261269', company: 'PT SEKAWAN KONTRINDO', po_number: '', project_name: '' };

// ---- isi bawaan ----
const w = defaultLabel(weldCoupon, request);
assert.strictEqual(w.kind, 'weld');
assert.strictEqual(w.title, 'PT SEKAWAN KONTRINDO');
assert.strictEqual(w.marking, 'SKK.11.7');
assert.deepStrictEqual(w.left.map(x => x.label), ['WPS No', 'PQR No', 'Material Size', 'Testing for', "Welder's Name/ID"]);
assert.deepStrictEqual(w.left.map(x => x.value), ['SEK-GT-P-10H10H-N24', 'PQR-24B/ASME/SEK/26', 'Joint Pipe, 2" Sch 10 to 10 mm thk', 'Welding Procedure Specification', '-']);
assert.deepStrictEqual(w.right.map(x => x.label), ['Material Type/Grade', 'Welding Position', 'Welding Process']);
const m = defaultLabel(matCoupon, request);
assert.strictEqual(m.kind, 'material');
assert.deepStrictEqual(m.left.map(x => x.value), ['SCM440H', 'Sample, Dia. 25 mm', 'J29571', 'Material Testing']);
assert.deepStrictEqual(m.right, [{ label: 'Po No', value: '-' }, { label: 'Project Name', value: '-' }]);
assert.strictEqual(defaultLabel({ thickness: '12' }, {}).left[1].value, '12 mm Thickness', 'ukuran dari tebal bila Material Size kosong');

// ---- sanitasi ----
assert.strictEqual(sanitizeLabel(null), null);
const s = sanitizeLabel({ title: ' PT X ', marking: 'M1', kind: 'evil', left: [{ label: 'A', value: '1' }, { label: '', value: '' }], right: 'x', copies: 99 });
assert.deepStrictEqual(s, { title: 'PT X', marking: 'M1', kind: 'weld', left: [{ label: 'A', value: '1' }], right: [], copies: 20 });
assert.strictEqual(sanitizeLabel({ left: Array.from({ length: 30 }, (_, i) => ({ label: 'L' + i })) }).left.length, 12, 'maks. 12 baris per kolom');

// ---- halaman cetak: isi bawaan vs tersimpan, aman dari HTML di data ----
{
  const wo = { id: 7, test_request: request, coupon_tests: [weldCoupon, { ...matCoupon, material_type_grade: '</script><b>x' }] };
  const html = renderCouponLabelsHtml(wo, { 2: { ...m, title: 'PT ALFA VALVES INDONESIA', copies: 2 } });
  const data = JSON.parse(/const DATA = (.*);\n/.exec(html)[1]);
  assert.strictEqual(data.woId, 7);
  assert.strictEqual(data.coupons[0].data.marking, 'SKK.11.7');
  assert.strictEqual(data.coupons[0].own, false);
  assert.strictEqual(data.coupons[1].data.title, 'PT ALFA VALVES INDONESIA', 'label tersimpan dipakai');
  assert.strictEqual(data.coupons[1].def.title, 'PT SEKAWAN KONTRINDO', 'isi bawaan tetap tersedia untuk tombol Kembalikan');
  assert.ok(!html.includes('</script><b>'), 'data coupon tidak bisa menutup tag script');
}

// ---- route simpan ----
const store = { '7|1': { label_data: null } };
const pool = {
  async query(sql, params) {
    if (/^SELECT 1 FROM work_order_sample_marks/.test(sql)) return { rows: store[params[0] + '|' + params[1]] ? [{}] : [] };
    if (/^UPDATE work_order_sample_marks SET label_data/.test(sql)) { store[params[1] + '|' + params[2]].label_data = params[0]; return { rowCount: 1 }; }
    if (/^SELECT coupon_row_no, label_data/.test(sql)) return { rows: [] };
    throw new Error('unexpected sql ' + sql);
  }
};
const routes = {};
const app = { get: (p, h) => { routes['GET ' + p] = h; }, put: (p, h) => { routes['PUT ' + p] = h; } };
registerCouponLabelRoutes(app, { pool, getFullWorkOrder: async id => (id === '7' ? { id: 7, test_request: request, coupon_tests: [weldCoupon] } : null) });
const call = (key, params, body) => new Promise(resolve => {
  const res = { statusCode: 200, headers: {}, status(c) { this.statusCode = c; return this; }, setHeader(k, v) { this.headers[k] = v; },
    json(o) { resolve({ status: this.statusCode, body: o }); }, send(o) { resolve({ status: this.statusCode, body: o }); } };
  routes[key]({ params, body, query: {} }, res);
});
(async () => {
  let r = await call('PUT /api/work-orders/:id/coupon-labels/:rowNo', { id: '7', rowNo: '1' }, { label: { ...w, title: 'PT CUSTOM' } });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(JSON.parse(store['7|1'].label_data).title, 'PT CUSTOM');
  r = await call('PUT /api/work-orders/:id/coupon-labels/:rowNo', { id: '7', rowNo: '1' }, { label: null });
  assert.strictEqual(store['7|1'].label_data, null, 'null = kembali ke isi bawaan');
  assert.strictEqual((await call('PUT /api/work-orders/:id/coupon-labels/:rowNo', { id: '7', rowNo: '9' }, { label: w })).status, 404);
  r = await call('GET /work-orders/:id/coupon-labels', { id: '7' });
  assert.ok(r.body.includes('Label Coupon') && r.body.includes('SKK.11.7'));
  assert.strictEqual((await call('GET /work-orders/:id/coupon-labels', { id: '8' })).status, 404);
  console.log('COUPON LABELS OK');
})().catch(e => { console.error(e); process.exit(1); });
