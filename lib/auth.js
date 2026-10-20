// Login, sesi, dan penerapan role (hak akses per menu).
//
// Sesi = cookie bertanda tangan (HMAC-SHA256), HttpOnly, SameSite=Lax, berlaku 12 jam (diperpanjang saat aktif). Tidak ada tabel
// sesi: isi cookie hanya id pengguna + kedaluwarsa + "stempel" kata sandi, jadi mengganti kata sandi otomatis mematikan sesi lama.
// Rahasia penanda tangan: env SESSION_SECRET, atau (bila tidak ada) dibuat sekali lalu disimpan di tabel app_settings supaya
// sesi tetap sah setelah deploy ulang.
//
// Penerapan: aktif secara bawaan. Bisa dimatikan lewat Pengaturan (app_settings.auth_enforced = 'false') atau lewat env
// AUTH_DISABLE=1 (pintu darurat bila terkunci). Saat aktif, semua /api/* (kecuali /api/auth/*) dan halaman cetak wajib login;
// file statis (halaman, CSS, JS, gambar) tetap terbuka supaya halaman login bisa tampil.

const crypto = require('crypto');
const { verifyPassword, hashPassword, PERMISSION_MODULES, allPermissions } = require('./users');

const COOKIE = 'detech_sid';
const SESSION_MS = 12 * 60 * 60 * 1000;
const REFRESH_MS = 6 * 60 * 60 * 1000;
const SETTINGS_TTL = 8000;
const USER_TTL = 10000;
// Batas percobaan login gagal: per IP+username (5 kali / 15 menit -> kunci 5 menit) dan per username dari IP mana pun
// (20 kali / 30 menit -> kunci 15 menit; menahan tebakan yang berpindah-pindah IP).
const LIMITS = {
  ip: { max: 5, windowMs: 15 * 60 * 1000, lockMs: 5 * 60 * 1000 },
  user: { max: 20, windowMs: 30 * 60 * 1000, lockMs: 15 * 60 * 1000 }
};

// IP klien: entri TERAKHIR X-Forwarded-For (ditambahkan proxy Railway); entri awal bisa diisi sembarang oleh klien.
function clientIp(req) {
  const xff = String((req.headers || {})['x-forwarded-for'] || '').split(',').map(x => x.trim()).filter(Boolean);
  return xff.length ? xff[xff.length - 1] : String(req.ip || (req.socket && req.socket.remoteAddress) || '');
}

// ----- penanda tangan sesi -----

const b64u = buf => Buffer.from(buf).toString('base64').replace(/=+$/, '').replace(/[+]/g, '-').replace(/[/]/g, '_');
const fromB64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const sign = (secret, payload) => b64u(crypto.createHmac('sha256', secret).update(payload).digest());
const stampOf = hash => crypto.createHash('sha256').update(String(hash || '')).digest('hex').slice(0, 12);

function makeToken(secret, user, now = Date.now()) {
  const payload = b64u(JSON.stringify({ u: user.id, e: now + SESSION_MS, s: stampOf(user.password_hash) }));
  return payload + '.' + sign(secret, payload);
}

function readToken(secret, token, now = Date.now()) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const expect = Buffer.from(sign(secret, parts[0])), got = Buffer.from(parts[1]);
  if (expect.length !== got.length || !crypto.timingSafeEqual(expect, got)) return null;
  try {
    const p = JSON.parse(fromB64u(parts[0]).toString('utf8'));
    return p && p.e > now ? p : null;
  } catch (e) { return null; }
}

function parseCookies(header) {
  const out = {};
  String(header || '').split(';').forEach(kv => {
    const i = kv.indexOf('=');
    if (i > 0) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

const isHttps = req => (req.headers || {})['x-forwarded-proto'] === 'https' || !!req.secure;

function cookieHeader(req, token, maxAgeMs) {
  return `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${isHttps(req) ? '; Secure' : ''}`;
}

// ----- aturan akses: path + metode -> modul + aksi -----

// Daftar pilihan untuk form: cukup login (tanpa cek modul)
const LOOKUP_RE = /^\/api\/(coupon-types|ref-codes|test-methods|test-types|welding-positions|welding-processes|next-job-number|customers|specimen-types|test-type-codes|equipment|master)(\/|$)/;
const PRINT_RE = /^\/(requests|specimen-inspections|test-reports|work-orders)\//;
// Modul yang halamannya memuat daftar Permintaan Uji / Work Order / Pengecekan Spesimen (dashboard, antrian, form lain)
const LIST_VIEWERS = ['dashboard', 'permintaan-uji', 'work-order', 'tasks', 'pengecekan-spesimen', 'hasil-laporan', 'antrian-kerja'];

function ruleFor(method, p) {
  const isGet = method === 'GET' || method === 'HEAD';
  if (isGet && LOOKUP_RE.test(p)) return { open: true };
  if (/^\/api\/(app-users|roles)(\/|$)/.test(p)) return { module: 'pengguna' };
  if (/^\/api\/(admin|settings|audit-log)(\/|$)/.test(p)) return { module: 'pengaturan' };
  if (/^\/api\/(customers|equipment|master|specimen-types|test-type-codes)(\/|$)/.test(p)) return { module: 'master-data' };
  if (/^\/api\/(lhu-reports|lhu-attachments|lhu-distributions)(\/|$)/.test(p)) return { module: 'hasil-laporan' };
  if (p === '/api/queues/summary') return { module: 'antrian-kerja', anyView: LIST_VIEWERS };
  if (/^\/api\/queues\//.test(p)) return { module: 'antrian-kerja' };
  if (/^\/api\/(work-order-progress|work-order-steps)$/.test(p)) return { module: 'tasks', anyView: LIST_VIEWERS };
  if (/^\/api\/test-reports(\/|$)|^\/test-reports\//.test(p)) return { module: 'tasks' };
  // Menu Machining: tim machining (modul machining) atau pengguna Tasks yang biasa memakai tahap Preparation
  if (p === '/api/machining') return { module: 'machining', anyView: ['tasks'] };
  if (/^\/api\/work-orders\/[^/]+\/machining$/.test(p)) return { module: 'machining', alt: 'tasks' };
  if (/^\/api\/work-order-files\//.test(p) || /^\/api\/work-orders\/[^/]+\/(tasks|progress|test-reports|machining|files)(\/|$)/.test(p)) return { module: 'tasks', anyView: ['work-order', ...LIST_VIEWERS] };
  if (/^\/api\/requests\/[^/]+\/work-order$/.test(p)) return { module: 'work-order' };
  if (/^\/api\/requests\/[^/]+\/specimen-inspections$/.test(p)) return { module: 'pengecekan-spesimen' };
  if (/^\/(api\/)?work-orders(\/|$)/.test(p)) return { module: 'work-order', anyView: LIST_VIEWERS };
  if (/^\/(api\/)?requests(\/|$)/.test(p)) return { module: 'permintaan-uji', anyView: LIST_VIEWERS };
  if (/^\/(api\/)?specimen-inspections(\/|$)/.test(p)) return { module: 'pengecekan-spesimen', anyView: LIST_VIEWERS };
  return { open: true };   // route lain: cukup login
}

function actionFor(module, method) {
  if (method === 'GET' || method === 'HEAD') return 'view';
  const mod = PERMISSION_MODULES.find(m => m.key === module);
  const want = method === 'POST' ? 'create' : (method === 'DELETE' ? 'delete' : 'edit');
  if (mod && mod.actions.includes(want)) return want;
  return 'edit';   // modul tanpa Tambah/Hapus (mis. Tasks): semua perubahan dihitung sebagai Ubah
}

const hasPerm = (user, module, action) => !!user && Array.isArray((user.permissions || {})[module]) && user.permissions[module].includes(action);

function allowed(user, rule, method) {
  if (rule.open) return true;
  const get = method === 'GET' || method === 'HEAD';
  if (get && rule.anyView && rule.anyView.some(m => hasPerm(user, m, 'view'))) return true;
  if (rule.alt && hasPerm(user, rule.alt, actionFor(rule.alt, method))) return true;
  return hasPerm(user, rule.module, actionFor(rule.module, method));
}

// ----- pengaturan tersimpan -----

function makeSettings(pool) {
  const cache = new Map();
  return {
    async get(key) {
      const hit = cache.get(key);
      if (hit && Date.now() - hit.at < SETTINGS_TTL) return hit.value;
      const { rows } = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
      const value = rows.length ? rows[0].value : null;
      cache.set(key, { value, at: Date.now() });
      return value;
    },
    async set(key, value) {
      await pool.query(
        `INSERT INTO app_settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`, [key, String(value)]);
      cache.set(key, { value: String(value), at: Date.now() });
    }
  };
}

const forcedOff = () => /^(1|true|yes)$/i.test(String(process.env.AUTH_DISABLE || ''));

function createAuth(pool) {
  const settings = makeSettings(pool);
  let secret = null;
  const userCache = new Map();
  const fails = new Map();
  const DUMMY_HASH = hashPassword('dummy-password-untuk-menyamakan-waktu');

  async function getSecret() {
    if (secret) return secret;
    if (process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 16) return (secret = process.env.SESSION_SECRET);
    let v = await settings.get('session_secret');
    if (!v) {
      await pool.query(`INSERT INTO app_settings (key, value) VALUES ('session_secret', $1) ON CONFLICT (key) DO NOTHING`, [crypto.randomBytes(32).toString('hex')]);
      const { rows } = await pool.query(`SELECT value FROM app_settings WHERE key = 'session_secret'`);
      v = rows[0].value;
    }
    return (secret = v);
  }

  const USER_SQL = `SELECT u.id, u.name, u.username, u.email, u.password_hash, u.active, u.role_id, r.name AS role_name, r.permissions, r.is_system
                    FROM app_users u LEFT JOIN roles r ON r.id = u.role_id`;
  const shape = row => row && ({
    id: row.id, name: row.name, username: row.username, email: row.email || '', password_hash: row.password_hash, active: row.active,
    role_id: row.role_id, role_name: row.role_name || '', is_admin: !!row.is_system,
    permissions: row.is_system ? allPermissions() : (row.permissions || {})
  });
  const publicUser = u => u && ({ id: u.id, name: u.name, username: u.username, email: u.email, role_name: u.role_name, is_admin: u.is_admin, permissions: u.permissions });

  async function loadUserById(id) {
    const hit = userCache.get(id);
    if (hit && Date.now() - hit.at < USER_TTL) return hit.user;
    const { rows } = await pool.query(USER_SQL + ' WHERE u.id = $1', [id]);
    const user = shape(rows[0]);
    userCache.set(id, { user, at: Date.now() });
    return user;
  }
  const forgetUser = id => userCache.delete(id);

  async function userFromRequest(req) {
    const tok = parseCookies((req.headers || {}).cookie)[COOKIE];
    if (!tok) return null;
    const p = readToken(await getSecret(), tok);
    if (!p) return null;
    const user = await loadUserById(p.u);
    if (!user || !user.active || stampOf(user.password_hash) !== p.s) return null;
    user._exp = p.e;
    return user;
  }

  async function isEnforced() {
    if (forcedOff()) return false;
    return (await settings.get('auth_enforced')) !== 'false';
  }

  function middleware() {
    return async (req, res, next) => {
      try {
        // dinormalkan ke huruf kecil: Express (bila routing tidak peka huruf) menganggap "/API/x" sama dengan "/api/x"
        const p = req.path.toLowerCase();
        if (!p.startsWith('/api/') && !PRINT_RE.test(p)) return next();   // file statis selalu terbuka
        req.user = await userFromRequest(req);
        if (p.startsWith('/api/auth/')) return next();
        if (!(await isEnforced())) return next();
        if (!req.user) {
          if (p.startsWith('/api/')) return res.status(401).json({ error: 'Sesi berakhir atau belum login. Silakan login kembali.', code: 'AUTH_REQUIRED' });
          res.status(401).setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.send('<!doctype html><meta charset="utf-8"><title>Perlu login</title><body style="font-family:sans-serif;padding:40px"><h3>Perlu login</h3><p>Silakan <a href="/">login</a> ke DETECH LIMS terlebih dahulu, lalu buka halaman ini lagi.</p></body>');
        }
        if (!allowed(req.user, ruleFor(req.method, p), req.method)) {
          const msg = 'Anda tidak punya akses untuk tindakan ini.';
          if (p.startsWith('/api/')) return res.status(403).json({ error: msg, code: 'FORBIDDEN' });
          res.status(403).setHeader('Content-Type', 'text/html; charset=utf-8');
          return res.send(`<!doctype html><meta charset="utf-8"><title>Tidak ada akses</title><body style="font-family:sans-serif;padding:40px"><h3>Tidak ada akses</h3><p>${msg}</p></body>`);
        }
        next();
      } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Gagal memeriksa login' });
      }
    };
  }

  function registerRoutes(app) {
    const lockedFor = key => { const f = fails.get(key); return f && f.until > Date.now() ? f.until : 0; };
    const addFail = (key, lim) => {
      const now = Date.now();
      let f = fails.get(key);
      if (!f || (f.until && f.until <= now) || now - f.first > lim.windowMs) f = { n: 0, first: now, until: 0 };   // jendela baru
      f.n += 1;
      if (f.n >= lim.max) f.until = now + lim.lockMs;
      fails.set(key, f);
      if (fails.size > 5000) for (const [k, v] of fails) if ((v.until && v.until <= now) || now - v.first > LIMITS.user.windowMs) fails.delete(k);
    };

    app.post('/api/auth/login', async (req, res) => {
      try {
        const b = req.body || {};
        const username = String(b.username || '').trim().toLowerCase();
        const password = String(b.password || '');
        if (!username || !password) return res.status(400).json({ error: 'Username dan kata sandi wajib diisi' });
        const ipKey = `ip|${clientIp(req)}|${username}`, userKey = `user|${username}`;
        const until = Math.max(lockedFor(ipKey), lockedFor(userKey));
        if (until) return res.status(429).json({ error: `Terlalu banyak percobaan gagal. Coba lagi dalam ${Math.ceil((until - Date.now()) / 60000)} menit.` });
        const { rows } = await pool.query(USER_SQL + ' WHERE u.username = $1', [username]);
        const user = shape(rows[0]);
        const ok = verifyPassword(password, user ? user.password_hash : DUMMY_HASH) && !!user;
        if (!ok) {
          addFail(ipKey, LIMITS.ip);
          addFail(userKey, LIMITS.user);
          return res.status(401).json({ error: 'Username atau kata sandi salah' });
        }
        if (!user.active) return res.status(403).json({ error: 'Akun ini dinonaktifkan. Hubungi Administrator.' });
        fails.delete(ipKey);
        fails.delete(userKey);
        await pool.query('UPDATE app_users SET last_login_at = NOW() WHERE id = $1', [user.id]);
        forgetUser(user.id);
        res.setHeader('Set-Cookie', cookieHeader(req, makeToken(await getSecret(), user), SESSION_MS));
        res.json({ user: publicUser(user) });
      } catch (err) { console.error(err); res.status(500).json({ error: 'Gagal login' }); }
    });

    app.post('/api/auth/logout', (req, res) => {
      res.setHeader('Set-Cookie', cookieHeader(req, '', 0));
      res.json({ ok: true });
    });

    app.get('/api/auth/me', async (req, res) => {
      try {
        const user = req.user !== undefined ? req.user : await userFromRequest(req);
        if (user && user._exp - Date.now() < REFRESH_MS) res.setHeader('Set-Cookie', cookieHeader(req, makeToken(await getSecret(), user), SESSION_MS));   // perpanjang saat aktif
        res.json({ enforced: await isEnforced(), forced_off: forcedOff(), user: publicUser(user) });
      } catch (err) { console.error(err); res.status(500).json({ error: 'Gagal memuat sesi' }); }
    });

    app.post('/api/auth/password', async (req, res) => {
      try {
        const user = req.user;
        if (!user) return res.status(401).json({ error: 'Perlu login', code: 'AUTH_REQUIRED' });
        const b = req.body || {};
        if (!verifyPassword(String(b.current || ''), user.password_hash)) return res.status(400).json({ error: 'Kata sandi saat ini salah' });
        const next = String(b.next || '');
        if (next.length < 8) return res.status(400).json({ error: 'Kata sandi baru minimal 8 karakter' });
        const hash = hashPassword(next);
        await pool.query('UPDATE app_users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [hash, user.id]);
        forgetUser(user.id);
        const fresh = await loadUserById(user.id);
        res.setHeader('Set-Cookie', cookieHeader(req, makeToken(await getSecret(), fresh), SESSION_MS));   // sesi ini tetap sah; sesi lain mati
        res.json({ ok: true });
      } catch (err) { console.error(err); res.status(500).json({ error: 'Gagal mengganti kata sandi' }); }
    });

    // Saklar penerapan login & role (Pengaturan)
    app.get('/api/settings/auth', async (req, res) => {
      try {
        const { rows } = await pool.query(`SELECT COUNT(*) AS n FROM app_users u JOIN roles r ON r.id = u.role_id WHERE r.is_system = TRUE AND u.active = TRUE`);
        res.json({ enforced: (await settings.get('auth_enforced')) !== 'false', forced_off: forcedOff(), admin_count: Number(rows[0].n) || 0 });
      } catch (err) { console.error(err); res.status(500).json({ error: 'Gagal memuat pengaturan' }); }
    });

    app.put('/api/settings/auth', async (req, res) => {
      try {
        const want = !!(req.body || {}).enforced;
        if (want) {
          const { rows } = await pool.query(`SELECT COUNT(*) AS n FROM app_users u JOIN roles r ON r.id = u.role_id WHERE r.is_system = TRUE AND u.active = TRUE`);
          if (!(Number(rows[0].n) > 0)) return res.status(400).json({ error: 'Belum ada Administrator aktif. Buat dulu di menu Pengguna.' });
        }
        await settings.set('auth_enforced', want ? 'true' : 'false');
        res.json({ enforced: want, forced_off: forcedOff() });
      } catch (err) { console.error(err); res.status(500).json({ error: 'Gagal menyimpan pengaturan' }); }
    });
  }

  return { middleware, registerRoutes, isEnforced, userFromRequest, settings, forgetUser };
}

// ----- Administrator awal / pemulihan -----

function randomPassword(len = 16) {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(len);
  return Array.from(buf, b => chars[b % chars.length]).join('');
}

// Dipanggil saat server start (setelah skema siap):
//  - env ADMIN_USERNAME + ADMIN_PASSWORD (>= 8 karakter): buat / pulihkan akun Administrator itu (pemulihan bila lupa kata sandi;
//    hapus kedua variabel setelah dipakai);
//  - bila tidak ada Administrator aktif sama sekali: buat akun "admin" dengan kata sandi acak yang dicetak SEKALI ke log server.
async function ensureAdmin(pool, log = console.log) {
  const { rows: roleRows } = await pool.query('SELECT id FROM roles WHERE is_system = TRUE ORDER BY id LIMIT 1');
  if (!roleRows.length) { log('[auth] Role Administrator tidak ditemukan; akun awal tidak dibuat'); return null; }
  const roleId = roleRows[0].id;
  const envUser = String(process.env.ADMIN_USERNAME || '').trim().toLowerCase();
  const envPass = String(process.env.ADMIN_PASSWORD || '');
  if (envUser && envPass) {
    if (!/^[a-z0-9._-]{3,40}$/.test(envUser) || envPass.length < 8) {
      log('[auth] ADMIN_USERNAME/ADMIN_PASSWORD diabaikan: username 3-40 karakter (huruf kecil/angka/._-) dan kata sandi minimal 8 karakter');
    } else {
      const { rows } = await pool.query('SELECT id FROM app_users WHERE username = $1', [envUser]);
      if (rows.length) {
        await pool.query('UPDATE app_users SET password_hash = $1, role_id = $2, active = TRUE, updated_at = NOW() WHERE id = $3', [hashPassword(envPass), roleId, rows[0].id]);
        log(`[auth] Akun Administrator "${envUser}" dipulihkan dari ADMIN_USERNAME/ADMIN_PASSWORD. Hapus kedua variabel itu setelah selesai.`);
      } else {
        await pool.query('INSERT INTO app_users (name, username, email, password_hash, role_id, active) VALUES ($1,$2,$3,$4,$5,TRUE)', ['Administrator', envUser, '', hashPassword(envPass), roleId]);
        log(`[auth] Akun Administrator "${envUser}" dibuat dari ADMIN_USERNAME/ADMIN_PASSWORD. Hapus kedua variabel itu setelah selesai.`);
      }
      return { username: envUser };
    }
  }
  const { rows: cnt } = await pool.query('SELECT COUNT(*) AS n FROM app_users u JOIN roles r ON r.id = u.role_id WHERE r.is_system = TRUE AND u.active = TRUE');
  if (Number(cnt[0].n) > 0) return null;
  let username = 'admin';
  const taken = await pool.query('SELECT id FROM app_users WHERE username = $1', [username]);
  if (taken.rows.length) username = 'administrator';
  const pw = randomPassword();
  await pool.query('INSERT INTO app_users (name, username, email, password_hash, role_id, active) VALUES ($1,$2,$3,$4,$5,TRUE)', ['Administrator', username, '', hashPassword(pw), roleId]);
  log('==============================================================');
  log('[auth] Belum ada Administrator aktif. Akun awal dibuat (ditampilkan SEKALI):');
  log(`[auth]   username : ${username}`);
  log(`[auth]   password : ${pw}`);
  log('[auth] Segera login lalu ganti kata sandinya (klik nama Anda di sidebar).');
  log('==============================================================');
  return { username, password: pw };
}

module.exports = { clientIp, LIMITS, createAuth, ensureAdmin, ruleFor, actionFor, allowed, makeToken, readToken, parseCookies, PRINT_RE, COOKIE, randomPassword };
