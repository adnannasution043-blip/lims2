// Dashboard manajemen: KPI periode vs periode sebelumnya, tren, status, TAT, klien teratas, Work Order terlama.
const assert = require('assert');
const { buildDashboard, monthKeys } = require('../lib/dashboard');

assert.deepStrictEqual(monthKeys('2026-02', 4), ['2025-11', '2025-12', '2026-01', '2026-02']);

const now = new Date('2026-10-22T03:00:00Z');   // 22 Okt 2026 10.00 WIB
const stages = (doneUntil) => ['receiving', 'preparation', 'testing', 'reporting', 'review'].map((key, i) => ({ key, label: key, status: i < doneUntil ? 'final' : 'pending' }));
const prog = (id, doneUntil) => ({ work_order_id: id, stages: stages(doneUntil), done_count: doneUntil, total: 5, current: { label: doneUntil < 5 ? ['Receiving', 'Preparation', 'Testing', 'Reporting', 'Review & Approval'][doneUntil] : 'Review & Approval', status: 'pending' } });

const data = {
  requests: [
    { id: 1, job_number: 'DE.1.26.0001', company: 'PT AAN', status: 'final', received_date: '2026-10-01' },
    { id: 2, job_number: 'DE.1.26.0002', company: 'PT AAN', status: 'final', received_date: '2026-09-10' },
    { id: 3, job_number: 'DE.1.26.0003', company: 'PT Radiant', status: 'final', received_date: '2026-10-05' },
    { id: 4, job_number: 'DE.1.26.0004', company: 'PT ALFA', status: 'draft', received_date: '', created_at: '2026-10-20T02:00:00Z' },
    { id: 5, job_number: 'DE.1.26.0005', company: 'PT Lama', status: 'final', received_date: '2026-04-10' },   // periode sebelumnya (3 bln)
    { id: 6, job_number: 'DE.1.26.0006', company: 'PT Tanpa WO', status: 'final', received_date: '2026-10-15' }
  ],
  workOrders: [
    { id: 11, test_request_id: 1, created_at: '2026-10-02T02:00:00Z', job_number: 'DE.1.26.0001', company: 'PT AAN', machining_status: 'selesai', machining_finished_at: '2026-10-03T02:00:00Z' },
    { id: 12, test_request_id: 2, created_at: '2026-09-11T02:00:00Z', job_number: 'DE.1.26.0002', company: 'PT AAN', machining_status: 'selesai', machining_finished_at: '2026-09-12T02:00:00Z' },
    { id: 13, test_request_id: 3, created_at: '2026-10-06T02:00:00Z', job_number: 'DE.1.26.0003', company: 'PT Radiant', machining_status: 'belum' }
  ],
  progress: [prog(11, 1), prog(12, 5), prog(13, 0)],
  testItems: [
    { test_request_id: 1, test_name: 'Tensile Test', qty: '2' }, { test_request_id: 1, test_name: 'Bend Root', qty: '2' },
    { test_request_id: 2, test_name: 'Tensile Test', qty: '3' }, { test_request_id: 3, test_name: 'Charpy Impact Test', qty: '9' }
  ],
  testReports: [
    { test_request_id: 2, status: 'final', date_tested: '2026-09-20', updated_at: '2026-09-20T05:00:00Z', n: 3 },
    { test_request_id: 5, status: 'final', date_tested: '2026-05-01', updated_at: '2026-05-01T05:00:00Z', n: 4 }
  ],
  sheets: [{ test_request_id: 2, status: 'final', created_at: '2026-09-13T02:00:00Z', updated_at: '2026-09-14T02:00:00Z' }],
  tasks: [
    { work_order_id: 11, task_key: 'receiving', status: 'final', updated_at: '2026-10-02T04:00:00Z' },
    { work_order_id: 12, task_key: 'receiving', status: 'final', updated_at: '2026-09-11T04:00:00Z' },
    { work_order_id: 12, task_key: 'reporting', status: 'final', customer_status: 'accepted' },
    { work_order_id: 12, task_key: 'review', status: 'final', approval_status: 'approved', approval_date: '2026-09-25', updated_at: '2026-09-25T04:00:00Z' },
    { work_order_id: 13, task_key: 'reporting', status: 'draft', customer_status: 'revision' }
  ],
  issuedCoupons: [{ work_order_id: 12, n: '2' }]
};

const d = buildDashboard(data, { months: 3, now });
assert.deepStrictEqual([d.period.from, d.period.to, d.period.prev_from, d.period.prev_to], ['2026-08', '2026-10', '2026-05', '2026-07']);
// KPI: Permintaan (Agu–Okt): 1,2,3,4(created_at),6 = 5; sebelumnya: 0 (Apr di luar Mei–Jul) -> perubahan null ("baru")
assert.strictEqual(d.kpi.requests.value, 5);
assert.strictEqual(d.kpi.requests.change, null);
assert.strictEqual(d.kpi.work_orders.value, 3);
assert.deepStrictEqual([d.kpi.specimens.value, d.kpi.specimens.prev, d.kpi.specimens.change], [3, 4, -25]);
assert.strictEqual(d.kpi.lhu.value, 2, 'LHU dihitung per coupon');
// Tindak lanjut (kondisi saat ini): req 5 & 6 Final tanpa WO, WO 11 machining selesai tanpa sheet, WO 13 customer minta revisi
assert.deepStrictEqual(d.follow_ups.map(f => f.kind).sort(), ['customer', 'specimen', 'wo', 'wo']);
assert.strictEqual(d.kpi.follow_up.value, 4);
// Tren
assert.deepStrictEqual(d.trend.map(t => [t.month, t.requests, t.lhu]), [['2026-08', 0, 0], ['2026-09', 1, 2], ['2026-10', 4, 0]]);
// Status WO: 12 selesai, 11 berjalan, 13 menunggu Receiving
assert.deepStrictEqual(d.wo_status, { running: 1, done: 1, waiting: 1 });
// Spesimen: 1 sheet final; masih menunggu: WO 11 (2 jenis, 0 sheet) + WO 13 (1 jenis) = 3
assert.deepStrictEqual(d.specimen_status, { final: 1, draft: 0, waiting: 3 });
// Jumlah pengujian per jenis (Qty)
assert.deepStrictEqual(d.tests_by_type.map(t => [t.label, t.value]), [['Charpy Impact Test', 9], ['Tensile Test', 5], ['Bend Root', 2]]);
// TAT: diterima 10 Sep, LHU 25 Sep -> 15 hari di bulan September
assert.deepStrictEqual(d.tat.months.map(m => m.days), [null, 15, null]);
assert.strictEqual(d.tat.target, 5);
// Klien teratas
assert.deepStrictEqual(d.top_clients.slice(0, 2).map(c => [c.label, c.value]), [['PT AAN', 2], ['PT ALFA', 1]]);
// Work Order terlama yang masih berjalan (12 sudah selesai, tidak ikut)
assert.deepStrictEqual(d.longest.map(l => [l.job_number, l.days]), [['DE.1.26.0001', 21], ['DE.1.26.0003', 17]]);
assert.strictEqual(d.longest[0].tests, 'Tensile Test, Bend Root');
// Aktivitas
const act = Object.fromEntries(d.activity.series.map(s => [s.key, s.values]));
assert.deepStrictEqual(act.receiving, [0, 1, 1]);
assert.deepStrictEqual(act.preparation, [0, 1, 1]);
assert.deepStrictEqual(act.lhu, [0, 2, 0]);
// periode tidak dikenal -> 12 bulan
assert.strictEqual(buildDashboard(data, { months: '7', now }).period.months, 12);

console.log('dashboard OK');
