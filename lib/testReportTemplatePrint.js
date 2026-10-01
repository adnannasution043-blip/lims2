// Cetak Lembar Hasil Uji memakai form resmi Detech (template grid hasil konversi Excel, lihat
// lib/reportTemplate.js). Setiap kunci template punya "filler" yang memetakan data sheet ke alamat sel
// form aslinya. Teks tetap form (Term & Conditions, alamat, nama Technical Manager, logo) tidak disentuh.
const { esc } = require('./printCommon');
const { loadTemplate, renderTemplateTable } = require('./reportTemplate');

const dash = v => { const s = String(v == null ? '' : v).trim(); return s || '-'; };

// 2026-05-14 -> 14/05/2026 (form Excel: xx/xx/20xx)
function longDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dash(s);
}

const RESULT_LABEL = { accepted: 'Accepted', rejected: 'Rejected' };
const resultText = v => RESULT_LABEL[v] || '-';

// actual diutamakan; kalau kosong pakai Code (form hanya punya satu kolom nilai)
const measured = (actual, code) => dash(String(actual || '').trim() || code);

const BEND_KIND = { 'Bend Root': 'Root', 'Bend Face': 'Face', 'Bend Side': 'Side' };

function commonValues(r, map) {
  const tr = r.test_request || {};
  const coupon = r.coupon || {};
  const v = {};
  v[map.job] = dash(tr.job_number);
  v[map.reportNo] = dash(r.report_no);
  v[map.received] = longDate(tr.received_date);
  v[map.tested] = longDate(r.date_tested);
  v[map.customer] = dash(tr.company);
  v[map.address] = dash(tr.address);
  v[map.po] = dash(tr.po_number);
  v[map.project] = dash(tr.project_name);
  v[map.sampleMarking] = dash(r.sample_marking);
  v[map.env] = r.environment_temp || '25 ± 2 ºC';
  v[map.method] = dash(r.test_method || r.method);
  v[map.refCode] = dash(r.reference_code);
  v[map.conducted] = dash(r.test_conducted_by || r.testing_pic);
  v[map.witnessed] = dash(r.witnessed_by);
  v[map.remarks] = dash(r.remarks);
  if (r.testing_machine) v[map.machine] = r.testing_machine;
  const objectText = [...(coupon.coupon_type || []), coupon.coupon_type_other || ''].filter(Boolean).join(', ') || coupon.material_type_grade;
  v[map.object] = dash(objectText);
  v[map.grade] = dash(coupon.material_type_grade);
  v[map.size] = dash(coupon.material_size);
  v[map.heat] = dash(r.heat_no);
  return v;
}

const SEC_MAP = {
  job: 'J12', reportNo: 'J13', received: 'AD13', tested: 'AD14', customer: 'J14', address: 'J15', po: 'AD16',
  project: 'AD17', object: 'J19', sampleMarking: 'AD19', grade: 'AD23', size: 'J25', heat: 'AD24',
  env: 'J30', method: 'J32', refCode: 'AD32', machine: 'J42', remarks: 'J43', conducted: 'J45', witnessed: 'J46'
};

const MAT_MAP = {
  job: 'J12', reportNo: 'J13', received: 'AD13', tested: 'AD14', customer: 'J14', address: 'J15', po: 'AD18',
  project: 'AD19', object: 'J18', sampleMarking: 'AD22', grade: 'J22', size: 'J23', heat: 'J24',
  env: 'J28', method: 'J30', refCode: 'AD31', machine: 'J38', remarks: 'J39', conducted: 'J41', witnessed: 'J42'
};

// Form Weld: spesimen berpasangan kiri/kanan (A,D,O | T,W,AH); kolom kiri diisi dulu (min. 2 baris
// seperti form aslinya), sisanya kolom kanan.
function fillBendSec(r) {
  const coupon = r.coupon || {};
  const v = commonValues(r, SEC_MAP);
  v.AD12 = '1 of 1';
  v.J23 = dash(coupon.no_wps);
  v.J24 = dash(r.pqr_no);
  v.AD25 = dash(coupon.welding_position);
  v.AD26 = dash(coupon.welding_process);
  v.J26 = dash(r.testing_purpose || 'Welding Procedure Specification');
  v.J27 = dash(r.welder_name);
  v.J33 = dash(coupon.thickness);
  v.AD33 = measured(r.specimen_width_actual, r.specimen_width_code);
  v.J34 = measured(r.former_diameter_actual, r.former_diameter_code);
  v.AD34 = measured(r.bend_angle_actual, r.bend_angle_code || '180');
  v.J35 = measured(r.shoulder_distance_actual, r.shoulder_distance_code);
  const kind = BEND_KIND[r.test_name];
  if (kind) { v.A37 = `Type of Bend: ${kind} Bend Test`; v.T37 = `Type of Bend: ${kind} Bend Test`; }

  const rows = r.rows || [];
  const perRow = Math.max(2, Math.ceil(rows.length / 2));
  const items = [];
  for (let i = 0; i < perRow; i++) {
    const L = rows[i], R = rows[i + perRow];
    items.push({
      A: L ? L.marking_specimen : '', D: L ? dash(L.observation) : '', O: L ? resultText(L.result) : '',
      T: R ? R.marking_specimen : '', W: R ? dash(R.observation) : '', AH: R ? resultText(R.result) : ''
    });
  }
  return { values: v, repeat: { row: 39, items }, hideRows: [40], sigAt: ['AC50', 'AJ54'] };
}

function fillBendMat(r) {
  const coupon = r.coupon || {};
  const v = commonValues(r, MAT_MAP);
  v.AD12 = '1 of 1';
  v.J25 = dash(r.testing_purpose || 'Material Testing');
  v.J31 = dash(coupon.thickness);
  v.J32 = measured(r.former_diameter_actual, r.former_diameter_code);
  v.AD32 = measured(r.bend_angle_actual, r.bend_angle_code || '180');
  v.J33 = measured(r.shoulder_distance_actual, r.shoulder_distance_code);
  const items = (r.rows || []).map(row => ({ A: row.marking_specimen, J: dash(row.observation), AD: resultText(row.result) }));
  return { values: v, repeat: { row: 36, items }, spans: { AD18: 7, AD19: 7 }, sigAt: ['AC49', 'AJ53'] };
}

const FILLERS = { 'bend-sec': fillBendSec, 'bend-mat': fillBendMat };

function hasTemplate(key) { return !!FILLERS[key]; }

function renderTemplateReportHtml(r) {
  const tpl = loadTemplate(r.template);
  const fill = FILLERS[r.template](r);
  const sig = r.approved_signatory && r.approved_signatory.signature;
  const out = renderTemplateTable(tpl, {
    values: fill.values,
    repeat: fill.repeat,
    hideRows: fill.hideRows,
    spans: fill.spans,
    overlays: sig ? [{ ref: fill.sigAt[0], toRef: fill.sigAt[1], src: sig }] : []
  });
  const tr = r.test_request || {};
  const portrait = tpl.orientation !== 'landscape';
  const pageW = portrait ? 734 : 1074; // A4 dikurangi margin 8mm (px @96dpi)
  const scale = pageW / out.width;

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${esc(tr.job_number || 'Laporan Hasil Uji')} - ${esc(r.title)}</title>
<style>
  @page { size: A4 ${portrait ? 'portrait' : 'landscape'}; margin: 8mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Calibri, Carlito, Arial, sans-serif; background: #ddd; }
  .toolbar { position: sticky; top: 0; background: #0E3270; color: #fff; padding: 10px 16px;
             display: flex; justify-content: space-between; align-items: center; z-index: 10; font-family: Arial, sans-serif; }
  .toolbar button { background: #AA0000; border: none; padding: 8px 18px; font-weight: bold; color: #fff;
             border-radius: 4px; cursor: pointer; font-size: 10pt; }
  .paper { width: ${pageW}px; margin: 16px auto; padding: 0; background: #fff; box-shadow: 0 0 8px rgba(0,0,0,.25); }
  .scaled { zoom: ${scale}; }
  ${out.css}
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .paper { box-shadow: none; margin: 0; width: auto; }
  }
</style>
</head>
<body>
  <div class="toolbar">
    <span>Laporan Hasil Uji &mdash; ${esc(tr.job_number || '')}</span>
    <button onclick="window.print()">Print / Simpan sebagai PDF</button>
  </div>
  <div class="paper"><div class="scaled">${out.html}</div></div>
</body>
</html>`;
}

module.exports = { hasTemplate, renderTemplateReportHtml };
