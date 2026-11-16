// Cetak Work Order: Sample Identification tercentang dari jenis coupon, kolom Material Size memuat data coupon
// Permintaan Uji (ukuran, Heat No, las, WPS, PQR, Welder, Note), Remarks = metode tes (cadangan: Test Method di Lembar).
const assert = require('assert');
const { renderWorkOrderPrintHtml } = require('../lib/workOrderPrintView');

const coupon = {
  row_no: 1, coupon_type: ['Joint Plate', 'Round Bar'], coupon_type_other: '', ref_code: 'ASME Sec. IX : 2025',
  material_type_grade: 'AISI 4130', material_size: '22 mm Thickness', outside_diameter: '-', thickness: '-',
  heat_number: 'Aj123kj', welder_name: 'Faizal Rizky Januar', welding_process: 'SMAW', welding_position: '1G',
  no_wps: '005/WPS/PPDSI-2026', pqr_no: '005/PQR/PPDSI-2026', note: 'Rd-pe-2026', sample_marking: 'PDS.11.1',
  test_items: [
    { test_name: 'Tensile Test', checked: true, qty: '2', method: 'ASME Sec. IX QW-150' },
    { test_name: 'Hardness Test', checked: true, qty: '1', method: '' }
  ],
  other_tests: []
};
const html = renderWorkOrderPrintHtml({ test_request: { job_number: 'DE.1261368' }, coupon_tests: [coupon], report_methods: { '1|Hardness Test': 'ASTM E92-23' } });
const cell = cls => (html.match(new RegExp(`<td class="${cls}"[^>]*>([\\s\\S]*?)</td>`, 'g')) || []);

assert.ok(html.includes('&#9746; Joint Plate') && html.includes('&#9744; Joint Pipe'), 'Joint Plate dari daftar jenis coupon tercentang');
assert.ok(html.includes('Round Bar'), 'jenis coupon lain ditulis');
const size = cell('matsize-col')[0];
['22 mm Thickness', 'Heat No : Aj123kj', 'SMAW 1G', 'No. WPS : 005/WPS/PPDSI-2026', 'No. PQR : 005/PQR/PPDSI-2026', 'Welder : Faizal Rizky Januar', 'Rd-pe-2026']
  .forEach(t => assert.ok(size.includes(t), 'Material Size memuat ' + t));
assert.ok(!/OD\. - mm|Thickness - mm/.test(html), 'isian "-" tidak dicetak sebagai ukuran');
const remarks = cell('remarks-col');
assert.ok(remarks[0].includes('ASME Sec. IX QW-150'), 'Remarks = metode tes Permintaan Uji');
assert.ok(remarks[1].includes('ASTM E92-23'), 'metode kosong: Test Method dari Lembar Hasil Uji');

console.log('work-order-print.test.js OK');
