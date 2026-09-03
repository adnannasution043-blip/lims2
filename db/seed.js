// Isi data dummy untuk Tinjauan Permintaan Pengujian, mengikuti format contoh form
// DPI-LP-FR-24 Rev.4 (job DE.1251409 / PT Allpro Mirai Indonesia).
// Jalankan: npm run seed
const { pool, initSchema } = require('./init');
const { TEST_TYPES } = require('./testTypes');

function buildItems(checkedMap) {
  return TEST_TYPES.map(name => {
    const c = checkedMap[name];
    return c
      ? { test_name: name, checked: true, qty: c.qty || '', method: c.method || '' }
      : { test_name: name, checked: false, qty: '', method: '' };
  });
}

const REQUESTS = [
  {
    job_number: 'DE.251022.01',
    received_date: '2025-10-22',
    company: 'PT Allpro Mirai Indonesia',
    po_number: '',
    customer_id: 'VMV',
    on_behalf_owner: 'PT VNV Mandiri Valve',
    project_name: '',
    address: 'Kawasan Pergudangan Marunda Center Blok T3 No. 19 & 20, Segara Makmur, Tarumajaya, Kab. Bekasi - Jawa Barat 17211',
    phone: '',
    uncertainty_clarification: 'N',
    capability_test_methods: 'Y',
    contract_differences: 'N',
    equipment_availability: 'Y',
    witness_status: 'Not Witness',
    witness_date: '2025-10-23',
    specimen_status: 'Taken',
    lhu_target_date: '',
    lhu_handling: 'sent by PT Detech',
    customer_name: '',
    customer_date: '',
    received_by_name: 'Fajar P',
    received_by_date: '2025-10-22',
    status: 'final',
    coupon_tests: [
      {
        coupon_type: [],
        coupon_type_other: 'Joint Pipe',
        material_type_grade: 'SA-335 Gr. P11 to SA-335 Gr. P11',
        material_size: '',
        outside_diameter: '168.3',
        thickness: '10',
        heat_number: '',
        welding_process: 'GTAW + SMAW',
        welding_position: '6G',
        ref_code: 'ASME Sec. IX : 2025',
        no_wps: '002/WPS/ASME/VMV/25',
        testing_purpose: 'WPS',
        note: 'No PQR : 002/PQR/ASME/VMV/25',
        charpy_temp: '', charpy_wm: '', charpy_bm: '', charpy_haz: '',
        test_items: buildItems({
          'Tensile Test': { qty: '2', method: 'ASTM E8/E8M-22' },
          'Bend Root': { qty: '4', method: 'ASTM E190-21' },
          'Bend Face': { qty: '4', method: 'ASTM E190-21' },
          'Bend Side': { qty: '4', method: 'ASTM E190-21' }
        })
      }
    ]
  },
  {
    job_number: 'DE.251015.01',
    received_date: '2025-10-15',
    company: 'PT Krakatau Steel Tbk',
    po_number: 'PO/KS/2025/0847',
    customer_id: 'KS',
    on_behalf_owner: '',
    project_name: 'Fabrikasi Tangki Penyimpanan BBM',
    address: 'Jl. Industri No. 5, Kawasan Industri Krakatau, Cilegon, Banten 42435',
    phone: '0254-123456',
    uncertainty_clarification: 'N',
    capability_test_methods: 'Y',
    contract_differences: 'N',
    equipment_availability: 'Y',
    witness_status: 'Witness',
    witness_date: '2025-10-16',
    specimen_status: 'Taken',
    lhu_target_date: '2025-10-25',
    lhu_handling: 'Taken by customer',
    customer_name: 'Budi Santoso',
    customer_date: '2025-10-15',
    received_by_name: 'Alfa Sendya',
    received_by_date: '2025-10-15',
    status: 'draft',
    coupon_tests: [
      {
        coupon_type: ['Plate'],
        coupon_type_other: '',
        material_type_grade: 'SA-516 Gr. 70',
        material_size: '2000 x 1000',
        outside_diameter: '',
        thickness: '12',
        heat_number: 'HN-88213',
        welding_process: 'SMAW',
        welding_position: '1G',
        ref_code: 'ASME Sec. IX : 2023',
        no_wps: '015/WPS/ASME/KS/25',
        testing_purpose: 'Production Test',
        note: '',
        charpy_temp: '', charpy_wm: '', charpy_bm: '', charpy_haz: '',
        test_items: buildItems({
          'Hardness Test': { qty: '3', method: 'ASTM E10-18' },
          'Chemical Composition Test': { qty: '1', method: 'ASTM E415' },
          'Microstructure / Metallography': { qty: '2', method: 'ASTM E3-11' }
        })
      }
    ]
  },
  {
    job_number: 'DE.250928.02',
    received_date: '2025-09-28',
    company: 'PT Pertamina Hulu Energi',
    po_number: 'PHE/PO/2025/1123',
    customer_id: 'PHE',
    on_behalf_owner: 'PT Rekayasa Industri',
    project_name: 'Pipeline Replacement Project Blok Rokan',
    address: 'Menara Standard Chartered, Jl. Prof. Dr. Satrio No. 164, Jakarta Selatan 12930',
    phone: '021-5140000',
    uncertainty_clarification: 'N',
    capability_test_methods: 'Y',
    contract_differences: 'N',
    equipment_availability: 'Y',
    witness_status: 'Witness',
    witness_date: '2025-09-29',
    specimen_status: 'Taken',
    lhu_target_date: '2025-10-10',
    lhu_handling: 'sent by PT Detech',
    customer_name: 'Dewi Anggraini',
    customer_date: '2025-09-28',
    received_by_name: 'Dio Dwi P',
    received_by_date: '2025-09-28',
    status: 'final',
    coupon_tests: [
      {
        coupon_type: ['Pipe'],
        coupon_type_other: '',
        material_type_grade: 'API 5L X65',
        material_size: '',
        outside_diameter: '323.9',
        thickness: '12.7',
        heat_number: 'HN-77421',
        welding_process: 'GTAW + SMAW',
        welding_position: '5G',
        ref_code: 'ASME Sec. IX : 2023',
        no_wps: '021/WPS/API/PHE/25',
        testing_purpose: 'WPS Qualification',
        note: 'No PQR : 021/PQR/API/PHE/25',
        charpy_temp: '-20', charpy_wm: '55', charpy_bm: '68', charpy_haz: '61',
        test_items: buildItems({
          'Tensile Test': { qty: '2', method: 'ASTM E8/E8M-22' },
          'Bend Root': { qty: '4', method: 'ASTM E190-21' },
          'Bend Face': { qty: '4', method: 'ASTM E190-21' },
          'Bend Side': { qty: '4', method: 'ASTM E190-21' },
          'Charpy Impact Test': { qty: '9', method: 'ASTM E23-18' },
          'Macro-etching & Examination': { qty: '1', method: 'ASTM E340-15' }
        })
      }
    ]
  }
];

async function insertCouponRows(client, testRequestId, couponRows) {
  let rowNo = 0;
  for (const row of couponRows) {
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

    for (const ti of row.test_items) {
      await client.query(
        `INSERT INTO test_items (coupon_test_id, test_name, checked, qty, method)
         VALUES ($1,$2,$3,$4,$5)`,
        [coupon.id, ti.test_name, !!ti.checked, ti.qty || '', ti.method || '']
      );
    }
  }
}

async function seed() {
  await initSchema();
  const client = await pool.connect();
  try {
    for (const r of REQUESTS) {
      const { rows: existing } = await client.query(
        `SELECT id FROM test_requests WHERE job_number = $1`, [r.job_number]
      );
      if (existing.length) {
        console.log(`[seed] Lewati ${r.job_number} — sudah ada.`);
        continue;
      }

      await client.query('BEGIN');
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
          r.job_number, r.received_date, r.company, r.po_number, r.customer_id,
          r.on_behalf_owner, r.project_name, r.address, r.phone,
          r.uncertainty_clarification, r.capability_test_methods,
          r.contract_differences, r.equipment_availability,
          r.witness_status, r.witness_date, r.specimen_status,
          r.lhu_target_date, r.lhu_handling,
          r.customer_name, r.customer_date, r.received_by_name, r.received_by_date,
          r.status
        ]
      );
      await insertCouponRows(client, inserted.id, r.coupon_tests);
      await client.query('COMMIT');
      console.log(`[seed] Dibuat ${r.job_number} — ${r.company}`);
    }
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

seed()
  .then(() => console.log('[seed] Selesai.'))
  .catch(err => {
    console.error('[seed] Gagal:', err);
    process.exit(1);
  });
