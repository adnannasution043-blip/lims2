// Other Test di Permintaan Uji (permintaan klien 2026-11-19): semua jenis pengujian bisa dipilih / diketik di Other
// Test dan memakai form report jenisnya; nama yang sama dengan jenis tetap yang belum dicentang menjadi centang jenis
// itu; nama kembar ditolak dengan pesan yang jelas.
const assert = require('assert');
const { normalizeOtherTests, otherTestProblem, TEST_TYPES } = require('../db/testTypes');
const { templateOptions, canonicalTestName, withCanonicalCategory } = require('../lib/testReports');

// ---- nama bebas -> form report jenisnya ----
const cases = {
  'Hardness': 'Hardness Test', 'Hardness Rockwell': 'Hardness Test', 'Micro Vickers Hardness': 'Hardness Test', 'Uji Kekerasan': 'Hardness Test',
  'Tensile': 'Tensile Test', 'Uji Tarik': 'Tensile Test', 'Proof Load Test': 'Tensile Test',
  'Root Bend': 'Bend Root', 'Face Bend 2': 'Bend Face', 'Side Bend Test': 'Bend Side', 'Bending': 'Bending Material',
  'Impact Test -46C': 'Charpy Impact Test', 'Charpy': 'Charpy Impact Test',
  'Macro': 'Macro-etching & Examination', 'Micro': 'Microstructure / Metallography', 'Metallography': 'Microstructure / Metallography',
  'Chemical Analysis': 'Chemical Composition Test', 'Ferrite': 'Ferrite Point Count/ Ferrite Content',
  'Pitting': 'Pitting Corrosion', 'Intergranular A262': 'Intergranular Corrosion', 'Nick Break': 'Nick Break Test',
  'Fillet Weld Break 2': 'Fillet Weld Break', 'Flattening': 'Flattening Test', 'Through Thickness 2': 'Through Thickness',
  // nama Other Test yang sudah dikenali sebelumnya tidak berubah
  'Compression Test (ASTM E9)': 'Compression Test', 'SSCC PR test': 'SSCC Test', 'SCC test': 'SCC Test', 'HIC test': 'HIC Test',
  'Peel test': 'Peel Test', 'Grain size test': 'Grain Size Test', 'Salt spray test': 'Salt Spray Test', 'SEM-EDX examination': 'SEM-EDX Test',
  'Uji Geser Las': 'Geser Las Test', 'Flaring test': 'Flaring Test'
};
Object.entries(cases).forEach(([name, canon]) => {
  assert.strictEqual(canonicalTestName(name), canon, name);
  assert.ok(templateOptions(name).length > 0, name + ' punya form report');
  assert.deepStrictEqual(templateOptions(name), templateOptions(canon), name + ' memakai form ' + canon);
});
assert.ok(templateOptions('PMI').length > 0, 'PMI tetap dikenali');
assert.deepStrictEqual(templateOptions('Leak Test'), [], 'nama tanpa jenis dikenal: isian umum');
// jenis tetap tetap memakai formnya sendiri
TEST_TYPES.forEach(n => assert.ok(templateOptions(n).length > 0, n));

// ---- kategori (Pengecekan Spesimen / Lembar): nama bebas ikut kategori nama bakunya ----
const cat = withCanonicalCategory({ 'Tensile Test': 'tensile', 'Charpy Impact Test': 'charpy', 'Bend Root': 'bending', 'Bending Material': 'bending' });
assert.strictEqual(cat['Impact Test -46C'], 'charpy');
assert.strictEqual(cat['Uji Tarik'], 'tensile');
assert.strictEqual(cat['Root Bend'], 'bending');
assert.strictEqual(cat['Tensile Test'], 'tensile');
assert.strictEqual(cat['Hardness Rockwell'], undefined, 'Hardness: kategori umum');
assert.deepStrictEqual(Object.keys(cat).length, 4);

// ---- nama sama dengan jenis tetap ----
// belum dicentang -> pindah menjadi centang jenis itu (Qty & metode ikut); dulu baris itu hilang saat dimuat ulang
let rows = [{ test_items: [{ test_name: 'Hardness Test', checked: false, qty: '', method: '' }], other_tests: [{ test_name: ' hardness test ', qty: '2', method: 'ASTM E18' }, { test_name: 'Hardness Rockwell', qty: '1' }] }];
normalizeOtherTests(rows);
assert.deepStrictEqual(rows[0].test_items[0], { test_name: 'Hardness Test', checked: true, qty: '2', method: 'ASTM E18' });
assert.deepStrictEqual(rows[0].other_tests.map(o => o.test_name), ['Hardness Rockwell']);
assert.strictEqual(otherTestProblem(rows), '');
// jenis tetap yang tidak ada di daftar coupon lama ditambahkan sebagai centang
rows = [{ test_items: [], other_tests: [{ test_name: 'Through Thickness', qty: '3' }] }];
normalizeOtherTests(rows);
assert.deepStrictEqual(rows[0].test_items, [{ test_name: 'Through Thickness', checked: true, qty: '3', method: '' }]);
// sudah dicentang -> ditolak dengan saran nama lain
rows = [{ test_items: [{ test_name: 'Hardness Test', checked: true, qty: '1' }], other_tests: [{ test_name: 'Hardness Test', qty: '2' }] }];
normalizeOtherTests(rows);
assert.ok(/sudah dicentang.*Hardness Rockwell/.test(otherTestProblem(rows)));
// nama kembar di coupon yang sama ditolak; coupon berbeda boleh
assert.ok(/ditulis dua kali/.test(otherTestProblem([{ other_tests: [{ test_name: 'Hardness Rockwell' }, { test_name: 'hardness rockwell ' }] }])));
assert.strictEqual(otherTestProblem([{ other_tests: [{ test_name: 'Hardness Rockwell' }] }, { other_tests: [{ test_name: 'Hardness Rockwell' }] }]), '');
assert.strictEqual(otherTestProblem([{ other_tests: [{ test_name: '' }, { test_name: '' }] }]), '', 'baris kosong diabaikan');
assert.strictEqual(otherTestProblem(undefined), '');

console.log('other-tests.test.js OK');
