// API integrasi dengan aplikasi Administrasi & Keuangan (lib/integration.js): token bersama, data customer/Job/LHU,
// upsert customer dari Administrasi, dan status tagihan dari Administrasi untuk halaman LHU.
const assert = require('assert');
const http = require('http');
const express = require('express');
const { registerIntegrationRoutes, registerBillingRoutes, tokenOk, integrationToken } = require('../lib/integration');

const TOKEN = 'token-integrasi-rahasia-0123456789';

assert.strictEqual(integrationToken({ INTEGRATION_TOKEN: 'pendek' }), null, 'token < 24 karakter ditolak');
assert.strictEqual(integrationToken({ INTEGRATION_TOKEN: TOKEN }), TOKEN);
assert.ok(tokenOk('Bearer ' + TOKEN, TOKEN));
assert.ok(!tokenOk('Bearer salah', TOKEN));
assert.ok(!tokenOk('', TOKEN));
assert.ok(!tokenOk('Bearer ' + TOKEN, null));

const customers = [{ customer_id: 'C001', on_behalf_owner: 'PT A', company: 'PT A', address: 'Jl. A', phone: '1' }];
const upserts = [];
const pool = {
  async query(sql, p = []) {
    const q = sql.replace(/\s+/g, ' ').trim();
    if (/^SELECT customer_id, on_behalf_owner, company, address, phone FROM customers/.test(q)) return { rows: customers };
    if (/^SELECT customer_id, on_behalf_owner FROM customers WHERE upper\(trim\(customer_id\)\)/.test(q)) {
      return { rows: customers.filter(c => c.customer_id.toUpperCase() === p[0].toUpperCase() && c.on_behalf_owner.toUpperCase() === p[1].toUpperCase()) };
    }
    if (/^INSERT INTO customers/.test(q)) {
      upserts.push(p);
      const exists = customers.some(c => c.customer_id === p[0] && c.on_behalf_owner === p[1]);
      return { rows: [{ customer_id: p[0], on_behalf_owner: p[1], company: p[2], address: p[3], phone: p[4], created: !exists }] };
    }
    if (/^SELECT job_number, company, on_behalf_owner, customer_id, project_name, po_number, received_date, status FROM test_requests WHERE job_number ILIKE/.test(q)) {
      assert.strictEqual(p[0], '%0187%');
      assert.strictEqual(p[1], 100, 'limit dibatasi 100');
      return { rows: [{ job_number: 'DE.1.26.0187', company: 'PT A' }] };
    }
    if (/^SELECT id, job_number, .* FROM test_requests WHERE job_number = \$1/.test(q)) {
      return { rows: p[0] === 'DE.1.26.0187' ? [{ id: 7, job_number: 'DE.1.26.0187', company: 'PT A', customer_id: 'C001' }] : [] };
    }
    if (/^SELECT \* FROM coupon_tests WHERE test_request_id = \$1/.test(q)) return { rows: [{ id: 70, test_request_id: 7, row_no: 1, material_type_grade: 'A36' }] };
    if (/^SELECT ti\.coupon_test_id/.test(q)) return { rows: [{ coupon_test_id: 70, test_name: 'Tensile Test', checked: true, qty: '2' }] };
    if (/^SELECT wsm\.coupon_row_no, wsm\.report_no/.test(q)) {
      assert.ok(/t\.task_key = 'review' AND t\.status = 'final' AND t\.approval_status = 'approved'/.test(q), 'hanya LHU terbit');
      return { rows: [{ coupon_row_no: 1, report_no: 'DE.1/1026/0187', sample_marking: 'A.1', issue_date: '2026-10-05', distribution_status: null }] };
    }
    if (/^SELECT to_char\(\(created_at/.test(q)) return { rows: [{ d: '2026-10-01' }, { d: '2026-10-02' }] };
    if (/^SELECT tr\.job_number, tr\.company/.test(q)) {
      assert.deepStrictEqual(p, ['2026-10-01', '2026-10-31']);
      return { rows: [{ job_number: 'DE.1.26.0187', issue_date: '2026-10-05', lhu_count: 1, report_nos: 'DE.1/1026/0187' }] };
    }
    throw new Error('query tidak dikenal: ' + q.slice(0, 120));
  }
};

function listen(app) {
  return new Promise(r => { const s = http.createServer(app).listen(0, () => r(s)); });
}

(async () => {
  // ---- server Administrasi tiruan untuk status tagihan ----
  const adminApp = express();
  adminApp.get('/api/integration/v1/jobs/:jobNo/billing', (req, res) => {
    if (req.get('authorization') !== 'Bearer ' + TOKEN) return res.status(401).json({ error: 'Token integrasi salah' });
    res.json({ job_no: req.params.jobNo, invoices: [{ number: '001/DE.1/INV/X/2026', total: 1000, outstanding: 400, pay_status: 'partial' }], all_paid: false, outstanding: 400 });
  });
  const adminSrv = await listen(adminApp);

  const env = { INTEGRATION_TOKEN: TOKEN, ADMIN_APP_URL: `http://127.0.0.1:${adminSrv.address().port}/` };
  const app = express();
  app.use(express.json());
  const api = registerIntegrationRoutes(app, { pool, env });
  registerBillingRoutes(app, { api });
  const srv = await listen(app);
  const base = `http://127.0.0.1:${srv.address().port}`;
  const call = async (path, opts = {}) => {
    const r = await fetch(base + path, { ...opts, headers: { 'content-type': 'application/json', ...(opts.token === false ? {} : { authorization: 'Bearer ' + (opts.token || TOKEN) }) } });
    return { status: r.status, body: await r.json() };
  };

  try {
    assert.strictEqual((await call('/api/integration/v1/health', { token: false })).status, 401, 'tanpa token ditolak');
    assert.strictEqual((await call('/api/integration/v1/health', { token: 'token-salah-token-salah-token-salah' })).status, 401);
    assert.deepStrictEqual((await call('/api/integration/v1/health')).body, { ok: true, app: 'detech-lims', version: 1 });

    assert.deepStrictEqual((await call('/api/integration/v1/customers')).body.customers, customers);

    const created = await call('/api/integration/v1/customers', { method: 'POST', body: JSON.stringify({ customer_id: 'C002', on_behalf_owner: 'PT B', company: 'PT B' }) });
    assert.strictEqual(created.status, 201);
    // beda huruf besar/kecil -> memakai pasangan yang sudah ada, tidak membuat customer ganda
    const updated = await call('/api/integration/v1/customers', { method: 'POST', body: JSON.stringify({ customer_id: 'c001', on_behalf_owner: 'pt a', address: 'Jl. Baru' }) });
    assert.strictEqual(updated.status, 200);
    assert.deepStrictEqual([updated.body.customer.customer_id, updated.body.customer.on_behalf_owner], ['C001', 'PT A']);
    assert.strictEqual((await call('/api/integration/v1/customers', { method: 'POST', body: JSON.stringify({ company: 'Tanpa ID' }) })).status, 400);
    assert.strictEqual(upserts.length, 2);

    assert.strictEqual((await call('/api/integration/v1/jobs?q=0187&limit=999')).body.jobs[0].job_number, 'DE.1.26.0187');

    const job = (await call('/api/integration/v1/jobs/DE.1.26.0187')).body.job;
    assert.strictEqual(job.id, undefined, 'id internal LIMS tidak dibocorkan');
    assert.strictEqual(job.coupons[0].tests[0].test_name, 'Tensile Test');
    assert.strictEqual(job.coupons[0].test_request_id, undefined);
    assert.deepStrictEqual(job.lhu, [{ coupon_row_no: 1, report_no: 'DE.1/1026/0187', sample_marking: 'A.1', issue_date: '2026-10-05', distribution_status: 'belum_dikirim' }]);
    assert.strictEqual((await call('/api/integration/v1/jobs/TIDAK-ADA')).status, 404);

    assert.deepStrictEqual((await call('/api/integration/v1/job-dates?from=2026-10-01&to=2026-10-31')).body.dates, ['2026-10-01', '2026-10-02']);
    assert.strictEqual((await call('/api/integration/v1/job-dates?from=x&to=2026-10-31')).status, 400);
    assert.strictEqual((await call('/api/integration/v1/lhu-issued?from=2026-10-01&to=2026-10-31')).body.jobs[0].report_nos, 'DE.1/1026/0187');

    // status tagihan dari Administrasi (rute pengguna LIMS)
    const bill = (await call('/api/billing/jobs/DE.1.26.0187', { token: false })).body;
    assert.strictEqual(bill.enabled, true);
    assert.strictEqual(bill.all_paid, false);
    assert.strictEqual(bill.invoices[0].pay_status, 'partial');

    // integrasi mati bila token tidak diset
    const off = express();
    const offApi = registerIntegrationRoutes(off, { pool, env: {} });
    registerBillingRoutes(off, { api: offApi });
    const offSrv = await listen(off);
    const r = await fetch(`http://127.0.0.1:${offSrv.address().port}/api/integration/v1/health`, { headers: { authorization: 'Bearer ' + TOKEN } });
    assert.strictEqual(r.status, 503);
    const b2 = await (await fetch(`http://127.0.0.1:${offSrv.address().port}/api/billing/jobs/X`)).json();
    assert.deepStrictEqual(b2, { enabled: false });
    offSrv.close();

    // Administrasi mati -> pesan jelas, bukan error 500
    adminSrv.close();
    const down = (await call('/api/billing/jobs/DE.1.26.0187', { token: false })).body;
    assert.ok(/tidak bisa dihubungi/.test(down.error), down.error);

    console.log('integration: semua tes lulus');
  } finally {
    srv.close();
    adminSrv.close();
  }
})().catch(err => { console.error(err); process.exit(1); });
