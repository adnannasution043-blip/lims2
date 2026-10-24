// Master Data > Pola Hardness — sketsa posisi titik & susunan titik uji Hardness yang sering berubah per client.
// Satu pola = jenis (weld/material), label tiap line (1-3), zona per line (nama + jumlah titik, total maks. 15 titik)
// dan gambar sketsa (data URL JPEG/PNG, diperkecil di browser). Saat dipilih di Lembar Hasil Uji Hardness, pola
// disalin ke isian Lembar (snapshot), jadi laporan lama tidak berubah bila pola di master diubah atau dihapus.

const KINDS = ['weld', 'material'];
const MAX_LINES = 3;
const MAX_POINTS = 15;
const MAX_SKETCH = 1500000;   // panjang data URL
const SKETCH_RE = /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/;

const LIST_COLUMNS = `id, name, kind, customer, lines, zones, notes, (sketch_image IS NOT NULL AND sketch_image <> '') AS has_sketch, created_at, updated_at`;

function str(value, max = 300) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; } }
  return [];
}

// Susunan titik yang valid, atau pesan error. Dipakai untuk master dan untuk snapshot pola pada Lembar.
function cleanLayout(input) {
  const b = input || {};
  const lines = asArray(b.lines).slice(0, MAX_LINES).map((l, i) => str(l, 40) || 'Line ' + (i + 1));
  const zones = asArray(b.zones).map(z => ({ name: str(z && z.name, 40), points: Math.floor(Number(z && z.points)) || 0 }))
    .filter(z => z.points > 0);
  const total = zones.reduce((n, z) => n + z.points, 0);
  if (!lines.length) return { error: 'Minimal 1 line' };
  if (!zones.length) return { error: 'Minimal 1 zona dengan jumlah titik' };
  if (total > MAX_POINTS) return { error: `Total titik per line maksimal ${MAX_POINTS} (sekarang ${total})` };
  return { lines, zones, total };
}

function cleanSketch(v) {
  return typeof v === 'string' && SKETCH_RE.test(v) && v.length <= MAX_SKETCH ? v : '';
}

// Snapshot pola pada isian Lembar Hasil Uji (fields.pattern); null bila tidak valid
function sanitizePatternSnapshot(input) {
  if (!input || typeof input !== 'object') return null;
  const layout = cleanLayout(input);
  if (layout.error) return null;
  return {
    id: Number(input.id) || null,
    name: str(input.name, 120),
    kind: KINDS.includes(input.kind) ? input.kind : 'weld',
    lines: layout.lines,
    zones: layout.zones,
    sketch: cleanSketch(input.sketch)
  };
}

const rowOut = r => ({ ...r, lines: asArray(r.lines), zones: asArray(r.zones) });

function registerHardnessPatternRoutes(app, deps) {
  const { pool } = deps;

  app.get('/api/hardness-patterns', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${LIST_COLUMNS} FROM hardness_patterns ORDER BY kind, name`);
      res.json({ items: rows.map(rowOut) });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat Pola Hardness' });
    }
  });

  app.get('/api/hardness-patterns/:id', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${LIST_COLUMNS}, sketch_image FROM hardness_patterns WHERE id = $1`, [req.params.id]);
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      const { sketch_image, ...rest } = rows[0];
      res.json({ ...rowOut(rest), sketch: sketch_image || '' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat Pola Hardness' });
    }
  });

  // body: { name, kind, customer, lines: [label], zones: [{name, points}], notes, sketch: dataUrl | '' (hapus) | undefined (tetap) }
  const parse = b => {
    const name = str(b.name, 120);
    if (!name) return { error: 'Nama pola wajib diisi' };
    const layout = cleanLayout(b);
    if (layout.error) return layout;
    if (b.sketch !== undefined && b.sketch !== '' && !cleanSketch(b.sketch)) return { error: 'Sketsa harus gambar JPG/PNG/WEBP, maks. 1,5 MB' };
    return {
      name, kind: KINDS.includes(b.kind) ? b.kind : 'weld', customer: str(b.customer, 200), notes: str(b.notes, 500),
      lines: layout.lines, zones: layout.zones, sketch: b.sketch === undefined ? undefined : cleanSketch(b.sketch)
    };
  };

  app.post('/api/hardness-patterns', async (req, res) => {
    const p = parse(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    try {
      const { rows } = await pool.query(
        `INSERT INTO hardness_patterns (name, kind, customer, lines, zones, notes, sketch_image)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${LIST_COLUMNS}`,
        [p.name, p.kind, p.customer, JSON.stringify(p.lines), JSON.stringify(p.zones), p.notes, p.sketch || null]
      );
      res.status(201).json(rowOut(rows[0]));
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Nama pola sudah dipakai' });
      console.error(err);
      res.status(500).json({ error: 'Gagal menambah Pola Hardness' });
    }
  });

  app.put('/api/hardness-patterns/:id', async (req, res) => {
    const p = parse(req.body || {});
    if (p.error) return res.status(400).json({ error: p.error });
    try {
      const { rows } = await pool.query(
        `UPDATE hardness_patterns SET name=$1, kind=$2, customer=$3, lines=$4, zones=$5, notes=$6,
           sketch_image = CASE WHEN $7::boolean THEN $8 ELSE sketch_image END, updated_at=NOW()
         WHERE id=$9 RETURNING ${LIST_COLUMNS}`,
        [p.name, p.kind, p.customer, JSON.stringify(p.lines), JSON.stringify(p.zones), p.notes,
          p.sketch !== undefined, p.sketch || null, req.params.id]
      );
      if (!rows.length) return res.status(404).json({ error: 'Not found' });
      res.json(rowOut(rows[0]));
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Nama pola sudah dipakai' });
      console.error(err);
      res.status(500).json({ error: 'Gagal menyimpan Pola Hardness' });
    }
  });

  app.delete('/api/hardness-patterns/:id', async (req, res) => {
    try {
      const { rowCount } = await pool.query(`DELETE FROM hardness_patterns WHERE id = $1`, [req.params.id]);
      if (!rowCount) return res.status(404).json({ error: 'Not found' });
      res.json({ ok: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal menghapus Pola Hardness' });
    }
  });
}

// Pola bawaan = susunan form resmi sekarang (Weld 2 line x 9 titik, Material 5 titik); tanpa sketsa = sketsa form dipakai
const DEFAULT_PATTERNS = [
  { name: 'Weld standar (2 line x 9 titik)', kind: 'weld', lines: ['Line 1', 'Line 2'], zones: [{ name: 'Base Metal', points: 3 }, { name: 'HAZ', points: 3 }, { name: 'Weld Metal', points: 3 }], notes: 'Susunan form resmi DE.1/TR/10 & 11 HARD' },
  { name: 'Material standar (5 titik)', kind: 'material', lines: ['Line 1'], zones: [{ name: '', points: 5 }], notes: 'Susunan form resmi DE.1/TR/10 & 12 HARD' }
];

module.exports = { registerHardnessPatternRoutes, sanitizePatternSnapshot, cleanLayout, DEFAULT_PATTERNS, KINDS, MAX_LINES, MAX_POINTS };
