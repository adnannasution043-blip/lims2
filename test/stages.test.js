// Urutan tahap Work Order: tahap tidak bisa dilompati, dan tanggal/status uji diambil dari Lembar Hasil Uji.
const assert = require('assert');
const { blockingStage, evalStage } = require('../lib/workOrderTasks');

const all = (v, extra = {}) => ({ receiving: v, preparation: v, testing: v, reporting: v, review: v, released: v, ...extra });

assert.strictEqual(blockingStage('receiving', all('pending')), null);
assert.strictEqual(blockingStage('testing', all('final', { preparation: 'draft' })).key, 'preparation');
assert.strictEqual(blockingStage('testing', all('final', { preparation: 'na' })), null);   // tidak ada sheet yang diperlukan
assert.strictEqual(blockingStage('review', all('final', { reporting: 'draft' })).key, 'reporting');
assert.strictEqual(blockingStage('review', all('pending')).key, 'receiving');            // tahap pertama yang belum selesai
assert.strictEqual(blockingStage('review', all('final')), null);

// Testing: Lembar Final -> Selesai + tanggal dari Lembar; Draft -> Sedang Diuji; tanpa Lembar -> isian tersimpan
const wo = {
  id: 1, coupon_tests: [{ row_no: 1, sample_marking: 'A.1', coupon_type: ['Plate'], test_items: [
    { test_name: 'Tensile Test', checked: true, qty: '2' }, { test_name: 'Bend Root', checked: true, qty: '2' }, { test_name: 'Hardness Test', checked: true, qty: '' }
  ], other_tests: [] }]
};
const task = { data: { items: { '1|Hardness Test': { status: 'na', tested_date: '2026-10-01' }, '1|Bend Root': { status: 'selesai', tested_date: '2026-01-01' } } } };
const ctx = {
  sheets: [], codes: {}, tasks: { testing: task }, statuses: {},
  testReports: [
    { id: 5, coupon_row_no: 1, test_name: 'Tensile Test', status: 'final', date_tested: '2026-10-20' },
    { id: 6, coupon_row_no: 1, test_name: 'Bend Root', status: 'draft', date_tested: '' }
  ]
};
const t = evalStage('testing', wo, task, ctx);
const by = Object.fromEntries(t.items.map(i => [i.test_name, i]));
assert.deepStrictEqual([by['Tensile Test'].status, by['Tensile Test'].tested_date, by['Tensile Test'].from_sheet], ['selesai', '2026-10-20', true]);
assert.deepStrictEqual([by['Bend Root'].status, by['Bend Root'].tested_date], ['proses', '2026-01-01']);   // Lembar draft; tanggal lama dipakai bila Lembar kosong
assert.deepStrictEqual([by['Hardness Test'].status, by['Hardness Test'].from_sheet], ['na', false]);
// Reporting membaca tanggal yang sama
const rep = evalStage('reporting', wo, null, ctx);
assert.strictEqual(rep.items.find(i => i.test_name === 'Tensile Test').tested_date, '2026-10-20');

// Root & Face Bend berbagi satu Lembar gabungan (disimpan sebagai 'Bend Root'): baris Face ikut status Lembar itu
const wo2 = { id: 2, coupon_tests: [{ row_no: 1, sample_marking: 'B.1', coupon_type: ['Plate'], test_items: [
  { test_name: 'Bend Root', checked: true, qty: '2' }, { test_name: 'Bend Face', checked: true, qty: '2' }], other_tests: [] }] };
const t2 = evalStage('testing', wo2, null, { sheets: [], codes: {}, tasks: {}, statuses: {},
  testReports: [{ id: 9, coupon_row_no: 1, test_name: 'Bend Root', status: 'final', date_tested: '2026-10-21' }] });
assert.deepStrictEqual(t2.items.map(i => [i.test_name, i.report_id, i.status, i.tested_date]),
  [['Bend Root', 9, 'selesai', '2026-10-21'], ['Bend Face', 9, 'selesai', '2026-10-21']]);

console.log('stages OK');
