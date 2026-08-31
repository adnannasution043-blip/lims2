const express = require('express');
const path = require('path');
const { pool, initSchema } = require('./db/init');
const { TEST_TYPES } = require('./db/testTypes');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- helpers ----------

async function generateJobNumber() {
  // e.g. DE.260831.01  (DE.yymmdd.seq) — mirrors the "DE.xxxxxx" style seen on the sample form
  const now = new Date();
  const y = String(now.getFullYear()).slice(2);
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  const prefix = `DE.${y}${m}${d}`;
  const { rows } = await pool.query(
    `SELECT COUNT(*) AS c FROM test_requests WHERE job_number LIKE $1`,
    [`${prefix}%`]
  );
  const seq = String(parseInt(rows[0].c, 10) + 1).padStart(2, '0');
  return `${prefix}.${seq}`;
}

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
    result.push({
      ...c,
      coupon_type: c.coupon_type || [], // jsonb column, pg parses it already
      test_items: items.map(i => ({ ...i, checked: !!i.checked }))
    });
  }
  return result;
}

async function getFullRequest(id) {
  const { rows } = await pool.query(`SELECT * FROM test_requests WHERE id = $1`, [id]);
  const req = rows[0];
  if (!req) return null;
  req.coupon_tests = await serializeCouponRows(id);
  return req;
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
         charpy_temp, charpy_wm, charpy_bm, charpy_haz
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       RETURNING id`,
      [
        testRequestId, rowNo, JSON.stringify(row.coupon_type || []), row.coupon_type_other || '',
        row.material_type_grade || '', row.material_size || '', row.outside_diameter || '',
        row.thickness || '', row.heat_number || '', row.welding_process || '',
        row.welding_position || '', row.ref_code || '', row.no_wps || '',
        row.testing_purpose || '', row.note || '',
        row.charpy_temp || '', row.charpy_wm || '', row.charpy_bm || '', row.charpy_haz || ''
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
  }
}

// ---------- API routes ----------

app.get('/api/test-types', (req, res) => {
  res.json({ testTypes: TEST_TYPES });
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
      `SELECT id, job_number, company, project_name, received_date, status, created_at
       FROM test_requests ORDER BY id DESC`
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
         customer_name, customer_date, received_by_name, received_by_date, status
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING id`,
      [
        jobNumber, b.received_date || '', b.company || '', b.po_number || '', b.customer_id || '',
        b.on_behalf_owner || '', b.project_name || '', b.address || '', b.phone || '',
        b.uncertainty_clarification || '', b.capability_test_methods || '',
        b.contract_differences || '', b.equipment_availability || '',
        b.witness_status || '', b.witness_date || '', b.specimen_status || '',
        b.lhu_target_date || '', b.lhu_handling || '',
        b.customer_name || '', b.customer_date || '', b.received_by_name || '', b.received_by_date || '',
        b.status || 'draft'
      ]
    );

    await insertCouponRows(client, inserted.id, b.coupon_tests);
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
  const client = await pool.connect();
  try {
    const { rows: existingRows } = await client.query(`SELECT id FROM test_requests WHERE id = $1`, [id]);
    if (!existingRows.length) {
      client.release();
      return res.status(404).json({ error: 'Not found' });
    }

    await client.query('BEGIN');

    await client.query(
      `UPDATE test_requests SET
         job_number=$1, received_date=$2, company=$3, po_number=$4, customer_id=$5, on_behalf_owner=$6,
         project_name=$7, address=$8, phone=$9,
         uncertainty_clarification=$10, capability_test_methods=$11,
         contract_differences=$12, equipment_availability=$13,
         witness_status=$14, witness_date=$15, specimen_status=$16,
         lhu_target_date=$17, lhu_handling=$18,
         customer_name=$19, customer_date=$20, received_by_name=$21, received_by_date=$22,
         status=$23, updated_at=NOW()
       WHERE id=$24`,
      [
        b.job_number || '', b.received_date || '', b.company || '', b.po_number || '', b.customer_id || '',
        b.on_behalf_owner || '', b.project_name || '', b.address || '', b.phone || '',
        b.uncertainty_clarification || '', b.capability_test_methods || '',
        b.contract_differences || '', b.equipment_availability || '',
        b.witness_status || '', b.witness_date || '', b.specimen_status || '',
        b.lhu_target_date || '', b.lhu_handling || '',
        b.customer_name || '', b.customer_date || '', b.received_by_name || '', b.received_by_date || '',
        b.status || 'draft', id
      ]
    );

    await client.query(`DELETE FROM coupon_tests WHERE test_request_id = $1`, [id]);
    await insertCouponRows(client, Number(id), b.coupon_tests);

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
