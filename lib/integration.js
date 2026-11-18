// Integrasi dengan aplikasi DETECH Administrasi & Keuangan (aplikasi terpisah, server & database sendiri).
//
// Arah LIMS -> Administrasi (API ini, dipanggil server Administrasi):
//   GET  /api/integration/v1/health
//   GET  /api/integration/v1/customers                 master customer (dipakai master customer Administrasi)
//   POST /api/integration/v1/customers                 customer baru/ubah dari Administrasi (upsert per ID + Atas Nama)
//   GET  /api/integration/v1/jobs?q=&limit=            cari Job (Permintaan Uji)
//   GET  /api/integration/v1/jobs/:jobNo               satu Job lengkap: coupon, jenis uji, dan LHU per coupon
//   GET  /api/integration/v1/job-dates?from=&to=       tanggal masuk Job (tren di Analisa Bisnis)
//   GET  /api/integration/v1/lhu-issued?from=&to=      Job yang LHU-nya sudah terbit (siap ditagih)
//
// Arah Administrasi -> LIMS (dipanggil dari halaman LIMS, lewat server LIMS):
//   GET  /api/billing/jobs/:jobNo                      status tagihan Job dari Administrasi (invoice, terbayar, lunas)
//
// Pengaman: token bersama di env INTEGRATION_TOKEN (minimal 24 karakter, nilai SAMA di kedua aplikasi), dikirim sebagai
// "Authorization: Bearer <token>". Tanpa token yang diset, API integrasi mati (503). Rute /api/integration/* dipasang
// SEBELUM middleware login, jadi tidak memakai sesi pengguna — hanya token.

const crypto = require('crypto');

const MIN_TOKEN = 24;
const str = (v, max = 300) => String(v == null ? '' : v).trim().slice(0, max);
const isoDate = v => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : null);

function tokenOk(header, expected) {
  const m = /^Bearer\s+(.+)$/i.exec(String(header || ''));
  if (!m || !expected) return false;
  const a = crypto.createHash('sha256').update(m[1].trim()).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function integrationToken(env = process.env) {
  const t = String(env.INTEGRATION_TOKEN || '').trim();
  return t.length >= MIN_TOKEN ? t : null;
}

// LHU terbit = Review & Approval Work Order final + disetujui (sama dengan lib/integrity.js LHU_ISSUED_SQL)
const LHU_ISSUED = "t.task_key = 'review' AND t.status = 'final' AND t.approval_status = 'approved'";
const ISSUE_DATE = `COALESCE(NULLIF(t.approval_date, ''), to_char(t.updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'))`;

function createIntegrationApi({ pool, env = process.env }) {
  const api = {
    async customers() {
      const { rows } = await pool.query(
        `SELECT customer_id, on_behalf_owner, company, address, phone FROM customers ORDER BY id`);
      return rows;
    },

    async upsertCustomer(b) {
      const f = {
        customer_id: str(b.customer_id, 80), on_behalf_owner: str(b.on_behalf_owner),
        company: str(b.company), address: str(b.address, 1000), phone: str(b.phone, 100)
      };
      if (!f.customer_id || !f.on_behalf_owner) {
        const e = new Error('customer_id (ID Perusahaan) dan on_behalf_owner (Atas Nama) wajib diisi'); e.status = 400; throw e;
      }
      // pasangan yang sudah ada dengan ejaan huruf besar/kecil berbeda dipakai (tidak membuat customer ganda)
      const { rows: same } = await pool.query(
        `SELECT customer_id, on_behalf_owner FROM customers
          WHERE upper(trim(customer_id)) = upper($1) AND upper(trim(on_behalf_owner)) = upper($2) ORDER BY id LIMIT 1`,
        [f.customer_id, f.on_behalf_owner]);
      if (same[0]) { f.customer_id = same[0].customer_id; f.on_behalf_owner = same[0].on_behalf_owner; }
      const { rows } = await pool.query(
        `INSERT INTO customers (customer_id, on_behalf_owner, company, address, phone) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (customer_id, on_behalf_owner) DO UPDATE SET
           company = COALESCE(NULLIF(EXCLUDED.company, ''), customers.company),
           address = COALESCE(NULLIF(EXCLUDED.address, ''), customers.address),
           phone = COALESCE(NULLIF(EXCLUDED.phone, ''), customers.phone)
         RETURNING customer_id, on_behalf_owner, company, address, phone, (xmax = 0) AS created`,
        [f.customer_id, f.on_behalf_owner, f.company, f.address, f.phone]);
      return rows[0];
    },

    async jobs(q, limit = 20) {
      const like = '%' + str(q, 100) + '%';
      const { rows } = await pool.query(
        `SELECT job_number, company, on_behalf_owner, customer_id, project_name, po_number, received_date, status
           FROM test_requests
          WHERE job_number ILIKE $1 OR company ILIKE $1 OR on_behalf_owner ILIKE $1 OR project_name ILIKE $1
          ORDER BY id DESC LIMIT $2`, [like, Math.min(Math.max(Number(limit) || 20, 1), 100)]);
      return rows;
    },

    // Satu Job: header Permintaan Uji + coupon + jenis uji yang dicentang + LHU per coupon (No. Laporan, tanggal terbit, distribusi).
    async job(jobNo) {
      const { rows } = await pool.query(
        `SELECT id, job_number, company, on_behalf_owner, customer_id, project_name, po_number, address, phone, received_date, status
           FROM test_requests WHERE job_number = $1 LIMIT 1`, [str(jobNo, 60)]);
      if (!rows[0]) return null;
      const job = rows[0];
      const { rows: coupons } = await pool.query(
        `SELECT * FROM coupon_tests WHERE test_request_id = $1 ORDER BY row_no, id`, [job.id]);
      const { rows: tests } = await pool.query(
        `SELECT ti.coupon_test_id, ti.test_name, ti.test_name_other, ti.checked, ti.qty, ti.method
           FROM test_items ti JOIN coupon_tests ct ON ct.id = ti.coupon_test_id
          WHERE ct.test_request_id = $1 ORDER BY ti.id`, [job.id]);
      coupons.forEach(c => { c.tests = tests.filter(t => t.coupon_test_id === c.id); });
      const { rows: reports } = await pool.query(
        `SELECT wsm.coupon_row_no, wsm.report_no, wsm.sample_marking, ${ISSUE_DATE} AS issue_date,
                (SELECT status FROM lhu_distributions ld WHERE ld.work_order_id = wo.id
                   AND (ld.coupon_row_no = wsm.coupon_row_no OR ld.coupon_row_no IS NULL) ORDER BY ld.id DESC LIMIT 1) AS distribution_status
           FROM work_orders wo
           JOIN work_order_tasks t ON t.work_order_id = wo.id AND ${LHU_ISSUED}
           JOIN work_order_sample_marks wsm ON wsm.work_order_id = wo.id AND COALESCE(wsm.report_no, '') <> ''
          WHERE wo.test_request_id = $1 ORDER BY wsm.coupon_row_no`, [job.id]);
      const { id, ...header } = job;
      return {
        ...header,
        coupons: coupons.map(({ test_request_id, ...c }) => c),
        lhu: reports.map(r => ({ ...r, distribution_status: r.distribution_status || 'belum_dikirim' }))
      };
    },

    async jobDates(from, to) {
      const { rows } = await pool.query(
        `SELECT to_char((created_at AT TIME ZONE 'Asia/Jakarta')::date, 'YYYY-MM-DD') AS d FROM test_requests
          WHERE (created_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1 AND $2`, [from, to]);
      return rows.map(r => r.d);
    },

    // Job yang LHU-nya terbit pada rentang tanggal: bahan "pekerjaan selesai tapi belum ditagih" di Administrasi.
    async lhuIssued(from, to) {
      const { rows } = await pool.query(
        `SELECT tr.job_number, tr.company, tr.on_behalf_owner, tr.customer_id, tr.project_name, tr.po_number,
                MIN(${ISSUE_DATE}) AS issue_date, COUNT(DISTINCT wsm.coupon_row_no)::int AS lhu_count,
                string_agg(DISTINCT wsm.report_no, ', ') AS report_nos
           FROM work_orders wo
           JOIN test_requests tr ON tr.id = wo.test_request_id
           JOIN work_order_tasks t ON t.work_order_id = wo.id AND ${LHU_ISSUED}
           JOIN work_order_sample_marks wsm ON wsm.work_order_id = wo.id AND COALESCE(wsm.report_no, '') <> ''
          WHERE ${ISSUE_DATE} BETWEEN $1 AND $2
          GROUP BY tr.id ORDER BY MIN(${ISSUE_DATE}) DESC, tr.job_number DESC`, [from, to]);
      return rows;
    }
  };

  // Klien ke Administrasi: status tagihan per Job (dipakai halaman LHU sebelum report asli dikirim).
  api.billing = async (jobNo) => {
    const base = String(env.ADMIN_APP_URL || '').trim().replace(/\/+$/, '');
    const token = integrationToken(env);
    if (!base || !token) return { enabled: false };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const r = await fetch(`${base}/api/integration/v1/jobs/${encodeURIComponent(jobNo)}/billing`, {
        headers: { authorization: `Bearer ${token}`, accept: 'application/json' }, signal: ctrl.signal
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`);
      return { enabled: true, ...body };
    } finally { clearTimeout(timer); }
  };

  return api;
}

function registerIntegrationRoutes(app, { pool, env = process.env, api }) {
  api = api || createIntegrationApi({ pool, env });

  const guard = (req, res, next) => {
    const token = integrationToken(env);
    if (!token) return res.status(503).json({ error: 'Integrasi belum diaktifkan (INTEGRATION_TOKEN belum diset di LIMS)' });
    if (!tokenOk(req.get('authorization'), token)) return res.status(401).json({ error: 'Token integrasi salah' });
    next();
  };
  const wrap = fn => async (req, res) => {
    try { await fn(req, res); } catch (err) {
      if (err.status) return res.status(err.status).json({ error: err.message });
      console.error('[integration]', err);
      res.status(500).json({ error: 'Gagal memproses permintaan integrasi' });
    }
  };
  const P = '/api/integration/v1';

  app.get(`${P}/health`, guard, (req, res) => res.json({ ok: true, app: 'detech-lims', version: 1 }));
  app.get(`${P}/customers`, guard, wrap(async (req, res) => res.json({ customers: await api.customers() })));
  app.post(`${P}/customers`, guard, wrap(async (req, res) => {
    const c = await api.upsertCustomer(req.body || {});
    res.status(c.created ? 201 : 200).json({ customer: c });
  }));
  app.get(`${P}/jobs`, guard, wrap(async (req, res) => res.json({ jobs: await api.jobs(req.query.q, req.query.limit) })));
  app.get(`${P}/jobs/:jobNo`, guard, wrap(async (req, res) => {
    const job = await api.job(req.params.jobNo);
    if (!job) return res.status(404).json({ error: 'Job tidak ditemukan di LIMS' });
    res.json({ job });
  }));
  app.get(`${P}/job-dates`, guard, wrap(async (req, res) => {
    const from = isoDate(req.query.from), to = isoDate(req.query.to);
    if (!from || !to) return res.status(400).json({ error: 'from dan to (YYYY-MM-DD) wajib' });
    res.json({ dates: await api.jobDates(from, to) });
  }));
  app.get(`${P}/lhu-issued`, guard, wrap(async (req, res) => {
    const from = isoDate(req.query.from), to = isoDate(req.query.to);
    if (!from || !to) return res.status(400).json({ error: 'from dan to (YYYY-MM-DD) wajib' });
    res.json({ jobs: await api.lhuIssued(from, to) });
  }));
  return api;
}

// Rute untuk pengguna LIMS (lewat login biasa): status tagihan Job dari Administrasi.
function registerBillingRoutes(app, { api }) {
  app.get('/api/billing/jobs/:jobNo', async (req, res) => {
    try {
      res.json(await api.billing(str(req.params.jobNo, 60)));
    } catch (err) {
      res.json({ enabled: true, error: 'Aplikasi Administrasi tidak bisa dihubungi: ' + err.message });
    }
  });
}

module.exports = { createIntegrationApi, registerIntegrationRoutes, registerBillingRoutes, tokenOk, integrationToken };
