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

function sanitizeRows(input, fallbackMarkings, category, fallbackRows) {
  const arr = Array.isArray(input) ? input : null;
  if (!arr || !arr.length) return fallbackRows || defaultRows(fallbackMarkings);
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
  const { pool, getFullWorkOrder, computeMarkingInfo, TEST_NAME_TO_CATEGORY, signatureToDataUrl } = deps;

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

    return {
      ...row,
      title: reportTitle(row.category, row.test_name),
      template: row.template || defaultTemplate(row.test_name, coupon),
      fields: row.category === 'charpy'
        ? { ...charpyFieldDefaults(row.template || defaultTemplate(row.test_name, coupon), coupon), ...(row.fields || {}) }
        : (row.fields || {}),
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
        [wo.test_request_id, couponRowNo, testName, category, JSON.stringify(category === 'charpy' ? charpyDefaultRows(marking.markings, coupon, template) : defaultRows(marking.markings, TEMPLATE_OBSERVATION[template])), coupon.ref_code || '', coupon.testing_purpose || '', template]
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
        `SELECT no_wps, welding_process, testing_purpose, charpy_wm, charpy_bm, charpy_haz, charpy_fl, charpy_fl2, charpy_optional_label, charpy_optional
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
          JSON.stringify(sanitizeRows(b.rows, marking.markings, r.category, r.category === 'charpy' ? charpyDefaultRows(marking.markings, couponRows[0], pickTemplate(r.test_name, b.template, couponRows[0])) : null)),
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

  app.get('/test-reports/:id/print', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${REPORT_COLUMNS} FROM test_reports WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).send('Lembar Hasil Uji tidak ditemukan');
      const { renderTestReportPrintHtml } = require('./testReportPrintView');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(renderTestReportPrintHtml(await fullReport(rows[0])));
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal membuat halaman cetak');
    }
  });
}

module.exports = { registerTestReportRoutes, reportTitle, BEND_TYPE_LABELS, TEMPLATE_OBSERVATION, defaultTemplate, pickTemplate };
