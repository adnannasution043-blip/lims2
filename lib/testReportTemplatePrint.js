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
  const cellText = ref => { const row = tpl.rows.find(x => x.r === Number(ref.replace(/[A-Z]+/, ''))); const c = row && row.cells.find(x => x.ref === ref); return clean(c && c.v); };
  Object.entries(data).forEach(([k, v]) => {
    // tanpa isian: biarkan teks bawaan form, kecuali teks itu hanya penanda ("xxx") -> "-"
    if (v === undefined && refs[k] && /^[xX]+( to [xX]+)?$/.test(cellText(refs[k]))) v = '-';
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
    cells: [['J', 'M', 'P', 'S', 'V', 'Y', 'AB', 'AE', 'AH'].map(c => c + '40'), ['J', 'M', 'P', 'S', 'V', 'Y', 'AB', 'AE', 'AH'].map(c => c + '44')]
  },
  'hard-mat': {
    att: 'hard-mat-att', spec: 'G34', lines: 1, points: 5,
    cells: [['G', 'M', 'S', 'Y', 'AE'].map(c => c + '38')], sketchBox: ['A34', 'AJ45']
  }
};
const HARD_TYPE = 'Vickers Hardness Number (HV) Load Test, 10 Kgf';

function hardInfo(key) { return HARD[key] ? { lines: HARD[key].lines, points: HARD[key].points } : null; }

function fillHardAtt(r, h) {
  const base = fillLabelled({ ...r, template: h.att });
  const data = ((r.fields || {}).hardness) || {};
  const v = base.values;
  if (h.lines === 1) v.J29 = HARD_TYPE;   // sel Type of Test pada lampiran Material kosong di form aslinya
  v[h.spec] = dash(((r.fields || {}).spec) || (r.coupon || {}).material_type_grade);
  h.cells.forEach((row, li) => row.forEach((ref, pi) => { v[ref] = blank(((data.lines || [])[li] || [])[pi]); }));
  return base;
}

function fillHard(r) {
  const h = HARD[r.template];
  const base = fillLabelled(r);
  const sketch = (r.fields || {}).sketch;
  if (h.sketchBox && /^data:image\//.test(sketch || '')) base.overlays = [{ ref: h.sketchBox[0], toRef: h.sketchBox[1], src: sketch }];
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
  if (MACRO[key]) return Array.from({ length: MACRO_MAX_PHOTOS }, (_, i) => key + '/s' + (i + 1));
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

function getFiller(key) {
  if (FILLERS[key]) return FILLERS[key];
  if (/^chem-/.test(key)) return fillChem;
  if (/^ferrite-(weld|mat)$/.test(key)) return fillFerrite;
  if (/^fwb-/.test(key)) return fillFwb;
  if (key === 'flat') return fillFlat;
  if (HARD[key]) return fillHard;
  if (CORR[key]) return fillCorr;
  if (MACRO[key]) return fillMacro;
  return null;
}

const FILLERS = {
  'bend-sec': fillBendSec, 'bend-mat': fillBendMat,
  'charpy-weld': fillCharpyWeld, 'charpy-weld-eqt': fillCharpyEqt, 'charpy-mat': fillCharpyMat
};

function hasTemplate(key) { return !!key && !!getFiller(key) && fs.existsSync(path.join(__dirname, 'reportTemplates', key + '.json')); }

// Laporan = halaman utama + (opsional) halaman lampiran. Filler boleh mengembalikan `attachments`:
// [{ template, fill }] — tiap lampiran dicetak sebagai halaman sendiri dengan "Total of Page" yang disesuaikan.
function pageHtml(r, template, fill, idx, total) {
  const tpl = loadTemplate(template);
  const sig = r.approved_signatory && r.approved_signatory.signature;
  const values = { ...fill.values };
  const refs = locate(template);
  if (refs.pages) values[refs.pages] = `${idx + 1} of ${total}`;
  const out = renderTemplateTable(tpl, {
    scope: 'pg' + idx,
    values,
    repeat: fill.repeat,
    hideRows: fill.hideRows,
    spans: fill.spans,
    groups: fill.groups,
    blocks: fill.blocks,
    photos: fill.photos ? Object.fromEntries(Object.entries(fill.photos).filter(e => e[1])) : Object.fromEntries((tpl.slots || []).map(sl => [sl.id, (r.photo_data || {})[template + '/' + sl.id]]).filter(e => e[1])),
    captions: fill.captions,
    overlays: (sig && fill.sigAt ? [{ ref: fill.sigAt[0], toRef: fill.sigAt[1], src: sig }] : []).concat(fill.overlays || [])
  });
  const pageW = tpl.orientation === 'landscape' ? 1074 : 734; // A4 dikurangi margin 8mm (px @96dpi)
  return { css: out.css, html: `<div class="paper"><div class="scaled" data-zoom="${pageW / out.width}" style="zoom:${pageW / out.width}">${out.html}</div></div>`, landscape: tpl.orientation === 'landscape' };
}

function renderTemplateReportHtml(r) {
  const main = getFiller(r.template)(r);
  const attachments = main.attachments || [];
  const total = 1 + attachments.length;
  const pages = [pageHtml(r, r.template, main, 0, total)]
    .concat(attachments.map((a, i) => pageHtml(r, a.template, a.fill, i + 1, total)));
  const tr = r.test_request || {};
  const portrait = !pages[0].landscape;

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
  .paper { width: ${portrait ? 734 : 1074}px; margin: 16px auto; padding: 0; background: #fff; box-shadow: 0 0 8px rgba(0,0,0,.25); }
  @media print {
    body { background: #fff; }
    .toolbar { display: none; }
    .paper { box-shadow: none; margin: 0; width: auto; break-after: page; page-break-after: always; }
    .paper:last-child { break-after: auto; page-break-after: auto; }
  }
  .scaled { display: flex; justify-content: center; }
  ${pages.map(p => p.css).join('\n')}
</style>
</head>
<body>
  <div class="toolbar">
    <span>Laporan Hasil Uji &mdash; ${esc(tr.job_number || '')}</span>
    <button onclick="window.print()">Print / Simpan sebagai PDF</button>
  </div>
  ${pages.map(p => p.html).join('\n')}
<script>
  // Isi form bisa melebihi satu halaman (mis. banyak spesimen): kecilkan skala halaman itu agar tetap muat satu lembar.
  (function () {
    var MAX = ${portrait ? 1055 : 735};
    function fit() {
      document.querySelectorAll('.scaled').forEach(function (s) {
        var base = parseFloat(s.getAttribute('data-zoom'));
        s.style.zoom = base;
        var h = s.getBoundingClientRect().height;
        if (h > MAX) s.style.zoom = base * MAX / h;
      });
    }
    window.addEventListener('load', fit);
    window.addEventListener('beforeprint', fit);
  })();
</script>
</body>
</html>`;
}

module.exports = { hasTemplate, renderTemplateReportHtml, templateElements, ferriteLocations, fwbInfo, hardInfo, corrInfo, photoSlotIds, macroInfo };
