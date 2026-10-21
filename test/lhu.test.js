// Hasil & Laporan: satu LHU per coupon, terbit otomatis setelah Review & Approval disetujui (lib/lhuReports.js).
const assert = require('assert');
const { registerLhuReportRoutes, parseLhuId } = require('../lib/lhuReports');

assert.deepStrictEqual(parseLhuId('12-3'), { woId: 12, rowNo: 3 });
assert.deepStrictEqual(parseLhuId('12'), { woId: 12, rowNo: null });
assert.strictEqual(parseLhuId('12-x'), null);
assert.strictEqual(parseLhuId(''), null);

// ---- data tiruan: WO 1 terbit (2 coupon), WO 2 belum terbit ----
const state = {
  issued: new Set([1]),
  marks: [
    { work_order_id: 1, coupon_row_no: 1, report_no: 'DE.1/1026/0001', sample_marking: 'ABC.10.1' },
    { work_order_id: 1, coupon_row_no: 2, report_no: 'DE.1/1026/0002', sample_marking: 'ABC.10.2' },
    { work_order_id: 2, coupon_row_no: 1, report_no: 'DE.1/1026/0003', sample_marking: 'XYZ.10.1' }
  ],
  dist: [{ id: 1, work_order_id: 1, coupon_row_no: null, status: 'sent' }],
  reports: [{ id: 5, coupon_row_no: 1, status: 'final' }, { id: 6, coupon_row_no: 1, status: 'draft' }, { id: 7, coupon_row_no: 2, status: 'final' }],
  inserted: []
};
const pool = {
  async query(sql, p = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (/^SELECT DISTINCT wo\.id FROM work_orders wo/.test(q)) return { rows: [] };
    if (/^SELECT wo\.id AS work_order_id, wsm\.coupon_row_no/.test(q)) {
      assert.ok(/t\.task_key = 'review' AND t\.status = 'final' AND t\.approval_status = 'approved'/.test(q), 'hanya Work Order yang Review-nya disetujui');
      return { rows: state.marks.filter(m => state.issued.has(m.work_order_id)).map(m => ({ ...m, legacy_lhu_number: m.work_order_id === 1 ? 'LHU-26-00003' : null, job_number: 'DE.1.26.000' + m.work_order_id, company: 'PT A', project_name: 'P', lhu_issue_date: '2026-10-21', revision: '0', distribution_status: 'sent' })) };
    }
    if (/^SELECT wsm\.coupon_row_no FROM work_order_sample_marks wsm JOIN work_order_tasks t/.test(q)) {
      return { rows: state.issued.has(Number(p[0])) ? state.marks.filter(m => m.work_order_id === Number(p[0])).map(m => ({ coupon_row_no: m.coupon_row_no })) : [] };
    }
    if (/^SELECT \* FROM work_order_tasks/.test(q)) return { rows: [{ task_key: 'review', status: 'final', approval_status: 'approved', approval_date: '2026-10-21', approver_name: 'Fajar', updated_at: new Date() }] };
    if (/^SELECT status FROM test_reports WHERE test_request_id = \$1 AND coupon_row_no = \$2/.test(q)) return { rows: state.reports.filter(r => r.coupon_row_no === p[1]) };
    if (/^SELECT status, sent_date, method FROM lhu_distributions/.test(q)) return { rows: state.dist.filter(d => d.work_order_id === p[0] && (d.coupon_row_no === p[1] || d.coupon_row_no === null)).slice(-1) };
    if (/^SELECT MAX\(updated_at\)/.test(q)) return { rows: [{ t: null }] };
    if (/^SELECT COUNT\(\*\) AS n FROM lhu_revocations/.test(q)) return { rows: [{ n: '1' }] };
    if (/^INSERT INTO lhu_distributions/.test(q)) { state.inserted.push(p); return { rows: [{ id: 9, work_order_id: p[0] }] }; }
    if (/^SELECT id FROM test_reports WHERE test_request_id = \$1 AND coupon_row_no = \$2 AND status = 'final'/.test(q)) return { rows: state.reports.filter(r => r.coupon_row_no === p[1] && r.status === 'final').map(r => ({ id: r.id })) };
    if (/^SELECT id FROM test_reports WHERE test_request_id = \$1 AND coupon_row_no = \$2 ORDER BY/.test(q)) return { rows: state.reports.filter(r => r.coupon_row_no === p[1]).map(r => ({ id: r.id })) };
    throw new Error('query tidak dikenal: ' + q.slice(0, 120));
  }
};
const getFullWorkOrder = async id => (Number(id) === 1 ? {
  id: 1, test_request_id: 10, lhu_number: 'LHU-26-00003', test_request: { job_number: 'DE.1.26.0001', company: 'PT A' },
  coupon_tests: [
    { row_no: 1, coupon_type: ['Plate'], sample_marking: 'ABC.10.1', report_no: 'DE.1/1026/0001', test_items: [{ test_name: 'Tensile Test', checked: true, qty: '2' }], other_tests: [] },
    { row_no: 2, coupon_type: ['Pipe'], sample_marking: 'ABC.10.2', report_no: 'DE.1/1026/0002', test_items: [{ test_name: 'Bend Root', checked: true, qty: '2' }], other_tests: [] }
  ]
} : null);
const printed = [];
const printableReport = async id => { printed.push(id); return { id, template: 'tn-red', title: 'Tensile', test_request: { job_number: 'DE.1.26.0001' }, coupon: {}, rows: [], fields: {}, report_no: 'DE.1/1026/0001' }; };

const routes = {};
const app = { get: (p, ...h) => { routes['GET ' + p] = h[h.length - 1]; }, post: (p, ...h) => { routes['POST ' + p] = h[h.length - 1]; }, delete: (p, h) => { routes['DELETE ' + p] = h; } };
registerLhuReportRoutes(app, { pool, getFullWorkOrder, printableReport, rawBody: (q, s, n) => n() });
const call = (key, params, body) => new Promise(resolve => {
  const res = { code: 200, status(c) { this.code = c; return this; }, json(o) { resolve({ status: this.code, body: o }); }, send(o) { resolve({ status: this.code, body: o }); }, setHeader() {} };
  routes[key]({ params, body: body || {} }, res);
});

(async () => {
  // daftar: satu baris per coupon Work Order yang terbit, No. LHU = No. Laporan coupon
  let r = await call('GET /api/lhu-reports', {});
  assert.deepStrictEqual(r.body.items.map(i => [i.id, i.lhu_number, i.sample_marking, i.distribution_status]),
    [['1-1', 'DE.1/1026/0001', 'ABC.10.1', 'sent'], ['1-2', 'DE.1/1026/0002', 'ABC.10.2', 'sent']]);
  assert.strictEqual(r.body.items[0].legacy_lhu_number, 'LHU-26-00003');

  // detail per coupon; id lama tanpa coupon = coupon pertama; WO belum terbit / coupon asing = 404
  r = await call('GET /api/lhu-reports/:id', { id: '1-2' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.lhu_number, 'DE.1/1026/0002');
  assert.strictEqual(r.body.coupon.sample_marking, 'ABC.10.2');
  assert.strictEqual(r.body.final_check.coupons, 1);
  assert.strictEqual(r.body.final_check.result_sheets, 1);
  assert.strictEqual(r.body.lhu_issue_date, '2026-10-21');
  assert.strictEqual(r.body.revision, 1);
  assert.strictEqual((await call('GET /api/lhu-reports/:id', { id: '1' })).body.lhu_number, 'DE.1/1026/0001');
  assert.strictEqual((await call('GET /api/lhu-reports/:id', { id: '2-1' })).status, 404);
  assert.strictEqual((await call('GET /api/lhu-reports/:id', { id: '1-9' })).status, 404);

  // distribusi dicatat per coupon
  r = await call('POST /api/lhu-reports/:id/distributions', { id: '1-2' }, { status: 'sent', sent_date: '2026-10-22', method: 'Email', recipient: 'QC' });
  assert.strictEqual(r.status, 201);
  assert.deepStrictEqual(state.inserted[0].slice(0, 2), [1, 2]);
  assert.strictEqual((await call('POST /api/lhu-reports/:id/distributions', { id: '2-1' }, { sent_date: 'x', recipient: 'y' })).status, 404);

  // dokumen LHU: hanya Lembar Final coupon itu, digabung jadi satu
  r = await call('GET /lhu-reports/:id/print', { id: '1-1' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(printed, [5]);
  assert.ok(r.body.includes('Laporan Hasil Uji DE.1/1026/0001'));
  assert.ok(r.body.includes('1 of 1'));

  // Preliminary Report: semua Lembar coupon (termasuk Draft), tanpa logo & tanda tangan, dengan watermark
  printed.length = 0;
  r = await call('GET /work-orders/:id/preliminary/:rowNo', { id: '1', rowNo: '1' });
  assert.strictEqual(r.status, 200);
  assert.deepStrictEqual(printed, [5, 6]);
  assert.ok(r.body.includes('PRELIMINARY REPORT'));
  assert.ok(!r.body.includes('class="rt-img"'), 'logo DETECH & KAN tidak dicetak');
  assert.ok(!/Approved Signatory|Technical Manager|Pangestu/.test(r.body), 'blok tanda tangan approval kosong');
  const official = await call('GET /lhu-reports/:id/print', { id: '1-1' });
  assert.ok(official.body.includes('class="rt-img"') && official.body.includes('Approved Signatory') && !official.body.includes('PRELIMINARY'));
  assert.strictEqual((await call('GET /work-orders/:id/preliminary/:rowNo', { id: '1', rowNo: '7' })).status, 404);

  console.log('LHU OK');
})().catch(e => { console.error(e); process.exit(1); });
