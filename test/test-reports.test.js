const assert = require('assert');
const ROOT = require('path').join(__dirname, '..') + '/';
const { registerTestReportRoutes, reportTitle } = require(ROOT + 'lib/testReports.js');
const { renderTestReportPrintHtml } = require(ROOT + 'lib/testReportPrintView.js');

const MAP = { 'Bend Root': 'bending', 'Bend Face': 'bending', 'Tensile Test': 'tensile', 'Charpy Impact Test': 'charpy', 'Nick Break Test': 'bending' };

// ---- Compression Test (tn-comp): nama bebas dari "Other Test" dikenali dari pola ----
{
  const { defaultTemplate, pickTemplate } = require(ROOT + 'lib/testReports.js');
  const { tnInfo, hasTemplate } = require(ROOT + 'lib/testReportTemplatePrint.js');
  ['SCC Test', 'SCC test', 'Stress Corrosion Cracking Test (SCC)', 'SCC', 'Stress Corrosion Cracking (ASTM G36)'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'scc', n));
  ['Sulfide Stress Corrosion Cracking Test (SSCC)', 'SSCC', 'SSCC FPB', 'SSCC four point bend'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'sscc-fpb', n));
  ['SSCC PR', 'SSCC proof ring (NACE TM0177)', 'Sulfide Stress Corrosion Cracking - Tensile/Proof Load Method'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'sscc-pr', n));
  ['HIC Test', 'HIC test', 'Hydrogen Induced Cracking (NACE TM0284)', 'HIC'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'hic', n));
  assert.strictEqual(defaultTemplate('Chicago Test', {}), null);
  ['Salt Spray Test', 'Salt spray test', 'Salt Fog (ASTM B117)'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'salt', n));
  ['SEM-EDX Test', 'SEM-EDX examination', 'EDX analysis'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'sem', n));
  ['Grain Size Test', 'Grain size test', 'Determination of the apparent grain size'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'grain', n));
  ['Peel Test', 'Peel test', 'peeling'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'peel', n));
  ['Geser Las Test', 'Uji Geser Las', 'geser-las'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'tn-geser', n));
  ['Flaring Test', 'Flaring test', 'flare test'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'flaring', n));
  ['Compression Test', 'Compression test (ASTM E9)', 'compression', 'Uji Tekan'].forEach(n => assert.strictEqual(defaultTemplate(n, {}), 'tn-comp', n));
  assert.strictEqual(defaultTemplate('Tensile Test', {}), 'tn-mat');
  assert.strictEqual(defaultTemplate('Decorative Test', {}), null);
  assert.ok(hasTemplate('tn-comp'));
  assert.deepStrictEqual(tnInfo('tn-comp').cols.map(c => c.key), ['dia', 'area', 'load', 'location', 'failure']);
  assert.strictEqual(tnInfo('tn-comp').cols[2].label, 'Maximum Load (N)');
  assert.strictEqual(tnInfo('tn-ttt').cols.find(c => c.key === 'load').label, 'Tensile load (N)');
  const html = renderTestReportPrintHtml({ test_request: { job_number: 'DE.1.26.0042' }, coupon: {}, report_no: 'R', test_name: 'Compression Test', template: 'tn-comp',
    rows: [{ marking_specimen: 'X-CP1', dia: '25.4', load: '310500' }, { marking_specimen: 'X-CP2', dia: '25.5', load: '312000' }] });
  ['X-CP1', 'X-CP2', '506.71', '510.7', 'DE.1/TR/16/PRESS'].forEach(t => assert.ok(html.includes(t), 'cetak memuat ' + t));
}

// ---- reportTitle ----
assert.strictEqual(reportTitle('bending', 'Bend Root'), 'Root Bend Test');
assert.strictEqual(reportTitle('bending', 'Unknown'), 'BENDING TEST (TRANSVERSE WELDING)');
assert.strictEqual(reportTitle('tensile', 'Tensile Test'), 'TENSILE TEST');
assert.strictEqual(reportTitle('general', 'Hardness Test'), 'HARDNESS TEST');

// ---- fake app/pool harness (sama gaya dengan test-routes.js sebelumnya) ----
const WO = {
  id: 1, test_request_id: 10, testing_pic: 'Budi',
  coupon_tests: [
    { row_no: 1, coupon_type: ['Plate'], material_type_grade: 'A36', material_size: '20x150', thickness: '12',
      welding_process: 'SMAW', welding_position: '3G', no_wps: 'WPS-1', ref_code: 'AWS D1.1', testing_purpose: 'Kualifikasi',
      test_items: [{ test_name: 'Bend Root', checked: true, qty: '3', method: 'ASTM E190' }, { test_name: 'Tensile Test', checked: true, qty: '2' }, { test_name: 'Charpy Impact Test', checked: true, qty: '5', method: 'ASTM E23' }, { test_name: 'Chemical Composition Test', checked: true, qty: '1' }, { test_name: 'Ferrite Point Count/ Ferrite Content', checked: true, qty: '1' }, { test_name: 'Fillet Weld Break', checked: true, qty: '2' }, { test_name: 'Flattening Test', checked: true, qty: '3' }, { test_name: 'Hardness Test', checked: true, qty: '1' }, { test_name: 'Intergranular / Pitting Corrosion', checked: true, qty: '1' }, { test_name: 'Macro-etching & Examination', checked: true, qty: '2' }, { test_name: 'Microstructure / Metallography', checked: true, qty: '2' }, { test_name: 'Nick Break Test', checked: true, qty: '2' }, { test_name: 'Through Thickness', checked: true, qty: '1' }],
      ref_code: 'AWS D1.1',
      charpy_temp: '-20', charpy_wm: '3', charpy_haz: '2',
      other_tests: [{ test_name: 'Compression Test (ASTM E9)', checked: true, qty: '2' }, { test_name: 'Flaring test', checked: true, qty: '3' }, { test_name: 'Uji Geser Las', checked: true, qty: '2' }, { test_name: 'Peel test', checked: true, qty: '2' }, { test_name: 'Grain size test', checked: true, qty: '1' }, { test_name: 'SEM-EDX examination', checked: true, qty: '2' }, { test_name: 'Salt spray test', checked: true, qty: '2' }, { test_name: 'HIC test', checked: true, qty: '3' }, { test_name: 'SCC test', checked: true, qty: '2' }, { test_name: 'SSCC FPB test', checked: true, qty: '3' }, { test_name: 'SSCC PR test', checked: true, qty: '2' }] }
  ,
    // Coupon 2: Root & Face Bend -> satu Lembar gabungan
    { row_no: 2, coupon_type: ['Plate'], material_type_grade: 'A36', thickness: '12', no_wps: 'WPS-2', ref_code: 'ASME IX',
      test_items: [{ test_name: 'Bend Root', checked: true, qty: '2' }, { test_name: 'Bend Face', checked: true, qty: '2' }], other_tests: [] }
  ]
};

let reports = [];
const photoStore = [];
// Pengecekan Spesimen per coupon+jenis pengujian; default Final supaya Lembar boleh dibuat
const inspections = { blockedTest: null, status: 'final' };
let seq = 0;
const calls = [];
const pool = {
  query: async (sql, params) => {
    calls.push(sql.trim().slice(0, 40));
    if (/FROM coupon_tests WHERE test_request_id = \$1 AND row_no = \$2/.test(sql) ) {
      const c = WO.coupon_tests.find(x => x.row_no === params[1]);
      return { rows: c ? [c] : [] };
    }
    if (/FROM test_requests WHERE id = \$1/.test(sql)) return { rows: [{ job_number: 'DE.1.26.0001', company: 'ABN', project_name: 'Skid', received_date: '2026-09-20', address: 'Jl. X', po_number: 'PO-1', on_behalf_owner: 'ABN' }] };
    if (/FROM test_items WHERE coupon_test_id/.test(sql)) return { rows: [{ method: 'ASTM E190' }] };
    if (/FROM work_orders WHERE test_request_id/.test(sql)) return { rows: [{ id: 1, testing_pic: 'Budi' }] };
    if (/FROM work_order_tasks WHERE work_order_id = \$1 AND task_key = 'review'/.test(sql)) return { rows: [{ approver_name: 'Citra', approver_signature: null, approval_status: 'approved' }] };
    if (/^INSERT INTO test_reports/.test(sql)) {
      const [test_request_id, coupon_row_no, test_name, category, rows_json, reference_code, testing_purpose, template] = params;
      let row = reports.find(r => r.test_request_id === test_request_id && r.coupon_row_no === coupon_row_no && r.test_name === test_name);
      if (!row) {
        row = { id: ++seq, test_request_id, coupon_row_no, test_name, category, report_no: '', date_tested: '', environment_temp: '', test_method: '', reference_code, testing_purpose,
          specimen_width_code: '', specimen_width_actual: '', former_diameter_code: '', former_diameter_actual: '',
          bend_angle_code: '', bend_angle_actual: '', shoulder_distance_code: '', shoulder_distance_actual: '',
          testing_machine: '', welder_name: '', witnessed_by: '', test_conducted_by: '', remarks: '',
          rows: JSON.parse(rows_json), template, pqr_no: '', heat_no: '', fields: {}, status: 'draft', created_at: new Date(), updated_at: new Date() };
        reports.push(row);
      }
      return { rows: [row] };
    }
    if (/^SELECT test_request_id, coupon_row_no, test_name FROM test_reports WHERE id/.test(sql)) {
      const row = reports.find(r => r.id === Number(params[0]));
      return { rows: row ? [row] : [] };
    }
    if (/^SELECT [\s\S]* FROM test_reports WHERE id/.test(sql)) {
      const row = reports.find(r => r.id === Number(params[0]));
      return { rows: row ? [row] : [] };
    }
    if (/^UPDATE test_reports SET/.test(sql)) {
      const row = reports.find(r => r.id === Number(params[params.length - 1]));
      if (!row) return { rows: [] };
      Object.assign(row, {
        report_no: params[0], date_tested: params[1], environment_temp: params[2], test_method: params[3], reference_code: params[4], testing_purpose: params[5],
        specimen_width_code: params[6], specimen_width_actual: params[7], former_diameter_code: params[8], former_diameter_actual: params[9],
        bend_angle_code: params[10], bend_angle_actual: params[11], shoulder_distance_code: params[12], shoulder_distance_actual: params[13],
        testing_machine: params[14], welder_name: params[15], witnessed_by: params[16], test_conducted_by: params[17], remarks: params[18],
        rows: JSON.parse(params[19]), status: params[20], template: params[21], pqr_no: params[22], heat_no: params[23], fields: JSON.parse(params[24])
      });
      return { rows: [row] };
    }
    const q = sql.trim();
    if (/test_report_files/.test(q)) {
      const F = global.__mfiles = global.__mfiles || [];
      if (/^SELECT id FROM test_reports WHERE id/.test(q)) return { rows: reports.filter(r => r.id === Number(params[0])).map(r => ({ id: r.id })) };
      if (/^SELECT COUNT/.test(q)) return { rows: [{ n: F.filter(f => f.test_report_id === Number(params[0])).length }] };
      if (/^INSERT INTO test_report_files/.test(q)) { const f = { id: F.length + 1, test_report_id: Number(params[0]), filename: params[1], mime_type: params[2], size_bytes: params[3], data: params[4], created_at: 'now' }; F.push(f); return { rows: [f] }; }
      if (/^SELECT id, test_report_id/.test(q)) return { rows: F.filter(f => f.test_report_id === Number(params[0])) };
      if (/^SELECT filename, mime_type, data/.test(q)) return { rows: F.filter(f => f.id === Number(params[0])) };
      if (/^DELETE FROM test_report_files/.test(q)) { const i = F.findIndex(f => f.id === Number(params[0])); if (i >= 0) F.splice(i, 1); return { rowCount: i >= 0 ? 1 : 0 }; }
    }
    if (/^SELECT report_no FROM work_order_sample_marks WHERE work_order_id/.test(q)) return { rows: [{ report_no: params[1] === 1 ? 'DE.1/1026/0001' : '' }] };
    if (/^SELECT id FROM test_reports WHERE test_request_id = [$]1 AND coupon_row_no/.test(q)) return { rows: reports.filter(r => r.coupon_row_no === params[1] && r.test_name === params[2]) };
    if (/^SELECT test_name, status FROM specimen_inspections WHERE test_request_id/.test(q)) {
      return { rows: params[2].flatMap(n => (n === inspections.blockedTest ? (inspections.status ? [{ test_name: n, status: inspections.status }] : []) : [{ test_name: n, status: 'final' }])) };
    }
    if (/^SELECT ti[.]test_name FROM test_items ti JOIN coupon_tests ct/.test(q)) {
      const cp = WO.coupon_tests.find(c => c.row_no === params[1]);
      return { rows: (cp ? cp.test_items : []).filter(t => t.checked && params[2].includes(t.test_name)).map(t => ({ test_name: t.test_name })) };
    }
    if (/^SELECT test_name FROM test_reports WHERE test_request_id = [$]1 AND coupon_row_no = [$]2 AND test_name = ANY/.test(q)) {
      return { rows: reports.filter(r => r.coupon_row_no === params[1] && params[2].includes(r.test_name)).map(r => ({ test_name: r.test_name })) };
    }
    if (/^SELECT COUNT[(][*][)] AS n FROM test_report_photos/.test(q)) return { rows: [{ n: photoStore.filter(p => p.id === Number(params[0])).length }] };
    if (/^SELECT slot FROM test_report_photos/.test(q)) return { rows: photoStore.filter(p => p.id === Number(params[0])).map(p => ({ slot: p.slot })) };
    if (/^SELECT slot, mime_type, data FROM test_report_photos/.test(q)) return { rows: photoStore.filter(p => p.id === Number(params[0])) };
    if (/^SELECT mime_type, data FROM test_report_photos/.test(q)) return { rows: photoStore.filter(p => p.id === Number(params[0]) && p.slot === params[1]) };
    if (/^SELECT id, test_name FROM test_reports/.test(q)) { const row = reports.find(r => r.id === Number(params[0])); return { rows: row ? [row] : [] }; }
    if (/^INSERT INTO test_report_photos/.test(q)) { const i = photoStore.findIndex(p => p.id === Number(params[0]) && p.slot === params[1]); const e = { id: Number(params[0]), slot: params[1], mime_type: params[2], data: params[3] }; if (i >= 0) photoStore[i] = e; else photoStore.push(e); return { rows: [] }; }
    if (/^DELETE FROM test_report_photos/.test(q)) { const i = photoStore.findIndex(p => p.id === Number(params[0]) && p.slot === params[1]); if (i >= 0) photoStore.splice(i, 1); return { rows: [] }; }
    if (/^DELETE FROM test_reports/.test(sql)) {
      const before = reports.length;
      reports = reports.filter(r => r.id !== Number(params[0]));
      return { rowCount: before - reports.length };
    }
    throw new Error('unexpected sql: ' + sql.slice(0, 90));
  }
};

const routes = {};
const app = {
  get: (p, h) => { routes['GET ' + p] = h; },
  post: (p, ...h) => { routes['POST ' + p] = h[h.length - 1]; },
  put: (p, h) => { routes['PUT ' + p] = h; },
  delete: (p, h) => { routes['DELETE ' + p] = h; }
};
const computeMarkingInfo = async (reqId, testName, couponRowNo) => {
  const cp = WO.coupon_tests.find(c => c.row_no === couponRowNo);
  const item = cp.test_items.concat(cp.other_tests).find(t => t.test_name === testName);
  const qty = parseInt(item.qty, 10) || 0;
  const code = /Compression/.test(testName) ? 'CP' : /Flaring/.test(testName) ? 'FL' : /Geser/.test(testName) ? 'GL' : /Peel/i.test(testName) ? 'PL' : /Grain/i.test(testName) ? 'GS' : /EDX/i.test(testName) ? 'SE' : /Salt/i.test(testName) ? 'SP' : /HIC/i.test(testName) ? 'HC' : /SSCC/i.test(testName) ? 'SS' : /SCC/i.test(testName) ? 'SC' : testName === 'Bend Root' ? 'BR' : testName === 'Bend Face' ? 'BF' : (testName === 'Charpy Impact Test' ? 'CH' : 'TS');
  return { sample_marking: 'ABN.9.1', code, qty, markings: Array.from({ length: qty }, (_, i) => `ABN.9.1-${code}${i + 1}`) };
};

registerTestReportRoutes(app, {
  pool, TEST_NAME_TO_CATEGORY: MAP, computeMarkingInfo,
  getFullWorkOrder: async id => (String(id) === '1' ? JSON.parse(JSON.stringify(WO)) : null),
  signatureToDataUrl: b => (b ? 'data:image/png;base64,X' : null),
  rawBody: (req, res, next) => next()
});

function call(method, path, params, body) {
  return new Promise(resolve => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); }, setHeader() {}, send(o) { resolve({ status: this.statusCode, body: o }); } };
    routes[`${method} ${path}`]({ params, body }, res);
  });
}

(async () => {
  // tidak melompati tahap: Lembar baru ditolak bila Pengecekan Spesimen-nya belum Final / belum dibuat
  inspections.blockedTest = 'Bend Root'; inspections.status = 'draft';
  let r0 = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Bend Root' });
  assert.strictEqual(r0.status, 400);
  assert.strictEqual(r0.body.code, 'STAGE_ORDER');
  assert.ok(/belum Final/.test(r0.body.error));
  inspections.status = null;
  r0 = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Bend Root' });
  assert.ok(/belum dibuat/.test(r0.body.error));
  inspections.blockedTest = null;
  assert.strictEqual(reports.length, 0);

  // buat sheet bending -> rows terisi otomatis ABN.9.1-BR1..3
  let r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Bend Root' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.category, 'bending');
  assert.deepStrictEqual(r.body.rows.map(x => x.marking_specimen), ['ABN.9.1-BR1', 'ABN.9.1-BR2', 'ABN.9.1-BR3']);
  assert.strictEqual(r.body.rows[0].observation, 'No Open Discontinuity was Observed');
  assert.strictEqual(r.body.title, 'Root Bend Test');
  assert.strictEqual(r.body.report_no, 'DE.1/1026/0001');   // No. Laporan otomatis dari coupon
  assert.strictEqual(r.body.testing_pic, 'Budi');
  assert.strictEqual(r.body.approved_signatory.name, 'Citra');
  const id = r.body.id;

  // template default: coupon punya WPS -> Weld; ubah ke Material lewat PUT; nilai asing ditolak
  assert.strictEqual(r.body.template, 'bend-sec');
  assert.strictEqual(r.body.template_options.length, 2);

  // idempoten: POST kedua mengembalikan sheet yang sama (bukan duplikat)
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Bend Root' });
  assert.strictEqual(r.body.id, id);
  assert.strictEqual(reports.length, 1);

  // tolak jenis pengujian yang tidak dicentang pada coupon itu
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Fatigue Test' });
  assert.strictEqual(r.status, 400);
  assert.ok(r.body.error.includes('tidak dipilih'));

  // GET detail
  r = await call('GET', '/api/test-reports/:id', { id: String(id) });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.sample_marking, 'ABN.9.1');
  assert.strictEqual(r.body.qty, 3);

  // Finalisasi ditolak bila data belum lengkap (tanggal uji, penguji, Result tiap spesimen)
  r = await call('PUT', '/api/test-reports/:id', { id: String(id) }, { status: 'final', rows: [] });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.body.code, 'INCOMPLETE');
  assert.ok(r.body.problems.some(p => /Date of Tested/.test(p)));
  assert.ok(r.body.problems.some(p => /Belum ada data hasil/.test(p)));
  r = await call('PUT', '/api/test-reports/:id', { id: String(id) }, {
    date_tested: '2026-09-25', test_conducted_by: 'Budi', status: 'final',
    rows: [{ marking_specimen: 'ABN.9.1-BR1', observation: 'OK', result: 'accepted' }, { marking_specimen: 'ABN.9.1-BR2', result: 'zzz' }]
  });
  assert.strictEqual(r.status, 400);
  assert.deepStrictEqual(r.body.problems, ['Spesimen ABN.9.1-BR2: Result belum dipilih']);   // enum tidak valid dihitung kosong
  assert.strictEqual(reports[0].status, 'draft');

  // PUT: field bend + rows tersanitasi, kunci asing pada rows diabaikan
  r = await call('PUT', '/api/test-reports/:id', { id: String(id) }, {
    report_no: 'RPT-1', date_tested: '2026-09-25', bend_angle_actual: '181', specimen_width_actual: '20.1',
    testing_machine: 'Hydraulic Press 400 Bar', welder_name: 'Joko', witnessed_by: 'PT Y', test_conducted_by: 'Budi',
    remarks: 'ok', status: 'draft',
    rows: [{ marking_specimen: 'ABN.9.1-BR1', observation: 'OK', result: 'accepted', evil: '<script>' }, { marking_specimen: 'ABN.9.1-BR2', result: 'zzz' }]
  });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.status, 'draft');
  assert.strictEqual(r.body.rows.length, 2);
  assert.strictEqual(r.body.rows[0].result, 'accepted');
  assert.strictEqual(r.body.rows[1].result, '');       // enum tidak valid -> dikosongkan
  assert.ok(!('evil' in r.body.rows[0]));

  r = await call('PUT', '/api/test-reports/:id', { id: String(id) }, { template: 'bend-mat', heat_no: 'H-9', pqr_no: 'PQR-2', rows: [{ marking_specimen: 'ABN.9.1-BR1', observation: 'No Crack was Observed', result: 'accepted' }], status: 'draft' });
  assert.strictEqual(r.body.template, 'bend-mat');
  assert.strictEqual(r.body.heat_no, 'H-9');
  r = await call('PUT', '/api/test-reports/:id', { id: String(id) }, { template: 'tensile-x', rows: [], status: 'draft' });
  assert.strictEqual(r.body.template, 'bend-sec');   // tidak valid -> default dari coupon (punya WPS)

  // PUT dengan rows kosong -> fallback ke markings otomatis (bukan sheet kosong)
  r = await call('PUT', '/api/test-reports/:id', { id: String(id) }, { rows: [], status: 'draft' });
  assert.deepStrictEqual(r.body.rows.map(x => x.marking_specimen), ['ABN.9.1-BR1', 'ABN.9.1-BR2', 'ABN.9.1-BR3']);

  // cetak: render tanpa error, judul & form no bending muncul
  const printCalls = [];
  const printRoute = routes['GET /test-reports/:id/print'];
  await new Promise(resolve => {
    const res = { statusCode: 200, setHeader() {}, send(html) { printCalls.push(html); resolve(); } };
    printRoute({ params: { id: String(id) } }, res);
  });
  assert.ok(printCalls[0].includes('Root Bend Test'));
  assert.ok(printCalls[0].includes('DE.1/TR/02/BEND.SEC'));
  assert.ok(printCalls[0].includes('Type of Bend: Root Bend Test'));
  assert.ok(printCalls[0].includes('class="rt pg0"'));
  assert.ok(printCalls[0].includes('ABN.9.1-BR1'));

  // kategori umum: form no menandakan belum ada form resmi, tanpa blok dimensi bend
  const generalHtml = renderTestReportPrintHtml({
    category: 'general', title: 'HARDNESS TEST', test_request: { job_number: 'X' }, coupon: {}, rows: [{ marking_specimen: 'X-HD1', observation: '-', result: '' }]
  });
  assert.ok(generalHtml.includes('belum ada form resmi'));
  assert.ok(!generalHtml.includes('Dimensi Pengujian Bend'));

  // ---- Charpy ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Charpy Impact Test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'charpy-weld');
  assert.strictEqual(r.body.template_options.length, 3);
  assert.deepStrictEqual(r.body.rows.map(x => x.notch_position), ['Weld Center Line', 'Weld Center Line', 'Weld Center Line', 'HAZ', 'HAZ']);  // dari jumlah WM/HAZ coupon
  assert.strictEqual(r.body.fields.test_temp, '-20');
  assert.strictEqual(r.body.fields.orientation, 'Transversal');
  const cid = r.body.id;
  r = await call('PUT', '/api/test-reports/:id', { id: String(cid) }, {
    template: 'charpy-mat', fields: { test_temp: '-40', orientation: 'Longitudinal', evil: 'x' }, status: 'draft',
    rows: [{ marking_specimen: 'ABN.9.1-CH1', notch_position: 'Base Metal', impact: '100', lateral: '1.0', remarks: '', evil: 1 }, { marking_specimen: 'ABN.9.1-CH2', notch_position: 'Base Metal', impact: '110', lateral: '1.2' }]
  });
  assert.strictEqual(r.body.template, 'charpy-mat');
  assert.strictEqual(r.body.fields.test_temp, '-40');
  assert.ok(!('evil' in r.body.fields) && !('evil' in r.body.rows[0]));
  const chHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(cid) } }, { setHeader() {}, send: resolve }));
  assert.ok(chHtml.includes('-40') && chHtml.includes('Longitudinal') && chHtml.includes('>105<'));   // Average 100 & 110
  assert.ok(chHtml.includes('DE.1/TR/06/CHARPY/MAT'));
  // rows kosong -> fallback ke default charpy (bukan observation/result)
  r = await call('PUT', '/api/test-reports/:id', { id: String(cid) }, { template: 'charpy-weld', rows: [], status: 'draft' });
  assert.strictEqual(r.body.rows.length, 5);
  assert.ok('notch_position' in r.body.rows[0] && !('observation' in r.body.rows[0]));

  // ---- Chemical ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Chemical Composition Test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'chem-weld-cs');     // coupon punya WPS, A36 -> carbon steel weld
  assert.strictEqual(r.body.template_options.length, 13);
  assert.ok(r.body.template_elements['chem-mat-ti'].includes('Ti'));
  assert.ok(!r.body.template_elements['chem-weld-cs'].includes('O'));
  const kid = r.body.id;
  r = await call('PUT', '/api/test-reports/:id', { id: String(kid) }, { template: 'chem-mat-ss', fields: { elements: { C: '0.03', Cr: '17.9', Ni: '', evil: { x: 1 } } }, status: 'draft' });
  assert.strictEqual(r.body.template, 'chem-mat-ss');
  assert.deepStrictEqual(Object.keys(r.body.fields.elements).sort(), ['C', 'Cr']);   // kosong & non-string dibuang
  const chemHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(kid) } }, { setHeader() {}, send: resolve }));
  assert.ok(chemHtml.includes('>17.9<') && chemHtml.includes('DE.1/TR/15/CHEM/MAT'));
  r = await call('PUT', '/api/test-reports/:id', { id: String(kid) }, { template: 'nope', status: 'draft' });
  assert.strictEqual(r.body.template, 'chem-weld-cs');

  // ---- Ferrite ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Ferrite Point Count/ Ferrite Content' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'ferrite-weld');
  assert.deepStrictEqual(r.body.template_locations['ferrite-weld'], ['Base Metal', 'HAZ', 'Weld Metal']);
  assert.deepStrictEqual(r.body.template_locations['ferrite-mat'], ['Base Metal']);
  assert.strictEqual(r.body.fields.sample_id, 'ABN.9.1-TS1');   // dari Marking Specimen pertama
  const fid = r.body.id;
  const pi = Array.from({ length: 30 }, (_, i) => String(4 + (i % 3)));   // 4,5,6 ...
  r = await call('PUT', '/api/test-reports/:id', { id: String(fid) }, { fields: { sample_id: 'FC-1', ferrite: { 'Base Metal': { n: '30', pt: '16', pi }, 'Bogus': { n: '1' }, 'HAZ': 'x' } }, status: 'draft' });
  assert.deepStrictEqual(Object.keys(r.body.fields.ferrite), ['Base Metal']);
  assert.strictEqual(r.body.fields.ferrite['Base Metal'].pi.length, 30);
  const ferHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(fid) } }, { setHeader() {}, send: resolve }));
  // Pi 4,5,6 berulang -> rata-rata (Pi/16*100) = 31.25 ; 4 halaman (utama + 3 lampiran) ; halaman 'x of 4'
  assert.ok(ferHtml.includes('>31.25<'), 'mean 31.25');
  assert.strictEqual((ferHtml.match(/class="paper"/g) || []).length, 4);
  assert.ok(ferHtml.includes('1 of 4') && ferHtml.includes('4 of 4'));
  r = await call('PUT', '/api/test-reports/:id', { id: String(fid) }, { template: 'ferrite-mat', fields: { ferrite: { 'Base Metal': { n: '30', pt: '16', pi } } }, status: 'draft' });
  const matHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(fid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual((matHtml.match(/class="paper"/g) || []).length, 2);

  // ---- Fillet Weld Break ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Fillet Weld Break' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'fwb-aws-d11');
  assert.strictEqual(r.body.template_options.length, 4);
  assert.deepStrictEqual(Object.keys(r.body.template_fwb), ['fwb-aws-d11', 'fwb-aws-d12', 'fwb-asme-plate', 'fwb-asme-pipe']);
  assert.strictEqual(r.body.template_fwb['fwb-aws-d12'].length, 3);
  assert.strictEqual(r.body.rows.length, 2);
  assert.deepStrictEqual(Object.keys(r.body.rows[0]).sort(), ['marking_specimen', 'remarks', 'result']);
  const wid = r.body.id;
  r = await call('PUT', '/api/test-reports/:id', { id: String(wid) }, { template: 'fwb-asme-pipe', status: 'draft',
    rows: [{ marking_specimen: 'ABN.9.1-TS1', remarks: ['ok 1', null, 'x'], result: 'accepted', evil: 1 }, { marking_specimen: 'ABN.9.1-TS2', result: 'rejected' }] });
  assert.strictEqual(r.body.template, 'fwb-asme-pipe');
  assert.strictEqual(r.body.rows[0].remarks[1], '');
  assert.ok(!('evil' in r.body.rows[0]));
  const fwbHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(wid) } }, { setHeader() {}, send: resolve }));
  assert.ok(fwbHtml.includes('>ok 1<') && fwbHtml.includes('>Rejected<') && fwbHtml.includes('Plate to Pipe') === false);
  assert.strictEqual((fwbHtml.match(/ABN[.]9[.]1-TS[12]/g) || []).length, 2);
  assert.ok(fwbHtml.includes('No inclusion or porosity'));   // remarks kosong -> teks bawaan form
  r = await call('PUT', '/api/test-reports/:id', { id: String(wid) }, { template: 'fwb-aws-d11', rows: [], status: 'draft' });
  assert.strictEqual(r.body.rows.length, 2);   // fallback ke default (satu per Marking Specimen)

  // ---- Flattening ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Flattening Test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'flat');
  assert.strictEqual(r.body.rows.length, 3);
  assert.deepStrictEqual(Object.keys(r.body.rows[0]).sort(), ['e', 'first', 'h', 'length', 'marking_specimen', 'od', 'second', 'wt']);
  const flid = r.body.id;
  r = await call('PUT', '/api/test-reports/:id', { id: String(flid) }, { status: 'draft', rows: [
    { marking_specimen: 'ABN.9.1-TS1', od: '168.3', wt: '7.11', e: '0.08', length: '63.5', first: 'OK', second: 'OK', evil: 1 },
    { marking_specimen: 'ABN.9.1-TS2', od: '168.3', wt: '7.11', e: '0.08', h: '50' },
    { marking_specimen: 'ABN.9.1-TS3', od: '', wt: '7', e: '0.07' }] });
  assert.ok(!('evil' in r.body.rows[0]));
  const flHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(flid) } }, { setHeader() {}, send: resolve }));
  assert.ok(flHtml.includes('>62.81<'), 'H dihitung dari (1+e)t/(e+t/D)');
  assert.ok(flHtml.includes('>50<'), 'H manual menimpa');
  assert.strictEqual((flHtml.match(/class="paper"/g) || []).length, 2);   // 3 spesimen -> 2 halaman (2 + 1)
  assert.ok(flHtml.includes('1 of 2') && flHtml.includes('2 of 2'));

  // ---- Hardness ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Hardness Test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'hard-weld');
  assert.deepStrictEqual(r.body.template_hard, { 'hard-weld': { lines: 2, points: 9 }, 'hard-mat': { lines: 1, points: 5 } });
  assert.strictEqual(r.body.fields.spec, 'A36');   // default dari Material Type/Grade coupon
  const hid = r.body.id;
  const png = 'data:image/png;base64,iVBORw0KGgo=';
  r = await call('PUT', '/api/test-reports/:id', { id: String(hid) }, { template: 'hard-mat', status: 'draft', fields: {
    spec: 'ASTM A36', hardness: { lines: [['172', '175', null, '168', '174', 'x'.repeat(40)], ['9']] }, sketch: png, evil: 1 } });
  assert.strictEqual(r.body.template, 'hard-mat');
  assert.strictEqual(r.body.fields.hardness.lines[0][2], '');
  assert.strictEqual(r.body.fields.hardness.lines[0][5].length, 12);
  assert.strictEqual(r.body.fields.sketch, png);
  assert.ok(!('evil' in r.body.fields));
  const hardHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(hid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual((hardHtml.match(/class="paper"/g) || []).length, 2);   // Sketch Hardness + hasil
  assert.ok(hardHtml.includes('>172<') && hardHtml.includes('ASTM A36') && hardHtml.includes(png));
  assert.ok(hardHtml.includes('1 of 2') && hardHtml.includes('2 of 2'));
  r = await call('PUT', '/api/test-reports/:id', { id: String(hid) }, { template: 'hard-weld', status: 'draft', fields: { sketch: 'javascript:alert(1)' } });
  assert.ok(!('sketch' in r.body.fields), 'sketch bukan data:image ditolak');

  // ---- Corrosion ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Intergranular / Pitting Corrosion' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'corr-pit-weld');   // coupon punya WPS, ref 'AWS D1.1' -> pitting Weld
  assert.strictEqual(r.body.template_options.length, 6);
  assert.deepStrictEqual(Object.keys(r.body.template_corr), ['corr-pit-weld', 'corr-pit-mat', 'corr-b-weld', 'corr-c-weld', 'corr-e-mat', 'corr-g28']);
  assert.strictEqual(r.body.template_corr['corr-c-weld'].periods, 3);
  assert.strictEqual(r.body.template_corr['corr-pit-mat'].photos.reduce((n, p) => n + p.slots.length, 0), 12);
  assert.strictEqual(r.body.fields.corr.sample_id, 'ABN.9.1-TS1');
  const cid2 = r.body.id;
  const w = (a, d) => [0, 1, 2, 3, 4].map(i => (a + i * d).toFixed(4));
  r = await call('PUT', '/api/test-reports/:id', { id: String(cid2) }, { status: 'draft', fields: { corr: { hours: '72', volume: '600', l: '50', w: '25', t: '3', before: w(33.7589, -0.0001), after: w(33.7578, 0.0001), sample_id: 'PT-1', summary: '', evil: 1 } } });
  assert.strictEqual(r.body.fields.corr.hours, '72');
  assert.ok(!('evil' in r.body.fields.corr));
  assert.strictEqual(r.body.fields.corr.before.length, 5);
  let corrHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(cid2) } }, { setHeader() {}, send: resolve }));
  assert.ok(corrHtml.includes('>33.7587<') && corrHtml.includes('>33.758<'), 'rata-rata sebelum/sesudah');
  assert.ok(corrHtml.includes('>0.00295<'), 'luas dari L W T (m2)');
  assert.ok(corrHtml.includes('>0.0007<'), 'weight loss');
  assert.strictEqual((corrHtml.match(/class="paper"/g) || []).length, 3);   // utama + 2 halaman foto

  // foto: unggah, daftar, tampil di cetak, hapus; slot asing & format salah ditolak
  const png1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const upload = (slot, mime, body) => new Promise(resolve => routes['POST /api/test-reports/:id/photos']({ params: { id: String(cid2) }, query: { slot }, headers: { 'content-type': mime }, body }, { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } }));
  assert.strictEqual((await upload('corr-pit-weld-ph1/s1', 'image/png', png1)).status, 201);
  assert.strictEqual((await upload('corr-pit-weld-ph1/s1', 'image/png', png1)).status, 201);   // timpa
  assert.strictEqual((await upload('corr-pit-weld-ph2/s6', 'image/png', png1)).status, 201);
  assert.strictEqual((await upload('corr-e-mat/s1', 'image/png', png1)).status, 201);          // slot form lain dari jenis yang sama, valid
  assert.strictEqual((await upload('hard-weld/s1', 'image/png', png1)).status, 400);            // bukan slot jenis ini
  assert.strictEqual((await upload('../x/s1', 'image/png', png1)).status, 400);
  assert.strictEqual((await upload('corr-pit-weld-ph1/s2', 'text/html', Buffer.from('<b>'))).status, 400);
  assert.strictEqual(photoStore.length, 3);
  r = await call('GET', '/api/test-reports/:id', { id: String(cid2) });
  assert.deepStrictEqual(r.body.photos.slice().sort(), ['corr-e-mat/s1', 'corr-pit-weld-ph1/s1', 'corr-pit-weld-ph2/s6']);
  corrHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(cid2) } }, { setHeader() {}, send: resolve }));
  assert.ok(corrHtml.includes('data:image/png;base64,iVBORw0KGgo'), 'foto tampil di halaman foto');
  await new Promise(resolve => routes['DELETE /api/test-reports/:id/photo']({ params: { id: String(cid2) }, query: { slot: 'corr-e-mat/s1' } }, { json: resolve }));
  assert.strictEqual(photoStore.length, 2);

  // template lain: C (3 halaman), E (1), G28 (3), B (2)
  const pagesOf = async (tpl, corr) => {
    await call('PUT', '/api/test-reports/:id', { id: String(cid2) }, { template: tpl, status: 'draft', fields: { corr } });
    const h = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(cid2) } }, { setHeader() {}, send: resolve }));
    return (h.match(/class="paper"/g) || []).length;
  };
  assert.strictEqual(await pagesOf('corr-c-weld', { hours: '48', area: '0.003', periods: [{ before: w(32, 0), after: w(31, 0) }, { before: w(31, 0), after: w(30, 0) }, { before: w(30, 0), after: w(29, 0) }] }), 3);
  assert.strictEqual(await pagesOf('corr-e-mat', { hours: '15' }), 1);
  assert.strictEqual(await pagesOf('corr-g28', { hours: '120', area: '20.11', before: w(33.7589, 0), after: w(33.7578, 0) }), 3);
  assert.strictEqual(await pagesOf('corr-b-weld', {}), 2);
  assert.strictEqual(await pagesOf('corr-pit-mat', {}), 3);   // tanpa isian: tetap tercetak (tanpa angka)

  // ---- Macro-Etching ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Macro-etching & Examination' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'macro-butt');       // coupon las, bukan fillet
  assert.deepStrictEqual(r.body.template_options.map(o => o.key), ['macro-butt', 'macro-fillet', 'macro-mat']);
  assert.strictEqual(r.body.template_macro['macro-fillet'].kv.length, 3);
  assert.strictEqual(r.body.rows.length, 2);
  assert.deepStrictEqual(Object.keys(r.body.rows[0]).sort(), ['marking_specimen', 'mag', 'result', 'thickness', 'width'].sort());
  const mid = r.body.id;
  r = await call('PUT', '/api/test-reports/:id', { id: String(mid) }, { template: 'macro-fillet', status: 'draft', rows: [
    { marking_specimen: 'ABN.9.1-TS1', thickness: '12', width: '25', mag: '', result: 'accepted', size_x: '6', size_y: '5', evil: 1 },
    { marking_specimen: 'ABN.9.1-TS2', thickness: '12', width: '25', mag: '5X', result: 'Rejected' }] });
  assert.strictEqual(r.body.template, 'macro-fillet');
  assert.ok(!('evil' in r.body.rows[0]) && r.body.rows[0].size_x === '6');
  const png2 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const upMacro = slot => new Promise(resolve => routes['POST /api/test-reports/:id/photos']({ params: { id: String(mid) }, query: { slot }, headers: { 'content-type': 'image/png' }, body: png2 }, { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } }));
  assert.strictEqual((await upMacro('macro-fillet/s1')).status, 201);
  assert.strictEqual((await upMacro('macro-fillet/s2')).status, 201);
  assert.strictEqual((await upMacro('macro-fillet/s21')).status, 400);   // di atas batas 20 foto
  let macroHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(mid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual((macroHtml.match(/class="paper"/g) || []).length, 2);      // satu halaman per spesimen
  assert.strictEqual((macroHtml.match(/data:image\/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ/g) || []).length, 2);   // dua foto, masing-masing di halamannya
  assert.ok(macroHtml.includes('>Accepted<') && macroHtml.includes('>Rejected<') && macroHtml.includes('>5X<') && macroHtml.includes('>10X<'));
  await call('PUT', '/api/test-reports/:id', { id: String(mid) }, { template: 'macro-mat', status: 'draft', rows: [{ marking_specimen: 'ABN.9.1-TS1', result: '' }] });
  macroHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(mid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual((macroHtml.match(/class="paper"/g) || []).length, 1);

  // ---- Microstructure ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Microstructure / Metallography' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'micro-weld');
  assert.deepStrictEqual(r.body.template_options.map(o => o.key), ['micro-weld', 'micro-mat', 'micro-thick-weld', 'micro-thick-mat']);
  assert.deepStrictEqual(r.body.template_micro['micro-weld'], { thick: false, photosPerRow: 2, photoLabels: ['Foto sampel (makro)', 'Foto mikrostruktur'] });
  assert.strictEqual(r.body.template_micro['micro-thick-mat'].photosPerRow, 1);
  assert.strictEqual(r.body.rows.length, 2);
  const msid = r.body.id;
  const png3 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const upMicro = slot => new Promise(resolve => routes['POST /api/test-reports/:id/photos']({ params: { id: String(msid) }, query: { slot }, headers: { 'content-type': 'image/png' }, body: png3 }, { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } }));
  for (const s of ['micro-weld/s1', 'micro-weld/s2', 'micro-weld/s3', 'micro-weld/s4']) assert.strictEqual((await upMicro(s)).status, 201);
  const pagesPhotos = async (tpl, rows) => {
    await call('PUT', '/api/test-reports/:id', { id: String(msid) }, { template: tpl, status: 'draft', rows });
    const h = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(msid) } }, { setHeader() {}, send: resolve }));
    return { pages: (h.match(/class="paper"/g) || []).length, photos: (h.match(/iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ/g) || []).length, html: h };
  };
  const twoRows = [{ marking_specimen: 'ABN.9.1-TS1', t1: '12.5', t2: '13', t3: '12.8', t5: '13.2', evil: 1 }, { marking_specimen: 'ABN.9.1-TS2' }];
  let x = await pagesPhotos('micro-weld', twoRows);
  assert.strictEqual(x.pages, 2);
  assert.strictEqual(x.photos, 4);                 // 2 foto per spesimen x 2 spesimen
  for (const s of ['micro-thick-weld/s1', 'micro-thick-weld/s2']) assert.strictEqual((await upMicro(s)).status, 201);
  x = await pagesPhotos('micro-thick-weld', twoRows);
  assert.strictEqual(x.pages, 2);
  assert.strictEqual(x.photos, 2);                 // 1 foto per spesimen (slot s1 dan s2)
  assert.ok(x.html.includes('>12.88<'), 'average dari spot terisi');
  r = await call('GET', '/api/test-reports/:id', { id: String(msid) });
  assert.ok(!('evil' in r.body.rows[0]) && r.body.rows[0].t5 === '13.2');
  x = await pagesPhotos('micro-mat', [{ marking_specimen: 'A' }]);
  assert.strictEqual(x.pages, 1);

  // ---- Nick Break ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Nick Break Test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'nickbreak');
  assert.strictEqual(r.body.category, 'bending');                  // kategori antrean tetap
  assert.strictEqual(r.body.template_options.length, 1);
  assert.deepStrictEqual(Object.keys(r.body.rows[0]).sort(), ['defect', 'depth', 'distance', 'length', 'marking_specimen', 'result']);
  assert.strictEqual(r.body.rows[0].defect, 'No Discontinuity was Observed');
  const nid = r.body.id;
  r = await call('PUT', '/api/test-reports/:id', { id: String(nid) }, { status: 'draft', rows: [
    { marking_specimen: 'ABN.9.1-TS1', defect: 'Slag inclusion', depth: '1.2', length: '6', distance: '25', result: 'rejected', evil: 1 },
    { marking_specimen: 'ABN.9.1-TS2', defect: 'No Discontinuity was Observed', result: 'accepted' }] });
  assert.ok(!('evil' in r.body.rows[0]) && r.body.rows[0].depth === '1.2');
  const nbHtml = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(nid) } }, { setHeader() {}, send: resolve }));
  assert.ok(nbHtml.includes('>Slag inclusion<') && nbHtml.includes('>Rejected<') && nbHtml.includes('>Accepted<') && nbHtml.includes('DE.1/TR/07/NB'));
  // sheet lama (observation/result) tetap tercetak di form resmi
  const legacy = renderTestReportPrintHtml({ category: 'bending', template: 'nickbreak', test_name: 'Nick Break Test', title: 'Nick Break Test', test_request: {}, coupon: {}, rows: [{ marking_specimen: 'X-NB1', observation: 'Porosity', result: 'rejected' }] });
  assert.ok(legacy.includes('>Porosity<') && legacy.includes('>Rejected<'));

  // ---- Tensile ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Tensile Test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'tn-red');                     // coupon las -> Reduced Section
  assert.deepStrictEqual(r.body.template_options.map(o => o.key), ['tn-red', 'tn-full', 'tn-weld', 'tn-bolt', 'tn-mat']);
  assert.ok(r.body.template_tn['tn-bolt'].bolt && !r.body.template_tn['tn-red'].bolt);
  assert.deepStrictEqual(r.body.template_tn['tn-red'].cols.map(c => c.key), ['thickness', 'width', 'area', 'load', 'strength', 'location', 'failure']);
  assert.strictEqual(r.body.rows.length, 2);
  const tid = r.body.id;
  const tnHtml = async (tpl, rows, fields) => {
    await call('PUT', '/api/test-reports/:id', { id: String(tid) }, { template: tpl, status: 'draft', rows, fields: fields || {} });
    return new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(tid) } }, { setHeader() {}, send: resolve }));
  };
  let h = await tnHtml('tn-red', [{ marking_specimen: 'S1', thickness: '12', width: '25', load: '153000', location: 'Base Metal', failure: 'Ductile', evil: 1 }, { marking_specimen: 'S2', area: '300', strength: '520' }]);
  assert.ok(h.includes('>300.00<'), 'area = 12 x 25');
  assert.ok(h.includes('>510<'), 'strength = 153000/300');
  assert.ok(h.includes('>520<') && h.includes('>Base Metal<'));
  assert.strictEqual((h.match(/class="paper"/g) || []).length, 1);
  h = await tnHtml('tn-full', [{ marking_specimen: 'S1', dia: '20', load: '160000' }]);
  assert.ok(h.includes('>314.16<') && h.includes('>509<'), 'area = pi d^2 / 4; strength = load / area');
  h = await tnHtml('tn-weld', [{ marking_specimen: 'S1', dia: '12.5', gauge: '50', l1: '62', yield: '480', tensile: '575' }], { type_specimen: 'Round', test_speed: '10 mm/min' });
  assert.ok(h.includes('>24.0<') && h.includes('>122.72<') && h.includes('Round') && h.includes('10 mm/min'));
  h = await tnHtml('tn-bolt', [{ marking_specimen: 'PL1', kind: 'Proof Load', dia: '16', load: '95000' }, { marking_specimen: 'TS1', kind: 'Tensile', dia: '16', load: '120000' }]);
  assert.ok(h.includes('Proof Load PL1') && h.includes('Thread is Good') && h.includes('>597<') && h.includes('12 MPa/s'));
  h = await tnHtml('tn-mat', [{ marking_specimen: 'S1', thickness: '6', width: '12.5', gauge: '50', l1: '63', yield: '360', tensile: '510' }]);
  assert.ok(h.includes('>75.00<') && h.includes('>26.0<'));
  r = await call('GET', '/api/test-reports/:id', { id: String(tid) });
  assert.ok(!('evil' in r.body.rows[0]));
  // sheet tensile lama (observation/result) tetap tercetak
  const legacyTn = renderTestReportPrintHtml({ category: 'tensile', template: 'tn-red', test_name: 'Tensile Test', title: 'TENSILE TEST', test_request: {}, coupon: {}, rows: [{ marking_specimen: 'L-TS1', observation: 'x', result: '' }] });
  assert.ok(legacyTn.includes('L-TS1'));

  // ---- Through Thickness ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Through Thickness' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'tn-ttt');
  assert.deepStrictEqual(r.body.template_options.map(o => o.key), ['tn-ttt']);
  assert.deepStrictEqual(r.body.template_tn['tn-ttt'].cols.map(c => c.key), ['dia', 'area', 'ra', 'load', 'strength', 'failure']);
  const ttid = r.body.id;
  await call('PUT', '/api/test-reports/:id', { id: String(ttid) }, { status: 'draft', fields: { type_specimen: 'Round', test_speed: '10 mm/min' }, rows: [{ marking_specimen: 'TT1', dia: '12.5', ra: '41', load: '72000', failure: 'ductile' }] });
  const tth = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(ttid) } }, { setHeader() {}, send: resolve }));
  assert.ok(tth.includes('>122.72<') && tth.includes('>587<') && tth.includes('>41<') && tth.includes('Round') && tth.includes('DE.1/TR/04/TTT/MAT'));

  // ---- Compression Test (nama bebas dari Other Test) ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Compression Test (ASTM E9)' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'tn-comp');
  assert.deepStrictEqual(r.body.template_options.map(o => o.key), ['tn-comp']);
  assert.deepStrictEqual(r.body.template_tn['tn-comp'].cols.map(c => c.key), ['dia', 'area', 'load', 'location', 'failure']);
  assert.strictEqual(r.body.rows.length, 2);
  const cpid = r.body.id;
  await call('PUT', '/api/test-reports/:id', { id: String(cpid) }, { status: 'draft', rows: [{ marking_specimen: 'CP1', dia: '25.4', load: '310500', location: 'Mid', failure: 'Barrel' }, { marking_specimen: 'CP2', dia: '25', load: '300000' }] });
  const cph = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(cpid) } }, { setHeader() {}, send: resolve }));
  assert.ok(cph.includes('>506.71<') && cph.includes('>490.87<') && cph.includes('>310500<') && cph.includes('Barrel') && cph.includes('DE.1/TR/16/PRESS'));

  // ---- Flaring Test (nama bebas) ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Flaring test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'flaring');
  assert.strictEqual(r.body.rows.length, 3);
  assert.strictEqual(r.body.rows[0].observation, 'No Crack was Observed');
  const fnid = r.body.id;
  await call('PUT', '/api/test-reports/:id', { id: String(fnid) }, { status: 'draft', rows: [{ marking_specimen: 'FL1', observation: 'No Crack was Observed', result: 'accepted' }, { marking_specimen: 'FL2', observation: 'Crack at the flared edge', result: 'rejected' }, { marking_specimen: 'FL3', observation: '', result: '' }] });
  const fnh = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(fnid) } }, { setHeader() {}, send: resolve }));
  assert.ok(fnh.includes('>FL1<') && fnh.includes('>FL2<') && fnh.includes('>FL3<') && fnh.includes('Crack at the flared edge') && fnh.includes('Accepted') && fnh.includes('Rejected') && fnh.includes('DE.1/TR/14/FLAR'));

  // ---- Uji Geser Las (nama bebas) ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Uji Geser Las' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'tn-geser');
  assert.deepStrictEqual(r.body.template_tn['tn-geser'].cols.map(c => c.key), ['dia', 'area', 'load', 'strength', 'location', 'failure']);
  const glid = r.body.id;
  await call('PUT', '/api/test-reports/:id', { id: String(glid) }, { status: 'draft', rows: [{ marking_specimen: 'GL1', dia: '12', load: '50000' }, { marking_specimen: 'GL2', dia: '12', load: '48000', location: 'Base Metal', failure: 'Ductile' }] });
  const glh = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(glid) } }, { setHeader() {}, send: resolve }));
  assert.ok(glh.includes('>113.10<') && glh.includes('>442<') && glh.includes('>424<') && glh.includes('SNI-07-0663-1995') && glh.includes('Weld Joint Area') && glh.includes('Base Metal') && glh.includes('DE.1/TR/25/GESER-LAS'), 'geser las cetak');

  // ---- Peel Test (nama bebas; memakai mesin Fillet Weld Break) ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Peel test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'peel');
  assert.deepStrictEqual(r.body.template_fwb.peel, ['No discontinuities', 'No discontinuities', 'No discontinuities']);
  assert.strictEqual(r.body.rows.length, 2);
  assert.deepStrictEqual(r.body.rows[0].remarks, []);
  const plid = r.body.id;
  await call('PUT', '/api/test-reports/:id', { id: String(plid) }, { status: 'draft', rows: [{ marking_specimen: 'PL1', remarks: [], result: 'accepted' }, { marking_specimen: 'PL2', remarks: ['Unbrazed area 30%', '', 'Edge to edge discontinuity'], result: 'rejected' }] });
  const plh = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(plid) } }, { setHeader() {}, send: resolve }));
  assert.ok(plh.includes('>PL1<') && plh.includes('>PL2<') && plh.includes('Unbrazed area 30%') && plh.includes('Edge to edge discontinuity') && plh.includes('No discontinuities') && plh.includes('Accepted') && plh.includes('Rejected') && plh.includes('DE.1/TR/23/PEEL'), 'peel cetak');
  assert.ok(plh.includes('Welding Procedure Specification'), 'peel: Testing for bawaan form');

  // ---- Determination of the apparent grain size (nama bebas) ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Grain size test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'grain');
  assert.deepStrictEqual(r.body.template_options.map(o => o.key), ['grain']);
  assert.ok(r.body.template_grain);
  assert.strictEqual(r.body.rows.length, 5);
  assert.deepStrictEqual(Object.keys(r.body.rows[0]), ['l1', 'l2', 'l3', 'len']);
  const gsid = r.body.id;
  r = await call('PUT', '/api/test-reports/:id', { id: String(gsid) }, { status: 'draft', fields: { grain_g: '7.5', grain_mm2: '1650', grain_dia: '0.025', grain_area: '0.00061', evil: 'x' },
    rows: [{ l1: '12', l2: '14', l3: '13', len: '3' }, { l1: '20', l2: '22', l3: '18', len: '3' }, { l1: '', l2: '', l3: '', len: '' }, {}, {}, { l1: '1' }] });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.rows.length, 5, 'maks. 5 field');
  assert.strictEqual(r.body.fields.grain_g, '7.5'); assert.strictEqual(r.body.fields.evil, undefined);
  const gsh = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(gsid) } }, { setHeader() {}, send: resolve }));
  ['>39<', '>60<', '>13.00<', '>20.00<', '>16.50<', '>7.5<', '>1650<', '>0.025<', '>0.00061<', 'Attachment (Field 1)', 'Attachment (Field 2)', 'DE.1/TR/22/GRAIN-SIZE'].forEach(t => assert.ok(gsh.includes(t), 'grain cetak memuat ' + t));
  assert.ok(!gsh.includes('Attachment (Field 3)'), 'field kosong tidak dicetak sebagai lampiran');
  assert.ok(/3 of 3/.test(gsh) || /3 of 3/.test(gsh.replace(/<[^>]+>/g, '')), 'total halaman 3');

  // ---- SEM-EDX (nama bebas): dua halaman per spesimen, gambar tempel sebagai slot foto ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'SEM-EDX examination' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'sem');
  assert.strictEqual(r.body.template_pset.labels.length, 3); assert.ok(!r.body.template_pset.fields);
  assert.deepStrictEqual(r.body.rows, [{ marking_specimen: 'ABN.9.1-SE1' }, { marking_specimen: 'ABN.9.1-SE2' }]);
  const seid = r.body.id;
  const pngS = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJXgAAAA1JREFUeJxj+M/A8B8ABQAB/6vONokAAAAASUVORK5CYII=', 'base64');
  const upSem = slot => new Promise(resolve => routes['POST /api/test-reports/:id/photos']({ params: { id: String(seid) }, query: { slot }, headers: { 'content-type': 'image/png' }, body: pngS }, { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } }));
  for (const sl of ['sem/s1', 'sem/s2', 'sem/s3', 'sem/s4']) assert.strictEqual((await upSem(sl)).status, 201, sl);
  assert.strictEqual((await upSem('sem/s31')).status, 400);   // di atas batas 30 gambar (10 spesimen x 3)
  r = await call('PUT', '/api/test-reports/:id', { id: String(seid) }, { status: 'draft', rows: [{ marking_specimen: 'ABN.9.1-SE1' }, { marking_specimen: 'ABN.9.1-SE2', evil: 1 }] });
  assert.ok(!('evil' in r.body.rows[1]));
  const seh = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(seid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual(seh.split('class="paper"').length - 1, 4, '2 spesimen x 2 halaman');
  assert.strictEqual(seh.split('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ').length - 1, 4, 'empat gambar');
  ['ABN.9.1-SE1', 'ABN.9.1-SE2', 'SEM Photograph', 'EDX Result', 'SEM-EDX Examination'].forEach(t => assert.ok(seh.includes(t), 'sem cetak memuat ' + t));

  // ---- Salt Spray (nama bebas): parameter bawaan + satu halaman foto per spesimen ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'Salt spray test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'salt');
  assert.strictEqual(r.body.template_pset.labels.length, 4);
  assert.strictEqual(r.body.template_pset.fields.length, 9);
  assert.strictEqual(r.body.template_pset.fields.find(f => f.key === 'salt_solution').def, '5 wt% NaCl + 95% H2O');
  assert.strictEqual(r.body.template_pset.fields.find(f => f.key === 'salt_exposure').def, '72h');
  assert.deepStrictEqual(r.body.rows, [{ marking_specimen: 'ABN.9.1-SP1' }, { marking_specimen: 'ABN.9.1-SP2' }]);
  const ssid = r.body.id;
  const upSalt = slot => new Promise(resolve => routes['POST /api/test-reports/:id/photos']({ params: { id: String(ssid) }, query: { slot }, headers: { 'content-type': 'image/png' }, body: pngS }, { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } }));
  for (const sl of ['salt/s1', 'salt/s2', 'salt/s3', 'salt/s4', 'salt/s5']) assert.strictEqual((await upSalt(sl)).status, 201, sl);
  assert.strictEqual((await upSalt('salt/s41')).status, 400);   // di atas batas 40 gambar (10 spesimen x 4)
  // bawaan: parameter dari form, jumlah spesimen = jumlah baris
  let ssh = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(ssid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual(ssh.split('class="paper"').length - 1, 3, 'halaman utama + 2 halaman foto');
  assert.strictEqual(ssh.split('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ').length - 1, 5, 'lima gambar');
  ['5 wt% NaCl + 95% H2O', '35 ± 2 °C', '0.8-1 kg/cm2', '1-2 mL/h', 'No rust was observed after 72h of exposure time', '>2<', 'ABN.9.1-SP2'].forEach(t => assert.ok(ssh.includes(t), 'salt bawaan memuat ' + t));
  // diisi: lama paparan ikut mengubah observasi bawaan; larik lain dipakai apa adanya
  r = await call('PUT', '/api/test-reports/:id', { id: String(ssid) }, { status: 'draft', fields: { salt_exposure: '96h', salt_solution: '3.5 wt% NaCl', evil: 'x' }, rows: [{ marking_specimen: 'ABN.9.1-SP1' }, { marking_specimen: 'ABN.9.1-SP2' }] });
  assert.strictEqual(r.body.fields.salt_exposure, '96h'); assert.strictEqual(r.body.fields.evil, undefined);
  ssh = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(ssid) } }, { setHeader() {}, send: resolve }));
  ['3.5 wt% NaCl', '>96h<', 'No rust was observed after 96h of exposure time'].forEach(t => assert.ok(ssh.includes(t), 'salt diisi memuat ' + t));
  assert.ok(!ssh.includes('5 wt% NaCl + 95% H2O'));

  // ---- HIC (nama bebas): angka contoh dari workbook klien sebagai patokan ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'HIC test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'hic');
  assert.strictEqual(r.body.template_hic.hic.fields.length, 10);
  assert.strictEqual(r.body.template_hic.hic.fields.find(f => f.key === 'hic_period').def, '96 Hours');
  assert.strictEqual(r.body.rows.length, 3);
  assert.strictEqual(r.body.rows[0].marking_specimen, 'ABN.9.1-HC1'); assert.strictEqual(r.body.rows[0].orient, 'Longitudinal');
  const hcid = r.body.id;
  const sec = (w, t, a, b) => ({ w, t, a, b });
  const mkRow = (m, s1, s2, s3) => { const o = { marking_specimen: m, orient: 'Longitudinal' }; [s1, s2, s3].forEach((x, i) => { o['w' + (i + 1)] = x.w; o['t' + (i + 1)] = x.t; o['a' + (i + 1)] = x.a; o['b' + (i + 1)] = x.b; }); return o; };
  const hcRows = [
    mkRow('ABN.9.1-HC1', sec('20.16', '15.07', '0.5 0.52', '0.4'), sec('20.15', '15.04', '2.16', '0.63'), sec('20.16', '15.09', '', '')),
    mkRow('ABN.9.1-HC2', sec('20.25', '15.05', '1.98', '0.54'), sec('20.23', '15.07', '', ''), sec('20.24', '15.07', '', '')),
    Object.assign(mkRow('ABN.9.1-HC3', sec('19.98', '15.06', '', ''), sec('20', '15.06', '1.73', '0.59'), sec('20', '15.06', '2.16', '0.85')), { evil: 1 })];
  r = await call('PUT', '/api/test-reports/:id', { id: String(hcid) }, { status: 'draft', rows: hcRows,
    fields: { hic_period: '720 Hours', hic_time: '720 h', evil: 'x', hic_log: [{ date: '2025-01-20', h2s: '2437', ph: '3.45', temp: '25.3' }, { date: '2025-01-21', h2s: '', ph: '3.58', temp: '25.5' }, {}] } });
  assert.strictEqual(r.status, 200);
  assert.ok(!('evil' in r.body.rows[2]) && r.body.fields.evil === undefined);
  assert.strictEqual(r.body.fields.hic_log.length, 3);
  const hch = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(hcid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual(hch.split('class="paper"').length - 1, 3, 'kondisi + hasil + log');
  // angka workbook klien: CT1 s1 0.13/5.06/2.65, s2 0.45/10.72/4.19; rata-rata CT1 0.19/5.26/2.28; CT2 0.12/3.26/1.20; CT3 0.32/6.48/3.19; rata-rata 3 spesimen 0.21/5.00/2.22
  ['>0.13<', '>5.06<', '>2.65<', '>0.45<', '>10.72<', '>4.19<', '>0.19<', '>5.26<', '>2.28<', '>0.35<', '>9.78<', '>3.59<', '>0.12<', '>3.26<', '>1.20<', '>0.34<', '>8.65<', '>3.92<', '>0.61<', '>10.80<', '>5.64<', '>0.32<', '>6.48<', '>3.19<', '>0.21<', '>5.00<', '>2.22<'].forEach(t => assert.ok(hch.includes(t), 'hic hitung memuat ' + t));
  ['720 Hours', '720 h', '1500 mL', 'Nitrogen', 'ABN.9.1-HC1', 'ABN.9.1-HC3', 'Monitoring', '20/01/2025', '>2437<', 'DE.1/TR/32'].forEach(t => assert.ok(hch.includes(t), 'hic cetak memuat ' + t));
  assert.ok(!hch.includes('96 Hours'));
  // tanpa log: dua halaman saja; section tanpa W/T dicetak "-"
  await call('PUT', '/api/test-reports/:id', { id: String(hcid) }, { status: 'draft', rows: [mkRow('ABN.9.1-HC1', sec('', '', '', ''), sec('20', '15', '', ''), sec('20', '15', '1', '1'))], fields: {} });
  const hch2 = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(hcid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual(hch2.split('class="paper"').length - 1, 2, 'tanpa log hanya dua halaman');
  assert.ok(hch2.includes('>-<') && hch2.includes('96 Hours'));

  // ---- SCC (nama bebas): satu halaman per spesimen, teks bawaan ikut lama uji ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'SCC test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'scc');
  assert.strictEqual(r.body.template_pset.labels.length, 1);
  assert.strictEqual(r.body.template_pset.fields.length, 5);
  assert.strictEqual(r.body.template_pset.fields.find(f => f.key === 'scc_period').def, '168 Hours');
  assert.strictEqual(r.body.template_pset.fields.find(f => f.key === 'scc_summary').long, true);
  assert.deepStrictEqual(r.body.rows, [{ marking_specimen: 'ABN.9.1-SC1' }, { marking_specimen: 'ABN.9.1-SC2' }]);
  const scid = r.body.id;
  const upScc = slot => new Promise(resolve => routes['POST /api/test-reports/:id/photos']({ params: { id: String(scid) }, query: { slot }, headers: { 'content-type': 'image/png' }, body: pngS }, { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } }));
  assert.strictEqual((await upScc('scc/s1')).status, 201); assert.strictEqual((await upScc('scc/s2')).status, 201);
  assert.strictEqual((await upScc('scc/s11')).status, 400);   // di atas batas 10 spesimen
  let sch = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(scid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual(sch.split('class="paper"').length - 1, 2, 'dua spesimen = dua halaman');
  assert.strictEqual(sch.split('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ').length - 1, 2);
  ['168 Hours', 'Magnesium Chloride Solution for 168 hours', 'after 168 h of immersion', 'Specimen Type h (L 102mm', 'ABN.9.1-SC2', 'DE.1/TR/33'].forEach(t => assert.ok(sch.includes(t), 'scc bawaan memuat ' + t));
  r = await call('PUT', '/api/test-reports/:id', { id: String(scid) }, { status: 'draft', rows: [{ marking_specimen: 'ABN.9.1-SC1' }, { marking_specimen: 'ABN.9.1-SC2' }], fields: { scc_period: '96 Hours', scc_volume: '1000', scc_spec: 'Specimen Type c (L 100mm)', evil: 'x' } });
  assert.strictEqual(r.body.fields.scc_period, '96 Hours'); assert.strictEqual(r.body.fields.evil, undefined);
  sch = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(scid) } }, { setHeader() {}, send: resolve }));
  ['96 Hours', 'Magnesium Chloride Solution for 96 hours', 'after 96 h of immersion', 'Specimen Type c (L 100mm)', '>1000<'].forEach(t => assert.ok(sch.includes(t), 'scc diisi memuat ' + t));
  assert.ok(!sch.includes('168 h') && !sch.includes('168 H'), 'tidak ada sisa 168 jam');
  r = await call('PUT', '/api/test-reports/:id', { id: String(scid) }, { status: 'draft', rows: [{ marking_specimen: 'ABN.9.1-SC1' }], fields: { scc_period: '96 Hours', scc_summary: 'Teks sendiri 168 jam.' } });
  sch = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(scid) } }, { setHeader() {}, send: resolve }));
  assert.ok(sch.includes('Teks sendiri 168 jam.') && sch.split('class="paper"').length - 1 === 1, 'teks sendiri dipakai apa adanya');

  // ---- SSCC FPB (nama bebas): 4 halaman; tabel pembebanan diketik; hasil 3 spesimen per halaman ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'SSCC FPB test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'sscc-fpb');
  assert.deepStrictEqual(r.body.template_options.map(o => o.key), ['sscc-fpb', 'sscc-pr']);
  assert.deepStrictEqual(Object.keys(r.body.template_hic).sort(), ['sscc-fpb', 'sscc-pr']);
  assert.strictEqual(r.body.template_hic['sscc-fpb'].fields.find(f => f.key === 'hic_h2s').def, '>2.300 mg/L');   // awalan ": " dari sel tidak tampil di placeholder
  assert.strictEqual(r.body.template_hic['sscc-pr'].fields.find(f => f.key === 'hic_ph_initial').def, '≤3');
  assert.strictEqual(r.body.rows.length, 3); assert.strictEqual(r.body.rows[0].orient, 'Longitudinal'); assert.strictEqual(r.body.rows[0].marking_specimen, 'ABN.9.1-SS1');
  const sfid = r.body.id;
  const upSscc = (id2, slot) => new Promise(resolve => routes['POST /api/test-reports/:id/photos']({ params: { id: String(id2) }, query: { slot }, headers: { 'content-type': 'image/png' }, body: pngS }, { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } }));
  for (const sl of ['sscc-fpb/s1', 'sscc-fpb/s2', 'sscc-fpb/s3']) assert.strictEqual((await upSscc(sfid, sl)).status, 201, sl);
  assert.strictEqual((await upSscc(sfid, 'sscc-fpb/s11')).status, 400);
  const fpbRow = (m, dim, strain) => ({ marking_specimen: m, orient: 'Longitudinal', stress: '388', modulus: '210', dim, h: '100', a: '25', strain, obs: '', d: '', evil: 1 });
  const fpbRows = [fpbRow('CT1', '110.12 x 19.87 x 5.02', '0.843'), fpbRow('CT2', '110.41 x 20.01 x 4.98', '0.85'), fpbRow('CT3', '110.32 x 19.94 x 5.01', '0.845')];
  r = await call('PUT', '/api/test-reports/:id', { id: String(sfid) }, { status: 'draft', rows: fpbRows, fields: { hic_log: [{ date: '2025-01-20', h2s: '2437', ph: '3.45', temp: '25.3' }] } });
  assert.strictEqual(r.status, 200); assert.ok(!('evil' in r.body.rows[0]));
  let sfh = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(sfid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual(sfh.split('class="paper"').length - 1, 4, 'kondisi + pembebanan + hasil (3 per halaman) + log');
  assert.strictEqual(sfh.split('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ').length - 1, 3, 'tiga foto');
  ['5000 mL', ': &gt;2.300 mg/L', ': Nitrogen', ': 720 h', '>388<', '>210<', '110.12 x 19.87 x 5.02', '110.41 x 20.01 x 4.98', '>0.843<', '>0.85<', 'CT1', 'CT3', 'No Crack was Observed', 'Test Result (Observation After 720h)', 'DE.1/TR/30', '20/01/2025'].forEach(t => assert.ok(sfh.includes(t), 'fpb memuat ' + t));
  // diisi: lama uji mengubah judul hasil; nilai H2S diberi awalan ": " seperti bawaan form; empat spesimen -> dua halaman hasil
  r = await call('PUT', '/api/test-reports/:id', { id: String(sfid) }, { status: 'draft', fields: { hic_period: '1000 Hours', hic_h2s: '>3 mg/L' }, rows: fpbRows.concat([fpbRow('CT4', '110 x 20 x 5', '0.9')]) });
  sfh = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(sfid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual(sfh.split('class="paper"').length - 1, 4, 'tanpa log: kondisi + pembebanan + dua halaman hasil');
  ['1000 Hours', 'Test Result (Observation After 1000h)', ': &gt;3 mg/L', 'CT4', '110 x 20 x 5'].forEach(t => assert.ok(sfh.includes(t), 'fpb diisi memuat ' + t));
  // ganti ke Proof Ring lewat pilihan form: data baris tetap, tata letak PR
  r = await call('PUT', '/api/test-reports/:id', { id: String(sfid) }, { status: 'draft', template: 'sscc-pr', fields: {}, rows: [fpbRow('CT1', '', '')] });
  assert.strictEqual(r.body.template, 'sscc-pr');

  // ---- SSCC PR (nama bebas): luas dan beban target dihitung (rumus form klien, 3.14) ----
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 1, test_name: 'SSCC PR test' });
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.template, 'sscc-pr');
  const spid = r.body.id;
  for (const sl of ['sscc-pr/s1', 'sscc-pr/s2']) assert.strictEqual((await upSscc(spid, sl)).status, 201, sl);
  r = await call('PUT', '/api/test-reports/:id', { id: String(spid) }, { status: 'draft', rows: [
    { marking_specimen: 'CT1', orient: 'Longitudinal', stress: '360', modulus: '196', d: '3.85', a: '25.43', dim: '', obs: '' },
    { marking_specimen: 'CT2', orient: '', stress: '', modulus: '196', d: '', a: '', dim: '', obs: 'Crack observed' }], fields: {} });
  assert.strictEqual(r.status, 200);
  const sph = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(spid) } }, { setHeader() {}, send: resolve }));
  assert.strictEqual(sph.split('class="paper"').length - 1, 4, 'kondisi + pembebanan + 2 halaman hasil (1 per halaman)');
  ['500 mL', '>11.64<', '>4188.84<', '3.85 x 25.43', '>360<', '>196<', 'Crack observed', 'No Crack was Observed', '>CT2<', 'DE.1/TR/31'].forEach(t => assert.ok(sph.includes(t), 'pr memuat ' + t));

  // ---- Root & Face Bend: satu Lembar gabungan per coupon ----
  inspections.blockedTest = 'Bend Face'; inspections.status = 'draft';
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 2, test_name: 'Bend Root' });
  assert.strictEqual(r.status, 400, 'Face belum Final -> Lembar gabungan belum bisa dibuat');
  assert.ok(/Bend Face/.test(r.body.error));
  inspections.blockedTest = null;
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 2, test_name: 'Bend Face' });
  assert.strictEqual(r.status, 201);
  const bid = r.body.id;
  assert.strictEqual(r.body.test_name, 'Bend Root', 'disimpan atas nama pengujian pertama');
  assert.strictEqual(r.body.title, 'Root & Face Bend Test');
  assert.deepStrictEqual(r.body.combined_tests, ['Bend Root', 'Bend Face']);
  assert.deepStrictEqual(r.body.rows.map(x => x.marking_specimen), ['ABN.9.1-BR1', 'ABN.9.1-BR2', 'ABN.9.1-BF1', 'ABN.9.1-BF2']);
  r = await call('POST', '/api/work-orders/:id/test-reports', { id: '1' }, { coupon_row_no: 2, test_name: 'Bend Root' });
  assert.strictEqual(r.body.id, bid, 'Root membuka Lembar yang sama');
  r = await call('PUT', '/api/test-reports/:id', { id: String(bid) }, { status: 'draft', template: 'bend-sec', rows: r.body.rows.map((x, i) => ({ ...x, result: 'accepted', observation: 'OK' + i })) });
  const bh = await new Promise(resolve => routes['GET /test-reports/:id/print']({ params: { id: String(bid) } }, { setHeader() {}, send: resolve }));
  ['Type of Bend: Root Bend Test', 'Type of Bend: Face Bend Test', 'ABN.9.1-BR2', 'ABN.9.1-BF2'].forEach(t => assert.ok(bh.includes(t), 'gabungan memuat ' + t));
  assert.ok(bh.indexOf('ABN.9.1-BR1') < bh.indexOf('ABN.9.1-BF1'));

  // ---- Lampiran hasil mesin uji ----
  const upFile = (rid, type, name, buf) => new Promise(resolve => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } };
    routes['POST /api/test-reports/:id/files']({ params: { id: String(rid) }, headers: { 'content-type': type, 'x-filename': encodeURIComponent(name) }, body: buf }, res);
  });
  r = await upFile(bid, 'application/pdf', 'UTM run 1.pdf', Buffer.from('%PDF-1'));
  assert.strictEqual(r.status, 201);
  assert.strictEqual(r.body.filename, 'UTM run 1.pdf');
  r = await upFile(bid, 'application/octet-stream', 'data.csv', Buffer.from('a,b'));
  assert.strictEqual(r.body.mime_type, 'text/csv', 'CSV tanpa tipe dikenali dari nama file');
  assert.strictEqual((await upFile(bid, 'application/x-msdownload', 'x.exe', Buffer.from('MZ'))).status, 400);
  assert.strictEqual((await upFile(bid, 'application/pdf', 'kosong.pdf', Buffer.alloc(0))).status, 400);
  assert.strictEqual((await upFile(9999, 'application/pdf', 'a.pdf', Buffer.from('x'))).status, 404);
  r = await call('GET', '/api/test-reports/:id/files', { id: String(bid) });
  assert.deepStrictEqual(r.body.items.map(f => f.filename), ['UTM run 1.pdf', 'data.csv']);
  r = await call('DELETE', '/api/test-report-files/:fileId', { fileId: '1' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual((await call('GET', '/api/test-reports/:id/files', { id: String(bid) })).body.items.length, 1);

  // DELETE
  r = await call('DELETE', '/api/test-reports/:id', { id: String(id) });
  assert.strictEqual(r.status, 200);
  r = await call('GET', '/api/test-reports/:id', { id: String(id) });
  assert.strictEqual(r.status, 404);

  console.log('TEST_REPORTS OK');
})().catch(e => { console.error(e); process.exit(1); });
