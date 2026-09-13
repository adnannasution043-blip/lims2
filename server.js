const express = require('express');
const path = require('path');
const { pool, initSchema } = require('./db/init');
const { TEST_TYPES } = require('./db/testTypes');
const { renderPrintHtml } = require('./lib/printView');
const { renderWorkOrderPrintHtml } = require('./lib/workOrderPrintView');
const { renderSpecimenPrintHtml } = require('./lib/specimenPrintView');
const { PROCESS_STEPS } = require('./db/workOrderSteps');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------

async function generateJobNumber() {
  // e.g. DE.1.26.0001  (DE.1.yy.seq) — seq resets to 0001 each new year
  const now = new Date();
  const y = String(now.getFullYear()).slice(2);
  const prefix = `DE.1.${y}.`;
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS c FROM test_requests WHERE job_number LIKE $1`,
    [`${prefix}%`]
  );
  const seq = String(parseInt(rows[0].c, 10) + 1).padStart(4, '0');
  return `${prefix}${seq}`;
}

function signatureToBuffer(dataUrl) {
  if (!dataUrl) return null;
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl);
  return match ? Buffer.from(match[1], 'base64') : null;
}

function signatureToDataUrl(buf) {
  return buf ? `data:image/png;base64,${buf.toString('base64')}` : null;
}

function attachSignatureUrls(row, fields) {
  if (!row) return row;
  for (const field of fields) row[field] = signatureToDataUrl(row[field]);
  return row;
}

const REQUEST_SIGNATURE_FIELDS = ['customer_signature', 'received_by_signature'];
const WORK_ORDER_SIGNATURE_FIELDS = ['prepared_by_signature', 'checked_by_signature', 'approved_by_signature'];

async function serializeCouponRows(testRequestId) {
  const { rows: coupons } = await pool.query(
    `SELECT * FROM coupon_tests WHERE test_request_id = $1 ORDER BY row_no ASC`,
    [testRequestId]
  );

  const result = [];
  for (const c of coupons) {
    const { rows: items } = await pool.query(
      `SELECT * FROM test_items WHERE coupon_test_id = $1 ORDER BY id ASC`,
      [c.id]
    );
    const testTypeSet = new Set(TEST_TYPES);
    result.push({
      ...c,
      coupon_type: c.coupon_type || [], // jsonb column, pg parses it already
      test_items: items.filter(i => testTypeSet.has(i.test_name)).map(i => ({ ...i, checked: !!i.checked })),
      // "Other Test" rows are free-typed names that don't match the fixed TEST_TYPES list.
      other_tests: items.filter(i => !testTypeSet.has(i.test_name)).map(i => ({ ...i, checked: !!i.checked }))
    });
  }
  return result;
}

async function getFullRequest(id) {
  const { rows } = await pool.query(
    `SELECT tr.*, wo.id AS work_order_id
     FROM test_requests tr
     LEFT JOIN work_orders wo ON wo.test_request_id = tr.id
     WHERE tr.id = $1`,
    [id]
  );
  const req = rows[0];
  if (!req) return null;
  attachSignatureUrls(req, REQUEST_SIGNATURE_FIELDS);
  req.coupon_tests = await serializeCouponRows(id);
  return req;
}

async function getFullWorkOrder(id) {
  const { rows } = await pool.query(`SELECT * FROM work_orders WHERE id = $1`, [id]);
  const wo = rows[0];
  if (!wo) return null;
  attachSignatureUrls(wo, WORK_ORDER_SIGNATURE_FIELDS);

  const { rows: reqRows } = await pool.query(`SELECT * FROM test_requests WHERE id = $1`, [wo.test_request_id]);
  wo.test_request = attachSignatureUrls(reqRows[0] || null, REQUEST_SIGNATURE_FIELDS);

  const couponRows = await serializeCouponRows(wo.test_request_id);
  const { rows: marks } = await pool.query(
    `SELECT coupon_row_no, sample_marking FROM work_order_sample_marks WHERE work_order_id = $1`,
    [id]
  );
  const markByRow = {};
  marks.forEach(m => { markByRow[m.coupon_row_no] = m.sample_marking; });

  const missingRowNos = couponRows.map(c => c.row_no).filter(rowNo => !markByRow[rowNo]);
  if (missingRowNos.length) {
    const assigned = await autoAssignSampleMarks(id, wo.test_request, missingRowNos);
    Object.assign(markByRow, assigned);
  }

  wo.coupon_tests = couponRows.map(c => ({ ...c, sample_marking: markByRow[c.row_no] || '' }));

  return wo;
}

const SPECIMEN_SIGNATURE_FIELDS = ['inspected_by_signature', 'approved_by_signature'];

// Which Jenis Pengujian (from the fixed TEST_TYPES list) a specimen inspection
// category corresponds to, in priority order — used to look up its Qty and
// build Marking Specimen = "{Sample Marking WO}-{code}{qty}".
const CATEGORY_TEST_NAMES = {
  tensile: ['Tensile Test'],
  bending: ['Bend Root', 'Bend Face', 'Bend Side'],
  charpy: ['Charpy Impact Test']
};

async function computeSuggestedMarking(testRequestId, category) {
  const candidateNames = CATEGORY_TEST_NAMES[category] || [];
  if (!candidateNames.length) return '';

  const { rows: couponRows } = await pool.query(
    `SELECT id, row_no FROM coupon_tests WHERE test_request_id = $1 ORDER BY row_no ASC LIMIT 1`,
    [testRequestId]
  );
  const coupon = couponRows[0];
  if (!coupon) return '';

  const { rows: items } = await pool.query(
    `SELECT test_name, qty FROM test_items
     WHERE coupon_test_id = $1 AND checked = TRUE AND test_name = ANY($2) AND qty IS NOT NULL AND qty <> ''
     ORDER BY array_position($2, test_name) ASC LIMIT 1`,
    [coupon.id, candidateNames]
  );
  const item = items[0];
  if (!item) return '';

  const { rows: codeRows } = await pool.query(`SELECT code FROM test_type_codes WHERE test_name = $1`, [item.test_name]);
  const code = (codeRows[0] || {}).code || '';

  const { rows: woRows } = await pool.query(`SELECT id FROM work_orders WHERE test_request_id = $1`, [testRequestId]);
  if (!woRows.length) return '';
  const wo = await getFullWorkOrder(woRows[0].id);
  const couponInWo = (wo.coupon_tests || []).find(c => c.row_no === coupon.row_no);
  const sampleMarking = (couponInWo || {}).sample_marking || '';
  if (!sampleMarking) return '';

  return `${sampleMarking}-${code}${item.qty}`;
}

async function getFullSpecimenInspection(id) {
  const { rows } = await pool.query(`SELECT * FROM specimen_inspections WHERE id = $1`, [id]);
  const insp = rows[0];
  if (!insp) return null;
  attachSignatureUrls(insp, SPECIMEN_SIGNATURE_FIELDS);

  const { rows: reqRows } = await pool.query(`SELECT * FROM test_requests WHERE id = $1`, [insp.test_request_id]);
  insp.test_request = reqRows[0] || null;

  const { rows: specimenRows } = await pool.query(
    `SELECT * FROM specimen_rows WHERE specimen_inspection_id = $1 ORDER BY row_no ASC`,
    [id]
  );
  insp.rows = specimenRows.map(r => ({ ...r, measurements: r.measurements || {} }));
  insp.suggested_marking = await computeSuggestedMarking(insp.test_request_id, insp.category);

  return insp;
}

async function insertCouponRows(client, testRequestId, couponRows) {
  let rowNo = 0;
  for (const row of (couponRows || [])) {
    rowNo += 1;
    const { rows: [coupon] } = await client.query(
      `INSERT INTO coupon_tests (
         test_request_id, row_no, coupon_type, coupon_type_other, material_type_grade,
         material_size, outside_diameter, thickness, heat_number, welding_process,
         welding_position, ref_code, no_wps, testing_purpose, note,
         charpy_temp, charpy_wm, charpy_bm, charpy_haz, charpy_fl, charpy_fl2,
         charpy_optional_label, charpy_optional, hardness_spot
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
       RETURNING id`,
      [
        testRequestId, rowNo, JSON.stringify(row.coupon_type || []), row.coupon_type_other || '',
        row.material_type_grade || '', row.material_size || '', row.outside_diameter || '',
        row.thickness || '', row.heat_number || '', row.welding_process || '',
        row.welding_position || '', row.ref_code || '', row.no_wps || '',
        row.testing_purpose || '', row.note || '',
        row.charpy_temp || '', row.charpy_wm || '', row.charpy_bm || '', row.charpy_haz || '',
        row.charpy_fl || '', row.charpy_fl2 || '', row.charpy_optional_label || '', row.charpy_optional || '',
        row.hardness_spot || ''
      ]
    );

    const itemsByName = {};
    (row.test_items || []).forEach(ti => { itemsByName[ti.test_name] = ti; });

    for (const name of TEST_TYPES) {
      const ti = itemsByName[name] || {};
      await client.query(
        `INSERT INTO test_items (coupon_test_id, test_name, checked, qty, method)
         VALUES ($1,$2,$3,$4,$5)`,
        [coupon.id, name, !!ti.checked, ti.qty || '', ti.method || '']
      );
    }

    for (const ot of (row.other_tests || [])) {
      const name = (ot.test_name || '').trim();
      if (!name) continue;
      await client.query(
        `INSERT INTO test_items (coupon_test_id, test_name, checked, qty, method)
         VALUES ($1,$2,$3,$4,$5)`,
        [coupon.id, name, true, ot.qty || '', ot.method || '']
      );
    }
  }
}

async function upsertMasterValues(client, table, couponRows, extract) {
  const names = [...new Set(
    (couponRows || [])
      .flatMap(row => extract(row))
      .map(name => (name || '').trim())
      .filter(Boolean)
  )];
  for (const name of names) {
    await client.query(
      `INSERT INTO ${table} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`,
      [name]
    );
  }
}

async function upsertCouponMasters(client, couponRows) {
  await upsertMasterValues(client, 'welding_processes', couponRows, row => [row.welding_process]);
  await upsertMasterValues(client, 'welding_positions', couponRows, row => [row.welding_position]);
  await upsertMasterValues(client, 'ref_codes', couponRows, row => [row.ref_code]);
  await upsertMasterValues(client, 'coupon_types', couponRows, row => [row.coupon_type_other]);
  await upsertMasterValues(client, 'test_methods', couponRows, row => [
    ...(row.test_items || []).map(ti => ti.method),
    ...(row.other_tests || []).map(ot => ot.method)
  ]);
}

async function upsertCustomer(client, customerId, onBehalfOwner) {
  const custId = (customerId || '').trim();
  const owner = (onBehalfOwner || '').trim();
  if (!custId || !owner) return;
  await client.query(
    `INSERT INTO customers (customer_id, on_behalf_owner) VALUES ($1, $2)
     ON CONFLICT (customer_id, on_behalf_owner) DO NOTHING`,
    [custId, owner]
  );
}

// Sample Marking = "{customer_id}.{month}.{seq}" (e.g. "WGJ.7.1"), seq counting
// existing marks for that customer within the same "YYYY-MM" as the request's
// received_date, resetting to 1 each new month. Assigned lazily (on first view)
// for any coupon row that doesn't have one yet, in row_no order, and persisted
// so it stays stable.
async function autoAssignSampleMarks(workOrderId, testRequest, rowNos) {
  const customerId = ((testRequest || {}).customer_id || '').trim();
  const receivedDate = (testRequest || {}).received_date || '';
  const monthBucket = receivedDate.slice(0, 7);
  if (!customerId || !monthBucket) return {};
  const monthNumber = parseInt(receivedDate.slice(5, 7), 10);

  const { rows: existing } = await pool.query(
    `SELECT wsm.sample_marking
     FROM work_order_sample_marks wsm
     JOIN work_orders wo ON wo.id = wsm.work_order_id
     JOIN test_requests tr ON tr.id = wo.test_request_id
     WHERE tr.customer_id = $1 AND LEFT(tr.received_date, 7) = $2`,
    [customerId, monthBucket]
  );

  const escaped = customerId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escaped}\\.${monthNumber}\\.(\\d+)$`);
  let next = existing.reduce((max, row) => {
    const m = pattern.exec(row.sample_marking || '');
    return m ? Math.max(max, parseInt(m[1], 10)) : max;
  }, 0) + 1;

  const assigned = {};
  for (const rowNo of [...rowNos].sort((a, b) => a - b)) {
    const marking = `${customerId}.${monthNumber}.${next}`;
    await pool.query(
      `INSERT INTO work_order_sample_marks (work_order_id, coupon_row_no, sample_marking)
       VALUES ($1, $2, $3)
       ON CONFLICT (work_order_id, coupon_row_no) DO NOTHING`,
      [workOrderId, rowNo, marking]
    );
    assigned[rowNo] = marking;
    next += 1;
  }
  return assigned;
}

// ---------- API routes ----------

app.get('/api/test-types', (req, res) => {
  res.json({ testTypes: TEST_TYPES });
});

app.get('/api/welding-processes', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT name FROM welding_processes ORDER BY id ASC`);
    res.json({ weldingProcesses: rows.map(r => r.name) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat master welding process' });
  }
});

app.get('/api/welding-positions', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT name FROM welding_positions ORDER BY id ASC`);
    res.json({ weldingPositions: rows.map(r => r.name) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat master welding position' });
  }
});

app.get('/api/ref-codes', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT name FROM ref_codes ORDER BY id ASC`);
    res.json({ refCodes: rows.map(r => r.name) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat master ref code' });
  }
});

app.get('/api/coupon-types', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT name FROM coupon_types ORDER BY id ASC`);
    res.json({ couponTypes: rows.map(r => r.name) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat master coupon type' });
  }
});

app.get('/api/test-methods', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT name FROM test_methods ORDER BY id ASC`);
    res.json({ testMethods: rows.map(r => r.name) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat master metode tes' });
  }
});

app.get('/api/customers', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, customer_id, on_behalf_owner FROM customers ORDER BY id ASC`
    );
    res.json({ customers: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat master customer' });
  }
});

app.post('/api/customers', async (req, res) => {
  const b = req.body || {};
  const customerId = (b.customer_id || '').trim();
  const owner = (b.on_behalf_owner || '').trim();
  if (!customerId || !owner) {
    return res.status(400).json({ error: 'ID Perusahaan dan Atas Nama Perusahaan tidak boleh kosong' });
  }
  try {
    await pool.query(
      `INSERT INTO customers (customer_id, on_behalf_owner) VALUES ($1, $2)
       ON CONFLICT (customer_id, on_behalf_owner) DO NOTHING`,
      [customerId, owner]
    );
    const { rows } = await pool.query(`SELECT id, customer_id, on_behalf_owner FROM customers ORDER BY id ASC`);
    res.status(201).json({ customers: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah customer' });
  }
});

app.delete('/api/customers/:id', async (req, res) => {
  try {
    await pool.query(`DELETE FROM customers WHERE id = $1`, [req.params.id]);
    const { rows } = await pool.query(`SELECT id, customer_id, on_behalf_owner FROM customers ORDER BY id ASC`);
    res.json({ customers: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus customer' });
  }
});

// Generic CRUD for the simple "name only" master tables, used by the Master Data
// menu. :key maps to a table through this allow-list — never interpolated raw.
const SIMPLE_MASTERS = {
  'welding-processes': 'welding_processes',
  'welding-positions': 'welding_positions',
  'ref-codes': 'ref_codes',
  'coupon-types': 'coupon_types',
  'test-methods': 'test_methods',
  'wo-pics': 'wo_pics'
};

app.get('/api/master/:key', async (req, res) => {
  const table = SIMPLE_MASTERS[req.params.key];
  if (!table) return res.status(404).json({ error: 'Master data tidak dikenal' });
  try {
    const { rows } = await pool.query(`SELECT id, name FROM ${table} ORDER BY name ASC`);
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat master data' });
  }
});

app.post('/api/master/:key', async (req, res) => {
  const table = SIMPLE_MASTERS[req.params.key];
  if (!table) return res.status(404).json({ error: 'Master data tidak dikenal' });
  const name = ((req.body || {}).name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nama tidak boleh kosong' });
  try {
    await pool.query(`INSERT INTO ${table} (name) VALUES ($1) ON CONFLICT (name) DO NOTHING`, [name]);
    const { rows } = await pool.query(`SELECT id, name FROM ${table} ORDER BY name ASC`);
    res.status(201).json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah data' });
  }
});

app.delete('/api/master/:key/:id', async (req, res) => {
  const table = SIMPLE_MASTERS[req.params.key];
  if (!table) return res.status(404).json({ error: 'Master data tidak dikenal' });
  try {
    await pool.query(`DELETE FROM ${table} WHERE id = $1`, [req.params.id]);
    const { rows } = await pool.query(`SELECT id, name FROM ${table} ORDER BY name ASC`);
    res.json({ items: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus data' });
  }
});

app.get('/api/next-job-number', async (req, res) => {
  try {
    res.json({ jobNumber: await generateJobNumber() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membuat nomor pekerjaan' });
  }
});

app.get('/api/requests', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT tr.id, tr.job_number, tr.company, tr.project_name, tr.received_date, tr.status, tr.created_at,
              wo.id AS work_order_id
       FROM test_requests tr
       LEFT JOIN work_orders wo ON wo.test_request_id = tr.id
       ORDER BY tr.id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat data' });
  }
});

app.get('/api/requests/:id', async (req, res) => {
  try {
    const data = await getFullRequest(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat data' });
  }
});

app.post('/api/requests', async (req, res) => {
  const b = req.body || {};
  if ((b.status || 'draft') === 'final' && !b.confirmation_agreed) {
    return res.status(400).json({ error: 'Konfirmasi persetujuan permintaan harus dicentang sebelum Finalisasi' });
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const jobNumber = b.job_number || await generateJobNumber();
    const { rows: [inserted] } = await client.query(
      `INSERT INTO test_requests (
         job_number, received_date, company, po_number, customer_id, on_behalf_owner,
         project_name, address, phone,
         uncertainty_clarification, capability_test_methods, contract_differences, equipment_availability,
         witness_status, witness_date, specimen_status, lhu_target_date, lhu_handling,
         customer_name, customer_date, customer_signature, received_by_name, received_by_date, received_by_signature,
         confirmation_agreed, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26)
       RETURNING id`,
      [
        jobNumber, b.received_date || '', b.company || '', b.po_number || '', b.customer_id || '',
        b.on_behalf_owner || '', b.project_name || '', b.address || '', b.phone || '',
        b.uncertainty_clarification || '', b.capability_test_methods || '',
        b.contract_differences || '', b.equipment_availability || '',
        b.witness_status || '', b.witness_date || '', b.specimen_status || '',
        b.lhu_target_date || '', b.lhu_handling || '',
        b.customer_name || '', b.customer_date || '', signatureToBuffer(b.customer_signature),
        b.received_by_name || '', b.received_by_date || '', signatureToBuffer(b.received_by_signature),
        !!b.confirmation_agreed, b.status || 'draft'
      ]
    );

    await insertCouponRows(client, inserted.id, b.coupon_tests);
    if ((b.status || 'draft') === 'final') {
      await upsertCouponMasters(client, b.coupon_tests);
      await upsertCustomer(client, b.customer_id, b.on_behalf_owner);
    }
    await client.query('COMMIT');

    res.status(201).json(await getFullRequest(inserted.id));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Gagal menyimpan data', detail: String(err.message || err) });
  } finally {
    client.release();
  }
});

app.put('/api/requests/:id', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  if ((b.status || 'draft') === 'final' && !b.confirmation_agreed) {
    return res.status(400).json({ error: 'Konfirmasi persetujuan permintaan harus dicentang sebelum Finalisasi' });
  }
  const client = await pool.connect();
  try {
    const { rows: existingRows } = await client.query(`SELECT id, status FROM test_requests WHERE id = $1`, [id]);
    if (!existingRows.length) {
      client.release();
      return res.status(404).json({ error: 'Not found' });
    }

    await client.query('BEGIN');

    // If this request was already Final, snapshot its current state as history
    // before applying the amendment, so previous versions stay viewable.
    if (existingRows[0].status === 'final') {
      const snapshot = await getFullRequest(id);
      await client.query(
        `INSERT INTO test_request_history (test_request_id, snapshot) VALUES ($1, $2)`,
        [id, JSON.stringify(snapshot)]
      );
    }

    await client.query(
      `UPDATE test_requests SET
         job_number=$1, received_date=$2, company=$3, po_number=$4, customer_id=$5, on_behalf_owner=$6,
         project_name=$7, address=$8, phone=$9,
         uncertainty_clarification=$10, capability_test_methods=$11,
         contract_differences=$12, equipment_availability=$13,
         witness_status=$14, witness_date=$15, specimen_status=$16,
         lhu_target_date=$17, lhu_handling=$18,
         customer_name=$19, customer_date=$20, customer_signature=$21,
         received_by_name=$22, received_by_date=$23, received_by_signature=$24,
         confirmation_agreed=$25, status=$26, updated_at=NOW()
       WHERE id=$27`,
      [
        b.job_number || '', b.received_date || '', b.company || '', b.po_number || '', b.customer_id || '',
        b.on_behalf_owner || '', b.project_name || '', b.address || '', b.phone || '',
        b.uncertainty_clarification || '', b.capability_test_methods || '',
        b.contract_differences || '', b.equipment_availability || '',
        b.witness_status || '', b.witness_date || '', b.specimen_status || '',
        b.lhu_target_date || '', b.lhu_handling || '',
        b.customer_name || '', b.customer_date || '', signatureToBuffer(b.customer_signature),
        b.received_by_name || '', b.received_by_date || '', signatureToBuffer(b.received_by_signature),
        !!b.confirmation_agreed,
        b.status || 'draft', id
      ]
    );

    await client.query(`DELETE FROM coupon_tests WHERE test_request_id = $1`, [id]);
    await insertCouponRows(client, Number(id), b.coupon_tests);
    if ((b.status || 'draft') === 'final') {
      await upsertCouponMasters(client, b.coupon_tests);
      await upsertCustomer(client, b.customer_id, b.on_behalf_owner);
    }

    await client.query('COMMIT');
    res.json(await getFullRequest(id));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Gagal memperbarui data', detail: String(err.message || err) });
  } finally {
    client.release();
  }
});

app.get('/requests/:id/print', async (req, res) => {
  try {
    const data = await getFullRequest(req.params.id);
    if (!data) return res.status(404).send('Permintaan tidak ditemukan');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPrintHtml(data));
  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal membuat halaman cetak');
  }
});

app.get('/api/requests/:id/history', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, amended_at FROM test_request_history WHERE test_request_id = $1 ORDER BY amended_at DESC`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat riwayat' });
  }
});

app.get('/requests/history/:historyId/print', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT snapshot FROM test_request_history WHERE id = $1`, [req.params.historyId]);
    if (!rows.length) return res.status(404).send('Versi riwayat tidak ditemukan');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderPrintHtml(rows[0].snapshot));
  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal membuat halaman cetak');
  }
});

app.delete('/api/requests/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM test_requests WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus data' });
  }
});

// ---------- Work Order (DPI-LP-FR-25) ----------

app.get('/api/work-order-steps', (req, res) => {
  res.json({ steps: PROCESS_STEPS });
});

app.get('/api/work-orders', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT wo.id, wo.test_request_id, wo.testing_date, wo.status, wo.created_at,
              tr.job_number, tr.company, tr.project_name
       FROM work_orders wo
       JOIN test_requests tr ON tr.id = wo.test_request_id
       ORDER BY wo.id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat data' });
  }
});

app.get('/api/work-orders/:id', async (req, res) => {
  try {
    const data = await getFullWorkOrder(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat data' });
  }
});

app.post('/api/requests/:id/work-order', async (req, res) => {
  try {
    const { rows: reqRows } = await pool.query(`SELECT * FROM test_requests WHERE id = $1`, [req.params.id]);
    const testRequest = reqRows[0];
    if (!testRequest) return res.status(404).json({ error: 'Permintaan tidak ditemukan' });
    if (testRequest.status !== 'final') {
      return res.status(400).json({ error: 'Permintaan harus difinalisasi dulu sebelum membuat Work Order' });
    }

    const { rows: existing } = await pool.query(
      `SELECT id FROM work_orders WHERE test_request_id = $1`, [req.params.id]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'Work Order untuk permintaan ini sudah ada', workOrderId: existing[0].id });
    }

    const { rows: couponRows } = await pool.query(
      `SELECT ref_code FROM coupon_tests WHERE test_request_id = $1 ORDER BY row_no ASC`,
      [req.params.id]
    );
    const ourReference = [...new Set(couponRows.map(r => (r.ref_code || '').trim()).filter(Boolean))].join(', ');

    const { rows: [wo] } = await pool.query(
      `INSERT INTO work_orders (test_request_id, our_reference) VALUES ($1, $2) RETURNING id`,
      [req.params.id, ourReference]
    );
    res.status(201).json(await getFullWorkOrder(wo.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membuat Work Order' });
  }
});

app.put('/api/work-orders/:id', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  const client = await pool.connect();
  try {
    const { rows: existing } = await client.query(`SELECT id FROM work_orders WHERE id = $1`, [id]);
    if (!existing.length) {
      client.release();
      return res.status(404).json({ error: 'Not found' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE work_orders SET
         testing_date=$1, our_reference=$2, contact_person=$3,
         receiving_pic=$4, machining_pic=$5, inspection_pic=$6, testing_pic=$7, reporting_pic=$8, doc_checked_pic=$9,
         prepared_by_name=$10, prepared_by_signature=$11,
         checked_by_name=$12, checked_by_signature=$13,
         approved_by_name=$14, approved_by_signature=$15, approval_date=$16,
         status=$17, updated_at=NOW()
       WHERE id=$18`,
      [
        b.testing_date || '', b.our_reference || '', b.contact_person || '',
        b.receiving_pic || '', b.machining_pic || '', b.inspection_pic || '',
        b.testing_pic || '', b.reporting_pic || '', b.doc_checked_pic || '',
        b.prepared_by_name || '', signatureToBuffer(b.prepared_by_signature),
        b.checked_by_name || '', signatureToBuffer(b.checked_by_signature),
        b.approved_by_name || '', signatureToBuffer(b.approved_by_signature), b.approval_date || '',
        b.status || 'draft', id
      ]
    );

    for (const mark of (b.sample_marks || [])) {
      await client.query(
        `INSERT INTO work_order_sample_marks (work_order_id, coupon_row_no, sample_marking)
         VALUES ($1,$2,$3)
         ON CONFLICT (work_order_id, coupon_row_no) DO UPDATE SET sample_marking = EXCLUDED.sample_marking`,
        [id, mark.row_no, mark.sample_marking || '']
      );
    }

    await client.query('COMMIT');
    res.json(await getFullWorkOrder(id));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Gagal memperbarui Work Order', detail: String(err.message || err) });
  } finally {
    client.release();
  }
});

app.delete('/api/work-orders/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM work_orders WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus Work Order' });
  }
});

app.get('/work-orders/:id/print', async (req, res) => {
  try {
    const data = await getFullWorkOrder(req.params.id);
    if (!data) return res.status(404).send('Work Order tidak ditemukan');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderWorkOrderPrintHtml(data));
  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal membuat halaman cetak');
  }
});

// ---------- Pengecekan Spesimen (DPI-LP-FR-26-1..4) ----------

const SPECIMEN_CATEGORIES = ['tensile', 'bending', 'charpy'];

app.get('/api/test-type-codes', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT id, test_name, code FROM test_type_codes ORDER BY test_name ASC`);
    res.json({ codes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat master kode jenis pengujian' });
  }
});

app.post('/api/test-type-codes', async (req, res) => {
  const b = req.body || {};
  const testName = (b.test_name || '').trim();
  const code = (b.code || '').trim();
  if (!testName || !code) return res.status(400).json({ error: 'Jenis Pengujian dan Kode tidak boleh kosong' });
  try {
    await pool.query(
      `INSERT INTO test_type_codes (test_name, code) VALUES ($1,$2)
       ON CONFLICT (test_name) DO UPDATE SET code = EXCLUDED.code`,
      [testName, code]
    );
    const { rows } = await pool.query(`SELECT id, test_name, code FROM test_type_codes ORDER BY test_name ASC`);
    res.status(201).json({ codes: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menyimpan kode jenis pengujian' });
  }
});

app.delete('/api/test-type-codes/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM test_type_codes WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus kode jenis pengujian' });
  }
});

app.get('/api/specimen-types', async (req, res) => {
  const category = req.query.category || '';
  const shape = req.query.shape || '';
  try {
    const { rows } = category
      ? (await pool.query(
          `SELECT id, category, shape, name, code_values FROM specimen_types WHERE category = $1 AND shape = $2 ORDER BY name ASC`,
          [category, shape]
        ))
      : (await pool.query(`SELECT id, category, shape, name, code_values FROM specimen_types ORDER BY category ASC, shape ASC, name ASC`));
    res.json({ types: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat master tipe spesimen' });
  }
});

app.post('/api/specimen-types', async (req, res) => {
  const b = req.body || {};
  const name = (b.name || '').trim();
  if (!SPECIMEN_CATEGORIES.includes(b.category)) return res.status(400).json({ error: 'Kategori tidak valid' });
  if (!name) return res.status(400).json({ error: 'Nama tipe spesimen tidak boleh kosong' });
  const shape = b.category === 'charpy' ? '' : (b.shape === 'round' ? 'round' : 'flat');
  try {
    await pool.query(
      `INSERT INTO specimen_types (category, shape, name, code_values) VALUES ($1,$2,$3,$4)
       ON CONFLICT (category, shape, name) DO UPDATE SET code_values = EXCLUDED.code_values`,
      [b.category, shape, name, JSON.stringify(b.code_values || {})]
    );
    const { rows } = await pool.query(
      `SELECT id, category, shape, name, code_values FROM specimen_types WHERE category = $1 AND shape = $2 ORDER BY name ASC`,
      [b.category, shape]
    );
    res.status(201).json({ types: rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menambah tipe spesimen' });
  }
});

app.delete('/api/specimen-types/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM specimen_types WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus tipe spesimen' });
  }
});

app.get('/api/specimen-inspections', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT si.id, si.test_request_id, si.category, si.shape, si.inspection_date, si.status, si.created_at,
              tr.job_number, tr.company
       FROM specimen_inspections si
       JOIN test_requests tr ON tr.id = si.test_request_id
       ORDER BY si.id DESC`
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat data' });
  }
});

app.get('/api/specimen-inspections/:id', async (req, res) => {
  try {
    const data = await getFullSpecimenInspection(req.params.id);
    if (!data) return res.status(404).json({ error: 'Not found' });
    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal memuat data' });
  }
});

app.post('/api/requests/:id/specimen-inspections', async (req, res) => {
  const b = req.body || {};
  if (!SPECIMEN_CATEGORIES.includes(b.category)) {
    return res.status(400).json({ error: 'Kategori tidak valid' });
  }
  const shape = b.category === 'charpy' ? null : (b.shape === 'round' ? 'round' : 'flat');
  try {
    const { rows: reqRows } = await pool.query(`SELECT * FROM test_requests WHERE id = $1`, [req.params.id]);
    const testRequest = reqRows[0];
    if (!testRequest) return res.status(404).json({ error: 'Permintaan tidak ditemukan' });
    if (testRequest.status !== 'final') {
      return res.status(400).json({ error: 'Permintaan harus difinalisasi dulu sebelum membuat Pengecekan Spesimen' });
    }

    const { rows: couponRows } = await pool.query(
      `SELECT ref_code FROM coupon_tests WHERE test_request_id = $1 ORDER BY row_no ASC`,
      [req.params.id]
    );
    const refCode = (couponRows.find(r => (r.ref_code || '').trim()) || {}).ref_code || '';

    const { rows: [insp] } = await pool.query(
      `INSERT INTO specimen_inspections (test_request_id, category, shape, ref_code)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [req.params.id, b.category, shape, refCode]
    );
    res.status(201).json(await getFullSpecimenInspection(insp.id));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal membuat Pengecekan Spesimen' });
  }
});

app.put('/api/specimen-inspections/:id', async (req, res) => {
  const id = req.params.id;
  const b = req.body || {};
  const client = await pool.connect();
  try {
    const { rows: existing } = await client.query(`SELECT id FROM specimen_inspections WHERE id = $1`, [id]);
    if (!existing.length) {
      client.release();
      return res.status(404).json({ error: 'Not found' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE specimen_inspections SET
         inspection_date=$1, type_of_specimen=$2, ref_code=$3, marking=$4,
         inspected_by_name=$5, inspected_by_signature=$6,
         approved_by_name=$7, approved_by_signature=$8,
         status=$9, updated_at=NOW()
       WHERE id=$10`,
      [
        b.inspection_date || '', b.type_of_specimen || '', b.ref_code || '', b.marking || '',
        b.inspected_by_name || '', signatureToBuffer(b.inspected_by_signature),
        b.approved_by_name || '', signatureToBuffer(b.approved_by_signature),
        b.status || 'draft', id
      ]
    );

    await client.query(`DELETE FROM specimen_rows WHERE specimen_inspection_id = $1`, [id]);
    let rowNo = 0;
    for (const row of (b.rows || [])) {
      rowNo += 1;
      await client.query(
        `INSERT INTO specimen_rows (specimen_inspection_id, row_no, marking_specimen, type_lt, location, accepted, measurements)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          id, rowNo, row.marking_specimen || '', row.type_lt || '', row.location || '', row.accepted || '',
          JSON.stringify(row.measurements || {})
        ]
      );
    }

    await client.query('COMMIT');
    res.json(await getFullSpecimenInspection(id));
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    res.status(500).json({ error: 'Gagal memperbarui data', detail: String(err.message || err) });
  } finally {
    client.release();
  }
});

app.delete('/api/specimen-inspections/:id', async (req, res) => {
  try {
    const { rowCount } = await pool.query(`DELETE FROM specimen_inspections WHERE id = $1`, [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Gagal menghapus data' });
  }
});

app.get('/specimen-inspections/:id/print', async (req, res) => {
  try {
    const data = await getFullSpecimenInspection(req.params.id);
    if (!data) return res.status(404).send('Pengecekan Spesimen tidak ditemukan');

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(renderSpecimenPrintHtml(data));
  } catch (err) {
    console.error(err);
    res.status(500).send('Gagal membuat halaman cetak');
  }
});

// ---------- startup ----------

initSchema()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`DETECH LIMS running on http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('[db] Failed to initialize schema:', err);
    process.exit(1);
  });
