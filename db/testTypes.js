// Order follows the DPI-LP-FR-24 Rev.4 form, plus client additions (2026-11): "Bending Material" and the former
// "Intergranular / Pitting Corrosion" split in two. The old combined name stays valid for existing requests.
const TEST_TYPES = [
  'Tensile Test',
  'Bend Root',
  'Bend Face',
  'Bend Side',
  'Bending Material',
  'Hardness Test',
  'Nick Break Test',
  'Charpy Impact Test',
  'Macro-etching & Examination',
  'Fillet Weld Break',
  'Flattening Test',
  'Chemical Composition Test',
  'Microstructure / Metallography',
  'Ferrite Point Count/ Ferrite Content',
  'Intergranular Corrosion',
  'Pitting Corrosion',
  'Through Thickness'
];

// Nama lama yang sudah tidak ada di daftar tetap; tetap tampil & tersimpan pada coupon yang sudah mencentangnya.
const LEGACY_TEST_TYPES = ['Intergranular / Pitting Corrosion'];

// Daftar Jenis Pengujian tetap untuk satu coupon: urutan TEST_TYPES (jenis yang belum ada di data lama = belum dicentang),
// ditambah nama lama yang dicentang.
function fixedTestNames(items) {
  const checked = new Set((items || []).filter(i => i.checked).map(i => i.test_name));
  return [...TEST_TYPES, ...LEGACY_TEST_TYPES.filter(n => checked.has(n))];
}

const FIXED_BY_KEY = () => new Map([...TEST_TYPES, ...LEGACY_TEST_TYPES].map(n => [n.toLowerCase(), n]));

// Other Test yang namanya sama dengan Jenis Pengujian tetap yang BELUM dicentang dipindah menjadi centang jenis itu
// (Qty & metode ikut). Dulu baris itu tersimpan sebagai item kembar lalu hilang saat Permintaan dimuat ulang.
function normalizeOtherTests(couponRows) {
  const fixed = FIXED_BY_KEY();
  (couponRows || []).forEach(row => {
    if (!row || !Array.isArray(row.other_tests)) return;
    row.test_items = Array.isArray(row.test_items) ? row.test_items : [];
    row.other_tests = row.other_tests.filter(ot => {
      const name = fixed.get(String((ot && ot.test_name) || '').trim().toLowerCase());
      if (!name) return true;
      let item = row.test_items.find(i => i && i.test_name === name);
      if (item && item.checked) return true;   // sudah dicentang: tetap sebagai Other Test, ditolak otherTestProblem
      if (!item) { item = { test_name: name }; row.test_items.push(item); }
      Object.assign(item, { checked: true, qty: ot.qty || item.qty || '', method: ot.method || item.method || '' });
      return false;
    });
  });
  return couponRows;
}

// Nama Other Test tidak boleh sama dengan Jenis Pengujian tetap yang sudah dicentang di coupon itu, atau dengan Other
// Test lain di coupon yang sama. Jenis yang sama kedua kalinya cukup diberi nama lain, mis. "Hardness Rockwell" ->
// tetap memakai form Hardness. Panggil normalizeOtherTests lebih dulu.
function otherTestProblem(couponRows) {
  const fixed = FIXED_BY_KEY();
  for (const [idx, row] of (couponRows || []).entries()) {
    const seen = new Set();
    for (const ot of (row && row.other_tests) || []) {
      const name = String((ot && ot.test_name) || '').trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (fixed.has(key)) return `Coupon Test #${idx + 1}: Other Test "${name}" sama dengan Jenis Pengujian "${fixed.get(key)}" yang sudah dicentang. Beri nama lain bila jenis ini diuji dua kali (mis. "${fixed.get(key).replace(/ Test$/, '')} Rockwell").`;
      if (seen.has(key)) return `Coupon Test #${idx + 1}: Other Test "${name}" ditulis dua kali. Beri nama berbeda untuk tiap pengujian.`;
      seen.add(key);
    }
  }
  return '';
}

module.exports = { TEST_TYPES, LEGACY_TEST_TYPES, fixedTestNames, normalizeOtherTests, otherTestProblem };
