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

// QR verifikasi keaslian LHU: tiap LHU (Work Order + coupon) punya token acak 128-bit (bukan nomor urut, tidak bisa
// ditebak). QR di LHU berisi alamat /verify/<token>; halaman itu terbuka tanpa login dan menampilkan data resmi LHU,
// statusnya (Valid / sedang direvisi), dan tombol membuka LHU asli untuk dibandingkan.
const crypto = require('crypto');
const QRCode = require('qrcode');

function baseUrlOf(req) {
  if (process.env.PUBLIC_BASE_URL) return process.env.PUBLIC_BASE_URL.replace(/\/+$/, '');
  const proto = String(req.get('x-forwarded-proto') || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.get('x-forwarded-host') || req.get('host') || '').split(',')[0].trim();
  return `${proto}://${host}`;
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

  async function verifyToken(woId, rowNo) {
    const { rows } = await pool.query('SELECT token FROM lhu_verify_tokens WHERE work_order_id = $1 AND coupon_row_no = $2', [woId, rowNo]);
    if (rows.length) return rows[0].token;
    const token = crypto.randomBytes(16).toString('base64url');
    const { rows: ins } = await pool.query(
      `INSERT INTO lhu_verify_tokens (token, work_order_id, coupon_row_no) VALUES ($1, $2, $3)
       ON CONFLICT (work_order_id, coupon_row_no) DO UPDATE SET work_order_id = EXCLUDED.work_order_id RETURNING token`,
      [token, woId, rowNo]);
    return ins[0].token;
  }

  async function qrFor(req, woId, rowNo) {
    const url = `${baseUrlOf(req)}/verify/${await verifyToken(woId, rowNo)}`;
    const svg = await QRCode.toString(url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1 });
    return { url, src: 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64') };
  }

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
        qr: (await qrFor(req, wo.id, coupon.row_no)).src,
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

  // ----- Verifikasi keaslian LHU (publik, tanpa login) -----
  async function lhuByToken(token) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(String(token || ''))) return null;
    const { rows } = await pool.query('SELECT work_order_id, coupon_row_no FROM lhu_verify_tokens WHERE token = $1', [token]);
    if (!rows.length) return null;
    const wo = await getFullWorkOrder(rows[0].work_order_id);
    const coupon = wo && (wo.coupon_tests || []).find(c => c.row_no === rows[0].coupon_row_no);
    if (!coupon) return null;
    const issued = !!(await findLhu(`${wo.id}-${coupon.row_no}`));
    const { rows: rv } = await pool.query('SELECT COUNT(*) AS n FROM lhu_revocations WHERE work_order_id = $1', [wo.id]);
    const { rows: tk } = await pool.query(`SELECT approver_name, approver_title, approval_date, updated_at FROM work_order_tasks WHERE work_order_id = $1 AND task_key = 'review'`, [wo.id]);
    return { wo, coupon, issued, revision: Number(rv[0].n) || 0, review: tk[0] || {} };
  }

  app.get('/verify/:token', async (req, res) => {
    try {
      const v = await lhuByToken(req.params.token);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      if (!v) return res.status(404).send(verifyPageHtml(null));
      res.send(verifyPageHtml(v, `/verify/${encodeURIComponent(req.params.token)}/lhu`));
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal memeriksa keaslian dokumen');
    }
  });

  // LHU asli (Lembar Final + lampiran witness) untuk dibandingkan dengan dokumen yang dipegang; hanya bila masih Valid
  app.get('/verify/:token/lhu', async (req, res) => {
    try {
      const v = await lhuByToken(req.params.token);
      if (!v || !v.issued) return res.status(404).send('Dokumen tidak tersedia');
      const job = (v.wo.test_request || {}).job_number || '';
      const html = await couponBundle(v.wo, v.coupon, true, {
        qr: (await qrFor(req, v.wo.id, v.coupon.row_no)).src,
        extra: witnessAttachment ? await witnessAttachment(v.wo, v.coupon.row_no) : null,
        title: `LHU ${v.coupon.report_no} - ${job}`,
        heading: `Laporan Hasil Uji ${esc(v.coupon.report_no)} &mdash; ${esc(job)} (salinan terverifikasi)`
      });
      if (!html) return res.status(404).send('Dokumen tidak tersedia');
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Robots-Tag', 'noindex');
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

// Halaman hasil pindai QR: ringkas, ramah HP, berlogo DETECH. v = null -> dokumen tidak terdaftar.
function verifyPageHtml(v, lhuUrl) {
  const { LOGO_BASE64 } = require('./printCommon');
  const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const fmtDate = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d || '')); return m ? `${Number(m[3])} ${BULAN[Number(m[2]) - 1]} ${m[1]}` : ''; };
  const row = (k, val) => `<tr><th>${esc(k)}</th><td>${val ? esc(val) : '-'}</td></tr>`;
  let body;
  if (!v) {
    body = `<div class="badge bad">Tidak ditemukan</div><p>Dokumen ini <b>tidak terdaftar</b> di sistem PT Detech Profesional Indonesia. Bila Anda menerima laporan dengan QR ini, mohon konfirmasi ke DETECH.</p>`;
  } else {
    const tr = v.wo.test_request || {};
    const c = v.coupon;
    const tests = [...(c.test_items || []).filter(t => t.checked), ...(c.other_tests || []).filter(t => String(t.test_name || '').trim())].map(t => t.test_name).join(', ');
    const status = v.issued
      ? `<div class="badge ok">&#10004; Valid &mdash; LHU resmi diterbitkan DETECH</div>`
      : `<div class="badge warn">LHU sedang dicabut untuk revisi</div><p>Versi yang Anda pegang mungkin sudah tidak berlaku. Mohon tunggu LHU revisi atau hubungi DETECH.</p>`;
    body = `${status}
      <table>
        ${row('No. LHU', c.report_no + (v.revision ? ` (Rev. ${v.revision})` : ''))}
        ${row('Job No.', tr.job_number)}
        ${row('Customer', tr.company)}
        ${row('Atas Nama Perusahaan', tr.on_behalf_owner)}
        ${row('Project Name', tr.project_name)}
        ${row('Sample Marking', c.sample_marking)}
        ${row('Jenis Pengujian', tests)}
        ${row('Tanggal Terbit', v.issued ? fmtDate(v.review.approval_date || (v.review.updated_at ? new Date(v.review.updated_at).toISOString().slice(0, 10) : '')) : '')}
        ${row('Disetujui oleh', v.issued ? [v.review.approver_name, v.review.approver_title].filter(Boolean).join(' — ') : '')}
      </table>
      ${v.issued && lhuUrl ? `<a class="btn" href="${lhuUrl}" target="_blank" rel="noopener">Lihat / Unduh LHU asli</a><p class="muted">Bandingkan isi LHU asli dengan dokumen yang Anda terima. Gunakan tombol <i>Print / Simpan sebagai PDF</i> untuk mengunduh.</p>` : ''}`;
  }
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex">
<title>Verifikasi LHU - DETECH</title><style>
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background: #f2f4f8; color: #1d2433; }
  .wrap { max-width: 560px; margin: 0 auto; padding: 20px 16px 40px; }
  .card { background: #fff; border-radius: 12px; box-shadow: 0 2px 10px rgba(0,0,0,.08); padding: 20px; }
  header { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; }
  header img { height: 40px; }
  header span { font-size: 13px; color: #5b6475; }
  h1 { font-size: 18px; margin: 0 0 14px; color: #0E3270; }
  .badge { display: inline-block; padding: 8px 12px; border-radius: 8px; font-weight: 700; margin-bottom: 12px; }
  .ok { background: #e6f6ec; color: #1e7a3d; } .warn { background: #fff4e0; color: #8a5300; } .bad { background: #fdecea; color: #b3261e; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; margin: 6px 0 16px; table-layout: fixed; }
  th { text-align: left; color: #5b6475; font-weight: 600; width: 42%; padding: 7px 8px 7px 0; vertical-align: top; border-bottom: 1px solid #eef0f4; }
  td { padding: 7px 0; border-bottom: 1px solid #eef0f4; font-weight: 600; overflow-wrap: anywhere; }
  .card, footer { overflow-wrap: anywhere; }
  .btn { display: inline-block; background: #AA0000; color: #fff; text-decoration: none; padding: 10px 16px; border-radius: 8px; font-weight: 700; }
  .muted { color: #5b6475; font-size: 12.5px; }
  footer { text-align: center; color: #8a92a3; font-size: 11.5px; margin-top: 16px; line-height: 1.5; }
</style></head><body><div class="wrap">
  <header><img src="data:image/png;base64,${LOGO_BASE64}" alt="DETECH"><span>Verifikasi keaslian<br>Laporan Hasil Uji</span></header>
  <div class="card"><h1>Verifikasi Laporan Hasil Uji</h1>${body}</div>
  <footer>PT DETECH PROFESIONAL INDONESIA<br>Bizpoint Modern Multi Business, Point 1, Jl. Guangzhou No.10, Sukamulya, Cikupa, Kab. Tangerang &middot; marketing@detech.co.id</footer>
</div></body></html>`;
}

module.exports = { registerLhuReportRoutes, parseLhuId, verifyPageHtml, EVENT_STATUSES, CURRENT_STATUS_LABELS, DISTRIBUTION_METHODS };
