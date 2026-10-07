// Manajemen Pengguna & Role (hak akses).
//
// STATUS: baru DISIAPKAN, belum diterapkan. Aplikasi masih bisa dibuka tanpa login dan tidak ada
// route yang memeriksa role/permission. Halaman ini hanya mengelola datanya (pengguna, role, matriks
// hak akses) supaya saat login dibuat nanti tinggal dipasang. Kata sandi sudah disimpan sebagai hash
// (scrypt) — verifyPassword() disiapkan untuk dipakai halaman login nanti.

const crypto = require('crypto');

// Modul = menu di sidebar. Aksi: view (lihat), create (tambah), edit (ubah), delete (hapus).
// `actions` membatasi aksi yang masuk akal untuk modul itu.
const PERMISSION_MODULES = [
  { key: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { key: 'permintaan-uji', label: 'Permintaan Uji', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'work-order', label: 'Work Order', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'tasks', label: 'Tasks (form tiap tahap)', actions: ['view', 'edit'] },
  { key: 'pengecekan-spesimen', label: 'Pengecekan Spesimen', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'hasil-laporan', label: 'Hasil & Laporan', actions: ['view', 'edit'] },
  { key: 'antrian-kerja', label: 'Antrian Kerja (Queue)', actions: ['view'] },
  { key: 'master-data', label: 'Master Data', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'pengguna', label: 'Pengguna & Role', actions: ['view', 'create', 'edit', 'delete'] },
  { key: 'pengaturan', label: 'Pengaturan', actions: ['view', 'edit'] }
];
const ACTIONS = ['view', 'create', 'edit', 'delete'];
const ADMIN_ROLE = 'Administrator';

function allPermissions() {
  const p = {};
  PERMISSION_MODULES.forEach(m => { p[m.key] = m.actions.slice(); });
  return p;
}

function sanitizePermissions(input) {
  const out = {};
  if (!input || typeof input !== 'object') return out;
  PERMISSION_MODULES.forEach(m => {
    const given = Array.isArray(input[m.key]) ? input[m.key] : [];
    const kept = m.actions.filter(a => given.includes(a));
    // Tambah/ubah/hapus hanya berarti kalau boleh melihat; tanpa "view" modul dianggap tidak punya akses.
    if (kept.includes('view')) out[m.key] = kept;
  });
  return out;
}

// Role bawaan, hanya dibuat saat tabel roles masih kosong (jadi role yang sengaja dihapus tidak muncul lagi).
function viewAll(except = []) {
  const p = {};
  PERMISSION_MODULES.forEach(m => { if (!except.includes(m.key)) p[m.key] = ['view']; });
  return p;
}
const DEFAULT_ROLES = [
  { name: ADMIN_ROLE, description: 'Akses penuh ke seluruh menu, termasuk Pengguna & Pengaturan.', is_system: true, permissions: allPermissions() },
  {
    name: 'Supervisor Lab', description: 'Mengelola seluruh alur kerja laboratorium dan Master Data; tanpa Pengguna & Pengaturan.', is_system: false,
    permissions: (() => { const p = allPermissions(); delete p.pengguna; delete p.pengaturan; return p; })()
  },
  {
    name: 'Receiving', description: 'Penerimaan sampel: membuka Permintaan Uji dan mengisi tahap Receiving.', is_system: false,
    permissions: { ...viewAll(['master-data', 'pengguna', 'pengaturan', 'hasil-laporan']), tasks: ['view', 'edit'], 'pengecekan-spesimen': ['view'] }
  },
  {
    name: 'Preparation / Machining', description: 'Persiapan spesimen: marking, cutting, machining, dan pengecekan spesimen.', is_system: false,
    permissions: { ...viewAll(['master-data', 'pengguna', 'pengaturan', 'hasil-laporan']), tasks: ['view', 'edit'], 'pengecekan-spesimen': ['view', 'create', 'edit'] }
  },
  {
    name: 'Analis Pengujian', description: 'Melakukan pengujian dan menginput hasil pada tahap Testing dan Reporting.', is_system: false,
    permissions: { ...viewAll(['master-data', 'pengguna', 'pengaturan']), tasks: ['view', 'edit'] }
  },
  {
    name: 'Reviewer / Approver', description: 'Memeriksa dan menyetujui laporan, serta menerbitkan LHU.', is_system: false,
    permissions: { ...viewAll(['master-data', 'pengguna', 'pengaturan']), tasks: ['view', 'edit'], 'hasil-laporan': ['view', 'edit'] }
  },
  {
    name: 'Viewer', description: 'Hanya melihat; tidak bisa menambah atau mengubah data.', is_system: false,
    permissions: viewAll(['pengguna', 'pengaturan'])
  }
];

// ----- kata sandi -----

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

function verifyPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const expected = Buffer.from(parts[2], 'hex');
  const actual = crypto.scryptSync(String(password), parts[1], expected.length);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

// ----- helper -----

function str(value, max = 200) {
  return String(value == null ? '' : value).trim().slice(0, max);
}

const USER_COLUMNS = `u.id, u.name, u.username, u.email, u.role_id, r.name AS role_name, u.active,
  u.last_login_at, u.created_at, u.updated_at`;
const USER_FROM = 'FROM app_users u LEFT JOIN roles r ON r.id = u.role_id';

function registerUserRoutes(app, deps) {
  const { pool } = deps;

  const fail = (res, err, msg) => { console.error(err); res.status(500).json({ error: msg }); };

  // ---------- Role ----------

  app.get('/api/roles', async (req, res) => {
    try {
      const { rows } = await pool.query(
        `SELECT r.id, r.name, r.description, r.permissions, r.is_system, r.created_at,
                (SELECT COUNT(*) FROM app_users u WHERE u.role_id = r.id) AS user_count
         FROM roles r ORDER BY r.is_system DESC, r.name ASC`
      );
      res.json({
        modules: PERMISSION_MODULES, actions: ACTIONS,
        roles: rows.map(r => ({ ...r, user_count: Number(r.user_count) || 0 }))
      });
    } catch (err) { fail(res, err, 'Gagal memuat data Role'); }
  });

  function roleInput(b) {
    return { name: str(b.name, 80), description: str(b.description, 400), permissions: sanitizePermissions(b.permissions) };
  }

  app.post('/api/roles', async (req, res) => {
    const { name, description, permissions } = roleInput(req.body || {});
    if (!name) return res.status(400).json({ error: 'Nama role wajib diisi' });
    try {
      const { rows } = await pool.query(
        `INSERT INTO roles (name, description, permissions, is_system) VALUES ($1,$2,$3,FALSE)
         RETURNING id, name, description, permissions, is_system, created_at`,
        [name, description, JSON.stringify(permissions)]
      );
      res.status(201).json({ ...rows[0], user_count: 0 });
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Nama role sudah dipakai' });
      fail(res, err, 'Gagal menambah Role');
    }
  });

  app.put('/api/roles/:id', async (req, res) => {
    const input = roleInput(req.body || {});
    if (!input.name) return res.status(400).json({ error: 'Nama role wajib diisi' });
    try {
      const cur = await pool.query('SELECT id, name, is_system FROM roles WHERE id = $1', [req.params.id]);
      if (!cur.rows.length) return res.status(404).json({ error: 'Role tidak ditemukan' });
      let { name, description, permissions } = input;
      if (cur.rows[0].is_system) {   // Administrator: nama dan akses penuh dikunci supaya tidak ada yang terkunci keluar nanti
        name = cur.rows[0].name;
        permissions = allPermissions();
      }
      const { rows } = await pool.query(
        `UPDATE roles SET name=$1, description=$2, permissions=$3, updated_at=NOW() WHERE id=$4
         RETURNING id, name, description, permissions, is_system, created_at`,
        [name, description, JSON.stringify(permissions), req.params.id]
      );
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Nama role sudah dipakai' });
      fail(res, err, 'Gagal menyimpan Role');
    }
  });

  app.delete('/api/roles/:id', async (req, res) => {
    try {
      const cur = await pool.query('SELECT id, name, is_system FROM roles WHERE id = $1', [req.params.id]);
      if (!cur.rows.length) return res.status(404).json({ error: 'Role tidak ditemukan' });
      if (cur.rows[0].is_system) return res.status(400).json({ error: 'Role bawaan sistem tidak bisa dihapus' });
      const used = await pool.query('SELECT COUNT(*) AS n FROM app_users WHERE role_id = $1', [req.params.id]);
      const n = Number(used.rows[0].n) || 0;
      if (n > 0) return res.status(400).json({ error: `Role masih dipakai ${n} pengguna. Pindahkan penggunanya ke role lain dulu.` });
      await pool.query('DELETE FROM roles WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { fail(res, err, 'Gagal menghapus Role'); }
  });

  // ---------- Pengguna ----------

  app.get('/api/app-users', async (req, res) => {
    try {
      const { rows } = await pool.query(`SELECT ${USER_COLUMNS} ${USER_FROM} ORDER BY u.name ASC`);
      res.json({ items: rows });
    } catch (err) { fail(res, err, 'Gagal memuat data Pengguna'); }
  });

  // Kembalikan pesan kesalahan (string) atau null jika valid. `create`: kata sandi wajib.
  function validateUser(b, create) {
    const username = str(b.username, 40).toLowerCase();
    if (!str(b.name, 120)) return 'Nama lengkap wajib diisi';
    if (!/^[a-z0-9._-]{3,40}$/.test(username)) return 'Username 3–40 karakter: huruf kecil, angka, titik, garis bawah, atau strip';
    const email = str(b.email, 160);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Format email tidak valid';
    if (!b.role_id) return 'Role wajib dipilih';
    const pw = String(b.password == null ? '' : b.password);
    if (create && pw.length < 8) return 'Kata sandi minimal 8 karakter';
    if (!create && pw && pw.length < 8) return 'Kata sandi baru minimal 8 karakter';
    return null;
  }

  async function activeAdminCountExcluding(userId) {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS n FROM app_users u JOIN roles r ON r.id = u.role_id
       WHERE r.is_system = TRUE AND u.active = TRUE AND u.id <> $1`, [userId]);
    return Number(rows[0].n) || 0;
  }

  app.post('/api/app-users', async (req, res) => {
    const b = req.body || {};
    const msg = validateUser(b, true);
    if (msg) return res.status(400).json({ error: msg });
    try {
      const role = await pool.query('SELECT id FROM roles WHERE id = $1', [b.role_id]);
      if (!role.rows.length) return res.status(400).json({ error: 'Role tidak ditemukan' });
      const ins = await pool.query(
        `INSERT INTO app_users (name, username, email, password_hash, role_id, active)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [str(b.name, 120), str(b.username, 40).toLowerCase(), str(b.email, 160), hashPassword(b.password), b.role_id, b.active !== false]
      );
      const { rows } = await pool.query(`SELECT ${USER_COLUMNS} ${USER_FROM} WHERE u.id = $1`, [ins.rows[0].id]);
      res.status(201).json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Username sudah dipakai' });
      fail(res, err, 'Gagal menambah Pengguna');
    }
  });

  app.put('/api/app-users/:id', async (req, res) => {
    const b = req.body || {};
    const msg = validateUser(b, false);
    if (msg) return res.status(400).json({ error: msg });
    try {
      const cur = await pool.query(
        `SELECT u.id, u.active, r.is_system FROM app_users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [req.params.id]);
      if (!cur.rows.length) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      const role = await pool.query('SELECT id, is_system FROM roles WHERE id = $1', [b.role_id]);
      if (!role.rows.length) return res.status(400).json({ error: 'Role tidak ditemukan' });

      // Jangan sampai tidak ada Administrator aktif yang tersisa.
      const wasAdmin = cur.rows[0].is_system && cur.rows[0].active;
      const stillAdmin = role.rows[0].is_system && b.active !== false;
      if (wasAdmin && !stillAdmin && (await activeAdminCountExcluding(req.params.id)) === 0) {
        return res.status(400).json({ error: 'Harus ada minimal satu Administrator aktif' });
      }

      const sets = ['name=$1', 'username=$2', 'email=$3', 'role_id=$4', 'active=$5', 'updated_at=NOW()'];
      const params = [str(b.name, 120), str(b.username, 40).toLowerCase(), str(b.email, 160), b.role_id, b.active !== false];
      if (b.password) { params.push(hashPassword(b.password)); sets.push(`password_hash=$${params.length}`); }
      params.push(req.params.id);
      await pool.query(`UPDATE app_users SET ${sets.join(', ')} WHERE id=$${params.length}`, params);
      const { rows } = await pool.query(`SELECT ${USER_COLUMNS} ${USER_FROM} WHERE u.id = $1`, [req.params.id]);
      res.json(rows[0]);
    } catch (err) {
      if (err.code === '23505') return res.status(400).json({ error: 'Username sudah dipakai' });
      fail(res, err, 'Gagal menyimpan Pengguna');
    }
  });

  app.delete('/api/app-users/:id', async (req, res) => {
    try {
      const cur = await pool.query(
        `SELECT u.id, u.active, r.is_system FROM app_users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1`, [req.params.id]);
      if (!cur.rows.length) return res.status(404).json({ error: 'Pengguna tidak ditemukan' });
      if (cur.rows[0].is_system && cur.rows[0].active && (await activeAdminCountExcluding(req.params.id)) === 0) {
        return res.status(400).json({ error: 'Harus ada minimal satu Administrator aktif' });
      }
      await pool.query('DELETE FROM app_users WHERE id = $1', [req.params.id]);
      res.json({ ok: true });
    } catch (err) { fail(res, err, 'Gagal menghapus Pengguna'); }
  });
}

module.exports = {
  registerUserRoutes, PERMISSION_MODULES, ACTIONS, DEFAULT_ROLES, ADMIN_ROLE,
  sanitizePermissions, allPermissions, hashPassword, verifyPassword
};
