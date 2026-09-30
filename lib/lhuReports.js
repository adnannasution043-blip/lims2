// Modul "Hasil & Laporan": daftar LHU (Laporan Hasil Uji) yang sudah diterbitkan lewat tahap
// Report Issued, riwayat distribusinya ke customer (bisa kirim berkali-kali, tiap kali dengan
// bukti kirim), attachment pendukung, dan riwayat status (diturunkan dari tanggal tiap tahap
// Tasks — bukan sumber data baru). Rev. selalu 0: belum ada alur revisi/terbit ulang LHU.

const { releasedFinalCheck } = require('./workOrderTasks');

const EVENT_STATUSES = ['sent', 'delivered'];
const CURRENT_STATUS_LABELS = { belum_dikirim: 'Menunggu Kirim', sent: 'Sent', delivered: 'Delivered' };
const DISTRIBUTION_METHODS = ['', 'Email', 'Kurir', 'Portal Customer', 'Diambil Langsung'];
const PROOF_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const ATTACHMENT_TYPES = [
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/zip', 'application/x-zip-compressed',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/msword'
];
const MAX_FILE_BYTES = 10 * 1024 * 1024;

function str(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function pick(value, allowed) {
  return allowed.includes(value) ? value : allowed[0];
}

function safeFilename(headerValue) {
  let filename = '';
  try { filename = decodeURIComponent(String(headerValue || '')); } catch (e) { filename = ''; }
  return filename.replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(0, 200) || 'file';
}

const LIST_QUERY = `
  SELECT wo.id, wo.lhu_number, tr.job_number, tr.company, tr.project_name,
         wot.task_date AS lhu_issue_date,
         ld.status AS distribution_status, ld.sent_date AS distribution_date, ld.method AS distribution_method
  FROM work_orders wo
  JOIN test_requests tr ON tr.id = wo.test_request_id
  LEFT JOIN work_order_tasks wot ON wot.work_order_id = wo.id AND wot.task_key = 'released'
  LEFT JOIN LATERAL (
    SELECT status, sent_date, method FROM lhu_distributions
    WHERE work_order_id = wo.id ORDER BY id DESC LIMIT 1
  ) ld ON true
  WHERE wo.lhu_number IS NOT NULL
`;

function projectListRow(row) {
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
    distribution_method: row.distribution_method || ''
  };
}

// Riwayat Status: bacaan-ulang tanggal tiap tahap Tasks yang sudah ada (tidak ada data baru).
// Preparation tidak punya baris work_order_tasks sendiri (lihat lib/workOrderTasks.js), jadi
// waktunya diambil dari sheet Pengecekan Spesimen (specimen_inspections) yang paling akhir Final.
async function buildTimeline(pool, wo, tasks) {
  const items = [];
  if (tasks.released) {
    items.push({ key: 'issued', label: 'Issued', date: tasks.released.updated_at, note: `LHU diterbitkan${wo.released_pic ? ' oleh ' + wo.released_pic : ''}` });
  }
  if (tasks.review) {
    if (tasks.review.approval_status === 'approved') {
      items.push({ key: 'approved', label: 'Approved', date: tasks.review.approval_date || tasks.review.updated_at, note: `Disetujui oleh ${tasks.review.approver_name || '-'}` });
    } else if (tasks.review.approval_status === 'rejected') {
      items.push({ key: 'rejected', label: 'Rejected', date: tasks.review.approval_date || tasks.review.updated_at, note: `Ditolak oleh ${tasks.review.approver_name || '-'} — perlu revisi` });
    }
    items.push({ key: 'review', label: 'Review', date: tasks.review.updated_at, note: 'Review selesai' });
  }
  if (tasks.reporting) items.push({ key: 'reporting', label: 'Reporting', date: tasks.reporting.updated_at, note: 'Input hasil pengujian selesai' });
  if (tasks.testing) items.push({ key: 'testing', label: 'Testing', date: tasks.testing.updated_at, note: 'Pengujian selesai' });
  const { rows: prepRows } = await pool.query(
    `SELECT MAX(updated_at) AS t FROM specimen_inspections WHERE test_request_id = $1 AND status = 'final'`,
    [wo.test_request_id]
  );
  if (prepRows[0] && prepRows[0].t) items.push({ key: 'preparation', label: 'Preparation', date: prepRows[0].t, note: 'Marking, cutting, machining specimen' });
  if (tasks.receiving) {
    const received = Object.values((tasks.receiving.data || {}).items || {}).filter(i => i.received === 'Y').length;
    const total = (wo.coupon_tests || []).length;
    items.push({ key: 'receiving', label: 'Receiving', date: tasks.receiving.updated_at, note: `Sampel diterima (${received}/${total} coupon)` });
  }
  return items
    .filter(i => i.date)
    .sort((a, b) => new Date(b.date) - new Date(a.date));
}

function registerLhuReportRoutes(app, deps) {
  const { pool, getFullWorkOrder, rawBody } = deps;

  app.get('/api/lhu-reports', async (req, res) => {
    try {
      const { rows } = await pool.query(`${LIST_QUERY} ORDER BY wo.lhu_number DESC`);
      res.json({ items: rows.map(projectListRow) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat daftar LHU' });
    }
  });

  app.get('/api/lhu-reports/:id', async (req, res) => {
    try {
      const wo = await getFullWorkOrder(req.params.id);
      if (!wo || !wo.lhu_number) return res.status(404).json({ error: 'LHU tidak ditemukan' });

      const { rows: taskRows } = await pool.query(`SELECT * FROM work_order_tasks WHERE work_order_id = $1`, [wo.id]);
      const tasks = {};
      taskRows.forEach(t => { tasks[t.task_key] = t; });

      const { rows: testReports } = await pool.query(`SELECT status FROM test_reports WHERE test_request_id = $1`, [wo.test_request_id]);
      const finalCheck = releasedFinalCheck(wo, { testReports });

      const { rows: distRows } = await pool.query(
        `SELECT status, sent_date, method FROM lhu_distributions WHERE work_order_id = $1 ORDER BY id DESC LIMIT 1`,
        [wo.id]
      );
      const current = distRows[0] || {};

      const timeline = await buildTimeline(pool, wo, tasks);

      const review = tasks.review || {};
      const tr = wo.test_request || {};

      res.json({
        id: wo.id,
        lhu_number: wo.lhu_number,
        revision: 0,
        template: 'Standard Material Test Report',
        lhu_issue_date: tasks.released ? tasks.released.task_date : '',
        work_order: {
          job_number: tr.job_number || '',
          company: tr.company || '',
          project_name: tr.project_name || '',
          received_date: tr.received_date || '',
          lhu_target_date: tr.lhu_target_date || ''
        },
        approval: {
          approved_by: review.approver_name || '',
          approved_date: review.approval_date || '',
          approval_notes: review.approval_notes || ''
        },
        final_check: finalCheck,
        distribution_status: current.status || 'belum_dikirim',
        distribution_date: current.sent_date || '',
        distribution_method: current.method || '',
        timeline
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat LHU' });
    }
  });

  // ----- Riwayat distribusi (bisa kirim berkali-kali) -----

  const DIST_COLUMNS = 'id, work_order_id, sent_date, method, recipient, status, proof_filename, proof_mime_type, created_at';

  app.get('/api/lhu-reports/:id/distributions', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${DIST_COLUMNS} FROM lhu_distributions WHERE work_order_id = $1 ORDER BY id ASC`,
        [req.params.id]
      );
      res.json({ items: rows.map(r => ({ ...r, has_proof: !!r.proof_filename })) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat riwayat distribusi' });
    }
  });

  app.post('/api/lhu-reports/:id/distributions', async (req, res) => {
    try {
      const { rows: woRows } = await pool.query(`SELECT id FROM work_orders WHERE id = $1 AND lhu_number IS NOT NULL`, [req.params.id]);
      if (!woRows.length) return res.status(404).json({ error: 'LHU tidak ditemukan' });

      const b = req.body || {};
      const status = pick(b.status, EVENT_STATUSES);
      const sentDate = str(b.sent_date, 20);
      const method = pick(b.method, DISTRIBUTION_METHODS);
      const recipient = str(b.recipient, 200);
      if (!sentDate) return res.status(400).json({ error: 'Tanggal kirim harus diisi' });
      if (!recipient) return res.status(400).json({ error: 'Penerima harus diisi' });

      const { rows } = await pool.query(
        `INSERT INTO lhu_distributions (work_order_id, sent_date, method, recipient, status)
         VALUES ($1,$2,$3,$4,$5) RETURNING ${DIST_COLUMNS}`,
        [req.params.id, sentDate, method, recipient, status]
      );
      res.status(201).json({ ...rows[0], has_proof: false });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan distribusi' });
    }
  });

  app.delete('/api/lhu-distributions/:distId', async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM lhu_distributions WHERE id = $1`, [req.params.distId]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus distribusi' });
    }
  });

  if (rawBody) {
    app.post('/api/lhu-distributions/:distId/proof', rawBody, async (req, res) => {
      try {
        const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!PROOF_TYPES.includes(mime)) return res.status(400).json({ error: 'Bukti kirim harus gambar (JPG/PNG/WEBP) atau PDF' });
        const data = req.body;
        if (!Buffer.isBuffer(data) || !data.length) return res.status(400).json({ error: 'File kosong' });
        if (data.length > MAX_FILE_BYTES) return res.status(413).json({ error: 'Ukuran file maksimal 10 MB' });
        const filename = safeFilename(req.headers['x-filename']);

        const { rows } = await pool.query(
          `UPDATE lhu_distributions SET proof_filename = $1, proof_mime_type = $2, proof_data = $3
           WHERE id = $4 RETURNING ${DIST_COLUMNS}`,
          [filename, mime, data, req.params.distId]
        );
        if (!rows.length) return res.status(404).json({ error: 'Distribusi tidak ditemukan' });
        res.status(201).json({ ...rows[0], has_proof: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengunggah bukti kirim' });
      }
    });
  }

  app.get('/api/lhu-distributions/:distId/proof', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT proof_filename, proof_mime_type, proof_data FROM lhu_distributions WHERE id = $1`, [req.params.distId]);
      if (!rows.length || !rows[0].proof_data) return res.status(404).send('Bukti kirim tidak ditemukan');
      const f = rows[0];
      res.setHeader('Content-Type', f.proof_mime_type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(f.proof_filename)}`);
      res.send(f.proof_data);
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal memuat bukti kirim');
    }
  });

  // ----- Attachment pendukung -----

  const ATT_COLUMNS = 'id, work_order_id, filename, mime_type, size_bytes, created_at';

  app.get('/api/lhu-reports/:id/attachments', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT ${ATT_COLUMNS} FROM lhu_attachments WHERE work_order_id = $1 ORDER BY id ASC`,
        [req.params.id]
      );
      res.json({ items: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat attachment' });
    }
  });

  if (rawBody) {
    app.post('/api/lhu-reports/:id/attachments', rawBody, async (req, res) => {
      try {
        const { rows: woRows } = await pool.query(`SELECT id FROM work_orders WHERE id = $1 AND lhu_number IS NOT NULL`, [req.params.id]);
        if (!woRows.length) return res.status(404).json({ error: 'LHU tidak ditemukan' });

        const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!ATTACHMENT_TYPES.includes(mime)) return res.status(400).json({ error: 'Format file tidak didukung' });
        const data = req.body;
        if (!Buffer.isBuffer(data) || !data.length) return res.status(400).json({ error: 'File kosong' });
        if (data.length > MAX_FILE_BYTES) return res.status(413).json({ error: 'Ukuran file maksimal 10 MB' });
        const filename = safeFilename(req.headers['x-filename']);

        const { rows } = await pool.query(
          `INSERT INTO lhu_attachments (work_order_id, filename, mime_type, size_bytes, data)
           VALUES ($1,$2,$3,$4,$5) RETURNING ${ATT_COLUMNS}`,
          [req.params.id, filename, mime, data.length, data]
        );
        res.status(201).json(rows[0]);
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengunggah attachment' });
      }
    });
  }

  app.get('/api/lhu-attachments/:attId', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT filename, mime_type, data FROM lhu_attachments WHERE id = $1`, [req.params.attId]);
      if (!rows.length) return res.status(404).send('File tidak ditemukan');
      const f = rows[0];
      res.setHeader('Content-Type', f.mime_type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
      res.send(f.data);
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal memuat file');
    }
  });

  app.delete('/api/lhu-attachments/:attId', async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM lhu_attachments WHERE id = $1`, [req.params.attId]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus attachment' });
    }
  });
}

module.exports = { registerLhuReportRoutes, EVENT_STATUSES, CURRENT_STATUS_LABELS, DISTRIBUTION_METHODS };
