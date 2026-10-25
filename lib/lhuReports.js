// Modul "Hasil & Laporan": daftar LHU (Laporan Hasil Uji), riwayat distribusinya ke customer (bisa kirim berkali-kali,
// tiap kali dengan bukti kirim), attachment pendukung, dan riwayat status (diturunkan dari tanggal tiap tahap Tasks).
//
// Satu LHU per coupon (permintaan klien): LHU terbit otomatis begitu Review & Approval Work Order selesai dengan
// keputusan Disetujui, dan No. LHU = No. Laporan coupon itu (DE.1/MMYY/nnnn). Id LHU di API = "{workOrderId}-{rowNo}".
// Distribusi & attachment lama yang dicatat per Work Order (coupon_row_no NULL) tampil di setiap coupon Work Order itu.
// Rev. = jumlah pencabutan LHU (Cabut LHU) pada Work Order tersebut.

const { releasedFinalCheck } = require('./workOrderTasks');
const { LHU_ISSUED_SQL } = require('./integrity');

// "12-3" -> { woId: 12, rowNo: 3 }; id lama tanpa coupon ("12") -> rowNo null (coupon pertama)
function parseLhuId(id) {
  const m = /^([0-9]+)(?:-([0-9]+))?$/.exec(String(id || ''));
  return m ? { woId: Number(m[1]), rowNo: m[2] ? Number(m[2]) : null } : null;
}

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

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

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

// Tanggal terbit = tanggal approval (atau waktu Review diselesaikan bila tanggal approval kosong), menurut WIB
const ISSUE_DATE_SQL = `COALESCE(NULLIF(t.approval_date, ''), to_char(t.updated_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD'))`;

const LIST_QUERY = `
  SELECT wo.id AS work_order_id, wsm.coupon_row_no, wsm.report_no, wsm.sample_marking, wo.lhu_number AS legacy_lhu_number,
         tr.job_number, tr.company, tr.project_name,
         ${ISSUE_DATE_SQL} AS lhu_issue_date,
         ld.status AS distribution_status, ld.sent_date AS distribution_date, ld.method AS distribution_method,
         (SELECT COUNT(*) FROM lhu_revocations rv WHERE rv.work_order_id = wo.id) AS revision
  FROM work_orders wo
  JOIN test_requests tr ON tr.id = wo.test_request_id
  JOIN work_order_tasks t ON t.work_order_id = wo.id AND ${LHU_ISSUED_SQL}
  JOIN coupon_tests ct ON ct.test_request_id = wo.test_request_id
  JOIN work_order_sample_marks wsm ON wsm.work_order_id = wo.id AND wsm.coupon_row_no = ct.row_no
                                  AND wsm.report_no IS NOT NULL AND wsm.report_no <> ''
  LEFT JOIN LATERAL (
    SELECT status, sent_date, method FROM lhu_distributions
    WHERE work_order_id = wo.id AND (coupon_row_no = wsm.coupon_row_no OR coupon_row_no IS NULL) ORDER BY id DESC LIMIT 1
  ) ld ON true
`;

function projectListRow(row) {
  return {
    id: `${row.work_order_id}-${row.coupon_row_no}`,
    work_order_id: row.work_order_id,
    coupon_row_no: row.coupon_row_no,
    sample_marking: row.sample_marking || '',
    lhu_number: row.report_no,
    legacy_lhu_number: row.legacy_lhu_number || '',
    revision: Number(row.revision) || 0,
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
  if (tasks.review && tasks.review.status === 'final' && tasks.review.approval_status === 'approved') {
    items.push({ key: 'issued', label: 'Issued', date: tasks.review.updated_at, note: 'LHU terbit otomatis setelah Review & Approval disetujui' });
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
  const { pool, getFullWorkOrder, rawBody, printableReport, witnessAttachment } = deps;

  // LHU yang ada: Work Order sudah terbit dan coupon itu punya No. Laporan. Mengembalikan { woId, rowNo } atau null.
  async function findLhu(id) {
    const ref = parseLhuId(id);
    if (!ref) return null;
    const { rows } = await pool.query(
      `SELECT wsm.coupon_row_no FROM work_order_sample_marks wsm
       JOIN work_order_tasks t ON t.work_order_id = wsm.work_order_id AND ${LHU_ISSUED_SQL}
       WHERE wsm.work_order_id = $1 AND wsm.report_no IS NOT NULL AND wsm.report_no <> '' ORDER BY wsm.coupon_row_no`, [ref.woId]);
    if (!rows.length) return null;
    const rowNo = ref.rowNo == null ? rows[0].coupon_row_no : ref.rowNo;
    return rows.some(r => r.coupon_row_no === rowNo) ? { woId: ref.woId, rowNo } : null;
  }

  // Work Order terbit yang coupon-nya belum punya No. Laporan (data lama): nomornya dibuat lewat getFullWorkOrder.
  async function ensureIssuedNumbers() {
    const { rows } = await pool.query(
      `SELECT DISTINCT wo.id FROM work_orders wo
       JOIN work_order_tasks t ON t.work_order_id = wo.id AND ${LHU_ISSUED_SQL}
       JOIN coupon_tests ct ON ct.test_request_id = wo.test_request_id
       LEFT JOIN work_order_sample_marks wsm ON wsm.work_order_id = wo.id AND wsm.coupon_row_no = ct.row_no
       WHERE COALESCE(wsm.report_no, '') = ''`);
    for (const r of rows) await getFullWorkOrder(r.id);
  }

  app.get('/api/lhu-reports', async (req, res) => {
    try {
      await ensureIssuedNumbers();
      const { rows } = await pool.query(`${LIST_QUERY} ORDER BY wsm.report_no DESC`);
      res.json({ items: rows.map(projectListRow) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat daftar LHU' });
    }
  });

  app.get('/api/lhu-reports/:id', async (req, res) => {
    try {
      const lhu = await findLhu(req.params.id);
      const wo = lhu && await getFullWorkOrder(lhu.woId);
      const coupon = wo && (wo.coupon_tests || []).find(c => c.row_no === lhu.rowNo);
      if (!coupon) return res.status(404).json({ error: 'LHU tidak ditemukan' });

      const { rows: taskRows } = await pool.query(`SELECT * FROM work_order_tasks WHERE work_order_id = $1`, [wo.id]);
      const tasks = {};
      taskRows.forEach(t => { tasks[t.task_key] = t; });

      const { rows: testReports } = await pool.query(
        `SELECT status FROM test_reports WHERE test_request_id = $1 AND coupon_row_no = $2`, [wo.test_request_id, coupon.row_no]);
      const finalCheck = releasedFinalCheck({ ...wo, coupon_tests: [coupon] }, { testReports });

      const { rows: distRows } = await pool.query(
        `SELECT status, sent_date, method FROM lhu_distributions
         WHERE work_order_id = $1 AND (coupon_row_no = $2 OR coupon_row_no IS NULL) ORDER BY id DESC LIMIT 1`,
        [wo.id, coupon.row_no]
      );
      const current = distRows[0] || {};

      const timeline = await buildTimeline(pool, wo, tasks);

      const review = tasks.review || {};
      const tr = wo.test_request || {};

      res.json({
        id: `${wo.id}-${coupon.row_no}`,
        work_order_id: wo.id,
        lhu_number: coupon.report_no,
        legacy_lhu_number: wo.lhu_number || '',
        coupon: { row_no: coupon.row_no, sample_marking: coupon.sample_marking || '', label: [...(coupon.coupon_type || []), coupon.coupon_type_other || ''].filter(Boolean).join(', ') },
        revision: Number((await pool.query('SELECT COUNT(*) AS n FROM lhu_revocations WHERE work_order_id = $1', [wo.id])).rows[0].n) || 0,
        template: 'Lembar Hasil Uji coupon ini (gabungan)',
        lhu_issue_date: review.approval_date || (review.updated_at ? new Date(review.updated_at).toISOString().slice(0, 10) : ''),
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
      const lhu = await findLhu(req.params.id);
      if (!lhu) return res.status(404).json({ error: 'LHU tidak ditemukan' });
      const { rows } = await pool.query(
        `SELECT ${DIST_COLUMNS} FROM lhu_distributions WHERE work_order_id = $1 AND (coupon_row_no = $2 OR coupon_row_no IS NULL) ORDER BY id ASC`,
        [lhu.woId, lhu.rowNo]
      );
      res.json({ items: rows.map(r => ({ ...r, has_proof: !!r.proof_filename })) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat riwayat distribusi' });
    }
  });

  app.post('/api/lhu-reports/:id/distributions', async (req, res) => {
    try {
      const lhu = await findLhu(req.params.id);
      if (!lhu) return res.status(404).json({ error: 'LHU tidak ditemukan' });

      const b = req.body || {};
      const status = pick(b.status, EVENT_STATUSES);
      const sentDate = str(b.sent_date, 20);
      const method = pick(b.method, DISTRIBUTION_METHODS);
      const recipient = str(b.recipient, 200);
      if (!sentDate) return res.status(400).json({ error: 'Tanggal kirim harus diisi' });
      if (!recipient) return res.status(400).json({ error: 'Penerima harus diisi' });

      const { rows } = await pool.query(
        `INSERT INTO lhu_distributions (work_order_id, coupon_row_no, sent_date, method, recipient, status)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${DIST_COLUMNS}`,
        [lhu.woId, lhu.rowNo, sentDate, method, recipient, status]
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
      const lhu = await findLhu(req.params.id);
      if (!lhu) return res.status(404).json({ error: 'LHU tidak ditemukan' });
      const { rows } = await pool.query(
        `SELECT ${ATT_COLUMNS} FROM lhu_attachments WHERE work_order_id = $1 AND (coupon_row_no = $2 OR coupon_row_no IS NULL) ORDER BY id ASC`,
        [lhu.woId, lhu.rowNo]
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
        const lhu = await findLhu(req.params.id);
        if (!lhu) return res.status(404).json({ error: 'LHU tidak ditemukan' });

        const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!ATTACHMENT_TYPES.includes(mime)) return res.status(400).json({ error: 'Format file tidak didukung' });
        const data = req.body;
        if (!Buffer.isBuffer(data) || !data.length) return res.status(400).json({ error: 'File kosong' });
        if (data.length > MAX_FILE_BYTES) return res.status(413).json({ error: 'Ukuran file maksimal 10 MB' });
        const filename = safeFilename(req.headers['x-filename']);

        const { rows } = await pool.query(
          `INSERT INTO lhu_attachments (work_order_id, coupon_row_no, filename, mime_type, size_bytes, data)
           VALUES ($1,$2,$3,$4,$5,$6) RETURNING ${ATT_COLUMNS}`,
          [lhu.woId, lhu.rowNo, filename, mime, data.length, data]
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

  // Semua Lembar Hasil Uji satu coupon dalam satu dokumen. finalOnly: LHU resmi hanya memuat Lembar Final.
  async function couponBundle(wo, coupon, finalOnly, opts) {
    const { rows } = await pool.query(
      `SELECT id FROM test_reports WHERE test_request_id = $1 AND coupon_row_no = $2${finalOnly ? " AND status = 'final'" : ''} ORDER BY id ASC`,
      [wo.test_request_id, coupon.row_no]);
    const official = require('./testReportTemplatePrint');
    const reports = [];
    for (const r of rows) {
      const rep = await printableReport(r.id);
      if (rep && rep.template && official.hasTemplate(rep.template)) reports.push(rep);
    }
    return reports.length ? official.renderTemplateBundleHtml(reports, opts) : null;
  }

  app.get('/lhu-reports/:id/print', async (req, res) => {
    try {
      const lhu = await findLhu(req.params.id);
      const wo = lhu && await getFullWorkOrder(lhu.woId);
      const coupon = wo && (wo.coupon_tests || []).find(c => c.row_no === lhu.rowNo);
      if (!coupon) return res.status(404).send('LHU tidak ditemukan');
      const job = (wo.test_request || {}).job_number || '';
      const html = await couponBundle(wo, coupon, true, {
        // lampiran: Daftar Kehadiran & Berita Acara Witness yang mencakup coupon ini
        extra: witnessAttachment ? await witnessAttachment(wo, coupon.row_no) : null,
        title: `LHU ${coupon.report_no} - ${job}`,
        heading: `Laporan Hasil Uji ${esc(coupon.report_no)} &mdash; ${esc(job)} &middot; ${esc(coupon.sample_marking || 'Coupon #' + coupon.row_no)}`
      });
      if (!html) return res.status(404).send('Belum ada Lembar Hasil Uji Final untuk coupon ini');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal membuat dokumen LHU');
    }
  });

  // Preliminary Report (tahap Reporting): diserahkan ke customer untuk ditinjau sebelum Review & Approval internal.
  // Isinya sama dengan LHU coupon itu, tanpa logo DETECH/KAN, tanpa tanda tangan approval, dengan watermark.
  app.get('/work-orders/:id/preliminary/:rowNo', async (req, res) => {
    try {
      const wo = await getFullWorkOrder(req.params.id);
      const coupon = wo && (wo.coupon_tests || []).find(c => c.row_no === Number(req.params.rowNo));
      if (!coupon) return res.status(404).send('Coupon tidak ditemukan');
      const job = (wo.test_request || {}).job_number || '';
      const html = await couponBundle(wo, coupon, false, {
        preliminary: true,
        title: `Preliminary ${coupon.report_no} - ${job}`,
        heading: `Preliminary Report ${esc(coupon.report_no)} &mdash; ${esc(job)} &middot; ${esc(coupon.sample_marking || 'Coupon #' + coupon.row_no)}`
      });
      if (!html) return res.status(404).send('Belum ada Lembar Hasil Uji untuk coupon ini');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.send(html);
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal membuat Preliminary Report');
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

module.exports = { registerLhuReportRoutes, parseLhuId, EVENT_STATUSES, CURRENT_STATUS_LABELS, DISTRIBUTION_METHODS };
