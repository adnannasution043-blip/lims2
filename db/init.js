const { Pool } = require('pg');

// Railway (and most managed Postgres) inject DATABASE_URL automatically once
// the Postgres plugin is attached to this service. For local dev, put your
// own connection string in a .env file / exported env var, see .env.example.
if (!process.env.DATABASE_URL) {
  console.warn('[db] DATABASE_URL not set — falling back to default local Postgres connection.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/detech_lims',
  // Railway's public proxy requires SSL; its private/internal network does not.
  // Set PGSSL=true if your DATABASE_URL needs SSL (e.g. connecting from outside Railway).
  ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : false
});

pool.on('error', (err) => {
  console.error('[db] Unexpected error on idle Postgres client', err);
});

async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS test_requests (
      id SERIAL PRIMARY KEY,
      job_number TEXT,
      received_date TEXT,
      company TEXT,
      po_number TEXT,
      customer_id TEXT,
      on_behalf_owner TEXT,
      project_name TEXT,
      address TEXT,
      phone TEXT,

      uncertainty_clarification TEXT,     -- 'Y' | 'N'
      capability_test_methods TEXT,       -- 'Y' | 'N'
      contract_differences TEXT,          -- 'Y' | 'N'
      equipment_availability TEXT,        -- 'Y' | 'N'

      witness_status TEXT,                -- 'Witness' | 'Not Witness'
      witness_date TEXT,
      specimen_status TEXT,               -- 'Taken' | 'Not Taken'
      lhu_target_date TEXT,
      lhu_handling TEXT,                  -- 'Taken by customer' | 'sent by PT Detech'

      customer_name TEXT,
      customer_date TEXT,
      customer_signature BYTEA,           -- PNG bytes captured from the signature pad
      received_by_name TEXT,
      received_by_date TEXT,
      received_by_signature BYTEA,        -- PNG bytes captured from the signature pad

      status TEXT DEFAULT 'draft',        -- 'draft' | 'final'
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- test_requests already exists in deployed DBs from before signatures were added,
    -- so CREATE TABLE IF NOT EXISTS above is a no-op there — add the columns explicitly.
    ALTER TABLE test_requests ADD COLUMN IF NOT EXISTS customer_signature BYTEA;
    ALTER TABLE test_requests ADD COLUMN IF NOT EXISTS received_by_signature BYTEA;

    CREATE TABLE IF NOT EXISTS coupon_tests (
      id SERIAL PRIMARY KEY,
      test_request_id INTEGER NOT NULL REFERENCES test_requests(id) ON DELETE CASCADE,
      row_no INTEGER NOT NULL,

      coupon_type JSONB DEFAULT '[]',    -- e.g. ["Plate","Pipe"]
      coupon_type_other TEXT,            -- free text for custom checkbox (e.g. "Joint Pipe")
      material_type_grade TEXT,
      material_size TEXT,
      outside_diameter TEXT,
      thickness TEXT,
      heat_number TEXT,
      welding_process TEXT,
      welding_position TEXT,
      ref_code TEXT,
      no_wps TEXT,
      testing_purpose TEXT,
      note TEXT,

      charpy_temp TEXT,
      charpy_wm TEXT,
      charpy_bm TEXT,
      charpy_haz TEXT
    );

    CREATE TABLE IF NOT EXISTS test_items (
      id SERIAL PRIMARY KEY,
      coupon_test_id INTEGER NOT NULL REFERENCES coupon_tests(id) ON DELETE CASCADE,
      test_name TEXT NOT NULL,
      checked BOOLEAN DEFAULT FALSE,
      qty TEXT,
      method TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_coupon_tests_request ON coupon_tests(test_request_id);
    CREATE INDEX IF NOT EXISTS idx_test_items_coupon ON test_items(coupon_test_id);

    -- Work Order (DPI-LP-FR-25): satu per Tinjauan Permintaan Pengujian yang sudah final.
    -- Info pelanggan & coupon test tidak diduplikasi di sini, cukup dibaca dari test_requests/
    -- coupon_tests lewat test_request_id — tabel ini hanya menyimpan data yang memang khas
    -- Work Order (tanggal testing, PIC tiap tahap proses, approval).
    CREATE TABLE IF NOT EXISTS work_orders (
      id SERIAL PRIMARY KEY,
      test_request_id INTEGER NOT NULL UNIQUE REFERENCES test_requests(id) ON DELETE CASCADE,

      testing_date TEXT,
      our_reference TEXT,
      contact_person TEXT,

      receiving_pic TEXT,
      machining_pic TEXT,
      inspection_pic TEXT,
      testing_pic TEXT,
      reporting_pic TEXT,
      doc_checked_pic TEXT,

      prepared_by_name TEXT,
      checked_by_name TEXT,
      approved_by_name TEXT,
      approval_date TEXT,

      status TEXT DEFAULT 'draft',        -- 'draft' | 'final'
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Sample Marking per baris coupon test, dikaitkan lewat row_no (bukan coupon_tests.id)
    -- karena PUT /api/requests/:id men-delete+insert ulang seluruh coupon_tests setiap
    -- request disimpan — mengikat lewat id akan membuat data ini gampang lepas/orphan.
    CREATE TABLE IF NOT EXISTS work_order_sample_marks (
      id SERIAL PRIMARY KEY,
      work_order_id INTEGER NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
      coupon_row_no INTEGER NOT NULL,
      sample_marking TEXT,
      UNIQUE(work_order_id, coupon_row_no)
    );

    CREATE INDEX IF NOT EXISTS idx_work_orders_request ON work_orders(test_request_id);
    CREATE INDEX IF NOT EXISTS idx_wo_sample_marks_wo ON work_order_sample_marks(work_order_id);

    CREATE TABLE IF NOT EXISTS welding_processes (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS welding_positions (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ref_codes (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS coupon_types (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Master list of PIC names, managed via the Master Data menu — used to fill the
    -- Description of Process dropdowns (Receiving/Machining/Inspection/Testing/
    -- Reporting/Doc. Checked) on the Work Order form.
    CREATE TABLE IF NOT EXISTS wo_pics (
      id SERIAL PRIMARY KEY,
      name TEXT UNIQUE NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // Seed default welding processes (idempotent — only inserts what's missing).
  await pool.query(
    `INSERT INTO welding_processes (name) VALUES ($1),($2),($3),($4),($5),($6),($7)
     ON CONFLICT (name) DO NOTHING`,
    ['GTAW', 'SMAW', 'GMAW', 'FCAW', 'SAW', 'GTAW + SMAW', 'Brazing']
  );

  // Seed default welding positions (idempotent — only inserts what's missing).
  await pool.query(
    `INSERT INTO welding_positions (name)
     VALUES ($1),($2),($3),($4),($5),($6),($7),($8),($9),($10),($11),($12)
     ON CONFLICT (name) DO NOTHING`,
    ['1F', '2F', '3F', '4F', '5F', '1G', '2G', '3G', '4G', '5G', '6G', '6GR']
  );

  // Seed default ref codes (idempotent — only inserts what's missing).
  await pool.query(
    `INSERT INTO ref_codes (name) VALUES ($1),($2),($3),($4)
     ON CONFLICT (name) DO NOTHING`,
    ['ASME BPVC Sec. IX', 'AWS D1.1/D1.1M', 'AWS D.1.6/D1.6M', 'API 1104']
  );

  // Seed default coupon types (idempotent — only inserts what's missing).
  await pool.query(
    `INSERT INTO coupon_types (name)
     VALUES ($1),($2),($3),($4),($5),($6),($7),($8),($9),($10),($11),($12)
     ON CONFLICT (name) DO NOTHING`,
    [
      'Plate', 'Pipe', 'Bolt/Nut', 'Round Bar', 'H Beam', 'WF',
      'Joint Plate', 'Joint Pipe', 'Fillet Weld', 'Overlay', 'Angle', 'C Beam'
    ]
  );
}

module.exports = { pool, initSchema };
