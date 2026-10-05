// Lembar Hasil Uji ("Testing Sheet") — dibuat dari tahap Testing, satu per coupon + Jenis
// Pengujian. Ini BUKAN Pengecekan Spesimen (yang tetap milik tahap Preparation: marking/cutting/
// machining). Sheet ini langsung berfungsi sebagai Laporan Hasil Uji: sekali diisi dan difinalisasi,
// halaman yang sama itu yang diekspor jadi PDF.
//
// category='bending' (Bend Root/Face/Side) dan 'charpy' memakai form resmi Detech (template Excel, lihat
// testReportTemplatePrint.js). Jenis Pengujian lain memakai layout umum sampai formulir resminya ada —
// sama seperti kategori 'general' di Pengecekan Spesimen.

const REPORT_TITLES = {
  tensile: 'TENSILE TEST',
  bending: 'BENDING TEST (TRANSVERSE WELDING)',
  charpy: 'CHARPY IMPACT TEST'
};

const BEND_TYPE_LABELS = {
  'Bend Root': 'Root Bend Test',
  'Bend Face': 'Face Bend Test',
  'Bend Side': 'Side Bend Test',
  'Nick Break Test': 'Nick Break Test'
};

const RESULTS = ['', 'accepted', 'rejected'];
const DEFAULT_OBSERVATION_OK = 'No Open Discontinuity was Observed';

// Form resmi (template grid dari Excel Detech) per Jenis Pengujian. Satu jenis bisa punya beberapa
// varian (Weld / Material), dipilih per sheet; defaultnya ditebak dari data coupon.
// Nick Break Test sengaja belum ada di sini (punya folder form sendiri) — tetap layout lama.
const TEMPLATE_OPTIONS = {
  'Bend Root': [{ key: 'bend-sec', label: 'Weld — DE.1/TR/02/BEND.SEC' }, { key: 'bend-mat', label: 'Material — DE.1/TR/02/BENDING/MAT' }],
  'Bend Face': [{ key: 'bend-sec', label: 'Weld — DE.1/TR/02/BEND.SEC' }, { key: 'bend-mat', label: 'Material — DE.1/TR/02/BENDING/MAT' }],
  'Bend Side': [{ key: 'bend-sec', label: 'Weld — DE.1/TR/02/BEND.SEC' }, { key: 'bend-mat', label: 'Material — DE.1/TR/02/BENDING/MAT' }]
};
const CHARPY_TEMPLATES = [
  { key: 'charpy-weld', label: 'Weld — DE.1/TR/05/CHARPY/Weld' },
  { key: 'charpy-weld-eqt', label: 'Weld EQT (Electrode Qualification) — DE.1/TR/05/CHARPY/Weld-EQT' },
  { key: 'charpy-mat', label: 'Material — DE.1/TR/06/CHARPY/MAT' }
];
TEMPLATE_OPTIONS['Charpy Impact Test'] = CHARPY_TEMPLATES;
const TEMPLATE_OBSERVATION = { 'bend-sec': 'No Open Discontinuity was Observed', 'bend-mat': 'No Crack was Observed' };

// Chemical Composition (13 form: Weld / Material x jenis logam). Satu form tiap jenis logam punya daftar
// elemen & metode uji bawaan sendiri. PMI bukan di daftar tetap Jenis Pengujian (diisi lewat "Lainnya"),
// jadi dikenali dari namanya.
const CHEM_METALS = {
  cs: 'Carbon & Low Alloy Steel', ss: 'Stainless & High Alloy Steel', ni: 'Nickel & Alloy Steel',
  cu: 'Copper & Alloy Steel', al: 'Aluminium & Alloy Steel', ti: 'Titanium & Alloy Steel', zn: 'Zinc', pmi: 'PMI'
};
const CHEM_WELD_METALS = ['cs', 'cu', 'ni', 'pmi', 'ss'];
const CHEM_TEMPLATES = [
  ...CHEM_WELD_METALS.map(m => ({ key: 'chem-weld-' + m, label: 'Weld — ' + CHEM_METALS[m] + ' (DE.1/TR/15/CHEM/Weld)' })),
  ...Object.keys(CHEM_METALS).map(m => ({ key: 'chem-mat-' + m, label: 'Material — ' + CHEM_METALS[m] + ' (DE.1/TR/15/CHEM/MAT)' }))
];
TEMPLATE_OPTIONS['Chemical Composition Test'] = CHEM_TEMPLATES;
// Fillet Weld Break: kriteria penerimaan tiap standar sudah tertulis di form; sheet hanya mengisi remarks per
// kriteria (bawaan form bila kosong) dan hasil per spesimen.
TEMPLATE_OPTIONS['Fillet Weld Break'] = [
  { key: 'fwb-aws-d11', label: 'AWS D1.1 — DE.1/TR/08/FWB' },
  { key: 'fwb-aws-d12', label: 'AWS D1.2 — DE.1/TR/08/FWB' },
  { key: 'fwb-asme-plate', label: 'ASME IX Plate to Plate — DE.1/TR/08/FWB' },
  { key: 'fwb-asme-pipe', label: 'ASME IX Plate to Pipe — DE.1/TR/08/FWB' }
];
// Macro-Etching & Examination: Butt Weld, Fillet Weld, Material. Satu halaman per spesimen, masing-masing dengan foto makro
// (foto diunggah di sheet, slot s<n> untuk baris ke-n).
TEMPLATE_OPTIONS['Macro-etching & Examination'] = [
  { key: 'macro-butt', label: 'Butt Weld — DE.1/TR/09/MAC/Weld' },
  { key: 'macro-fillet', label: 'Fillet Weld — DE.1/TR/09/MAC/Weld' },
  { key: 'macro-mat', label: 'Material — DE.1/TR/09/MAC/MAT' }
];
// Intergranular / Pitting Corrosion: 6 form (Pitting G48 Weld/Material; Intergranular A262 Practice B Weld, C Weld, E Material;
// G28 Material). Tiap form = halaman utama + halaman foto sampel (foto diunggah di sheet) [+ halaman per periode untuk C].
TEMPLATE_OPTIONS['Intergranular / Pitting Corrosion'] = [
  { key: 'corr-pit-weld', label: 'Pitting G48 Weld — DE.1/TR/17/PITT-CORROSION/Weld' },
  { key: 'corr-pit-mat', label: 'Pitting G48 Material — DE.1/TR/17/PITT-CORROSION/MAT' },
  { key: 'corr-b-weld', label: 'Intergranular A262 Practice B Weld — DE.1/TR/18' },
  { key: 'corr-c-weld', label: 'Intergranular A262 Practice C Weld (3 periode) — DE.1/TR/19' },
  { key: 'corr-e-mat', label: 'Intergranular A262 Practice E Material — DE.1/TR/28' },
  { key: 'corr-g28', label: 'Intergranular G28 Material — DE.1/TR/29' }
];
// Hardness (Vickers): dua halaman (Sketch Hardness + hasil). Weld: 2 baris x 9 titik; Material: 5 titik + sketsa unggahan.
TEMPLATE_OPTIONS['Hardness Test'] = [
  { key: 'hard-weld', label: 'Weld — DE.1/TR/10 & 11 HARD (Line 1/2, 9 titik)' },
  { key: 'hard-mat', label: 'Material — DE.1/TR/10 & 12 HARD (5 titik)' }
];
TEMPLATE_OPTIONS['Flattening Test'] = [{ key: 'flat', label: 'Material — DE.1/TR/13/FLAT' }];
TEMPLATE_OPTIONS['Ferrite Point Count/ Ferrite Content'] = [
  { key: 'ferrite-weld', label: 'Weld — DE.1/TR/20/FRT-CONTENT/Weld (Base Metal, HAZ, Weld Metal)' },
  { key: 'ferrite-mat', label: 'Material — DE.1/TR/20/FRT-CONTENT/MAT (Base Metal)' }
];
const isPmiName = name => /\bPMI\b/i.test(String(name || ''));

function templateOptions(testName) {
  if (TEMPLATE_OPTIONS[testName]) return TEMPLATE_OPTIONS[testName];
  return isPmiName(testName) ? CHEM_TEMPLATES : [];
}

function guessMetal(coupon, testName) {
  if (isPmiName(testName) || /\bPMI\b/i.test(String((coupon || {}).testing_purpose || ''))) return 'pmi';
  const g = String((coupon || {}).material_type_grade || '');
  if (/alumin|\bAl\b|\b(5083|6061|7075|1100)\b/i.test(g)) return 'al';
  if (/stainless|\bSS\b|SUS|(?:\b|TP)3(04|16)L?\b|duplex|\b2205\b|\b904L\b/i.test(g)) return 'ss';
  if (/nickel|inconel|monel|hastelloy|alloy 6[0-9]{2}|\bN0[0-9]{4}\b/i.test(g)) return 'ni';
  if (/copper|brass|bronze|cupro/i.test(g)) return 'cu';
  if (/titan|\bTi\b|grade ?[0-9]\b/i.test(g) && !/steel/i.test(g)) return 'ti';
  if (/zinc|\bZn\b/i.test(g)) return 'zn';
  return 'cs';
}

// Coupon las (punya WPS / proses las) -> form Weld; selain itu uji material.
function defaultTemplate(testName, coupon) {
  const opts = templateOptions(testName);
  if (!opts.length) return null;
  if (opts.some(o => /^macro-/.test(o.key))) {
    const weld = coupon && (String(coupon.no_wps || '').trim() || String(coupon.welding_process || '').trim());
    if (!weld) return 'macro-mat';
    const text = JSON.stringify((coupon || {}).coupon_type || '') + ' ' + String((coupon || {}).ref_code || '') + ' ' + String((coupon || {}).testing_purpose || '');
    return /fillet/i.test(text) ? 'macro-fillet' : 'macro-butt';
  }
  if (opts.some(o => /^corr-/.test(o.key))) {
    const ref = String((coupon || {}).ref_code || '') + ' ' + String((coupon || {}).testing_purpose || '');
    const weld = coupon && (String(coupon.no_wps || '').trim() || String(coupon.welding_process || '').trim());
    if (/Practice[ ]?E/i.test(ref)) return 'corr-e-mat';
    if (/Practice[ ]?C/i.test(ref)) return 'corr-c-weld';
    if (/Practice[ ]?B/i.test(ref)) return 'corr-b-weld';
    if (/G28/i.test(ref)) return 'corr-g28';
    return weld ? 'corr-pit-weld' : 'corr-pit-mat';
  }
  if (opts.some(o => /^hard-/.test(o.key))) {
    return coupon && (String(coupon.no_wps || '').trim() || String(coupon.welding_process || '').trim()) ? 'hard-weld' : 'hard-mat';
  }
  if (opts.some(o => o.key === 'flat')) return 'flat';
  if (opts.some(o => /^fwb-/.test(o.key))) {
    const ref = String((coupon || {}).ref_code || '') + ' ' + String((coupon || {}).testing_purpose || '');
    if (/D1[.]2/i.test(ref)) return 'fwb-aws-d12';
    if (/ASME|[ ]IX[ ]|section IX/i.test(ref)) return /pipe/i.test(JSON.stringify((coupon || {}).coupon_type || '')) ? 'fwb-asme-pipe' : 'fwb-asme-plate';
    return 'fwb-aws-d11';
  }
  if (opts.some(o => /^ferrite-/.test(o.key))) {
    return coupon && (String(coupon.no_wps || '').trim() || String(coupon.welding_process || '').trim()) ? 'ferrite-weld' : 'ferrite-mat';
  }
  if (opts.some(o => /^chem-/.test(o.key))) {
    const metal = guessMetal(coupon, testName);
    const weld = coupon && (String(coupon.no_wps || '').trim() || String(coupon.welding_process || '').trim());
    return weld && CHEM_WELD_METALS.includes(metal) ? 'chem-weld-' + metal : 'chem-mat-' + metal;
  }
  if (testName === 'Charpy Impact Test') {
    if (coupon && /electrode/i.test(String(coupon.testing_purpose || ''))) return 'charpy-weld-eqt';
    return coupon && (String(coupon.no_wps || '').trim() || String(coupon.welding_process || '').trim()) ? 'charpy-weld' : 'charpy-mat';
  }
  const weld = coupon && (String(coupon.no_wps || '').trim() || String(coupon.welding_process || '').trim());
  return weld ? 'bend-sec' : 'bend-mat';
}

// {kunci template: [label elemen,...]} untuk form Chemical, dipakai UI untuk menampilkan isian per elemen.
function chemElementsMap(testName) {
  const opts = templateOptions(testName).filter(o => /^chem-/.test(o.key));
  if (!opts.length) return null;
  const { templateElements } = require('./testReportTemplatePrint');
  const map = {};
  opts.forEach(o => { map[o.key] = templateElements(o.key).map(e => e.label); });
  return map;
}

function macroInfoMap(testName) {
  const opts = templateOptions(testName).filter(o => /^macro-/.test(o.key));
  if (!opts.length) return null;
  const { macroInfo } = require('./testReportTemplatePrint');
  const map = {};
  opts.forEach(o => { map[o.key] = macroInfo(o.key); });
  return map;
}

function corrInfoMap(testName) {
  const opts = templateOptions(testName).filter(o => /^corr-/.test(o.key));
  if (!opts.length) return null;
  const { corrInfo } = require('./testReportTemplatePrint');
  const map = {};
  opts.forEach(o => { map[o.key] = corrInfo(o.key); });
  return map;
}

function hardInfoMap(testName) {
  const opts = templateOptions(testName).filter(o => /^hard-/.test(o.key));
  if (!opts.length) return null;
  const { hardInfo } = require('./testReportTemplatePrint');
  const map = {};
  opts.forEach(o => { map[o.key] = hardInfo(o.key); });
  return map;
}

function fwbInfoMap(testName) {
  const opts = templateOptions(testName).filter(o => /^fwb-/.test(o.key));
  if (!opts.length) return null;
  const { fwbInfo } = require('./testReportTemplatePrint');
  const map = {};
  opts.forEach(o => { map[o.key] = fwbInfo(o.key).criteria.map(c => c.text); });
  return map;
}

function ferriteLocationsMap(testName) {
  const opts = templateOptions(testName).filter(o => /^ferrite-/.test(o.key));
  if (!opts.length) return null;
  const { ferriteLocations } = require('./testReportTemplatePrint');
  const map = {};
  opts.forEach(o => { map[o.key] = ferriteLocations(o.key); });
  return map;
}

function pickTemplate(testName, value, coupon) {
  const opts = templateOptions(testName);
  if (!opts.length) return null;
  return opts.some(o => o.key === value) ? value : defaultTemplate(testName, coupon);
}

function reportTitle(category, testName) {
  if (category === 'bending') return BEND_TYPE_LABELS[testName] || REPORT_TITLES.bending;
  return REPORT_TITLES[category] || String(testName || 'PENGUJIAN').toUpperCase();
}

function str(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function pick(value, allowed) {
  return allowed.includes(value) ? value : '';
}

function couponLabel(c) {
  const types = [...(c.coupon_type || [])];
  if (c.coupon_type_other) types.push(c.coupon_type_other);
  const typeText = types.length ? types.join(', ') : (c.material_type_grade || '-');
  return `Coupon #${c.row_no} — ${typeText}`;
}

// ---- Charpy: baris = {marking_specimen, notch_position, impact, lateral, remarks} ----
const CHARPY_FIELD_KEYS = ['test_temp', 'specimen_size', 'orientation'];
const CHARPY_DEFAULT_SIZE = '10 x 10 x 55';

// Posisi V-Notch tiap spesimen diambil dari jumlah per lokasi yang diisi di Permintaan Uji (WM/BM/HAZ/FL/FL+2/
// opsional), berurutan sesuai nomor spesimen. Hanya dipakai bila totalnya sama dengan Qty; kalau tidak, kosong.
function charpyNotchPositions(coupon, count) {
  if (!coupon) return [];
  const groups = [
    ['Weld Center Line', coupon.charpy_wm], ['Base Metal', coupon.charpy_bm], ['HAZ', coupon.charpy_haz],
    ['Fusion Line', coupon.charpy_fl], ['Fusion Line + 2 mm', coupon.charpy_fl2],
    [String(coupon.charpy_optional_label || '').trim() || 'Other', coupon.charpy_optional]
  ];
  const list = [];
  groups.forEach(([label, n]) => { for (let i = 0; i < (parseInt(n, 10) || 0); i++) list.push(label); });
  return list.length === count ? list : [];
}

function charpyDefaultRows(markings, coupon, template) {
  const notches = charpyNotchPositions(coupon, markings.length);
  const fallback = template === 'charpy-mat' ? 'Base Metal' : 'Weld Center Line';
  return markings.map((m, i) => ({ marking_specimen: m, notch_position: notches[i] || fallback, impact: '', lateral: '', remarks: '' }));
}

function charpyFieldDefaults(template, coupon) {
  return {
    test_temp: coupon && coupon.charpy_temp ? String(coupon.charpy_temp) : '',
    specimen_size: CHARPY_DEFAULT_SIZE,
    orientation: template === 'charpy-mat' ? 'Longitudinal' : 'Transversal'
  };
}

function sanitizeFields(category, testName, input) {
  const out = {};
  if (category === 'charpy') {
    CHARPY_FIELD_KEYS.forEach(k => { if (input && input[k] !== undefined) out[k] = str(input[k], 80); });
  } else if (templateOptions(testName).some(o => /^corr-/.test(o.key))) {
    const c = (input && input.corr && typeof input.corr === 'object') ? input.corr : {};
    const five = arr => [0, 1, 2, 3, 4].map(i => str((Array.isArray(arr) ? arr : [])[i], 14));
    out.corr = {
      hours: str(c.hours, 10), volume: str(c.volume, 10), l: str(c.l, 12), w: str(c.w, 12), t: str(c.t, 12), area: str(c.area, 14),
      density: str(c.density, 10), sample_id: str(c.sample_id, 80),
      before: five(c.before), after: five(c.after),
      periods: [0, 1, 2].map(i => ({ before: five(((c.periods || [])[i] || {}).before), after: five(((c.periods || [])[i] || {}).after) })),
      summary: str(c.summary, 1500), observation: str(c.observation, 1500),
      obs: [0, 1].map(i => str((Array.isArray(c.obs) ? c.obs : [])[i], 1500))
    };
  } else if (templateOptions(testName).some(o => /^hard-/.test(o.key))) {
    out.spec = str(input && input.spec, 200);
    const lines = (input && input.hardness && Array.isArray(input.hardness.lines)) ? input.hardness.lines : [];
    out.hardness = { lines: [0, 1].map(i => (Array.isArray(lines[i]) ? lines[i] : []).slice(0, 9).map(v => str(v, 12))) };
    const sk = input && input.sketch;
    if (typeof sk === 'string' && /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+\/=]+$/.test(sk) && sk.length <= 1500000) out.sketch = sk;
  } else if (templateOptions(testName).some(o => /^ferrite-/.test(o.key))) {
    out.sample_id = str(input && input.sample_id, 80);
    out.ferrite = {};
    const src = (input && input.ferrite && typeof input.ferrite === 'object') ? input.ferrite : {};
    ['Base Metal', 'HAZ', 'Weld Metal'].forEach(name => {
      const l = src[name];
      if (!l || typeof l !== 'object') return;
      out.ferrite[name] = {
        n: str(l.n, 4), pt: str(l.pt, 6),
        pi: (Array.isArray(l.pi) ? l.pi : []).slice(0, 30).map(v => str(v, 8))
      };
    });
  } else if (templateOptions(testName).some(o => /^chem-/.test(o.key))) {
    const src = (input && input.elements && typeof input.elements === 'object') ? input.elements : {};
    out.elements = {};
    Object.keys(src).slice(0, 80).forEach(k => { if (typeof src[k] !== 'string' && typeof src[k] !== 'number') return; const v = str(src[k], 30); if (v) out.elements[str(k, 12)] = v; });
  }
  return out;
}

// Baris hasil per spesimen (Specimen No. / Observation / Result). `markings` = urutan Specimen
// Marking dari computeMarkingInfo (rumus sama dengan Preparation/Pengecekan Spesimen), sehingga
// nomor spesimen di laporan ini selalu identik dengan yang ada di sheet Pengecekan Spesimen.
function defaultRows(markings, observation = DEFAULT_OBSERVATION_OK) {
  return markings.map(m => ({ marking_specimen: m, observation, result: '' }));
}

// Jenis baris sheet: charpy / fwb punya kolom sendiri, selain itu Specimen/Observation/Result.
function rowKind(category, testName) {
  if (category === 'charpy') return 'charpy';
  if (templateOptions(testName).some(o => o.key === 'flat')) return 'flat';
  if (templateOptions(testName).some(o => /^macro-/.test(o.key))) return 'macro';
  return templateOptions(testName).some(o => /^fwb-/.test(o.key)) ? 'fwb' : category;
}

// Baris Macro: kolom tabel + isian khusus form (kv); kosong = teks bawaan form saat cetak.
const MACRO_BASE_KEYS = ['thickness', 'width', 'mag', 'result'];
const MACRO_ALL_KV = ['weld_type', 'fusion', 'crack', 'undercut', 'porosity', 'slag', 'deposit', 'size_x', 'size_y', 'root'];
function macroDefaultRows(markings) {
  return markings.map(m => ({ marking_specimen: m, thickness: '', width: '', mag: '', result: '' }));
}

function flatDefaultRows(markings) {
  return markings.map(m => ({ marking_specimen: m, length: '', od: '', wt: '', e: '', h: '', first: '', second: '' }));
}

function fwbDefaultRows(markings) {
  return markings.map(m => ({ marking_specimen: m, remarks: [], result: '' }));
}

function sanitizeRows(input, fallbackMarkings, category, fallbackRows) {
  const arr = Array.isArray(input) ? input : null;
  if (!arr || !arr.length) return fallbackRows || defaultRows(fallbackMarkings);
  if (category === 'macro') {
    return arr.slice(0, 20).map(r => {
      const o = { marking_specimen: str((r || {}).marking_specimen, 80) };
      MACRO_BASE_KEYS.concat(MACRO_ALL_KV).forEach(k => { o[k] = str((r || {})[k], 80); });
      return o;
    });
  }
  if (category === 'flat') {
    return arr.slice(0, 200).map(r => ({
      marking_specimen: str((r || {}).marking_specimen, 80),
      length: str((r || {}).length, 40), od: str((r || {}).od, 40), wt: str((r || {}).wt, 40), e: str((r || {}).e, 40), h: str((r || {}).h, 40),
      first: str((r || {}).first, 300), second: str((r || {}).second, 300)
    }));
  }
  if (category === 'fwb') {
    return arr.slice(0, 200).map(r => ({
      marking_specimen: str((r || {}).marking_specimen, 80),
      remarks: (Array.isArray((r || {}).remarks) ? r.remarks : []).slice(0, 8).map(x => str(x, 300)),
      result: pick((r || {}).result, RESULTS)
    }));
  }
  if (category === 'charpy') {
    return arr.slice(0, 200).map(r => ({
      marking_specimen: str((r || {}).marking_specimen, 80),
      notch_position: str((r || {}).notch_position, 80),
      impact: str((r || {}).impact, 40),
      lateral: str((r || {}).lateral, 40),
      remarks: str((r || {}).remarks, 200)
    }));
  }
  return arr.slice(0, 200).map(r => ({
    marking_specimen: str((r || {}).marking_specimen, 80),
    observation: str((r || {}).observation, 300),
    result: pick((r || {}).result, RESULTS)
  }));
}

const REPORT_COLUMNS = `id, test_request_id, coupon_row_no, test_name, category, report_no, date_tested,
  environment_temp, test_method, reference_code, testing_purpose,
  specimen_width_code, specimen_width_actual, former_diameter_code, former_diameter_actual,
  bend_angle_code, bend_angle_actual, shoulder_distance_code, shoulder_distance_actual,
  testing_machine, welder_name, witnessed_by, test_conducted_by, remarks, rows, template, pqr_no, heat_no, fields, status, created_at, updated_at`;

function registerTestReportRoutes(app, deps) {
  const { pool, getFullWorkOrder, computeMarkingInfo, TEST_NAME_TO_CATEGORY, signatureToDataUrl, rawBody } = deps;

  async function fullReport(row) {
    if (!row) return null;
    const { rows: couponRows } = await pool.query(
      `SELECT row_no, coupon_type, coupon_type_other, material_type_grade, material_size, thickness,
              welding_process, welding_position, no_wps, ref_code, testing_purpose,
              charpy_temp, charpy_wm, charpy_bm, charpy_haz, charpy_fl, charpy_fl2, charpy_optional_label, charpy_optional
       FROM coupon_tests WHERE test_request_id = $1 AND row_no = $2`,
      [row.test_request_id, row.coupon_row_no]
    );
    const coupon = couponRows[0] || null;

    const { rows: reqRows } = await pool.query(
      `SELECT job_number, company, project_name, received_date, address, po_number, on_behalf_owner
       FROM test_requests WHERE id = $1`,
      [row.test_request_id]
    );
    const testRequest = reqRows[0] || null;

    const { rows: itemRows } = coupon
      ? await pool.query(
          `SELECT method FROM test_items WHERE coupon_test_id = (
             SELECT id FROM coupon_tests WHERE test_request_id = $1 AND row_no = $2
           ) AND test_name = $3 LIMIT 1`,
          [row.test_request_id, row.coupon_row_no, row.test_name]
        )
      : { rows: [] };

    const { rows: woRows } = await pool.query(`SELECT id, testing_pic FROM work_orders WHERE test_request_id = $1`, [row.test_request_id]);
    const wo = woRows[0] || null;

    const { rows: reviewRows } = wo
      ? await pool.query(`SELECT approver_name, approver_signature, approval_status FROM work_order_tasks WHERE work_order_id = $1 AND task_key = 'review'`, [wo.id])
      : { rows: [] };
    const review = reviewRows[0] || null;

    const marking = await computeMarkingInfo(row.test_request_id, row.test_name, row.coupon_row_no);

    const { rows: photoRows } = await pool.query(`SELECT slot FROM test_report_photos WHERE test_report_id = $1`, [row.id]);
    const photoSlots = photoRows.map(p => p.slot);

    return {
      ...row,
      title: reportTitle(row.category, row.test_name),
      template: row.template || defaultTemplate(row.test_name, coupon),
      fields: row.category === 'charpy'
        ? { ...charpyFieldDefaults(row.template || defaultTemplate(row.test_name, coupon), coupon), ...(row.fields || {}) }
        : (templateOptions(row.test_name).some(o => /^hard-/.test(o.key))
          ? { spec: (coupon || {}).material_type_grade || '', ...(row.fields || {}) }
          : templateOptions(row.test_name).some(o => /^corr-/.test(o.key))
            ? { ...(row.fields || {}), corr: { sample_id: ((row.rows || [])[0] || {}).marking_specimen || '', ...((row.fields || {}).corr || {}) } }
            : templateOptions(row.test_name).some(o => /^ferrite-/.test(o.key))
          ? { sample_id: ((row.rows || [])[0] || {}).marking_specimen || '', ...(row.fields || {}) }
          : (row.fields || {})),
      template_locations: ferriteLocationsMap(row.test_name),
      template_fwb: fwbInfoMap(row.test_name),
      template_hard: hardInfoMap(row.test_name),
      template_corr: corrInfoMap(row.test_name),
      template_macro: macroInfoMap(row.test_name),
      photos: photoSlots,
      template_options: templateOptions(row.test_name),
      template_elements: chemElementsMap(row.test_name),
      coupon: coupon ? { ...coupon, label: couponLabel(coupon) } : null,
      test_request: testRequest,
      sample_marking: marking.sample_marking,
      qty: marking.qty,
      method: (itemRows[0] || {}).method || '',
      testing_pic: wo ? wo.testing_pic || '' : '',
      approved_signatory: review ? { name: review.approver_name || '', signature: signatureToDataUrl(review.approver_signature), status: review.approval_status || '' } : null
    };
  }

  // Buat (atau ambil, kalau sudah ada) sheet untuk satu coupon + Jenis Pengujian.
  app.post('/api/work-orders/:id/test-reports', async (req, res) => {
    try {
      const wo = await getFullWorkOrder(req.params.id);
      if (!wo) return res.status(404).json({ error: 'Not found' });
      const b = req.body || {};
      const testName = str(b.test_name, 120);
      const couponRowNo = Number(b.coupon_row_no);
      if (!testName || !couponRowNo) return res.status(400).json({ error: 'Coupon dan Jenis Pengujian wajib diisi' });

      const coupon = (wo.coupon_tests || []).find(c => c.row_no === couponRowNo);
      if (!coupon) return res.status(400).json({ error: 'Coupon tidak ditemukan pada Work Order ini' });
      const onCoupon = [...(coupon.test_items || []), ...(coupon.other_tests || [])].some(t => t.checked && t.test_name === testName);
      if (!onCoupon) return res.status(400).json({ error: 'Jenis Pengujian ini tidak dipilih pada Coupon tersebut' });

      const category = TEST_NAME_TO_CATEGORY[testName] || 'general';
      const marking = await computeMarkingInfo(wo.test_request_id, testName, couponRowNo);
      const template = defaultTemplate(testName, coupon);

      const { rows: [report] } = await pool.query(
        `INSERT INTO test_reports (test_request_id, coupon_row_no, test_name, category, rows, reference_code, testing_purpose, template)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (test_request_id, coupon_row_no, test_name) DO UPDATE SET test_request_id = EXCLUDED.test_request_id
         RETURNING ${REPORT_COLUMNS}`,
        [wo.test_request_id, couponRowNo, testName, category, JSON.stringify(rowKind(category, testName) === 'charpy' ? charpyDefaultRows(marking.markings, coupon, template) : (rowKind(category, testName) === 'macro' ? macroDefaultRows(marking.markings) : rowKind(category, testName) === 'flat' ? flatDefaultRows(marking.markings) : rowKind(category, testName) === 'fwb' ? fwbDefaultRows(marking.markings) : defaultRows(marking.markings, TEMPLATE_OBSERVATION[template]))), coupon.ref_code || '', coupon.testing_purpose || '', template]
      );
      res.status(201).json(await fullReport(report));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal membuat Lembar Hasil Uji' });
    }
  });

  app.get('/api/test-reports/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${REPORT_COLUMNS} FROM test_reports WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(await fullReport(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat Lembar Hasil Uji' });
    }
  });

  app.put('/api/test-reports/:id', async (req, res) => {
    try {
      const { rows: repRows } = await pool.query(`SELECT test_request_id, coupon_row_no, test_name, category FROM test_reports WHERE id = $1`, [req.params.id]);
      if (!repRows.length) return res.status(404).json({ error: 'Not found' });
      const r = repRows[0];
      const b = req.body || {};
      const marking = await computeMarkingInfo(r.test_request_id, r.test_name, r.coupon_row_no);
      const { rows: couponRows } = await pool.query(
        `SELECT no_wps, welding_process, testing_purpose, ref_code, coupon_type, charpy_wm, charpy_bm, charpy_haz, charpy_fl, charpy_fl2, charpy_optional_label, charpy_optional
         FROM coupon_tests WHERE test_request_id = $1 AND row_no = $2`,
        [r.test_request_id, r.coupon_row_no]
      );

      const { rows: [updated] } = await pool.query(
        `UPDATE test_reports SET
           report_no=$1, date_tested=$2, environment_temp=$3, test_method=$4, reference_code=$5, testing_purpose=$6,
           specimen_width_code=$7, specimen_width_actual=$8, former_diameter_code=$9, former_diameter_actual=$10,
           bend_angle_code=$11, bend_angle_actual=$12, shoulder_distance_code=$13, shoulder_distance_actual=$14,
           testing_machine=$15, welder_name=$16, witnessed_by=$17, test_conducted_by=$18, remarks=$19,
           rows=$20, status=$21, template=$22, pqr_no=$23, heat_no=$24, fields=$25, updated_at=NOW()
         WHERE id=$26 RETURNING ${REPORT_COLUMNS}`,
        [
          str(b.report_no, 80), str(b.date_tested, 20), str(b.environment_temp, 60), str(b.test_method, 120),
          str(b.reference_code, 120), str(b.testing_purpose, 300),
          str(b.specimen_width_code, 40), str(b.specimen_width_actual, 40),
          str(b.former_diameter_code, 40), str(b.former_diameter_actual, 40),
          str(b.bend_angle_code, 40), str(b.bend_angle_actual, 40),
          str(b.shoulder_distance_code, 40), str(b.shoulder_distance_actual, 40),
          str(b.testing_machine, 200), str(b.welder_name, 200), str(b.witnessed_by, 200), str(b.test_conducted_by, 200),
          str(b.remarks, 2000),
          JSON.stringify(sanitizeRows(b.rows, marking.markings, rowKind(r.category, r.test_name), rowKind(r.category, r.test_name) === 'charpy' ? charpyDefaultRows(marking.markings, couponRows[0], pickTemplate(r.test_name, b.template, couponRows[0])) : (rowKind(r.category, r.test_name) === 'macro' ? macroDefaultRows(marking.markings) : rowKind(r.category, r.test_name) === 'flat' ? flatDefaultRows(marking.markings) : rowKind(r.category, r.test_name) === 'fwb' ? fwbDefaultRows(marking.markings) : null))),
          b.status === 'final' ? 'final' : 'draft',
          pickTemplate(r.test_name, b.template, couponRows[0]),
          str(b.pqr_no, 120), str(b.heat_no, 120),
          JSON.stringify(sanitizeFields(r.category, r.test_name, b.fields)),
          req.params.id
        ]
      );
      res.json(await fullReport(updated));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan Lembar Hasil Uji', detail: String(err.message || err) });
    }
  });

  app.delete('/api/test-reports/:id', async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM test_reports WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus Lembar Hasil Uji' });
    }
  });

  // Foto pada Lembar Hasil Uji: satu foto per slot ("<template>/<id>"). Gambar diperkecil di sisi klien sebelum diunggah.
  const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
  const MAX_PHOTO_BYTES = 6 * 1024 * 1024;
  const validSlot = s => /^[a-z0-9-]{3,40}[/]s[0-9]{1,2}$/.test(String(s || ''));

  if (rawBody) {
    app.post('/api/test-reports/:id/photos', rawBody, async (req, res) => {
      try {
        const slot = String(req.query.slot || '');
        if (!validSlot(slot)) return res.status(400).json({ error: 'Slot foto tidak valid' });
        const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!PHOTO_TYPES.includes(mime)) return res.status(400).json({ error: 'Format foto harus JPG, PNG atau WEBP' });
        const data = req.body;
        if (!Buffer.isBuffer(data) || !data.length) return res.status(400).json({ error: 'File kosong' });
        if (data.length > MAX_PHOTO_BYTES) return res.status(413).json({ error: 'Ukuran foto maksimal 6 MB' });
        const { rows: rep } = await pool.query(`SELECT id, test_name FROM test_reports WHERE id = $1`, [req.params.id]);
        if (!rep.length) return res.status(404).json({ error: 'Not found' });
        const { photoSlotIds } = require('./testReportTemplatePrint');
        const allowed = templateOptions(rep[0].test_name).some(o => photoSlotIds(o.key).includes(slot));
        if (!allowed) return res.status(400).json({ error: 'Slot foto tidak dikenal untuk jenis pengujian ini' });
        await pool.query(
          `INSERT INTO test_report_photos (test_report_id, slot, mime_type, data) VALUES ($1,$2,$3,$4)
           ON CONFLICT (test_report_id, slot) DO UPDATE SET mime_type = EXCLUDED.mime_type, data = EXCLUDED.data, created_at = NOW()`,
          [req.params.id, slot, mime, data]
        );
        res.status(201).json({ ok: true, slot });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengunggah foto' });
      }
    });
  }

  app.get('/api/test-reports/:id/photo', async (req, res) => {
    try {
      const slot = String(req.query.slot || '');
      if (!validSlot(slot)) return res.status(400).send('Slot tidak valid');
      const { rows } = await pool.query(`SELECT mime_type, data FROM test_report_photos WHERE test_report_id = $1 AND slot = $2`, [req.params.id, slot]);
      if (!rows.length) return res.status(404).send('Foto tidak ada');
      res.setHeader('Content-Type', rows[0].mime_type);
      res.setHeader('Cache-Control', 'private, max-age=60');
      res.send(rows[0].data);
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal memuat foto');
    }
  });

  app.delete('/api/test-reports/:id/photo', async (req, res) => {
    try {
      const slot = String(req.query.slot || '');
      if (!validSlot(slot)) return res.status(400).json({ error: 'Slot foto tidak valid' });
      await pool.query(`DELETE FROM test_report_photos WHERE test_report_id = $1 AND slot = $2`, [req.params.id, slot]);
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus foto' });
    }
  });

  app.get('/test-reports/:id/print', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${REPORT_COLUMNS} FROM test_reports WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).send('Lembar Hasil Uji tidak ditemukan');
      const { renderTestReportPrintHtml } = require('./testReportPrintView');
      const report = await fullReport(rows[0]);
      // foto disisipkan sebagai data URL agar halaman cetak berdiri sendiri
      const { rows: photoRows } = await pool.query(`SELECT slot, mime_type, data FROM test_report_photos WHERE test_report_id = $1`, [req.params.id]);
      report.photo_data = Object.fromEntries(photoRows.map(p => [p.slot, `data:${p.mime_type};base64,${Buffer.from(p.data).toString('base64')}`]));
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderTestReportPrintHtml(report));
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal membuat halaman cetak');
    }
  });
}

module.exports = { registerTestReportRoutes, reportTitle, BEND_TYPE_LABELS, TEMPLATE_OBSERVATION, defaultTemplate, pickTemplate };
