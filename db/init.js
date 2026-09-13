const { Pool } = require('pg');
const { COMPANY_IDS } = require('./companyIds');
const { TEST_METHOD_SEED } = require('./testMethodSeed');

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
      confirmation_agreed BOOLEAN DEFAULT FALSE,  -- final "I agree to this request" checklist

      status TEXT DEFAULT 'draft',        -- 'draft' | 'final'
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- test_requests already exists in deployed DBs from before signatures were added,
    -- so CREATE TABLE IF NOT EXISTS above is a no-op there — add the columns explicitly.
    ALTER TABLE test_requests ADD COLUMN IF NOT EXISTS customer_signature BYTEA;
    ALTER TABLE test_requests ADD COLUMN IF NOT EXISTS received_by_signature BYTEA;
    ALTER TABLE test_requests ADD COLUMN IF NOT EXISTS confirmation_agreed BOOLEAN DEFAULT FALSE;

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
      charpy_haz TEXT,
      charpy_fl TEXT,
      charpy_fl2 TEXT,
      charpy_optional_label TEXT,   -- editable label, defaults to "Opsional/Lainnya"
      charpy_optional TEXT,
      hardness_spot TEXT            -- Jumlah Spot, shown under Hardness Test
    );

    -- coupon_tests already existed before the FL/FL+2/Opsional Charpy columns were added.
    ALTER TABLE coupon_tests ADD COLUMN IF NOT EXISTS charpy_fl TEXT;
    ALTER TABLE coupon_tests ADD COLUMN IF NOT EXISTS charpy_fl2 TEXT;
    ALTER TABLE coupon_tests ADD COLUMN IF NOT EXISTS charpy_optional TEXT;
    ALTER TABLE coupon_tests ADD COLUMN IF NOT EXISTS hardness_spot TEXT;
    ALTER TABLE coupon_tests ADD COLUMN IF NOT EXISTS charpy_optional_label TEXT;

    CREATE TABLE IF NOT EXISTS test_items (
      id SERIAL PRIMARY KEY,
      coupon_test_id INTEGER NOT NULL REFERENCES coupon_tests(id) ON DELETE CASCADE,
      test_name TEXT NOT NULL,
      test_name_other TEXT,        -- free-text label typed in when test_name is 'Lainnya'
      checked BOOLEAN DEFAULT FALSE,
      qty TEXT,
      method TEXT
    );

    ALTER TABLE test_items ADD COLUMN IF NOT EXISTS test_name_other TEXT;

    CREATE INDEX IF NOT EXISTS idx_coupon_tests_request ON coupon_tests(test_request_id);
    CREATE INDEX IF NOT EXISTS idx_test_items_coupon ON test_items(coupon_test_id);

    -- Amendment history: a full snapshot of the request (+ coupon tests) taken
    -- right before a Final request gets saved again, so earlier versions stay
    -- viewable even though the request itself remains editable after Final.
    CREATE TABLE IF NOT EXISTS test_request_history (
      id SERIAL PRIMARY KEY,
      test_request_id INTEGER NOT NULL REFERENCES test_requests(id) ON DELETE CASCADE,
      snapshot JSONB NOT NULL,
      amended_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_test_request_history_request ON test_request_history(test_request_id);

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
      prepared_by_signature BYTEA,         -- PNG bytes captured from the signature pad
      checked_by_name TEXT,
      checked_by_signature BYTEA,          -- PNG bytes captured from the signature pad
      approved_by_name TEXT,
      approved_by_signature BYTEA,         -- PNG bytes captured from the signature pad
      approval_date TEXT,

      status TEXT DEFAULT 'draft',        -- 'draft' | 'final'
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- work_orders already existed before Approval signatures were added.
    ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS prepared_by_signature BYTEA;
    ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS checked_by_signature BYTEA;
    ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS approved_by_signature BYTEA;

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

    -- Shared across all Metode Tes fields (Tensile, Bend, Hardness, dst) in the
    -- Jenis Pengujian table — one growing list, not split per test type.
    CREATE TABLE IF NOT EXISTS test_methods (
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

    -- ID Perusahaan + Atas Nama Perusahaan are one paired record here, not two
    -- separate lists — picking one side should be able to fill in the other.
    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      customer_id TEXT NOT NULL,
      on_behalf_owner TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(customer_id, on_behalf_owner)
    );

    -- Pengecekan Spesimen (DPI-LP-FR-26-1..4). One sheet per test category
    -- (Tensile Flat/Round, Bending Flat/Round, Charpy Impact) — a single
    -- Permintaan Pengujian can have several sheets (different categories, or
    -- repeats). "category"+"shape" decide which fixed template renders/prints;
    -- Kode Acuan/standard is just data on the sheet, never changes the template.
    CREATE TABLE IF NOT EXISTS specimen_inspections (
      id SERIAL PRIMARY KEY,
      test_request_id INTEGER NOT NULL REFERENCES test_requests(id) ON DELETE CASCADE,

      category TEXT NOT NULL,           -- 'tensile' | 'bending' | 'charpy'
      shape TEXT,                       -- 'flat' | 'round' (tensile & bending only)

      inspection_date TEXT,
      type_of_specimen TEXT,
      ref_code TEXT,
      marking TEXT,

      inspected_by_name TEXT,
      inspected_by_signature BYTEA,
      approved_by_name TEXT,
      approved_by_signature BYTEA,

      status TEXT DEFAULT 'draft',        -- 'draft' | 'final'
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- Per-specimen rows. "measurements" is a JSONB bag because the field set
    -- differs a lot per category/shape (3-point width+thickness vs diameter vs
    -- V-notch + profile projector check, etc.) — the frontend owns that shape.
    CREATE TABLE IF NOT EXISTS specimen_rows (
      id SERIAL PRIMARY KEY,
      specimen_inspection_id INTEGER NOT NULL REFERENCES specimen_inspections(id) ON DELETE CASCADE,
      row_no INTEGER NOT NULL,

      marking_specimen TEXT,
      type_lt TEXT,                     -- 'L' | 'T'
      location TEXT,                    -- Charpy only: Base Metal / Weld Metal / HAZ / Fusion Line ...
      accepted TEXT,                    -- 'Y' | 'N' (Bending & Charpy)
      measurements JSONB DEFAULT '{}'
    );

    CREATE INDEX IF NOT EXISTS idx_specimen_inspections_request ON specimen_inspections(test_request_id);
    CREATE INDEX IF NOT EXISTS idx_specimen_rows_inspection ON specimen_rows(specimen_inspection_id);

    -- Master "Tipe Spesimen" per category+shape — picking one in the Pengecekan
    -- Spesimen form auto-fills every "Code" (standard/nominal) column; "Actual"
    -- stays for the technician to measure. Managed via Master Data menu.
    CREATE TABLE IF NOT EXISTS specimen_types (
      id SERIAL PRIMARY KEY,
      category TEXT NOT NULL,           -- 'tensile' | 'bending' | 'charpy'
      shape TEXT NOT NULL DEFAULT '',   -- 'flat' | 'round' (tensile & bending), '' for charpy
      name TEXT NOT NULL,
      code_values JSONB DEFAULT '{}',   -- e.g. {"width_code":"19","radius_code":"25",...}
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(category, shape, name)
    );

    CREATE INDEX IF NOT EXISTS idx_specimen_types_cat_shape ON specimen_types(category, shape);

    -- Short code per Jenis Pengujian (e.g. "Chemical Composition Test" -> "CA"),
    -- used to build Marking Specimen on the Pengecekan Spesimen form:
    -- {Sample Marking WO}-{code}{qty}. Managed via Master Data.
    CREATE TABLE IF NOT EXISTS test_type_codes (
      id SERIAL PRIMARY KEY,
      test_name TEXT UNIQUE NOT NULL,
      code TEXT NOT NULL,
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

  // Seed test methods imported from "List Test Method.xlsx" (idempotent).
  if (TEST_METHOD_SEED.length) {
    const placeholders = TEST_METHOD_SEED.map((_, i) => `($${i + 1})`).join(',');
    await pool.query(
      `INSERT INTO test_methods (name) VALUES ${placeholders} ON CONFLICT (name) DO NOTHING`,
      TEST_METHOD_SEED
    );
  }

  // Seed customers imported from "List COMPANY ID.xlsx" (idempotent).
  if (COMPANY_IDS.length) {
    const placeholders = COMPANY_IDS.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(',');
    await pool.query(
      `INSERT INTO customers (customer_id, on_behalf_owner) VALUES ${placeholders}
       ON CONFLICT (customer_id, on_behalf_owner) DO NOTHING`,
      COMPANY_IDS.flat()
    );
  }

  // Dummy starter "Tipe Spesimen" data (placeholder Code values loosely based on
  // the sample forms) — meant to be reviewed/corrected via Master Data, not used
  // as authoritative standard dimensions.
  const SPECIMEN_TYPE_SEED = [
    ['tensile', 'flat', 'Joint Pipe/Joint Plate', { gauge_length_code: '19', width_code: '19', thickness_code: '-', radius_code: '25', reduce_section_code: '250', total_length_code: '300' }],
    ['tensile', 'flat', 'Reduced Section Tension', { gauge_length_code: '20', width_code: '20', thickness_code: '-', radius_code: '12', reduce_section_code: '60', total_length_code: '300' }],
    ['tensile', 'flat', 'Full Section Tensile', { gauge_length_code: '-', width_code: '25', thickness_code: '-', radius_code: '-', reduce_section_code: '230', total_length_code: '300' }],
    ['tensile', 'round', 'BjTP/BjTS', { gauge_length_code: '200', diameter_code: '10', radius_code: '-', reduce_section_code: '225', total_length_code: '500' }],
    ['tensile', 'round', 'Plate/Anchor/Round Bar', { gauge_length_code: '36', diameter_code: '9', radius_code: '8', reduce_section_code: '45', total_length_code: '300' }],
    ['tensile', 'round', 'Specimen 1 Round', { gauge_length_code: '50', diameter_code: '12.5', radius_code: '10', reduce_section_code: '56', total_length_code: '300' }],
    ['bending', 'flat', 'Face & Root Bend', { width_code: '38', thickness_code: '-', radius_code: '3', length_code: '150' }],
    ['bending', 'flat', 'Side Bend', { width_code: '10', thickness_code: '-', radius_code: '3', length_code: '150' }],
    ['bending', 'round', 'BjTP/BjTS', { diameter_code: '10', length_code: '350' }],
    ['charpy', '', 'Standard Specimen', { length_code: '55', width_code: '10', thickness_code: '10' }]
  ];
  for (const [category, shape, name, codeValues] of SPECIMEN_TYPE_SEED) {
    await pool.query(
      `INSERT INTO specimen_types (category, shape, name, code_values) VALUES ($1,$2,$3,$4)
       ON CONFLICT (category, shape, name) DO NOTHING`,
      [category, shape, name, JSON.stringify(codeValues)]
    );
  }

  // Dummy starter codes per Jenis Pengujian, used to build Marking Specimen —
  // review/adjust the actual letters via Master Data.
  const TEST_TYPE_CODE_SEED = [
    ['Tensile Test', 'TS'], ['Bend Root', 'BR'], ['Bend Face', 'BF'], ['Bend Side', 'BS'],
    ['Hardness Test', 'HD'], ['Nick Break Test', 'NB'], ['Charpy Impact Test', 'CI'],
    ['Macro-etching & Examination', 'MC'], ['Fillet Weld Break', 'FW'], ['Flattening Test', 'FT'],
    ['Chemical Composition Test', 'CA'], ['Microstructure / Metallography', 'MS'],
    ['Ferrite Point Count/ Ferrite Content', 'FP'], ['Intergranular / Pitting Corrosion', 'IC'],
    ['Through Thickness', 'TT']
  ];
  for (const [testName, code] of TEST_TYPE_CODE_SEED) {
    await pool.query(
      `INSERT INTO test_type_codes (test_name, code) VALUES ($1,$2) ON CONFLICT (test_name) DO NOTHING`,
      [testName, code]
    );
  }
}

module.exports = { pool, initSchema };
