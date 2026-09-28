// Master Data > Equipment/Peralatan — dipakai untuk mencatat alat uji beserta status dan masa
// kalibrasinya (diminta klien). Terhubung ke tahap Testing: kolom "Alat" di sana menyarankan nama
// dari daftar ini, tapi TIDAK otomatis menambah alat baru ke master (beda dari master data
// sederhana lain) karena satu alat butuh info kalibrasi lengkap, bukan cuma nama.

const STATUSES = ['active', 'maintenance', 'calibration_due', 'out_of_service'];
const STATUS_LABELS = { active: 'Active', maintenance: 'Under Maintenance', calibration_due: 'Calibration Due', out_of_service: 'Out of Service' };

const CERT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_CERT_BYTES = 10 * 1024 * 1024;

const LIST_COLUMNS = `id, equipment_id, name, category, manufacturer, model, serial_number, status,
  calibration_number, last_calibration_date, next_calibration_due,
  certificate_filename, certificate_mime_type, created_at, updated_at`;

function str(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function pick(value, allowed, fallback) {
  return allowed.includes(value) ? value : fallback;
}

function registerEquipmentRoutes(app, deps) {
  const { pool, rawBody } = deps;

  app.get('/api/equipment', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${LIST_COLUMNS} FROM equipment ORDER BY name ASC`);
      res.json({ items: rows.map(r => ({ ...r, has_certificate: !!r.certificate_filename })) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat data Equipment' });
    }
  });

  app.get('/api/equipment/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${LIST_COLUMNS} FROM equipment WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json({ ...rows[0], has_certificate: !!rows[0].certificate_filename });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat data Equipment' });
    }
  });

  app.post('/api/equipment', async (req, res) => {
    const b = req.body || {};
    const equipmentId = str(b.equipment_id, 80);
    const name = str(b.name, 200);
    if (!equipmentId || !name) return res.status(400).json({ error: 'Equipment ID dan Equipment Name wajib diisi' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO equipment (equipment_id, name, category, manufacturer, model, serial_number, status,
           calibration_number, last_calibration_date, next_calibration_due)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING ${LIST_COLUMNS}`,
        [
          equipmentId, name, str(b.category, 120), str(b.manufacturer, 120), str(b.model, 120), str(b.serial_number, 120),
          pick(b.status, STATUSES, 'active'),
          str(b.calibration_number, 120), str(b.last_calibration_date, 20), str(b.next_calibration_due, 20)
        ]
      );
      res.status(201).json({ ...rows[0], has_certificate: false });
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Equipment ID sudah dipakai' });
      console.error(err);
      res.status(500).json({ error: 'Gagal menambah Equipment' });
    }
  });

  app.put('/api/equipment/:id', async (req, res) => {
    const b = req.body || {};
    const equipmentId = str(b.equipment_id, 80);
    const name = str(b.name, 200);
    if (!equipmentId || !name) return res.status(400).json({ error: 'Equipment ID dan Equipment Name wajib diisi' });
    try {
      const { rows } = await pool.query(
        `UPDATE equipment SET
           equipment_id=$1, name=$2, category=$3, manufacturer=$4, model=$5, serial_number=$6, status=$7,
           calibration_number=$8, last_calibration_date=$9, next_calibration_due=$10, updated_at=NOW()
         WHERE id=$11 RETURNING ${LIST_COLUMNS}`,
        [
          equipmentId, name, str(b.category, 120), str(b.manufacturer, 120), str(b.model, 120), str(b.serial_number, 120),
          pick(b.status, STATUSES, 'active'),
          str(b.calibration_number, 120), str(b.last_calibration_date, 20), str(b.next_calibration_due, 20),
          req.params.id
        ]
      );
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json({ ...rows[0], has_certificate: !!rows[0].certificate_filename });
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Equipment ID sudah dipakai' });
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan Equipment' });
    }
  });

  app.delete('/api/equipment/:id', async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM equipment WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus Equipment' });
    }
  });

  if (rawBody) {
    app.post('/api/equipment/:id/certificate', rawBody, async (req, res) => {
      try {
        const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
        if (!CERT_TYPES.includes(mime)) return res.status(400).json({ error: 'Format sertifikat harus gambar (JPG, PNG, WEBP) atau PDF' });
        const data = req.body;
        if (!Buffer.isBuffer(data) || !data.length) return res.status(400).json({ error: 'File kosong' });
        if (data.length > MAX_CERT_BYTES) return res.status(413).json({ error: 'Ukuran file maksimal 10 MB' });

        let filename = '';
        try { filename = decodeURIComponent(String(req.headers['x-filename'] || '')); } catch (e) { filename = ''; }
        filename = filename.replace(/[\\/\u0000-\u001f]/g, '_').trim().slice(0, 200) || 'sertifikat';

        const { rows } = await pool.query(
          `UPDATE equipment SET certificate_filename=$1, certificate_mime_type=$2, certificate_data=$3, updated_at=NOW()
           WHERE id=$4 RETURNING ${LIST_COLUMNS}`,
          [filename, mime, data, req.params.id]
        );
        if (!rows.length) return res.status(404).json({ error: 'Not found' });
        res.status(201).json({ ...rows[0], has_certificate: true });
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal mengunggah sertifikat' });
      }
    });
  }

  app.get('/api/equipment/:id/certificate', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT certificate_filename, certificate_mime_type, certificate_data FROM equipment WHERE id = $1`, [req.params.id]);
      const r = rows[0];
      if (!r || !r.certificate_data) return res.status(404).send('Sertifikat tidak ditemukan');
      res.setHeader('Content-Type', r.certificate_mime_type);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('Content-Disposition', `inline; filename*=UTF-8''${encodeURIComponent(r.certificate_filename)}`);
      res.send(r.certificate_data);
    } catch (err) {
      console.error(err);
      res.status(500).send('Gagal memuat sertifikat');
    }
  });

  app.delete('/api/equipment/:id/certificate', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `UPDATE equipment SET certificate_filename=NULL, certificate_mime_type=NULL, certificate_data=NULL, updated_at=NOW()
         WHERE id=$1 RETURNING ${LIST_COLUMNS}`,
        [req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json({ ...rows[0], has_certificate: false });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus sertifikat' });
    }
  });
}

module.exports = { registerEquipmentRoutes, STATUSES, STATUS_LABELS };
