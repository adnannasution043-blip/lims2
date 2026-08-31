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
      received_by_name TEXT,
      received_by_date TEXT,

      status TEXT DEFAULT 'draft',        -- 'draft' | 'final'
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

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
  `);
}

module.exports = { pool, initSchema };
