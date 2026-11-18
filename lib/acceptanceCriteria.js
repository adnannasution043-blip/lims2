// Master Data > Acceptance Criteria — kalimat kriteria penerimaan per standar (mis. AWS B4.0 Butir 9.2, AWS D1.1,
// ASME IX) untuk Fillet Weld Break / Peel. Satu set = nama standar + daftar kriteria (kalimat + Remarks bawaan).
// Saat dipilih di Lembar Hasil Uji, set disalin ke isian Lembar (snapshot), jadi laporan lama tidak berubah bila set
// di master diubah atau dihapus. Pola kerja sama dengan Pola Hardness.

const MAX_CRITERIA = 8;

function str(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
  return [];
}

// daftar kriteria yang valid (kalimat wajib, Remarks bawaan opsional)
function cleanCriteria(list) {
  return asArray(list).filter(c => c && typeof c === 'object')
    .map(c => ({ text: str(c.text, 800), remark: str(c.remark, 150) }))
    .filter(c => c.text).slice(0, MAX_CRITERIA);
}

// Snapshot pada isian Lembar (fields.fwb_criteria); null bila kosong / tidak valid (= kriteria bawaan form)
function sanitizeCriteriaSnapshot(input) {
  if (!input || typeof input !== 'object') return null;
  const criteria = cleanCriteria(input.criteria);
  if (!criteria.length) return null;
  return { id: Number(input.id) || null, name: str(input.name, 120), criteria };
}

const LIST_COLUMNS = 'id, name, customer, criteria, notes, created_at, updated_at';
const rowOut = r => ({ ...r, criteria: asArray(r.criteria) });

function registerAcceptanceCriteriaRoutes(app, deps) {
  const { pool } = deps;

  app.get('/api/acceptance-criteria', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${LIST_COLUMNS} FROM acceptance_criteria_sets ORDER BY name`);
      res.json({ items: rows.map(rowOut) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat Acceptance Criteria' });
    }
  });

  const parse = b => {
    const name = str(b.name, 120);
    if (!name) return { error: 'Nama standar wajib diisi' };
    const criteria = cleanCriteria(b.criteria);
    if (!criteria.length) return { error: 'Minimal 1 kalimat Acceptance Criteria' };
    return { name, customer: str(b.customer, 200), notes: str(b.notes, 500), criteria };
  };

  app.post('/api/acceptance-criteria', async (req, res) => {
    const p = parse(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    try {
      const { rows } = await pool.query(
        `INSERT INTO acceptance_criteria_sets (name, customer, criteria, notes) VALUES ($1,$2,$3,$4) RETURNING ${LIST_COLUMNS}`,
        [p.name, p.customer, JSON.stringify(p.criteria), p.notes]);
      res.status(201).json(rowOut(rows[0]));
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Nama standar sudah dipakai' });
      console.error(err);
      res.status(500).json({ error: 'Gagal menambah Acceptance Criteria' });
    }
  });

  app.put('/api/acceptance-criteria/:id', async (req, res) => {
    const p = parse(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    try {
      const { rows } = await pool.query(
        `UPDATE acceptance_criteria_sets SET name=$1, customer=$2, criteria=$3, notes=$4, updated_at=NOW() WHERE id=$5 RETURNING ${LIST_COLUMNS}`,
        [p.name, p.customer, JSON.stringify(p.criteria), p.notes, req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(rowOut(rows[0]));
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Nama standar sudah dipakai' });
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan Acceptance Criteria' });
    }
  });

  app.delete('/api/acceptance-criteria/:id', async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM acceptance_criteria_sets WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus Acceptance Criteria' });
    }
  });
}

// Set bawaan = kalimat form resmi sekarang (Fillet Weld Break AWS D1.1 / D1.2 / ASME IX, Peel), ditambahkan sekali
function defaultSets() {
  const { fwbInfo } = require('./testReportTemplatePrint');
  return [
    ['Fillet Weld Break — AWS D1.1', 'fwb-aws-d11'], ['Fillet Weld Break — AWS D1.2', 'fwb-aws-d12'],
    ['Fillet Weld Break — ASME IX (Plate)', 'fwb-asme-plate'], ['Fillet Weld Break — ASME IX (Pipe)', 'fwb-asme-pipe'],
    ['Peel Test', 'peel']
  ].map(([name, key]) => ({ name, notes: 'Kalimat form resmi ' + key, criteria: fwbInfo(key).criteria.map(c => ({ text: c.crit, remark: c.text })) }));
}

module.exports = { registerAcceptanceCriteriaRoutes, sanitizeCriteriaSnapshot, cleanCriteria, defaultSets, MAX_CRITERIA };
