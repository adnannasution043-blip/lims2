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

module.exports = { TEST_TYPES, LEGACY_TEST_TYPES, fixedTestNames };
