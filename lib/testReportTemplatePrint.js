// Cetak Lembar Hasil Uji memakai form resmi Detech (template grid hasil konversi Excel, lihat
// lib/reportTemplate.js). Setiap kunci template punya "filler" yang memetakan data sheet ke alamat sel
// form aslinya. Teks tetap form (Term & Conditions, alamat, nama Technical Manager, logo) tidak disentuh.
const fs = require('fs');
const path = require('path');
const { esc } = require('./printCommon');
const { loadTemplate, renderTemplateTable } = require('./reportTemplate');

const dash = v => { const s = String(v == null ? '' : v).trim(); return s || '-'; };
// Witnessed By disimpan dipisah koma; di laporan tiap saksi dicetak di baris sendiri (tersusun ke bawah)
const witnessLines = v => String(v == null ? '' : v).split(/[,;\n]/).map(x => x.trim()).filter(Boolean).join('\n') || '-';

// 2026-05-14 -> 14/05/2026 (form Excel: xx/xx/20xx)
function longDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
  return m ? `${m[3]}/${m[2]}/${m[1]}` : dash(s);
}

const RESULT_LABEL = { accepted: 'Accepted', rejected: 'Rejected' };
const resultText = v => RESULT_LABEL[v] || '-';

// actual diutamakan; kalau kosong pakai Code (form hanya punya satu kolom nilai)
// Dimensi Bend: satu nilai (isian Actual dihapus); data lama yang hanya punya Actual tetap tercetak.
const measured = (actual, code) => dash(String(code || '').trim() || String(actual || '').trim());

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
  v[map.witnessed] = witnessLines(r.witnessed_by);
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
  // Lembar gabungan Root & Face: kolom kiri Root, kolom kanan Face
  const groups = Array.isArray(r.bend_groups) && r.bend_groups.length === 2 ? r.bend_groups : null;
  let left = rows.slice(0, Math.ceil(rows.length / 2)), right = rows.slice(Math.ceil(rows.length / 2));
  if (groups) {
    const inRight = new Set(groups[1].markings);
    left = rows.filter(x => !inRight.has(x.marking_specimen));
    right = rows.filter(x => inRight.has(x.marking_specimen));
    v.A37 = `Type of Bend: ${groups[0].kind} Bend Test`;
    v.T37 = `Type of Bend: ${groups[1].kind} Bend Test`;
  }
  const perRow = Math.max(2, left.length, right.length);
  const items = [];
  for (let i = 0; i < perRow; i++) {
    const L = left[i], R = right[i];
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
  'WPS No': 'wps', 'PQR No': 'pqr', 'Material Size': 'size', 'Testing Purpose': 'purpose', 'Testing for': 'purpose', "Welder's Name": 'welder',
  'Material Type/Grade': 'grade', 'Heat No': 'heat', 'Heat No.': 'heat', 'Welding Position': 'position',
  'Welding Process': 'process', 'Environment Temp': 'env', 'Test Method': 'method', 'Reference Code': 'refCode',
  'Testing Machine Used': 'machine', 'Remarks': 'remarks', 'Test Conducted by': 'conducted', 'Witnessed By': 'witnessed',
  'Approved Signatory': 'approved', 'Type Specimen': 'typeSpec', 'Test Speed': 'speed'
};
const GAUGE_LEGEND = 'BBGM : Broke Between Gauge Marks; BOGM : Broke Outside Gauge Marks';
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
    typeSpec: clean((r.fields || {}).type_specimen) || undefined, speed: clean((r.fields || {}).test_speed) || undefined,
    conducted: dash(r.test_conducted_by || r.testing_pic), witnessed: witnessLines(r.witnessed_by),
    ...extra
  };
  const values = {};
  const spans = {};
  const cellText = ref => { const row = tpl.rows.find(x => x.r === Number(ref.replace(/[A-Z]+/, ''))); const c = row && row.cells.find(x => x.ref === ref); return clean(c && c.v); };
  Object.entries(data).forEach(([k, v]) => {
    // tanpa isian: biarkan teks bawaan form, kecuali teks itu hanya penanda ("xxx") -> "-"
    if (v === undefined && refs[k] && /^[xX]+( to [xX]+)?$/.test(cellText(refs[k]))) v = '-';
    if (v === undefined || !refs[k]) return;
    values[refs[k]] = v;
  });
  // Keterangan singkatan lokasi patah tarik (BBGM / BOGM) ikut dicetak di Remarks: teks bawaan form Tensile Material/Weld
  // dipertahankan, dan ditambahkan di form lain bila singkatan itu dipakai. Isian Remarks pengguna tetap di baris pertama.
  if (refs.remarks) {
    const own = clean(r.remarks) && clean(r.remarks) !== '-' ? String(r.remarks).trim() : '';
    const formLegend = /BBGM|BOGM/.test(cellText(refs.remarks)) ? cellText(refs.remarks) : '';
    const used = (r.rows || []).some(row => Object.values(row || {}).some(v => /\bB[BO]GM\b/i.test(String(v))));
    const legend = formLegend || (used ? GAUGE_LEGEND : '');
    if (legend) values[refs.remarks] = own ? own + '\n' + legend : legend;
  }
  // Testing Machine Used dipilih dari Master Equipment (teks sudah memuat model & S/N): baris contoh "S/N : ..." bawaan
  // form di bawahnya dikosongkan supaya tidak tercetak nomor seri alat lain.
  if (r.testing_machine && refs.machine) {
    const mRow = Number(refs.machine.replace(/[A-Z]+/, ''));
    const rRow = refs.remarks ? Number(refs.remarks.replace(/[A-Z]+/, '')) : mRow + 4;
    tpl.rows.filter(x => x.r > mRow && x.r < rRow).forEach(x => x.cells.forEach(c => { if (/^S\/N\b/.test(clean(c.v))) values[c.ref] = ''; }));
  }
  // PO / Project Name: sel aslinya hanya memuat "-" (tanpa colspan); lebarkan agar isian panjang tidak terpotong
  ['po', 'project'].forEach(k => {
    const ref = refs[k];
    if (!ref) return;
    const cell = tpl.rows.find(x => x.r === Number(ref.replace(/[A-Z]+/, ''))).cells.find(c => c.ref === ref);
    if (cell && !cell.cs) spans[ref] = 7;
  });
  // Test Conducted by / Witnessed By / Remarks: sel isian tunggal (kadang berformat rata tengah); lebarkan ke kanan
  // sepanjang sel kosong yang tidak digabung, rata kiri, supaya nama panjang tidak terpotong.
  ['conducted', 'witnessed', 'remarks'].forEach(k => {
    const ref = refs[k];
    if (!ref || spans[ref]) return;
    const row = tpl.rows.find(x => x.r === Number(ref.replace(/[A-Z]+/, '')));
    const at = row.cells.findIndex(c => c.ref === ref);
    if (at < 0 || row.cells[at].cs) return;
    let n = 1;
    while (n < 18 && row.cells[at + n] && !row.cells[at + n].cs && !row.cells[at + n].rs && clean(row.cells[at + n].v) === '' && !/background:/.test(tpl.styles[row.cells[at + n].s] || '')) n++;
    if (n > 1) spans[ref] = n;
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

// ---- Ferrite (ASTM E562 point count) ----
// Halaman utama memuat ringkasan per lokasi (Base Metal / HAZ / Weld Metal); tiap lokasi punya halaman
// Lampiran #16 berisi hitungan titik per medan (Pi). Rumus lampiran mengikuti sel Excel aslinya:
//   (Pi / PT) x 100 per medan; Pp = rata-rata; s = STDEV (sampel); 95% CI = t x s / sqrt(n); % RA = 95% CI / Pp x 100.
const FERRITE_ATT = {
  'ferrite-weld': { 'Base Metal': 'ferrite-weld-att-bm', 'HAZ': 'ferrite-weld-att-haz', 'Weld Metal': 'ferrite-weld-att-wm' },
  'ferrite-mat': { 'Base Metal': 'ferrite-mat-att' }
};
const FERRITE_FIELDS = 30;          // baris medan di form lampiran (A24..A53 di Excel)
const FERRITE_DEFAULT_N = 30;
const FERRITE_DEFAULT_PT = 16;

function ferriteLocations(key) { return Object.keys(FERRITE_ATT[key] || {}); }

// t Student dua sisi 95% menurut derajat bebas (n - 1); Excel aslinya memakai 2.045 tetap (n = 30).
const T95 = [0, 12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.160, 2.145, 2.131,
  2.120, 2.110, 2.101, 2.093, 2.086, 2.080, 2.074, 2.069, 2.064, 2.060, 2.056, 2.052, 2.048, 2.045];
const tValue = n => T95[Math.min(Math.max(n - 1, 1), 29)];

const fmt = (v, d) => (Number.isFinite(v) ? v.toFixed(d) : '');

// hasil hitung satu lokasi; null bila belum ada Pi yang diisi
function ferriteStats(loc) {
  const n = Math.min(FERRITE_FIELDS, Math.max(1, parseInt(loc.n, 10) || FERRITE_DEFAULT_N));
  const pt = parseFloat(loc.pt) || FERRITE_DEFAULT_PT;
  const raw = Array.from({ length: FERRITE_FIELDS }, (_, i) => (loc.pi || [])[i]);
  if (!raw.slice(0, n).some(v => String(v == null ? '' : v).trim() !== '')) return { n, pt, empty: true };
  const pi = raw.slice(0, n).map(v => num(v) || 0);
  const pct = pi.map(v => (v / pt) * 100);
  const mean = pct.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(pct.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
  const ci = (tValue(n) * sd) / Math.sqrt(n);
  const ra = mean ? (ci / mean) * 100 : NaN;
  return { n, pt, pi, pct, sumPi: pi.reduce((a, b) => a + b, 0), sumPct: pct.reduce((a, b) => a + b, 0), mean, sd, ci, ra };
}

function fillFerriteAttachment(r, template, locName, loc) {
  const base = fillLabelled({ ...r, template });
  const st = ferriteStats(loc || {});
  const v = base.values;
  v.E20 = String(st.n);
  v.E21 = String(st.pt);
  for (let i = 0; i < FERRITE_FIELDS; i++) {
    const row = 24 + i;
    const used = i < st.n;
    v['E' + row] = used && !st.empty ? blank((loc.pi || [])[i]) : '';
    v['I' + row] = used && !st.empty ? String(Math.round(st.pct[i])) : '';   // format Excel "0"
  }
  if (!st.empty) {
    v.E54 = String(st.sumPi);
    v.I54 = fmt(st.sumPct, 2);
    v.Y24 = fmt(st.mean, 2); v.Y25 = fmt(st.sd, 2); v.Y26 = fmt(st.ci, 2); v.Y27 = Number.isFinite(st.ra) ? fmt(st.ra, 2) : '-';
  } else {
    v.E54 = ''; v.I54 = ''; v.Y24 = ''; v.Y25 = ''; v.Y26 = ''; v.Y27 = '';
  }
  return { values: v, spans: {}, sigAt: null, stats: st };
}

function fillFerrite(r) {
  const base = fillLabelled(r);
  const tpl = loadTemplate(r.template);
  const f = r.fields || {};
  const data = f.ferrite || {};
  const locs = ferriteLocations(r.template);
  const attachments = [];
  // baris ringkasan: sel "Location" (kolom J) berisi nama lokasi; Estimated Volume di S, % RA di AB pada baris yang sama
  let firstRow = true;
  for (const row of tpl.rows) {
    const cell = row.cells.find(c => c.c === 9 && locs.includes(clean(c.v)));
    if (!cell) continue;
    const name = clean(cell.v);
    const a = fillFerriteAttachment(r, FERRITE_ATT[r.template][name], name, data[name]);
    attachments.push({ template: FERRITE_ATT[r.template][name], fill: a });
    base.values['S' + row.r] = a.stats.empty ? '' : fmt(a.stats.mean, 2);
    base.values['AB' + row.r] = a.stats.empty || !Number.isFinite(a.stats.ra) ? '' : fmt(a.stats.ra, 2);
    if (firstRow) {
      const idCell = tpl.rows.find(x => x.r === row.r).cells.find(c => c.c === 0);
      if (idCell) base.values[idCell.ref] = dash(f.sample_id);
      firstRow = false;
    }
  }
  return { ...base, attachments };
}

// ---- Fillet Weld Break ----
// Satu blok per spesimen: Specimen No (A) | Acceptance Criteria (E, teks tetap dari standar) | Remarks (Y, per
// kriteria) | Test Result (AF). Blok = semua baris di bawah header "Specimen No" sampai sebelum "Testing Machine Used".
const fwbCache = {};
function fwbInfo(key) {
  if (fwbCache[key]) return fwbCache[key];
  const tpl = loadTemplate(key);
  const head = tpl.rows.find(row => row.cells.some(c => c.c === 0 && clean(c.v) === 'Specimen No'));
  const from = head.r + 1;
  let to = from;
  const criteria = [];
  for (const row of tpl.rows) {
    if (row.r < from) continue;
    if (row.cells.some(c => clean(c.v) === 'Testing Machine Used')) break;
    row.cells.forEach(c => {
      if (!clean(c.v)) return;
      to = Math.max(to, row.r + (c.rs || 1) - 1);
      if (c.c === 24) criteria.push({ off: row.r - from, text: clean(c.v) });   // kolom Y = Remarks
    });
  }
  return (fwbCache[key] = { from, to, criteria });
}

function fillFwb(r) {
  const base = fillLabelled(r);
  const info = fwbInfo(r.template);
  const rows = (r.rows || []).length ? r.rows : [{}];
  const items = rows.map(row => {
    const it = { 'A+0': dash(row.marking_specimen), 'AF+0': resultText(row.result) };
    info.criteria.forEach((c, i) => {
      const own = clean((row.remarks || [])[i]);
      it['Y+' + c.off] = own || c.text;   // kosong -> teks bawaan form
    });
    return it;
  });
  return { ...base, blocks: { from: info.from, to: info.to, items } };
}

// ---- Flattening Test (material) ----
// Form punya dua kolom spesimen (FT-1, FT-2); lebih dari dua spesimen dicetak sebagai halaman tambahan dengan
// form yang sama (dua spesimen per halaman). H dihitung dari rumus di form: H = (1 + e) t / (e + t / D).
const FLAT_ROWS = { name: 32, length: 33, od: 34, wt: 35, e: 36, h: 37, first: 39, second: 40 };

function flatH(row) {
  const D = num(row.od), t = num(row.wt), e = num(row.e);
  if (D === null || t === null || e === null || D === 0) return '';
  const denom = e + t / D;
  return denom ? ((1 + e) * t / denom).toFixed(2) : '';
}

function fillFlat(r) {
  const rows = (r.rows || []).length ? r.rows : [{}];
  const pages = [];
  for (let i = 0; i < rows.length; i += 2) pages.push(rows.slice(i, i + 2));
  const build = pair => {
    const base = fillLabelled(r);
    [['Q', pair[0]], ['AA', pair[1]]].forEach(([col, row]) => {
      const set = (n, v) => { base.values[col + n] = v; };
      if (!row) { Object.values(FLAT_ROWS).forEach(n => set(n, '')); return; }
      set(FLAT_ROWS.name, dash(row.marking_specimen));
      set(FLAT_ROWS.length, blank(row.length));
      set(FLAT_ROWS.od, blank(row.od));
      set(FLAT_ROWS.wt, blank(row.wt));
      set(FLAT_ROWS.e, blank(row.e));
      set(FLAT_ROWS.h, blank(row.h) || flatH(row));
      set(FLAT_ROWS.first, blank(row.first));
      set(FLAT_ROWS.second, blank(row.second));
    });
    return base;
  };
  const main = build(pages[0]);
  main.attachments = pages.slice(1).map(p => ({ template: r.template, fill: build(p) }));
  return main;
}

// ---- Hardness (Vickers) ----
// Dua halaman: "Sketch Hardness" (HT1) lalu hasil (HT2). Weld: sketsa posisi titik sudah tercetak di form; hasil 2 baris
// (Line 1 / Line 2) x 9 titik (Base Metal 1-3, HAZ 4-6, Weld Metal 7-9). Material: area sketsa diisi gambar yang diunggah
// pada sheet; hasil 1 baris x 5 titik.
const HARD = {
  'hard-weld': {
    att: 'hard-weld-att', spec: 'J36', lines: 2, points: 9,
    sketchBox: ['A36', 'AJ47'], formSketch: im => im.y >= 544 && im.y < 800, table: [36, 44],
    cells: [['J', 'M', 'P', 'S', 'V', 'Y', 'AB', 'AE', 'AH'].map(c => c + '40'), ['J', 'M', 'P', 'S', 'V', 'Y', 'AB', 'AE', 'AH'].map(c => c + '44')]
  },
  'hard-mat': {
    att: 'hard-mat-att', spec: 'G34', lines: 1, points: 5,
    cells: [['G', 'M', 'S', 'Y', 'AE'].map(c => c + '38')], sketchBox: ['A34', 'AJ45'], table: [34, 38]
  }
};
// Pola Hardness (Master Data) yang disalin ke Lembar: { lines: [label], zones: [{name, points}], sketch }. Pola yang
// susunannya sama dengan form resmi tetap dicetak di sel-sel form; selain itu tabel hasil dibuat menurut pola.
function hardPattern(r) {
  const p = (r.fields || {}).pattern;
  return p && Array.isArray(p.zones) && p.zones.length && Array.isArray(p.lines) && p.lines.length ? p : null;
}
function hardMatchesForm(key, p) {
  const z = p.zones.map(x => [String(x.name || '').trim().toLowerCase(), Number(x.points)].join(':')).join('|');
  if (key === 'hard-weld') return p.lines.length === 2 && z === 'base metal:3|haz:3|weld metal:3' && p.lines.every((l, i) => l === 'Line ' + (i + 1));
  return p.lines.length === 1 && p.zones.length === 1 && Number(p.zones[0].points) === 5;
}
const HARD_HEAD = 'th-head';
function hardTableHtml(p, data, spec, width) {
  const total = p.zones.reduce((n, z) => n + Number(z.points), 0);
  const labelW = 92, locW = 115, ptW = (width - labelW - locW) / total;
  const named = p.zones.some(z => String(z.name || '').trim());
  const td = (cls, text, attrs = '') => `<td class="${cls}" ${attrs} style="text-align:center;vertical-align:middle">${esc(text)}</td>`;
  const rows = [`<tr style="height:32px">${td(HARD_HEAD, 'Material Specification', 'colspan="2"')}${td('th-body th-a', dash(spec), `colspan="${total}"`)}</tr>`];
  p.lines.forEach((label, li) => {
    const zc = 'th-body th-' + (li % 2 ? 'b' : 'a');
    const vals = (data.lines || [])[li] || [];
    rows.push('<tr style="height:8px"><td colspan="' + (total + 2) + '" style="padding:0"></td></tr>');
    let n = 0;
    if (named) rows.push(`<tr style="height:16px">${td(HARD_HEAD, label, 'rowspan="3"')}${td(HARD_HEAD, 'Location', 'rowspan="2"')}${p.zones.map(z => td(HARD_HEAD, z.name, `colspan="${z.points}"`)).join('')}</tr>`);
    rows.push(`<tr style="height:16px">${named ? '' : td(HARD_HEAD, label, 'rowspan="2"') + td(HARD_HEAD, 'Location')}${Array.from({ length: total }, () => td(HARD_HEAD, String(++n))).join('')}</tr>`);
    rows.push(`<tr style="height:24px">${td(HARD_HEAD, 'Result')}${Array.from({ length: total }, (_, i) => td(zc, blank(vals[i]))).join('')}</tr>`);
  });
  // lebar dalam persen: tabel mengikuti lebar halaman setelah kolom form dipersempit agar muat A4
  const pct = v => (v / width * 100).toFixed(3) + '%';
  return `<table style="width:100%;table-layout:fixed;border-collapse:collapse;font-family:'Arial Narrow',Arial,sans-serif;font-size:9pt"><colgroup><col style="width:${pct(labelW)}"><col style="width:${pct(locW)}">${Array.from({ length: total }, () => `<col style="width:${pct(ptW)}">`).join('')}</colgroup><tbody>${rows.join('')}</tbody></table>`;
}
const HARD_TYPE = 'Vickers Hardness Number (HV) Load Test, 10 Kgf';

function hardInfo(key) { return HARD[key] ? { lines: HARD[key].lines, points: HARD[key].points } : null; }

function fillHardAtt(r, h) {
  const base = fillLabelled({ ...r, template: h.att });
  const data = ((r.fields || {}).hardness) || {};
  const v = base.values;
  if (h.lines === 1) v.J29 = HARD_TYPE;   // sel Type of Test pada lampiran Material kosong di form aslinya
  v[h.spec] = dash(((r.fields || {}).spec) || (r.coupon || {}).material_type_grade);
  const p = hardPattern(r);
  if (p && !hardMatchesForm(r.template, p)) {
    const t = loadTemplate(h.att);
    base.inject = { from: h.table[0], to: h.table[1], html: hardTableHtml(p, data, (r.fields || {}).spec || (r.coupon || {}).material_type_grade, t.cols.reduce((a, b) => a + b, 0)) };
    return base;
  }
  h.cells.forEach((row, li) => row.forEach((ref, pi) => { v[ref] = blank(((data.lines || [])[li] || [])[pi]); }));
  return base;
}

function fillHard(r) {
  const h = HARD[r.template];
  const base = fillLabelled(r);
  // sketsa: unggahan di Lembar > sketsa Pola Hardness > sketsa bawaan form (Weld)
  const p = hardPattern(r);
  const sketch = [(r.fields || {}).sketch, p && p.sketch].find(s => /^data:image\//.test(s || ''));
  if (sketch) {
    base.overlays = [{ ref: h.sketchBox[0], toRef: h.sketchBox[1], src: sketch }];
    if (h.formSketch) base.dropImages = h.formSketch;
  }
  base.attachments = [{ template: h.att, fill: fillHardAtt(r, h) }];
  return base;
}

// ---- Corrosion (Pitting G48, Intergranular A262 B/C/E, G28) ----
// Halaman utama berisi tabel berat sebelum/sesudah (5 penimbangan) + hasil hitung; di belakangnya halaman foto sampel
// (kotak foto diisi foto unggahan, lihat tabel test_report_photos) dan, untuk Practice C, halaman per periode.
// Rumus memakai isian sheet (jam uji, luas permukaan) — bukan angka tetap seperti di sel Excel aslinya (72 jam, dst.).
const CORR = {
  'corr-pit-mat': { kind: 'pit-mat', photoPages: ['corr-pit-mat-ph1', 'corr-pit-mat-ph2'] },
  'corr-pit-weld': { kind: 'pit-weld', photoPages: ['corr-pit-weld-ph1', 'corr-pit-weld-ph2'] },
  'corr-b-weld': { kind: 'b', photoPages: ['corr-b-weld-ph'] },
  'corr-c-weld': { kind: 'c', periodPage: 'corr-c-weld-per', photoPages: [] },
  'corr-e-mat': { kind: 'e', photoPages: [] },
  'corr-g28': { kind: 'g28', photoPages: ['corr-g28-ph1', 'corr-g28-ph2'] }
};
const CORR_AREA_DIV = { 'pit-mat': 100, 'pit-weld': 1e6, b: 1e6, c: 1e6, g28: 100 };   // mm2 -> satuan form (cm2 / m2)
const CORR_AREA_UNIT = { 'pit-mat': 'cm2', 'pit-weld': 'm2', b: 'm2', c: 'm2', g28: 'cm2' };
const CORR_DEFAULT_DENSITY = 8.14;   // g/cm3, baja tahan karat (nilai di rumus Excel G28)
const CORR_C_HOURS = 48;

const cellsOf = key => loadTemplate(key).rows.flatMap(row => row.cells.map(c => ({ ...c, row: row.r })));
const textRows = (key, col, startsWith) => cellsOf(key).filter(c => c.c === col && clean(c.v).toLowerCase().startsWith(startsWith.toLowerCase())).map(c => c.row);

function corrInfo(key) {
  const cfg = CORR[key];
  if (!cfg) return null;
  const tpl = loadTemplate(key);
  const body = (col, head) => { const hit = cellsOf(key).find(c => c.c === col && clean(c.v).startsWith(head)); return hit ? clean(((cellsOf(key).find(x => x.row === hit.row + 1 && x.c === col)) || {}).v) : ''; };
  const slotPages = [];
  const addPage = (template, label) => { const t = loadTemplate(template); if ((t.slots || []).length) slotPages.push({ template, label, slots: t.slots.map(s => ({ slot: template + '/' + s.id, label: s.label })) }); };
  addPage(key, 'Halaman utama');
  (cfg.photoPages || []).forEach((p, i) => addPage(p, 'Halaman foto ' + (i + 1)));
  return {
    kind: cfg.kind,
    weights: cfg.kind !== 'e',
    periods: cfg.kind === 'c' ? 3 : 1,
    density: cfg.kind === 'g28',
    areaUnit: CORR_AREA_UNIT[cfg.kind] || '',
    summary: body(cfg.kind === 'e' ? 26 : 0, 'Summary of'),
    observation: cfg.kind === 'e' ? body(26, 'Examination Result') : (cfg.kind === 'pit-mat' || cfg.kind === 'pit-weld' ? body(22, 'Observation') : ''),
    periodObservation: cfg.kind === 'c' ? true : false,
    photos: slotPages
  };
}

// semua id slot foto sebuah form ("<template>/<id>"), untuk validasi unggahan
function photoSlotIds(key) {
  if (PSET[key]) return Array.from({ length: PSET_MAX * PSET[key].labels.length }, (_, i) => key + '/s' + (i + 1));
  if (key === 'grain') return Array.from({ length: GRAIN_MAX }, (_, i) => 'grain/s' + (i + 1));
  if (MACRO[key] || MICRO[key]) return Array.from({ length: MACRO_MAX_PHOTOS }, (_, i) => key + '/s' + (i + 1));
  const info = corrInfo(key);
  return info ? info.photos.flatMap(p => p.slots.map(sl => sl.slot)) : [];
}

const gnum = x => (Number.isFinite(x) ? x : null);
const mean = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
// bilangan "General" ala Excel: s.d. 5 desimal tanpa nol di belakang; sangat kecil/besar -> notasi ilmiah (8.98709E-05)
function gfmt(x) {
  if (x === null || !Number.isFinite(x)) return '';
  // seperti format "General" Excel: 7 angka bermakna; < 0.0001 atau >= 1e6 -> notasi ilmiah (7.90960E-05)
  if (x !== 0 && (Math.abs(x) < 0.0001 || Math.abs(x) >= 1e6)) return x.toExponential(5).replace(/e([+-])([0-9])$/, 'e$10$2').toUpperCase();
  return String(parseFloat(x.toPrecision(7)));
}
const nums = arr => (Array.isArray(arr) ? arr : []).slice(0, 5).map(v => num(v)).filter(v => v !== null);

function corrArea(c, kind) {
  const typed = num(c.area);
  if (typed !== null) return typed;
  const L = num(c.l), W = num(c.w), T = num(c.t);
  if (L === null || W === null || T === null) return null;
  return (2 * L * W + 2 * L * T + 2 * W * T) / CORR_AREA_DIV[kind];
}

function corrText(r, c, key, which, def) {
  const own = clean(which === 'obs' ? c.observation : c.summary);
  const hours = clean(c.hours);
  if (own) return String(which === 'obs' ? c.observation : c.summary).trim();
  return def.split('xxx').join(hours || '-');
}

function corrTextCell(key, col, head) {
  const hit = cellsOf(key).find(x => x.c === col && clean(x.v).startsWith(head));
  if (!hit) return null;
  const body = cellsOf(key).find(x => x.row === hit.row + 1 && x.c === col);
  return body ? { ref: body.ref, text: clean(body.v), raw: String(body.v == null ? '' : body.v) } : null;
}

function fillCorrCommon(r, key, kind, c) {
  const base = fillLabelled({ ...r, template: key });
  const refs = locate(key);
  const hours = clean(c.hours);
  const per = cellsOf(key).find(x => x.c === 0 && clean(x.v) === 'Period of Test');
  if (per && kind !== 'c') {
    const cur = clean((cellsOf(key).find(x => x.row === per.row && x.c === 9) || {}).v);
    base.values['J' + per.row] = hours ? hours + ' Hours' : cur.split('xxx').join('-');
  }
  const vol = cellsOf(key).find(x => x.c === 22 && clean(x.v) === 'Volume Test Solution');
  if (vol) {
    const cur = clean((cellsOf(key).find(x => x.row === vol.row && x.c === 29) || {}).v);
    base.values['AD' + vol.row] = clean(c.volume) || cur;
    const vcell = cellsOf(key).find(x => x.row === vol.row && x.c === 29);
    if (vcell && !vcell.cs) base.spans['AD' + vol.row] = 2;   // sel isian tanpa merge dilebarkan agar angka tidak terpotong
  }
  return base;
}

function fillCorrStats(base, key, kind, c, area) {
  const v = base.values;
  const before = nums(c.before), after = nums(c.after);
  const hours = num(c.hours);
  const avgB = mean(before), avgA = mean(after);
  const loss = avgB !== null && avgA !== null ? avgB - avgA : null;
  const cols = ['Q', 'T', 'W', 'Z', 'AC'];
  const rb = textRows(key, 9, 'Weight before test')[0], ra = textRows(key, 9, 'Weight after test')[0];
  cols.forEach((col, i) => {
    v[col + rb] = blank((c.before || [])[i]);
    v[col + ra] = blank((c.after || [])[i]);
  });
  v['AF' + rb] = gfmt(avgB); v['AF' + ra] = gfmt(avgA);
  const sid = cellsOf(key).find(x => x.c === 0 && x.row === rb);
  if (sid) v[sid.ref] = dash(clean(c.sample_id));
  const area0 = area;
  const put = (label, val, occurrence = 0) => { const rows = textRows(key, 9, label); if (rows[occurrence] !== undefined) v['T' + rows[occurrence]] = gfmt(val); };
  put('Surface Area', area0);
  put('Sample Weight loss', loss);
  const ok = loss !== null && area0 && hours;
  if (kind === 'pit-mat' || kind === 'b') put('Weight loss rate', ok ? loss / (area0 * hours) : null);
  if (kind === 'pit-weld') {
    const rate = ok ? loss / area0 / (hours / 24) : null;
    put('Weight loss rate', rate, 0);
    put('Weight loss rate', rate === null ? null : rate / 100, 1);
  }
  if (kind === 'g28') {
    const dens = num(c.density) || CORR_DEFAULT_DENSITY;
    put('Corrosion rate', ok ? (3450000 * loss) / (area0 * hours * dens) : null);
  }
}

function fillCorrTexts(base, key, kind, c, r) {
  const info = corrInfo(key);
  const sCell = corrTextCell(key, kind === 'e' ? 26 : 0, 'Summary of');
  if (sCell) base.values[sCell.ref] = corrText(r, c, key, 'sum', sCell.raw);
  const oCell = kind === 'e' ? corrTextCell(key, 26, 'Examination Result') : corrTextCell(key, 22, 'Observation');
  if (oCell && (kind === 'e' || kind === 'pit-mat' || kind === 'pit-weld')) base.values[oCell.ref] = corrText(r, c, key, 'obs', oCell.raw);
  return info;
}

function fillCorrC(r, cfg, c) {
  const key = r.template;
  const base = fillCorrCommon(r, key, 'c', c);
  const v = base.values;
  const area = corrArea(c, 'c');
  const hoursP = num(c.hours) || CORR_C_HOURS;   // jam per periode
  const periods = [0, 1, 2].map(p => {
    const before = nums((c.periods || [])[p] && c.periods[p].before), after = nums((c.periods || [])[p] && c.periods[p].after);
    const avgB = mean(before), avgA = mean(after);
    const loss = avgB !== null && avgA !== null ? avgB - avgA : null;
    const rate = loss !== null && area ? loss / (area * hoursP) : null;
    return { avgB, avgA, loss, rate, raw: (c.periods || [])[p] || {} };
  });
  const rbs = cellsOf(key).filter(x => clean(x.v) === 'Weight before test (g)').map(x => x.row);
  const ras = cellsOf(key).filter(x => clean(x.v) === 'Weight after test (g)').map(x => x.row);
  const cols = ['N', 'Q', 'T', 'W', 'Z'];
  periods.forEach((p, i) => {
    cols.forEach((col, k) => { v[col + rbs[i]] = blank((p.raw.before || [])[k]); v[col + ras[i]] = blank((p.raw.after || [])[k]); });
    v['AC' + rbs[i]] = gfmt(p.avgB); v['AC' + ras[i]] = gfmt(p.avgA);
    v['AG' + rbs[i]] = gfmt(p.loss);
  });
  const rateRows = cellsOf(key).filter(x => x.c === 4 && ['1', '2', '3'].includes(clean(x.v)) && x.row > ras[2]).map(x => x.row);
  periods.forEach((p, i) => { v['H' + rateRows[i]] = gfmt(p.rate); });
  const aRow = cellsOf(key).find(x => clean(x.v).startsWith('Surface Area')).row;
  v['T' + aRow] = gfmt(area);
  const avgRow = cellsOf(key).find(x => clean(x.v).startsWith('Average Weight loss rate')).row;
  v['T' + avgRow] = gfmt(mean(periods.map(p => p.rate).filter(x => x !== null)));
  const sid = cellsOf(key).find(x => x.c === 0 && x.row === rbs[0]);
  if (sid) v[sid.ref] = dash(clean(c.sample_id));
  const sCell = corrTextCell(key, 0, 'Summary of');
  if (sCell) v[sCell.ref] = corrText(r, c, key, 'sum', sCell.raw);

  // halaman Periode 2 dan 3 (form aslinya hanya punya kedua halaman ini); isi diambil dari tabel periode di atas
  base.attachments = [1, 2].map(i => {
    const pk = cfg.periodPage;
    const pb = fillCorrCommon(r, pk, 'c', c);
    const pv = pb.values;
    const head = cellsOf(pk).find(x => clean(x.v).startsWith('Periode'));
    if (head) pv[head.ref] = 'Periode ' + (i + 1);
    const p = periods[i];
    const prb = textRows(pk, 9, 'Weight before test')[0], pra = textRows(pk, 9, 'Weight after test')[0];
    ['Q', 'T', 'W', 'Z', 'AC'].forEach((col, k) => { pv[col + prb] = blank((p.raw.before || [])[k]); pv[col + pra] = blank((p.raw.after || [])[k]); });
    pv['AF' + prb] = gfmt(p.avgB); pv['AF' + pra] = gfmt(p.avgA);
    const psid = cellsOf(pk).find(x => x.c === 0 && x.row === prb);
    if (psid) pv[psid.ref] = dash(clean(c.sample_id));
    const putp = (label, val) => { const rows = textRows(pk, 9, label); if (rows[0] !== undefined) pv['T' + rows[0]] = gfmt(val); };
    putp('Surface Area', area); putp('Sample Weight loss', p.loss); putp('Weight loss rate', p.rate);
    const ps = corrTextCell(pk, 0, 'Summary of');
    if (ps) pv[ps.ref] = corrText(r, c, pk, 'sum', ps.raw);
    const po = corrTextCell(pk, 22, 'Observation');
    const ownObs = clean(((c.obs || [])[i - 1]));
    if (po) pv[po.ref] = ownObs ? String(c.obs[i - 1]).trim() : '';
    return { template: pk, fill: { ...pb, sigAt: pb.sigAt } };
  });
  return base;
}

function fillCorr(r) {
  const cfg = CORR[r.template];
  const c = ((r.fields || {}).corr) || {};
  const kind = cfg.kind;
  if (kind === 'c') return fillCorrC(r, cfg, c);
  const base = fillCorrCommon(r, r.template, kind, c);
  if (kind !== 'e') fillCorrStats(base, r.template, kind, c, corrArea(c, kind));
  fillCorrTexts(base, r.template, kind, c, r);
  base.attachments = (cfg.photoPages || []).map(pk => ({ template: pk, fill: fillLabelled({ ...r, template: pk }) }));
  return base;
}

// ---- Macro-Etching & Examination ----
// Satu halaman per spesimen (baris): tabel Specimen No / Thickness / Width / Magnification / Result, blok keterangan
// khusus form (Butt: tipe sambungan, fusion, crack, ...; Fillet: weld size x/y, root penetration) dan satu foto makro
// (slot s<n> untuk spesimen ke-n; label putih di atas foto berisi penanda spesimen).
const MACRO = {
  'macro-mat': {
    row: 34, specCol: 'A', cols: { thickness: 'H', width: 'O', mag: 'W', result: 'AD' }, magDef: '10x', kv: []
  },
  'macro-butt': {
    row: 36, specCol: 'A', cols: { thickness: 'E', width: 'I', mag: 'M', result: 'R' }, magDef: '10X',
    kv: [
      { key: 'weld_type', label: 'Weld type joint', ref: 'AE38', def: 'Groove Weld' }, { key: 'fusion', label: 'Fusion', ref: 'AE39', def: 'Good' },
      { key: 'crack', label: 'Crack', ref: 'AE40', def: 'None' }, { key: 'undercut', label: 'Undercut', ref: 'AE41', def: 'None' },
      { key: 'porosity', label: 'Porosity', ref: 'AE42', def: 'None' }, { key: 'slag', label: 'Slag', ref: 'AE43', def: 'None' },
      { key: 'deposit', label: 'Deposite weld size (mm)', ref: 'AE44', def: '' }
    ]
  },
  'macro-fillet': {
    row: 36, specCol: 'A', cols: { thickness: 'E', width: 'I', mag: 'M', result: 'R' }, magDef: '10X',
    kv: [
      { key: 'size_x', label: 'Weld Size x (mm)', ref: 'AB44', def: '' }, { key: 'size_y', label: 'Weld Size y (mm)', ref: 'AF44', def: '' },
      { key: 'root', label: 'Root Penetration', ref: 'AB46', def: 'Good' }
    ]
  }
};
const MACRO_MAX_PHOTOS = 20;

function macroInfo(key) {
  const m = MACRO[key];
  return m ? { kv: m.kv.map(({ key: k, label, def }) => ({ key: k, label, def })), magDef: m.magDef } : null;
}

function fillMacro(r) {
  const m = MACRO[r.template];
  const rows = (r.rows || []).length ? r.rows : [{}];
  const coupon = r.coupon || {};
  const build = (row, idx) => {
    const base = fillLabelled(r);
    const v = base.values;
    v[m.specCol + m.row] = dash(row.marking_specimen);
    v[m.cols.thickness + m.row] = dash(row.thickness);
    v[m.cols.width + m.row] = dash(row.width);
    v[m.cols.mag + m.row] = blank(row.mag) || m.magDef;
    v[m.cols.result + m.row] = dash(blank(row.result).replace(/^[a-z]/, ch => ch.toUpperCase()));   // "accepted" -> "Accepted"
    m.kv.forEach(f => { v[f.ref] = blank(row[f.key]) || f.def || '-'; });
    base.photos = { s1: (r.photo_data || {})[r.template + '/s' + (idx + 1)] };
    // label di atas foto: penanda spesimen (Fillet: sample marking / welder (posisi))
    if (r.template === 'macro-fillet') {
      const w = clean(r.welder_name), pos = clean(coupon.welding_position);
      base.captions = [clean(r.sample_marking), w ? w + (pos ? ' (' + pos + ')' : '') : ''].filter(Boolean).join(' / ') || clean(row.marking_specimen);
    } else base.captions = clean(row.marking_specimen);
    return base;
  };
  const pages = rows.map(build);
  const main = pages[0];
  main.attachments = pages.slice(1).map(p => ({ template: r.template, fill: p }));
  return main;
}

// ---- Microstructure / Metallography ----
// Satu halaman per spesimen (baris sheet). Form biasa: Sample Identification + dua foto (sampel makro & mikrostruktur).
// Form Thickness: satu foto mikrostruktur + tabel Spot No. 1-5 (Thickness µm) dan Average (dihitung).
// Foto spesimen ke-n memakai slot "<template>/s<n>" (Thickness) atau s<2n-1>, s<2n> (biasa).
const MICRO = {
  'micro-weld': { thick: false }, 'micro-mat': { thick: false },
  'micro-thick-weld': { thick: true }, 'micro-thick-mat': { thick: true }
};
const MICRO_MAX_ROWS = 10;
const MICRO_THICK_COLS = ['L', 'Q', 'V', 'AA', 'AF'];

function microInfo(key) {
  const m = MICRO[key];
  return m ? { thick: m.thick, photosPerRow: m.thick ? 1 : 2, photoLabels: loadTemplate(key).slots.map(s => s.label) } : null;
}

function fillMicro(r) {
  const key = r.template;
  const m = MICRO[key];
  const rows = (r.rows || []).length ? r.rows : [{}];
  const perRow = m.thick ? 1 : 2;
  const head = cellsOf(key).find(x => clean(x.v) === 'Sample Identification');
  const idRef = head ? cellsOf(key).find(x => x.row === head.row + 1 && x.c === head.c).ref : null;
  const build = (row, idx) => {
    const base = fillLabelled(r);
    const v = base.values;
    if (idRef) v[idRef] = dash(row.marking_specimen);
    if (m.thick) {
      const tRow = cellsOf(key).find(x => clean(x.v).startsWith('Thickness (')).row;
      const aRow = cellsOf(key).find(x => clean(x.v).startsWith('Average (')).row;
      const vals = [1, 2, 3, 4, 5].map(k => num(row['t' + k])).map((n, i) => (n === null ? null : { n, raw: clean(row['t' + (i + 1)]) }));
      MICRO_THICK_COLS.forEach((col, i) => { v[col + tRow] = vals[i] ? vals[i].raw : ''; });
      const used = vals.filter(Boolean).map(x => x.n);
      v['L' + aRow] = used.length ? String(Math.round((used.reduce((s, x) => s + x, 0) / used.length) * 100) / 100) : '';
    }
    base.photos = {};
    for (let p = 0; p < perRow; p++) base.photos['s' + (p + 1)] = (r.photo_data || {})[key + '/s' + (idx * perRow + p + 1)];
    // hanya satu dari dua foto (makro / mikro) yang diunggah: foto itu mengisi area kedua kotak, di tengah (shrink to fit),
    // dan garis penunjuk dari foto makro ke foto mikro tidak dicetak
    const got = Object.values(base.photos).filter(Boolean);
    if (perRow === 2 && got.length === 1) {
      const [a, b] = loadTemplate(key).slots;
      const y = Math.min(a.y, b.y);
      base.slots = [{ id: 'one', x: a.x, y, w: b.x + b.w - a.x, h: Math.max(a.y + a.h, b.y + b.h) - y, fit: 'contain' }];
      base.photos = { one: got[0] };
      base.dropShapes = sh => sh.type === 'line' && sh.h >= 3;
    }
    return base;
  };
  const pages = rows.slice(0, MICRO_MAX_ROWS).map(build);
  const main = pages[0];
  main.attachments = pages.slice(1).map(p => ({ template: key, fill: p }));
  return main;
}

// ---- Nick Break (DE.1/TR/07/NB, Weld) ----
// Tabel per spesimen: Kind of Discontinuities/Defect, Depth, Length, Distance between slag inclusions, Result.
function fillNb(r) {
  const base = fillLabelled(r);
  const rows = (r.rows || []).length ? r.rows : [{}];
  const cap = v => dash(blank(v).replace(/^[a-z]/, ch => ch.toUpperCase()));
  // `observation`: sheet lama (sebelum form resmi) menyimpan teks cacat di kolom itu
  base.repeat = {
    row: 36,
    items: rows.map(row => ({ A: dash(row.marking_specimen), F: dash(row.defect || row.observation), P: dash(row.depth), U: dash(row.length), Z: dash(row.distance), AF: cap(row.result) }))
  };
  base.hideRows = [37];
  return base;
}

// ---- Determination of the apparent grain size (DE.1/TR/22/GRAIN-SIZE) ----
// Satu baris = satu field pengamatan (maks. 5): jumlah intercept pada 3 garis ukur (l1..l3) + panjang total garis (len, mm).
// Halaman utama merangkum 5 field; tiap field berisi punya satu halaman Lampiran (foto + tabel garis ukur).
// Dihitung otomatis: Intercept Grain (N) = l1+l2+l3, Intercept/mm = N / len, rata-rata. Grain Size Indices (G), Grain/mm2,
// Mean Dia. dan Mean Area DIKETIK (fields.grain_*): rumus klien belum diketahui, jadi tidak dihitung otomatis.
const GRAIN_MAX = 5;
const GRAIN_FIELD_KEYS = ['grain_g', 'grain_mm2', 'grain_dia', 'grain_area'];
function grainNums(row) {
  const ls = ['l1', 'l2', 'l3'].map(k => num(row[k])).filter(n => n !== null);
  const n = ls.length ? ls.reduce((a, b) => a + b, 0) : null;
  const len = num(row.len);
  return { n, len, per: n !== null && len ? n / len : null };
}
const grainHasData = row => ['l1', 'l2', 'l3', 'len'].some(k => blank(row[k]));
const grainFmt = n => (n === null ? '' : (Math.round(n * 100) / 100).toString());

function fillGrain(r) {
  const rows = (r.rows || []).slice(0, GRAIN_MAX);
  const f = r.fields || {};
  const base = fillLabelled(r);
  const v = base.values;
  const pers = [];
  rows.forEach((row, i) => {
    const g = grainNums(row);
    const rr = 35 + i;
    v['H' + rr] = grainFmt(g.n);
    v['O' + rr] = blank(row.len);
    v['V' + rr] = g.per === null ? '' : g.per.toFixed(2);
    if (g.per !== null) pers.push(g.per);
  });
  v.AB35 = pers.length ? (pers.reduce((a, b) => a + b, 0) / pers.length).toFixed(2) : '-';
  v.AB40 = dash(f.grain_g); v.AB41 = dash(f.grain_mm2); v.AB42 = dash(f.grain_dia); v.AB43 = dash(f.grain_area);
  base.attachments = rows.map((row, i) => ({ row, i })).filter(({ row, i }) => grainHasData(row) || (r.photo_data || {})['grain/s' + (i + 1)]).map(({ row, i }) => {
    const att = fillLabelled({ ...r, template: 'grain-att' });
    const g = grainNums(row);
    att.values.A18 = 'Attachment (Field ' + (i + 1) + ')';
    att.values.I43 = blank(row.l1); att.values.I44 = blank(row.l2); att.values.I45 = blank(row.l3);
    att.values.N43 = grainFmt(g.n); att.values.T43 = blank(row.len); att.values.Z43 = g.per === null ? '' : g.per.toFixed(2);
    att.photos = { s1: (r.photo_data || {})['grain/s' + (i + 1)] };
    return { template: 'grain-att', fill: att };
  });
  return base;
}

// ---- SEM-EDX Examination (DE.1/TR/DRL/SEM-EDX/MAT) ----
// Satu baris = satu spesimen = dua halaman: foto SEM (halaman 1) dan hasil EDX (halaman 2: gambar spektrum + gambar tabel
// unsur, ditempel dari alat). Slot foto per spesimen: sem/s(3i+1) = foto SEM, s(3i+2) = spektrum, s(3i+3) = tabel EDX.
const PSET_MAX = 10;
// Jenis pengujian "foto per spesimen": satu baris = satu spesimen, tiap spesimen mencetak halaman berisi gambar. labels = nama slot
// gambar per spesimen (urut); slot id "<form>/s<n>", n = indeks spesimen x jumlah slot + urutan.
const PSET = {
  sem: { labels: ['Foto SEM (halaman 1)', 'Spektrum EDX (halaman 2)', 'Tabel hasil EDX (halaman 2)'] },
  salt: { labels: ['Before - Front Side', 'After - Front Side', 'Before - Back Side', 'After - Back Side'] },
  scc: { labels: ['Foto spesimen (20X)'] },
  'sscc-fpb': { labels: ['Foto 20X'] },
  'sscc-pr': { labels: ['Foto 20X'] }
};

// ---- Salt Spray (DE.1/TR/35/SALT-SPRAY) ----
// Halaman utama: parameter uji (nilai bawaan form, bisa diubah per pengujian) + observasi; lalu satu halaman foto per spesimen
// (Before/After x Front/Back). "Number of Specimen Tested" bawaannya jumlah baris spesimen.
const SALT_FIELDS = [
  { key: 'salt_solution', label: 'Test Solution', ref: 'L35' }, { key: 'salt_chamber', label: 'Test Chamber Temp.', ref: 'L36' },
  { key: 'salt_barrel', label: 'Air Barrel Temp.', ref: 'L37' }, { key: 'salt_pressure', label: 'Compressed Air Pressure', ref: 'L38' },
  { key: 'salt_ph', label: 'pH of Test Solution', ref: 'L39' }, { key: 'salt_exposure', label: 'Exposure Time', ref: 'L40' },
  { key: 'salt_qty', label: 'Number of Specimen Tested', ref: 'L41', derived: true }, { key: 'salt_condensate', label: 'Condensated Solution Collected', ref: 'L42' },
  { key: 'salt_observation', label: 'Observation', ref: 'L44' }
];
let saltDefaults = null;
function saltDef() {
  if (!saltDefaults) {
    saltDefaults = {};
    loadTemplate('salt').rows.forEach(row => row.cells.forEach(c => SALT_FIELDS.forEach(f => { if (c.ref === f.ref) saltDefaults[f.key] = clean(c.v); })));
  }
  return saltDefaults;
}
function psetInfo(key) {
  const c = PSET[key];
  if (!c) return null;
  const info = { labels: c.labels, max: PSET_MAX };
  if (key === 'salt') info.fields = SALT_FIELDS.map(f => ({ key: f.key, label: f.label, def: f.derived ? '(jumlah spesimen)' : (saltDef()[f.key] || '') }));
  if (key === 'scc') info.fields = SCC_FIELDS.map(f => ({ key: f.key, label: f.label, def: sccDef()[f.key] || '', long: !!f.long }));
  return info;
}
function fillSalt(r) {
  const rows = (r.rows || []).length ? r.rows.slice(0, PSET_MAX) : [{}];
  const f = r.fields || {}, d = saltDef(), ph = r.photo_data || {};
  const base = fillLabelled(r);
  SALT_FIELDS.forEach(fl => {
    let v = clean(f[fl.key]);
    if (!v) v = fl.derived ? String(rows.length) : d[fl.key];
    // observasi bawaan menyebut lama paparan; ikut lama paparan yang diisi bila observasi dikosongkan
    if (fl.key === 'salt_observation' && !clean(f.salt_observation) && clean(f.salt_exposure)) v = d.salt_observation.replace('72h', clean(f.salt_exposure));
    base.values[fl.ref] = v;
  });
  const n = PSET.salt.labels.length;
  const pages = rows.map((row, i) => {
    const marked = clean(row.marking_specimen) ? { ...r, sample_marking: clean(row.marking_specimen) } : r;
    const pg = fillLabelled({ ...marked, template: 'salt-photos' });
    pg.photos = Object.fromEntries(Array.from({ length: n }, (_, k) => ['s' + (k + 1), ph['salt/s' + (n * i + k + 1)]]));
    return { template: 'salt-photos', fill: pg };
  });
  base.attachments = pages;
  return base;
}

// ---- Hydrogen Induced Cracking / HIC (DE.1/TR/32/HIC/MAT, NACE TM0284) ----
// Tiga halaman: (1) kondisi uji (nilai bawaan form, bisa diubah), (2) tabel hasil per spesimen, (3) lampiran log pemantauan lingkungan
// (hanya dicetak bila log diisi). Satu baris = satu spesimen (CT1..): orientasi + tiga section, tiap section berisi lebar W, tebal T,
// serta daftar panjang retak (a) dan tebal retak (b). Rumus sama dengan sheet Calculation klien:
//   CSR = (Sum a x Sum b) / (W x T) x 100,  CLR = Sum a / W x 100,  CTR = Sum b / T x 100.
// Rata-rata per spesimen = rata-rata tiga section (nilai section dibulatkan 2 desimal dulu, seperti pada laporan klien);
// "Average (From 3 Specimen)" = rata-rata rata-rata itu.
const HIC_MAX = 20;
const HIC_FIELDS = [
  { key: 'hic_period', label: 'Period of Test', ref: 'J32' }, { key: 'hic_volume', label: 'Volume Test Solution', ref: 'AD32' },
  { key: 'hic_solution', label: 'Test Solution', ref: 'I35' }, { key: 'hic_temp', label: 'Temperatur (deg. C)', ref: 'I38' },
  { key: 'hic_ph_initial', label: 'PH Value - Initial', ref: 'M39' }, { key: 'hic_ph_purging', label: 'PH Value - After Purging', ref: 'M40' },
  { key: 'hic_ph_final', label: 'PH Value - Final', ref: 'M41' }, { key: 'hic_h2s', label: 'H2S Concentration', ref: 'I42' },
  { key: 'hic_inert', label: 'Inert Gas Used', ref: 'I43' }, { key: 'hic_time', label: 'Time of Testing', ref: 'I44' }
];
// Halaman kondisi uji HIC dan SSCC (FPB, PR) memakai tata letak sel yang sama (HIC_FIELDS); nilai bawaan dibaca dari template masing-masing.
const condDefaultsCache = {};
function condDef(tplKey) {
  if (!condDefaultsCache[tplKey]) {
    const d = {};
    loadTemplate(tplKey).rows.forEach(row => row.cells.forEach(c => HIC_FIELDS.forEach(f => { if (c.ref === f.ref) d[f.key] = clean(c.v); })));
    condDefaultsCache[tplKey] = d;
  }
  return condDefaultsCache[tplKey];
}
// Beberapa nilai bawaan form SSCC FPB diawali ": " (bagian teks sel). Isian pengguna diberi awalan yang sama supaya tampilannya konsisten.
const stripColon = v => String(v).replace(/^: ?/, '');
function condValue(tplKey, f, fl) {
  const def = condDef(tplKey)[fl.key] || '';
  const own = clean(f[fl.key]);
  if (!own) return def;
  return /^: /.test(def) ? ': ' + own : own;
}
// info per template (HIC / SSCC FPB / SSCC PR) untuk layar input: kind menentukan tabel baris
function hicInfo(tplKey) {
  return { kind: tplKey, fields: HIC_FIELDS.map(f => ({ key: f.key, label: f.label, def: stripColon(condDef(tplKey)[f.key] || '') })), max: tplKey === 'hic' ? HIC_MAX : PSET_MAX };
}
// halaman lampiran log lingkungan (hanya bila log diisi); tplKey = template log
function envLogPage(r, tplKey) {
  const f = r.fields || {};
  const log = (Array.isArray(f.hic_log) ? f.hic_log : []).filter(l => l && (clean(l.date) || clean(l.h2s) || clean(l.ph) || clean(l.temp)));
  if (!log.length) return null;
  const lp = fillLabelled({ ...r, template: tplKey });
  lp.repeat = { row: 19, items: log.map(l => ({ C: hicDate(l.date), K: dash(l.h2s), S: dash(l.ph), AA: dash(l.temp) })) };
  lp.hideRows = Array.from({ length: 31 }, (_, i) => 20 + i);
  return { template: tplKey, fill: lp };
}
// daftar angka dipisah spasi/koma/titik koma -> jumlah (null bila kosong)
function hicSum(v) {
  const ns = String(v == null ? '' : v).split(/[ ,;]+/).map(x => num(x)).filter(n => n !== null);
  return ns.length ? ns.reduce((a, b) => a + b, 0) : 0;
}
const r2 = n => Math.round(n * 100) / 100;
function hicSection(row, k) {
  const W = num(row['w' + k]), T = num(row['t' + k]);
  if (W === null || T === null || W === 0 || T === 0) return null;
  const a = hicSum(row['a' + k]), b = hicSum(row['b' + k]);
  return { csr: r2((a * b) / (W * T) * 100), clr: r2(a / W * 100), ctr: r2(b / T * 100) };
}
function hicRowCalc(row) {
  const secs = [1, 2, 3].map(k => hicSection(row, k));
  const done = secs.filter(Boolean);
  const avg = key => (done.length ? done.reduce((s, x) => s + x[key], 0) / done.length : null);
  return { secs, avg: done.length ? { csr: avg('csr'), clr: avg('clr'), ctr: avg('ctr') } : null };
}
const hicFmt = n => (n === null || n === undefined ? '-' : n.toFixed(2));
function hicDate(v) {
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(String(v || '').trim());
  return m ? m[3] + '/' + m[2] + '/' + m[1] : dash(v);
}
function fillHic(r) {
  const f = r.fields || {};
  const rows = (r.rows || []).length ? r.rows.slice(0, HIC_MAX) : [{}];
  const base = fillLabelled(r);
  HIC_FIELDS.forEach(fl => { base.values[fl.ref] = condValue('hic', f, fl); });

  const res = fillLabelled({ ...r, template: 'hic-result' });
  const calcs = rows.map(hicRowCalc);
  const cols = [['J', 'L', 'N'], ['P', 'R', 'T'], ['V', 'X', 'Z']];
  res.repeat = {
    row: 36,
    items: rows.map((row, i) => {
      const it = { A: dash(row.marking_specimen), F: dash(clean(row.orient) || 'Longitudinal') };
      calcs[i].secs.forEach((sc, k) => { it[cols[k][0]] = hicFmt(sc && sc.csr); it[cols[k][1]] = hicFmt(sc && sc.clr); it[cols[k][2]] = hicFmt(sc && sc.ctr); });
      const a = calcs[i].avg;
      it.AB = hicFmt(a && a.csr); it.AE = hicFmt(a && a.clr); it.AH = hicFmt(a && a.ctr);
      return it;
    })
  };
  res.hideRows = [37, 38];
  const avgs = calcs.map(c => c.avg).filter(Boolean);
  const mean = key => (avgs.length ? avgs.reduce((s, x) => s + x[key], 0) / avgs.length : null);
  res.values.AB39 = hicFmt(mean('csr')); res.values.AE39 = hicFmt(mean('clr')); res.values.AH39 = hicFmt(mean('ctr'));
  const pages = [{ template: 'hic-result', fill: res }];

  const logPage = envLogPage(r, 'hic-log');
  if (logPage) pages.push(logPage);
  base.attachments = pages;
  return base;
}

// ---- Stress Corrosion Cracking / SCC (DE.1/TR/33/SCC/MAT, ASTM G36) ----
// Satu halaman per spesimen: foto spesimen 20X + tiga blok teks (identifikasi & tipe, ringkasan uji, hasil pemeriksaan) yang
// bawaannya dari form dan bisa diubah. Teks bawaan menyebut lama perendaman (168 h): bila Period of Test diisi jam lain dan blok
// ringkasan/hasil dikosongkan, angka jam di teks bawaan ikut diganti.
const SCC_FIELDS = [
  { key: 'scc_period', label: 'Period of Test', ref: 'J32' }, { key: 'scc_volume', label: 'Volume Test Solution (ml)', ref: 'AD32' },
  { key: 'scc_spec', label: 'Specimen Identification & Type', ref: 'U35', long: true },
  { key: 'scc_summary', label: 'Summary of Test', ref: 'U38', long: true, hours: true },
  { key: 'scc_result', label: 'Examination Result', ref: 'U45', long: true, hours: true }
];
const SCC_DEFAULT_HOURS = '168';
let sccDefaults = null;
function sccDef() {
  if (!sccDefaults) {
    sccDefaults = {};
    loadTemplate('scc').rows.forEach(row => row.cells.forEach(c => SCC_FIELDS.forEach(f => { if (c.ref === f.ref) sccDefaults[f.key] = clean(c.v); })));
  }
  return sccDefaults;
}
function fillScc(r) {
  const rows = (r.rows || []).length ? r.rows.slice(0, PSET_MAX) : [{}];
  const f = r.fields || {}, d = sccDef(), ph = r.photo_data || {};
  const m = /([0-9]+(?:[.][0-9]+)?)/.exec(clean(f.scc_period));
  const hrs = m ? m[1] : null;
  const pages = rows.map((row, i) => {
    const marked = clean(row.marking_specimen) ? { ...r, sample_marking: clean(row.marking_specimen) } : r;
    const pg = fillLabelled(marked);
    SCC_FIELDS.forEach(fl => {
      let v = clean(f[fl.key]);
      if (!v) { v = d[fl.key]; if (fl.hours && hrs && hrs !== SCC_DEFAULT_HOURS) v = v.split(SCC_DEFAULT_HOURS).join(hrs); }
      pg.values[fl.ref] = v;
    });
    pg.photos = { s1: ph['scc/s' + (i + 1)] };
    return { template: 'scc', fill: pg };
  });
  const main = pages[0].fill;
  main.attachments = pages.slice(1);
  return main;
}

// ---- Sulfide Stress Corrosion Cracking / SSCC: FPB (DE.1/TR/30, NACE TM0316 four-point bend) dan PR (DE.1/TR/31, NACE TM0177 proof ring) ----
// Empat halaman: (1) kondisi uji (sama dengan HIC), (2) Specimen & Loading Condition (satu baris per spesimen), (3) hasil pengamatan:
// foto 20X + observasi per spesimen (FPB: 3 spesimen per halaman, PR: 1 per halaman), (4) lampiran log lingkungan (bila diisi).
// FPB: semua kolom diketik (rumus Target Strain tidak ada di form). PR: Cross Section area = 0.25 x 3.14 x D^2 dan Target Load =
// Target Stress x area, persis rumus pada form klien (memakai 3.14, bukan pi).
const SSCC_ROW_KEYS = ['orient', 'stress', 'modulus', 'dim', 'h', 'a', 'strain', 'd', 'obs'];
const SSCC = {
  'sscc-fpb': { load: 'sscc-fpb-load', res: 'sscc-fpb-res', log: 'sscc-fpb-log', per: 3, labels: ['A35', 'M35', 'Y35'], obs: ['A45', 'M45', 'Y45'], hide: [36, 37],
    map: { A: 'spec', G: 'orient', L: 'stress', Q: 'modulus', V: 'dim', AB: 'h', AE: 'a', AH: 'strain' } },
  'sscc-pr': { load: 'sscc-pr-load', res: 'sscc-pr-res', log: 'sscc-pr-log', per: 1, labels: ['A35'], obs: ['A45'], hide: [],
    map: { A: 'spec', G: 'orient', L: 'stress', Q: 'modulus', V: 'dim', AB: 'area', AG: 'load' } }
};
function tplCell(tplKey, ref) {
  let v = '';
  loadTemplate(tplKey).rows.forEach(row => row.cells.forEach(c => { if (c.ref === ref) v = clean(c.v); }));
  return v;
}
function ssccValues(key, row, idx) {
  const o = { spec: dash(row.marking_specimen) !== '-' ? clean(row.marking_specimen) : 'CT' + (idx + 1), orient: clean(row.orient) || 'Longitudinal' };
  if (key === 'sscc-fpb') {
    ['stress', 'modulus', 'dim', 'h', 'a', 'strain'].forEach(k => { o[k] = dash(row[k]); });
  } else {
    const d = num(row.d), a = blank(row.a), stress = num(row.stress);
    o.stress = dash(row.stress); o.modulus = dash(row.modulus);
    o.dim = blank(row.dim) || (d !== null && a ? blank(row.d) + ' x ' + a : '-');
    const area = d !== null ? 0.25 * 3.14 * d * d : null;
    o.area = area === null ? '-' : area.toFixed(2);
    o.load = area !== null && stress !== null ? (stress * area).toFixed(2) : '-';
  }
  return o;
}
function fillSscc(r) {
  const key = r.template, cfg = SSCC[key];
  const f = r.fields || {}, ph = r.photo_data || {};
  const rows = (r.rows || []).length ? r.rows.slice(0, PSET_MAX) : [{}];   // satu slot foto per spesimen, maks. 10
  const base = fillLabelled(r);
  HIC_FIELDS.forEach(fl => { base.values[fl.ref] = condValue(key, f, fl); });
  const pages = [];

  const load = fillLabelled({ ...r, template: cfg.load });
  load.repeat = { row: 35, items: rows.map((row, i) => { const v = ssccValues(key, row, i); const it = {}; Object.entries(cfg.map).forEach(([col, k]) => { it[col] = v[k]; }); return it; }) };
  if (cfg.hide.length) load.hideRows = cfg.hide;
  pages.push({ template: cfg.load, fill: load });

  // judul halaman hasil menyebut lama uji ("After 720h"): ikut Period of Test yang diisi
  const m = /([0-9]+(?:[.][0-9]+)?)/.exec(clean(f.hic_period)), dm = /([0-9]+(?:[.][0-9]+)?)/.exec(condDef(key).hic_period || '');
  let title = tplCell(cfg.res, 'A33');
  if (m && dm && m[1] !== dm[1]) title = title.split(dm[1]).join(m[1]);
  const obsDef = tplCell(cfg.res, cfg.obs[0]);
  for (let start = 0; start < rows.length; start += cfg.per) {
    const pg = fillLabelled({ ...r, template: cfg.res });
    pg.values.A33 = title;
    pg.photos = {};
    for (let k = 0; k < cfg.per; k++) {
      const idx = start + k, row = rows[idx];
      pg.values[cfg.labels[k]] = row ? ssccValues(key, row, idx).spec : '';
      pg.values[cfg.obs[k]] = row ? (clean(row.obs) || obsDef) : '';
      pg.photos['s' + (k + 1)] = row ? ph[key + '/s' + (idx + 1)] : undefined;
    }
    pages.push({ template: cfg.res, fill: pg });
  }
  const logPage = envLogPage(r, cfg.log);
  if (logPage) pages.push(logPage);
  base.attachments = pages;
  return base;
}

function fillSem(r) {
  const rows = (r.rows || []).length ? r.rows.slice(0, PSET_MAX) : [{}];
  const ph = r.photo_data || {};
  const marked = row => (clean(row.marking_specimen) ? { ...r, sample_marking: clean(row.marking_specimen) } : r);
  const pages = [];
  rows.forEach((row, i) => {
    const sem = fillLabelled(marked(row));
    sem.photos = { s1: ph['sem/s' + (3 * i + 1)] };
    pages.push({ template: 'sem', fill: sem });
    const edx = fillLabelled({ ...marked(row), template: 'sem-edx' });
    edx.photos = { s1: ph['sem/s' + (3 * i + 2)], s2: ph['sem/s' + (3 * i + 3)] };
    pages.push({ template: 'sem-edx', fill: edx });
  });
  const main = pages[0].fill;
  main.attachments = pages.slice(1);
  return main;
}

// ---- Flaring Test (DE.1/TR/14/FLAR): tabel Specimen No / Observation / Results, satu baris per spesimen ----
function fillFlaring(r) {
  const base = fillLabelled(r);
  const rows = (r.rows || []).length ? r.rows : [{}];
  base.repeat = { row: 33, items: rows.map(row => ({ A: dash(row.marking_specimen), J: dash(row.observation), AD: resultText(row.result) })) };
  return base;
}

// ---- Tensile Test (5 form: Full Section, Reduced Section, Bolt, Material, All Weld) ----
// Tabel hasil: satu baris per spesimen. Nilai yang diketik dicetak apa adanya; kolom yang bisa dihitung dan dikosongkan
// dihitung otomatis: Area (dari diameter, atau tebal x lebar), Tensile strength = beban / area (form dengan kolom beban)
// dan Elongation = (L1 - L0) / L0 x 100 (form Material / All Weld, bila L0 dan L1 diisi).
const TN = {
  'tn-full': { head: [35, 36], geom: 'round', row: 37, hide: [38], map: { A: 'spec', E: 'dia', J: 'area', O: 'load', T: 'strength', Y: 'location', AE: 'failure' },
    ui: ['dia', 'area', 'load', 'strength', 'location', 'failure'] },
  'tn-red': { head: [35, 36], geom: 'rect', row: 37, hide: [38], map: { A: 'spec', E: 'thickness', I: 'width', M: 'area', Q: 'load', U: 'strength', Y: 'location', AE: 'failure' },
    ui: ['thickness', 'width', 'area', 'load', 'strength', 'location', 'failure'] },
  // Through Thickness (DE.1/TR/04/TTT/MAT): satu baris spesimen bulat; strength = beban / area, Reduction of Area diketik
  'tn-ttt': { head: [32, 33], geom: 'round', row: 34, hide: [], map: { A: 'spec', E: 'dia', J: 'area', O: 'ra', T: 'load', Y: 'strength', AE: 'failure' },
    ui: ['dia', 'area', 'ra', 'load', 'strength', 'failure'] },
  // Compression Test (DE.1/TR/16/PRESS): satu form (Material); diameter, area, beban maksimum, lokasi dan tipe kegagalan
  'tn-comp': { head: [32, 33], geom: 'round', block: [34, 35], hide: [], map: { A: 'spec', G: 'dia', M: 'area', S: 'load', Y: 'location', AE: 'failure' },
    ui: ['dia', 'area', 'load', 'location', 'failure'], labels: { load: 'Maximum Load (N)' } },
  // Uji Geser Las (DE.1/TR/25/GESER-LAS): diameter, area, beban, kekuatan; lokasi bawaan "Weld Joint Area", tipe kegagalan bawaan "-"
  'tn-geser': { head: [32, 33], geom: 'round', block: [34, 35], hide: [], map: { A: 'spec', F: 'dia', K: 'area', P: 'load', U: 'strength', Z: 'location', AE: 'failure' },
    ui: ['dia', 'area', 'load', 'strength', 'location', 'failure'], defaults: { location: 'Weld Joint Area', failure: '-' }, refDefault: 'SNI-07-0663-1995' },
  'tn-bolt': { head: [33, 34], geom: 'round', bolt: true, block: [35, 36], hide: [37, 38], map: { A: 'spec', E: 'dia', J: 'area', O: 'load', T: 'strength', Y: 'location', AE: 'failure' },
    ui: ['dia', 'area', 'load', 'strength', 'location', 'failure'] },
  'tn-mat': { head: [32, 33], geom: 'both', block: [34, 35], map: { A: 'spec', D: 'thickness', G: 'width', J: 'dia', M: 'area', P: 'gauge', S: 'elong', V: 'ra', Y: 'yield', AC: 'tensile', AG: 'location' },
    ui: ['thickness', 'width', 'dia', 'area', 'gauge', 'l1', 'elong', 'ra', 'yield', 'tensile', 'location'] },
  'tn-weld': { head: [35, 36], geom: 'both', block: [37, 38], map: { A: 'spec', D: 'thickness', G: 'width', J: 'dia', M: 'area', P: 'gauge', S: 'elong', V: 'ra', Y: 'yield', AC: 'tensile', AG: 'location' },
    ui: ['thickness', 'width', 'dia', 'area', 'gauge', 'l1', 'elong', 'ra', 'yield', 'tensile', 'location'] }
};
const TN_LABELS = {
  dia: 'Diameter (mm)', thickness: 'Thickness (mm)', width: 'Width (mm)', area: 'Area (mm²)', load: 'Tensile load (N)',
  strength: 'Tensile strength (N/mm²)', gauge: 'Gauge Length L0 (mm)', l1: 'Final length L1 (mm) — untuk hitung Elongation',
  elong: 'Elongation (%)', ra: 'Reduction of Area (%)', yield: 'Yield strength (N/mm²)', tensile: 'Tensile strength (N/mm²)',
  location: 'Location of failure', failure: 'Type of failure'
};
const TN_BOLT_DEFAULTS = { 'Proof Load': { area: '-', strength: '-', location: '-', failure: 'Thread is Good' }, Tensile: { location: 'Thread', failure: '-' } };

function tnInfo(key) {
  const c = TN[key];
  return c ? { cols: c.ui.map(k => ({ key: k, label: (c.labels || {})[k] || TN_LABELS[k] })), bolt: !!c.bolt, geom: c.geom } : null;
}

function tnArea(geom, row) {
  const d = num(row.dia), t = num(row.thickness), w = num(row.width);
  if (geom !== 'round' && t !== null && w !== null) return t * w;
  if (geom !== 'rect' && d !== null) return (Math.PI * d * d) / 4;
  return null;
}

function fillTn(r) {
  const key = r.template;
  const c = TN[key];
  const rows = (r.rows || []).length ? r.rows : [{}];
  const items = rows.map(row => {
    const kind = c.bolt ? (row.kind === 'Proof Load' ? 'Proof Load' : 'Tensile') : null;
    const def = c.bolt ? TN_BOLT_DEFAULTS[kind] : (c.defaults || {});
    const area = blank(row.area) || (def.area === undefined && tnArea(c.geom, row) !== null ? tnArea(c.geom, row).toFixed(2) : '');
    const load = num(row.load), areaN = num(area);
    const val = {
      spec: c.bolt ? (kind + ' ' + blank(row.marking_specimen)).trim() : dash(row.marking_specimen),
      dia: blank(row.dia), thickness: blank(row.thickness), width: blank(row.width), area,
      load: blank(row.load),
      strength: blank(row.strength) || (def.strength === undefined && load !== null && areaN ? String(Math.round(load / areaN)) : ''),
      gauge: blank(row.gauge), ra: blank(row.ra), yield: blank(row.yield), tensile: blank(row.tensile),
      elong: blank(row.elong) || (num(row.gauge) && num(row.l1) !== null ? (Math.round(((num(row.l1) - num(row.gauge)) / num(row.gauge)) * 1000) / 10).toFixed(1) : ''),
      location: blank(row.location), failure: blank(row.failure)
    };
    const item = {};
    Object.entries(c.map).forEach(([col, k]) => {
      let v = val[k];
      if (v === '' && def[k] !== undefined) v = def[k];
      item[col + '+0'] = k === 'spec' ? v : dash(v);
    });
    return item;
  });
  // Reference Code kosong -> pakai bawaan form (bila form punya, mis. Geser Las)
  const base = fillLabelled(c.refDefault && !String(r.reference_code || '').trim() ? { ...r, reference_code: c.refDefault } : r);
  base.theme = { headRows: c.head || [] };   // gaya tabel berwarna (header gelap + baris selang-seling)
  if (c.block) {
    base.blocks = { from: c.block[0], to: c.block[1], items };
    base.hideRows = c.hide || [];
  } else {
    // satu baris tabel per spesimen: kunci per huruf kolom (tanpa offset)
    base.repeat = { row: c.row, items: items.map(it => Object.fromEntries(Object.entries(it).map(([k, v]) => [k.replace('+0', ''), v]))) };
    base.hideRows = c.hide || [];
  }
  return base;
}

function getFiller(key) {
  if (FILLERS[key]) return FILLERS[key];
  if (/^chem-/.test(key)) return fillChem;
  if (/^ferrite-(weld|mat)$/.test(key)) return fillFerrite;
  if (/^fwb-/.test(key) || key === 'peel') return fillFwb;   // Peel memakai tabel yang sama dengan Fillet Weld Break
  if (key === 'flat') return fillFlat;
  if (HARD[key]) return fillHard;
  if (CORR[key]) return fillCorr;
  if (MACRO[key]) return fillMacro;
  if (MICRO[key]) return fillMicro;
  if (key === 'nickbreak') return fillNb;
  if (key === 'flaring') return fillFlaring;
  if (key === 'grain') return fillGrain;
  if (key === 'sem') return fillSem;
  if (key === 'salt') return fillSalt;
  if (key === 'hic') return fillHic;
  if (key === 'scc') return fillScc;
  if (SSCC[key]) return fillSscc;
  if (TN[key]) return fillTn;
  return null;
}

const FILLERS = {
  'bend-sec': fillBendSec, 'bend-mat': fillBendMat,
  'charpy-weld': fillCharpyWeld, 'charpy-weld-eqt': fillCharpyEqt, 'charpy-mat': fillCharpyMat
};

function hasTemplate(key) { return !!key && !!getFiller(key) && fs.existsSync(path.join(__dirname, 'reportTemplates', key + '.json')); }

// Laporan = halaman utama + (opsional) halaman lampiran. Filler boleh mengembalikan `attachments`:
// [{ template, fill }] — tiap lampiran dicetak sebagai halaman sendiri dengan "Total of Page" yang disesuaikan.
// Baris kosong di antara "Witnessed By" dan label "Approved Signatory" dirapatkan (permintaan klien: blok tanda tangan dan
// Term & Conditions lebih dekat ke isi laporan). Satu baris jeda disisakan; baris yang berisi teks/isian, atau menjadi
// tempat garis, gambar, atau slot foto, tidak disentuh. Ruang tanda tangan di bawah label Approved Signatory tetap utuh.
// Baris "Term & Conditions" (awal bagian bawah form). Bagian itu didorong ke dasar kertas, kecuali ada gambar /
// kotak teks lepas (posisi absolut) di bawahnya yang tidak ikut bergeser.
function footerRow(tpl) {
  let y = 0, hit = null;
  for (const row of tpl.rows) {
    if (row.cells.some(c => /^Terms?\s*&\s*Conditions?/i.test(clean(c.v)))) { hit = { r: row.r, y }; break; }
    y += row.h || 0;
  }
  if (!hit) return null;
  const absolute = [...(tpl.images || []), ...(tpl.shapes || []).filter(sh => sh.type !== 'line')];
  return absolute.some(o => o.y >= hit.y) ? null : hit.r;
}

function signatureGapRows(tpl, values) {
  const label = re => { let hit = null; tpl.rows.forEach(row => { if (row.cells.some(c => re.test(clean(c.v)))) hit = row.r; }); return hit; };
  const wb = label(/^Witnessed By$/i), as = label(/^Approved Signatory$/i);
  if (!wb || !as || as - wb < 3) return [];
  let y = 0;
  const span = {};
  tpl.rows.forEach(row => { span[row.r] = [y, y + (row.h || 0)]; y += row.h || 0; });
  const anchored = [...(tpl.shapes || []), ...(tpl.images || []), ...(tpl.slots || [])].map(o => o.y);
  // gambar & kotak teks lepas diletakkan absolut di halaman; bila ada di bawah Witnessed By, merapatkan baris akan
  // menggesernya dari tempatnya, jadi template seperti itu dibiarkan apa adanya
  const absolute = [...(tpl.images || []), ...(tpl.shapes || []).filter(sh => sh.type !== 'line')];
  if (absolute.some(o => o.y >= span[wb][1])) return [];
  // baris yang tertutup sel gabungan (rowspan) dari baris lain tidak disentuh
  const merged = new Set();
  tpl.rows.forEach(row => row.cells.forEach(c => { for (let k = 1; k < (c.rs || 1); k++) merged.add(row.r + k); }));
  const empty = tpl.rows.filter(row => row.r > wb && row.r < as && !merged.has(row.r)
    && !row.cells.some(c => (c.rs || 1) > 1 || clean(c.v) || clean(values[c.ref]))
    && !anchored.some(oy => span[row.r][0] <= oy && oy < span[row.r][1])).map(row => row.r);
  return empty.slice(1);   // sisakan satu baris jeda
}

// Preliminary Report (permintaan klien): sama dengan laporan asli tetapi tanpa logo KAN/ilac di kepala halaman
// (logo DETECH tetap), tanpa blok tanda tangan approval, dan dengan watermark "PRELIMINARY REPORT" menyilang di tengah.
const HEADER_IMAGE_MAX_Y = 100;   // logo-logo kepala form ada di baris paling atas (y < 100 px)
const KAN_LOGO_MIN_X = 300;       // logo DETECH di kiri (x ~0), logo KAN di kanan (x ~600)
const isKanLogo = im => im.y < HEADER_IMAGE_MAX_Y && im.x >= KAN_LOGO_MIN_X;
const SIGNATURE_TEXT_RE = /^(Approved Signatory|Technical Manager)$|Pangestu/i;

// Lebar kolom hasil konversi Excel sedikit lebih lebar dari cetakan Excel aslinya (form dicetak di skala ~101%), sehingga
// dulu seluruh halaman, termasuk huruf, diperkecil ~88% agar muat A4 dan hasil cetak tampak kecil. Sekarang hanya kolom
// yang dipersempit agar pas selebar kertas; ukuran huruf dan tinggi baris tetap 100% seperti cetakan Excel. Posisi
// gambar & kotak teks ikut kolom (ukuran gambar tetap), kotak foto ikut menyempit sesuai selnya.
// Ruang cetak A4 (px @96dpi) dengan margin kertas atas 6 mm, bawah 5 mm, kiri-kanan 7 mm (mendekati margin form Excel):
// w = lebar isi, max = tinggi isi sebelum halaman diperkecil.
const PAGE = { portrait: { w: 740, max: 1075 }, landscape: { w: 1068, max: 745 } };

function fitColumns(tpl, pageW) {
  const total = tpl.cols.reduce((a, b) => a + b, 0);
  if (total <= pageW) return tpl;
  const k = pageW / total;
  let acc = 0, prev = 0;
  const cols = tpl.cols.map(w => { acc += w * k; const edge = Math.round(acc); const out = edge - prev; prev = edge; return out; });
  const x = v => Math.round(v * k);
  return {
    ...tpl,
    cols,
    images: (tpl.images || []).map(im => ({ ...im, x: Math.max(0, Math.min(x(im.x), pageW - im.w)) })),
    slots: (tpl.slots || []).map(sl => ({ ...sl, x: x(sl.x), w: x(sl.w) })),
    shapes: (tpl.shapes || []).map(sh => ({ ...sh, x: x(sh.x), w: sh.type === 'line' ? x(sh.w) : sh.w }))
  };
}

function pageHtml(r, template, fill, idx, total, scope = 'pg' + idx, opts = {}) {
  const base = loadTemplate(template);
  const keepImg = im => !(opts.preliminary && isKanLogo(im)) && !(fill.dropImages && fill.dropImages(im));
  let tpl = (base.images || []).every(keepImg) ? base : { ...base, images: base.images.filter(keepImg) };
  // kotak foto / garis drawing pengganti untuk halaman ini (mis. Microstructure dengan satu foto saja)
  if (fill.slots) tpl = { ...tpl, slots: fill.slots };
  if (fill.dropShapes) tpl = { ...tpl, shapes: (tpl.shapes || []).filter(sh => !fill.dropShapes(sh)) };
  const page = PAGE[tpl.orientation === 'landscape' ? 'landscape' : 'portrait'];
  tpl = fitColumns(tpl, page.w);
  const signatory = (!opts.preliminary && r.approved_signatory) || {};
  const sig = signatory.signature || null;
  const stamp = signatory.stamp || null;
  const values = { ...fill.values };
  if (opts.preliminary) tpl.rows.forEach(row => row.cells.forEach(c => { if (SIGNATURE_TEXT_RE.test(clean(c.v))) values[c.ref] = ''; }));
  // Disetujui: nama & jabatan di bawah tanda tangan mengikuti approver (bawaan form: Fajar Pangestu, S.Tr.T / Technical Manager)
  else if (signatory.status === 'approved' && signatory.name) {
    tpl.rows.forEach(row => row.cells.forEach(c => {
      const t = clean(c.v);
      if (/Pangestu/i.test(t)) values[c.ref] = signatory.name;
      else if (/^Technical Manager$/i.test(t)) values[c.ref] = signatory.title || '';
    }));
  }
  const refs = locate(template);
  if (refs.pages) values[refs.pages] = `${idx + 1} of ${total}`;
  const out = renderTemplateTable(tpl, {
    scope,
    values,
    repeat: fill.repeat,
    hideRows: [...(fill.hideRows || []), ...signatureGapRows(tpl, values)],
    spans: fill.spans,
    groups: fill.groups,
    // gaya tabel seperti form Tensile untuk semua laporan (permintaan klien): header gelap, baris hasil selang-seling
    theme: { ...(fill.theme || {}), auto: true },
    blocks: fill.blocks,
    inject: fill.inject,
    stretchBefore: footerRow(tpl),
    photos: fill.photos ? Object.fromEntries(Object.entries(fill.photos).filter(e => e[1])) : Object.fromEntries((tpl.slots || []).map(sl => [sl.id, (r.photo_data || {})[template + '/' + sl.id]]).filter(e => e[1])),
    captions: fill.captions,
    overlays: ((sig || stamp || opts.qr) && fill.sigAt ? [{ ref: fill.sigAt[0], toRef: fill.sigAt[1], src: sig, stamp, qr: opts.qr || null }] : []).concat(fill.overlays || [])
  });
  const pageW = page.w;
  const land = tpl.orientation === 'landscape';
  const mark = opts.preliminary ? '<div class="wm" aria-hidden="true">PRELIMINARY REPORT</div>' : '';
  return { css: out.css, html: `<div class="paper${land ? ' land' : ''}">${mark}<div class="scaled" data-zoom="${pageW / out.width}" data-max="${page.max}" style="zoom:${pageW / out.width}">${out.html}</div></div>`, landscape: land };
}

function renderTemplateReportHtml(r) {
  const tr = r.test_request || {};
  return renderTemplateBundleHtml([r], { title: `${tr.job_number || 'Laporan Hasil Uji'} - ${r.title}`, heading: `Laporan Hasil Uji &mdash; ${esc(tr.job_number || '')}` });
}

// Beberapa Lembar Hasil Uji dalam satu dokumen (LHU per coupon = semua Lembar coupon itu). Nomor halaman "x of y"
// dihitung untuk seluruh dokumen; halaman portrait dan landscape boleh bercampur.
function renderTemplateBundleHtml(reports, opts = {}) {
  const fills = reports.map(r => { const main = getFiller(r.template)(r); return { r, main, atts: main.attachments || [] }; });
  const total = fills.reduce((n, f) => n + 1 + f.atts.length, 0);
  const pages = [];
  fills.forEach(f => {
    pages.push(pageHtml(f.r, f.r.template, f.main, pages.length, total, undefined, opts));
    f.atts.forEach(att => pages.push(pageHtml(f.r, att.template, att.fill, pages.length, total, undefined, opts)));
  });

  return `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<title>${esc(opts.title || 'Laporan Hasil Uji')}</title>
<style>
  @page { size: A4 portrait; margin: 6mm 7mm 5mm; }
  @page land { size: A4 landscape; margin: 6mm 7mm 5mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: Calibri, Carlito, Arial, sans-serif; background: #ddd; }
  .toolbar { position: sticky; top: 0; background: #0E3270; color: #fff; padding: 10px 16px;
             display: flex; justify-content: space-between; align-items: center; z-index: 10; font-family: Arial, sans-serif; }
  .toolbar button { background: #AA0000; border: none; padding: 8px 18px; font-weight: bold; color: #fff;
             border-radius: 4px; cursor: pointer; font-size: 10pt; }
  .paper { width: ${PAGE.portrait.w}px; margin: 16px auto; padding: 0; background: #fff; box-shadow: 0 0 8px rgba(0,0,0,.25); }
  .paper.land { width: ${PAGE.landscape.w}px; page: land; }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .paper, .paper.land { box-shadow: none; margin: 0; width: auto; break-after: page; page-break-after: always; }
    .paper:last-child { break-after: auto; page-break-after: auto; }
  }
  .scaled { display: flex; justify-content: center; }
  .paper { position: relative; overflow: hidden; }
  .wm { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%) rotate(-35deg); z-index: 20; pointer-events: none;
        font: 700 56px Arial, sans-serif; letter-spacing: 4px; white-space: nowrap; color: rgba(200, 0, 0, .16);
        border: 6px solid rgba(200, 0, 0, .16); padding: 6px 28px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  ${pages.map(p => p.css).join('\n')}
  ${opts.extra ? opts.extra.css : ''}
</style>
</head>
<body>
  <div class="toolbar">
    <span>${opts.heading || 'Laporan Hasil Uji'}</span>
    <button onclick="window.print()">Print / Simpan sebagai PDF</button>
  </div>
  ${pages.map(p => p.html).join('\n')}
  ${opts.extra ? opts.extra.pages.join('\n') : ''}
<script>
  // Isi form bisa melebihi satu halaman (mis. banyak spesimen): kecilkan skala halaman itu agar tetap muat satu lembar.
  (function () {
    // Seperti "shrink to fit" Excel: isian yang lebih panjang dari selnya (mis. marking spesimen di kolom sempit)
    // dikecilkan hurufnya di sel itu saja (paling kecil 70%), bukan seluruh halaman.
    function shrinkCells(s) {
      s.querySelectorAll('.rt td:not(.rt-host)').forEach(function (td) {
        if (!td.textContent.trim() || td.scrollWidth <= td.clientWidth + 1) return;
        var size = parseFloat(getComputedStyle(td).fontSize), min = size * 0.7;
        while (td.scrollWidth > td.clientWidth + 1 && size > min) { size -= 0.5; td.style.fontSize = size + 'px'; }
      });
    }
    function fit() {
      document.querySelectorAll('.scaled').forEach(function (s) {
        shrinkCells(s);
        var base = parseFloat(s.getAttribute('data-zoom'));
        var max = parseFloat(s.getAttribute('data-max'));
        var gap = s.querySelector('.rt-stretch');
        if (gap) gap.style.height = '0px';
        s.style.zoom = base;
        var h = s.getBoundingClientRect().height;
        if (h > max) s.style.zoom = base * max / h;
        // sisa tinggi kertas diisi sebelum Term & Conditions, jadi bagian bawah form menempel di dasar halaman
        else if (gap && max - h > 4) gap.style.height = Math.floor((max - h - 4) / base) + 'px';
      });
    }
    window.addEventListener('load', fit);
    window.addEventListener('beforeprint', fit);
  })();
</script>
</body>
</html>`;
}

module.exports = { hasTemplate, renderTemplateReportHtml, renderTemplateBundleHtml, templateElements, ferriteLocations, fwbInfo, hardInfo, corrInfo, photoSlotIds, macroInfo, microInfo, tnInfo, psetInfo, SALT_FIELDS, SCC_FIELDS, hicInfo, HIC_FIELDS, hicRowCalc, SSCC_ROW_KEYS };
