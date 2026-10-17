// Jejak aktivitas: setiap permintaan yang mengubah data (POST/PUT/PATCH/DELETE ke /api/*) dicatat setelah selesai diproses:
// waktu, pengguna, metode + path, kode hasil, dan IP. Isi permintaan TIDAK disimpan (bisa berisi kata sandi atau file);
// untuk login hanya username yang dicatat. Catatan dibaca di Pengaturan (GET /api/audit-log, hak Pengaturan).

const { clientIp } = require('./auth');

function auditTrail(pool) {
  return (req, res, next) => {
    const method = req.method;
    const p = String(req.path || '').toLowerCase();
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) || !p.startsWith('/api/')) return next();
    res.on('finish', () => {
      const user = req.user || null;
      // login: pengguna belum terpasang di req.user, ambil username yang diketik (tanpa kata sandi)
      const username = user ? user.username : (p === '/api/auth/login' ? String((req.body || {}).username || '').trim().toLowerCase().slice(0, 80) : '');
      pool.query(
        `INSERT INTO audit_log (user_id, username, method, path, status, ip) VALUES ($1, $2, $3, $4, $5, $6)`,
        [user ? user.id : null, username, method, String(req.path).slice(0, 300), res.statusCode, clientIp(req).slice(0, 64)]
      ).catch(err => console.error('[audit] gagal mencatat:', err.message));
    });
    next();
  };
}

function registerAuditRoutes(app, { pool }) {
  app.get('/api/audit-log', async (req, res) => {
    try {
      const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 200, 1), 1000);
      const q = String(req.query.q || '').trim().slice(0, 80);
      const { rows } = q
        ? await pool.query(
          `SELECT id, at, username, method, path, status, ip FROM audit_log
           WHERE username ILIKE $1 OR path ILIKE $1 ORDER BY id DESC LIMIT $2`, ['%' + q + '%', limit])
        : await pool.query(`SELECT id, at, username, method, path, status, ip FROM audit_log ORDER BY id DESC LIMIT $1`, [limit]);
      res.json({ items: rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Gagal memuat jejak aktivitas' });
    }
  });
}

module.exports = { auditTrail, registerAuditRoutes };
