// Master Data > Pola Macro — tabel ukur & sketsa report Macro-Etching yang berbeda-beda per client (permintaan klien
// 2026-11-24: "report macro bisa custom seperti hardness"). Satu pola = daftar baris ukur, tiap baris berisi label
// (mis. "Weld Size (mm)") dan nama titik ukur (mis. A1, A2, A3; "P_A1" dicetak P dengan subskrip A1; tanpa titik = satu
// nilai, mis. "Fusion : Good"), ditambah gambar sketsa. Saat dipilih di Lembar Hasil Uji Macro, pola disalin ke isian
// Lembar (snapshot), jadi laporan lama tidak berubah bila pola di master diubah atau dihapus.

const MAX_GROUPS = 10;
const MAX_POINTS = 8;    // titik ukur per baris
const MAX_SKETCH = 1500000;   // panjang data URL
const SKETCH_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

const LIST_COLUMNS = `id, name, customer, groups, notes, (sketch_image IS NOT NULL AND sketch_image <> '') AS has_sketch, created_at, updated_at`;

function str(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
  return [];
}

// nama titik boleh diketik dipisah koma / spasi ("A1, A2, A3")
function pointList(v) {
  const arr = Array.isArray(v) ? v : String(v == null ? '' : v).split(/[,;\s]+/);
  return arr.map(x => str(x, 16)).filter(Boolean).slice(0, MAX_POINTS);
}

// Baris ukur yang valid, atau pesan error. Dipakai untuk master dan untuk snapshot pola pada Lembar.
function cleanGroups(input) {
  const groups = asArray(input).slice(0, MAX_GROUPS)
    .map(g => ({ label: str(g && g.label, 60), points: pointList(g && g.points) }))
    .filter(g => g.label || g.points.length);
  if (!groups.length) return { error: 'Minimal 1 baris ukur' };
  return { groups };
}

function cleanSketch(v) {
  return typeof v === 'string' && SKETCH_RE.test(v) && v.length <= MAX_SKETCH ? v : '';
}

// Snapshot pola pada isian Lembar Hasil Uji (fields.macro_pattern); null bila tidak valid
function sanitizeMacroSnapshot(input) {
  if (!input || typeof input !== 'object') return null;
  const g = cleanGroups(input.groups);
  if (g.error) return null;
  return { id: Number(input.id) || null, name: str(input.name, 120), groups: g.groups, sketch: cleanSketch(input.sketch) };
}

const rowOut = r => ({ ...r, groups: asArray(r.groups) });

function registerMacroPatternRoutes(app, deps) {
  const { pool } = deps;

  app.get('/api/macro-patterns', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${LIST_COLUMNS} FROM macro_patterns ORDER BY name`);
      res.json({ items: rows.map(rowOut) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat Pola Macro' });
    }
  });

  app.get('/api/macro-patterns/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${LIST_COLUMNS}, sketch_image FROM macro_patterns WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      const { sketch_image, ...rest } = rows[0];
      res.json({ ...rowOut(rest), sketch: sketch_image || '' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat Pola Macro' });
    }
  });

  // body: { name, customer, groups: [{label, points}], notes, sketch: dataUrl | '' (hapus) | undefined (tetap) }
  const parse = b => {
    const name = str(b.name, 120);
    if (!name) return { error: 'Nama pola wajib diisi' };
    const g = cleanGroups(b.groups);
    if (g.error) return g;
    if (b.sketch !== undefined && b.sketch !== '' && !cleanSketch(b.sketch)) return { error: 'Sketsa harus gambar JPG/PNG/WEBP, maks. 1,5 MB' };
    return { name, customer: str(b.customer, 200), notes: str(b.notes, 500), groups: g.groups, sketch: b.sketch === undefined ? undefined : cleanSketch(b.sketch) };
  };

  app.post('/api/macro-patterns', async (req, res) => {
    const p = parse(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    try {
      const { rows } = await pool.query(
        `INSERT INTO macro_patterns (name, customer, groups, notes, sketch_image) VALUES ($1,$2,$3,$4,$5) RETURNING ${LIST_COLUMNS}`,
        [p.name, p.customer, JSON.stringify(p.groups), p.notes, p.sketch || null]
      );
      res.status(201).json(rowOut(rows[0]));
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Nama pola sudah dipakai' });
      console.error(err);
      res.status(500).json({ error: 'Gagal menambah Pola Macro' });
    }
  });

  app.put('/api/macro-patterns/:id', async (req, res) => {
    const p = parse(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    try {
      const { rows } = await pool.query(
        `UPDATE macro_patterns SET name=$1, customer=$2, groups=$3, notes=$4,
           sketch_image = CASE WHEN $5::boolean THEN $6 ELSE sketch_image END, updated_at=NOW()
         WHERE id=$7 RETURNING ${LIST_COLUMNS}`,
        [p.name, p.customer, JSON.stringify(p.groups), p.notes, p.sketch !== undefined, p.sketch || null, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(rowOut(rows[0]));
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Nama pola sudah dipakai' });
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan Pola Macro' });
    }
  });

  app.delete('/api/macro-patterns/:id', async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM macro_patterns WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus Pola Macro' });
    }
  });
}

// Pola contoh dari report klien (fillet ganda: Weld Size & Weld Penetration sisi A dan B); sketsa diunggah sendiri
const DEFAULT_PATTERNS = [
  {
    name: 'Fillet ganda — Weld Size & Penetration (A/B)',
    groups: [
      { label: 'Weld Size (mm)', points: ['A1', 'A2', 'A3'] }, { label: 'Weld Penetration (mm)', points: ['P_A1', 'P_A2'] },
      { label: 'Weld Size (mm)', points: ['B1', 'B2', 'B3'] }, { label: 'Weld Penetration (mm)', points: ['P_B1', 'P_B2'] }
    ],
    notes: 'Contoh dari report Macro klien; unggah sketsa lewat Edit'
  }
];

module.exports = { registerMacroPatternRoutes, sanitizeMacroSnapshot, cleanGroups, pointList, DEFAULT_PATTERNS, MAX_GROUPS, MAX_POINTS };
