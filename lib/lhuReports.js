// Modul "Hasil & Laporan": daftar LHU (Laporan Hasil Uji) yang sudah diterbitkan lewat tahap
// Report Issued, plus status distribusinya ke customer. Bukan sumber data baru — hanya membaca
// work_orders yang sudah punya lhu_number, digabung dengan test_requests dan tanggal terbit dari
// work_order_tasks (task_key='released'). Rev. selalu 0 di sini: belum ada alur revisi/terbit
// ulang LHU (menyusul terpisah nanti).

const DISTRIBUTION_STATUSES = ['belum_dikirim', 'sent', 'delivered'];
const DISTRIBUTION_LABELS = { belum_dikirim: 'Menunggu Kirim', sent: 'Sent', delivered: 'Delivered' };
const DISTRIBUTION_METHODS = ['', 'Email', 'Kurir', 'Portal Customer', 'Diambil Langsung'];

function str(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function pick(value, allowed) {
  return allowed.includes(value) ? value : allowed[0];
}

const LIST_QUERY = `
  SELECT wo.id, wo.lhu_number, wo.distribution_status, wo.distribution_date,
         wo.distribution_method, wo.distribution_recipient,
         tr.job_number, tr.company, tr.project_name,
         wot.task_date AS lhu_issue_date
  FROM work_orders wo
  JOIN test_requests tr ON tr.id = wo.test_request_id
  LEFT JOIN work_order_tasks wot ON wot.work_order_id = wo.id AND wot.task_key = 'released'
  WHERE wo.lhu_number IS NOT NULL
`;

function project(row) {
  return {
    id: row.id,
    lhu_number: row.lhu_number,
    revision: 0,
    job_number: row.job_number,
    company: row.company,
    project_name: row.project_name,
    lhu_issue_date: row.lhu_issue_date || '',
    distribution_status: row.distribution_status || 'belum_dikirim',
    distribution_date: row.distribution_date || '',
    distribution_method: row.distribution_method || '',
    distribution_recipient: row.distribution_recipient || ''
  };
}

function registerLhuReportRoutes(app, deps) {
  const { pool } = deps;

  app.get('/api/lhu-reports', async (req, res) => {
    try {
      const { rows } = await pool.query(`${LIST_QUERY} ORDER BY wo.lhu_number DESC`);
      res.json({ items: rows.map(project) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat daftar LHU' });
    }
  });

  app.get('/api/lhu-reports/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`${LIST_QUERY} AND wo.id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'LHU tidak ditemukan' });
      res.json(project(rows[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat LHU' });
    }
  });

  app.put('/api/lhu-reports/:id/distribution', async (req, res) => {
    try {
      const b = req.body || {};
      const status = pick(b.distribution_status, DISTRIBUTION_STATUSES);
      const date = str(b.distribution_date, 20);
      const method = pick(b.distribution_method, DISTRIBUTION_METHODS);
      const recipient = str(b.distribution_recipient, 200);
      const { rows } = await pool.query(
        `UPDATE work_orders
         SET distribution_status = $1, distribution_date = $2, distribution_method = $3,
             distribution_recipient = $4, updated_at = NOW()
         WHERE id = $5 AND lhu_number IS NOT NULL
         RETURNING id`,
        [status, date, method, recipient, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'LHU tidak ditemukan' });
      const { rows: full } = await pool.query(`${LIST_QUERY} AND wo.id = $1`, [req.params.id]);
      res.json(project(full[0]));
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan status distribusi' });
    }
  });
}

module.exports = { registerLhuReportRoutes, DISTRIBUTION_STATUSES, DISTRIBUTION_LABELS, DISTRIBUTION_METHODS };
