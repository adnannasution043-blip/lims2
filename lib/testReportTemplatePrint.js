// Cetak Lembar Hasil Uji memakai form resmi Detech (template grid hasil konversi Excel, lihat
// lib/reportTemplate.js). Setiap kunci template punya "filler" yang memetakan data sheet ke alamat sel
// form aslinya. Teks tetap form (Term & Conditions, alamat, nama Technical Manager, logo) tidak disentuh.
const fs = require('fs');
const path = require('path');
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

// ---- Charpy ----
const CHARPY_WELD_MAP = {
  job: 'J12', reportNo: 'J13', received: 'AD13', tested: 'AD14', customer: 'J14', address: 'J15', po: 'AD16',
  project: 'AD17', object: 'J19', sampleMarking: 'AD19', grade: 'AD23', size: 'J25', heat: 'AD24',
  env: 'J30', method: 'J32', refCode: 'AD32', machine: 'J44', remarks: 'J45', conducted: 'J47', witnessed: 'J48'
};
const CHARPY_EQT_MAP = { ...CHARPY_WELD_MAP, machine: 'J51', remarks: 'J52', conducted: 'J54', witnessed: 'J55' };
const CHARPY_MAT_MAP = {
  job: 'J12', reportNo: 'J13', received: 'AD13', tested: 'AD14', customer: 'J14', address: 'J15', po: 'AD18',
  project: 'AD19', object: 'J18', sampleMarking: 'AD22', grade: 'J22', size: 'J23', heat: 'J24',
  env: 'J28', method: 'J30', refCode: 'AD30', machine: 'J42', remarks: 'J43', conducted: 'J45', witnessed: 'J46'
};

const num = v => { const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) && String(v).trim() !== '' ? n : null; };
// rata-rata sampai 1 desimal (10.0 -> "10"); kosong bila ada nilai yang belum diisi/bukan angka
function average(values) {
  const ns = values.map(num);
  if (!ns.length || ns.some(n => n === null)) return '';
  const avg = Math.round((ns.reduce((a, b) => a + b, 0) / ns.length) * 10) / 10;
  return String(avg);
}
const blank = v => (String(v == null ? '' : v).trim() === '' ? '' : String(v).trim());

function charpyTop(r, v, tempRef, sizeRef, orientRef) {
  const f = r.fields || {};
  v[sizeRef] = dash(f.specimen_size);
  v[tempRef] = dash(f.test_temp);
  v[orientRef] = dash(f.orientation);
}

// Weld & Material: satu blok per V-Notch Position (baris berurutan yang posisinya sama), berisi No. 1..n,
// Impact Value, Lateral Expansion, Remarks; Average dihitung per blok.
function charpyGroups(rows, firstRow, otherRow, skipRows) {
  const sets = [];
  rows.forEach(row => {
    const last = sets[sets.length - 1];
    const notch = String(row.notch_position || '').trim();
    if (last && last.notch === notch) last.rows.push(row); else sets.push({ notch, rows: [row] });
  });
  return {
    row: firstRow, otherRow, skipRows,
    items: sets.map(set => ({
      first: { C: dash(set.notch), P: average(set.rows.map(x => x.impact)) || '-' },
      rows: set.rows.map((x, i) => ({ A: String(i + 1), H: blank(x.impact), W: blank(x.lateral), AD: dash(x.remarks) }))
    }))
  };
}

function fillCharpyWeld(r) {
  const coupon = r.coupon || {};
  const v = commonValues(r, CHARPY_WELD_MAP);
  v.AD12 = '1 of 1';
  v.J23 = dash(coupon.no_wps); v.J24 = dash(r.pqr_no);
  v.AD25 = dash(coupon.welding_position); v.AD26 = dash(coupon.welding_process);
  v.J26 = dash(r.testing_purpose || 'Welding Procedure Specification');
  v.J27 = dash(r.welder_name);
  charpyTop(r, v, 'P36', 'H36', 'W36');
  return { values: v, spans: { AD16: 7, AD17: 7 }, groups: charpyGroups(r.rows || [], 40, 41, [41, 42]), sigAt: ['AC50', 'AJ54'] };
}

function fillCharpyMat(r) {
  const v = commonValues(r, CHARPY_MAT_MAP);
  v.AD12 = '1 of 1';
  v.J25 = dash(r.testing_purpose || 'Material Testing');
  charpyTop(r, v, 'P34', 'H34', 'W34');
  return { values: v, spans: { AD18: 7, AD19: 7 }, groups: charpyGroups(r.rows || [], 38, 39, [39, 40]), sigAt: ['AC49', 'AJ53'] };
}

// EQT: tabel atas memuat semua (maks. 5) spesimen; tabel bawah hanya 3 nilai yang dipakai — nilai tertinggi
// dan terendah dibuang ("The lowest and the highest values obtained shall be disregarded").
function fillCharpyEqt(r) {
  const coupon = r.coupon || {};
  const v = commonValues(r, CHARPY_EQT_MAP);
  v.AD12 = '1 of 1';
  v.J23 = dash(coupon.no_wps); v.J24 = dash(r.pqr_no);
  v.AD25 = dash(coupon.welding_position); v.AD26 = dash(coupon.welding_process);
  v.J26 = dash(r.testing_purpose || 'Electrode Qualification Test');
  v.J27 = dash(r.welder_name);
  charpyTop(r, v, 'P36', 'H36', 'W36');

  const rows = (r.rows || []).slice(0, 5);
  const notch = dash((rows[0] || {}).notch_position);
  v.H40 = notch;
  ['O', 'R', 'U', 'X', 'AA'].forEach((col, i) => {
    v[col + '40'] = rows[i] ? blank(rows[i].impact) : '';
    v[col + '42'] = rows[i] ? blank(rows[i].lateral) : '';
  });

  let used = rows.map((x, i) => ({ x, i }));
  if (used.length > 3 && used.every(u => num(u.x.impact) !== null)) {
    const sorted = [...used].sort((a, b) => num(a.x.impact) - num(b.x.impact));
    const drop = new Set([sorted[0].i, sorted[sorted.length - 1].i]);
    used = used.filter(u => !drop.has(u.i));
  }
  const kept = used.map(u => u.x);
  const items = [{
    first: { C: notch, P: average(kept.map(x => x.impact)) || '-' },
    rows: (kept.length ? kept : [{}]).map((x, i) => ({ A: String(i + 1), H: blank(x.impact), W: blank(x.lateral), AD: dash(x.remarks) }))
  }];
  return { values: v, spans: { AD16: 7, AD17: 7 }, groups: { row: 47, otherRow: 48, skipRows: [48, 49], items }, sigAt: ['AC54', 'AJ58'] };
}

// ---- Pengisi generik berbasis label (dipakai folder-folder baru) ----
// Posisi baris tiap form berbeda-beda (mis. Chemical punya 13 varian), jadi sel isian dicari dari teks label
// di kolom kiri (A -> isian di J) atau kolom kanan (W -> isian di AD), bukan ditulis tangan per form.
const LABEL_KEYS = {
  'Job No.': 'job', 'Report No.': 'reportNo', 'Customer': 'customer', 'Address': 'address',
  'Total of Page': 'pages', 'Date of Received': 'received', 'Date of Tested': 'tested', 'PO No.': 'po',
  'Project Name': 'project', 'Object to be Tested': 'object', 'Sample Marking': 'sampleMarking',
  'WPS No': 'wps', 'PQR No': 'pqr', 'Material Size': 'size', 'Testing Purpose': 'purpose', "Welder's Name": 'welder',
  'Material Type/Grade': 'grade', 'Heat No': 'heat', 'Heat No.': 'heat', 'Welding Position': 'position',
  'Welding Process': 'process', 'Environment Temp': 'env', 'Test Method': 'method', 'Reference Code': 'refCode',
  'Testing Machine Used': 'machine', 'Remarks': 'remarks', 'Test Conducted by': 'conducted', 'Witnessed By': 'witnessed',
  'Approved Signatory': 'approved'
};
const labelCache = {};
const clean = v => String(v == null ? '' : v).replace(/[\t\r\n ]+/g, ' ').trim();

// { key: ref } untuk sel isian + { approvedRow } untuk kotak tanda tangan.
function locate(key) {
  if (labelCache[key]) return labelCache[key];
  const tpl = loadTemplate(key);
  const refs = {};
  for (const row of tpl.rows) {
    for (const c of row.cells) {
      const k = LABEL_KEYS[clean(c.v)];
      if (!k) continue;
      if (k === 'approved') { if (c.c >= 26) refs.approvedRow = row.r; continue; }
      if (c.c === 0) refs[k] = 'J' + row.r;
      else if (c.c === 22) refs[k] = 'AD' + row.r;
    }
  }
  return (labelCache[key] = refs);
}

// Elemen yang dianalisis: baris label (teks elemen) di antara "Elements Analyzed" dan "Testing Machine Used";
// nilai ditulis di sel tepat di bawah labelnya.
const elementCache = {};
function templateElements(key) {
  if (elementCache[key]) return elementCache[key];
  const tpl = loadTemplate(key);
  const list = [];
  let inside = false;
  for (const row of tpl.rows) {
    const texts = row.cells.filter(c => clean(c.v));
    if (texts.some(c => /^Elements Analyzed/i.test(clean(c.v)))) { inside = true; continue; }
    if (texts.some(c => clean(c.v) === 'Testing Machine Used')) break;
    if (inside) texts.forEach(c => { if (c.c < 34) list.push({ label: clean(c.v), ref: c.ref.replace(/[0-9]+/, '') + (row.r + 1) }); });
  }
  return (elementCache[key] = list);
}

function fillLabelled(r, extra = {}) {
  const tr = r.test_request || {};
  const coupon = r.coupon || {};
  const tpl = loadTemplate(r.template);
  const refs = locate(r.template);
  const objectText = [...(coupon.coupon_type || []), coupon.coupon_type_other || ''].filter(Boolean).join(', ') || coupon.material_type_grade;
  // undefined = biarkan teks bawaan form (mis. Test Method / Testing Purpose / mesin)
  const data = {
    job: dash(tr.job_number), reportNo: dash(r.report_no), customer: dash(tr.company), address: dash(tr.address),
    pages: '1 of 1', received: longDate(tr.received_date), tested: longDate(r.date_tested),
    po: dash(tr.po_number), project: dash(tr.project_name), object: dash(objectText), sampleMarking: dash(r.sample_marking),
    wps: dash(coupon.no_wps), pqr: dash(r.pqr_no), size: dash(coupon.material_size), welder: dash(r.welder_name),
    grade: dash(coupon.material_type_grade), heat: dash(r.heat_no || coupon.heat_number),
    position: dash(coupon.welding_position), process: dash(coupon.welding_process),
    purpose: r.testing_purpose || undefined, env: r.environment_temp || undefined,
    method: (r.test_method || r.method) || undefined, refCode: dash(r.reference_code),
    machine: r.testing_machine || undefined, remarks: dash(r.remarks),
    conducted: dash(r.test_conducted_by || r.testing_pic), witnessed: dash(r.witnessed_by),
    ...extra
  };
  const values = {};
  const spans = {};
  Object.entries(data).forEach(([k, v]) => {
    if (v === undefined || !refs[k]) return;
    values[refs[k]] = v;
  });
  // PO / Project Name: sel aslinya hanya memuat "-" (tanpa colspan); lebarkan agar isian panjang tidak terpotong
  ['po', 'project'].forEach(k => {
    const ref = refs[k];
    if (!ref) return;
    const cell = tpl.rows.find(x => x.r === Number(ref.replace(/[A-Z]+/, ''))).cells.find(c => c.ref === ref);
    if (cell && !cell.cs) spans[ref] = 7;
  });
  const sigAt = refs.approvedRow ? ['AC' + (refs.approvedRow + 1), 'AJ' + (refs.approvedRow + 5)] : null;
  return { values, spans, sigAt };
}

function fillChem(r) {
  const elements = (r.fields || {}).elements || {};
  const out = fillLabelled(r);
  templateElements(r.template).forEach(e => { out.values[e.ref] = clean(elements[e.label]); });
  return out;
}

function getFiller(key) {
  if (FILLERS[key]) return FILLERS[key];
  if (/^chem-/.test(key)) return fillChem;
  return null;
}

const FILLERS = {
  'bend-sec': fillBendSec, 'bend-mat': fillBendMat,
  'charpy-weld': fillCharpyWeld, 'charpy-weld-eqt': fillCharpyEqt, 'charpy-mat': fillCharpyMat
};

function hasTemplate(key) { return !!key && !!getFiller(key) && fs.existsSync(path.join(__dirname, 'reportTemplates', key + '.json')); }

function renderTemplateReportHtml(r) {
  const tpl = loadTemplate(r.template);
  const fill = getFiller(r.template)(r);
  const sig = r.approved_signatory && r.approved_signatory.signature;
  const out = renderTemplateTable(tpl, {
    values: fill.values,
    repeat: fill.repeat,
    hideRows: fill.hideRows,
    spans: fill.spans,
    groups: fill.groups,
    overlays: sig && fill.sigAt ? [{ ref: fill.sigAt[0], toRef: fill.sigAt[1], src: sig }] : []
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

module.exports = { hasTemplate, renderTemplateReportHtml, templateElements };
