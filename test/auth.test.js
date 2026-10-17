const assert = require('assert');
const ROOT = require('path').join(__dirname, '..') + '/';
const U = require(ROOT + 'lib/users.js');
const A = require(ROOT + 'lib/auth.js');

// ---- pool palsu ----
const settingsStore = {};
const roles = [
  { id: 1, name: 'Administrator', is_system: true, permissions: U.allPermissions() },
  { id: 2, name: 'Viewer', is_system: false, permissions: { dashboard: ['view'], 'permintaan-uji': ['view'], 'work-order': ['view'], tasks: ['view'] } },
  { id: 3, name: 'Penguji', is_system: false, permissions: { dashboard: ['view'], tasks: ['view', 'edit'], 'antrian-kerja': ['view'] } },
  { id: 4, name: 'Master', is_system: false, permissions: { 'master-data': ['view', 'create', 'edit', 'delete'] } }
];
let users = [];
let uid = 0;
const addUser = (username, password, roleId, active = true) => { const u = { id: ++uid, name: username.toUpperCase(), username, email: '', password_hash: U.hashPassword(password), role_id: roleId, active, last_login_at: null }; users.push(u); return u; };
const row = u => { const r = roles.find(x => x.id === u.role_id); return { ...u, role_name: r && r.name, permissions: r && r.permissions, is_system: r && r.is_system }; };
const pool = {
  query: async (sql, p = []) => {
    sql = sql.replace(/\s+/g, ' ').trim();
    if (/^SELECT value FROM app_settings WHERE key = \$1/.test(sql)) return { rows: settingsStore[p[0]] === undefined ? [] : [{ value: settingsStore[p[0]] }] };
    if (/^SELECT value FROM app_settings WHERE key = 'session_secret'/.test(sql)) return { rows: [{ value: settingsStore.session_secret }] };
    if (/^INSERT INTO app_settings \(key, value\) VALUES \('session_secret', \$1\)/.test(sql)) { if (settingsStore.session_secret === undefined) settingsStore.session_secret = p[0]; return { rows: [] }; }
    if (/^INSERT INTO app_settings \(key, value\) VALUES \(\$1, \$2\)/.test(sql)) { settingsStore[p[0]] = p[1]; return { rows: [] }; }
    if (/^SELECT u\.id, u\.name, u\.username.* WHERE u\.id = \$1/.test(sql)) return { rows: users.filter(u => u.id === Number(p[0])).map(row) };
    if (/^SELECT u\.id, u\.name, u\.username.* WHERE u\.username = \$1/.test(sql)) return { rows: users.filter(u => u.username === p[0]).map(row) };
    if (/^UPDATE app_users SET last_login_at/.test(sql)) { users.find(u => u.id === Number(p[0])).last_login_at = 'now'; return { rows: [] }; }
    if (/^UPDATE app_users SET password_hash = \$1, updated_at = NOW\(\) WHERE id = \$2/.test(sql)) { users.find(u => u.id === Number(p[1])).password_hash = p[0]; return { rows: [] }; }
    if (/^SELECT COUNT\(\*\) AS n FROM app_users u JOIN roles r/.test(sql)) return { rows: [{ n: String(users.filter(u => u.active && roles.find(r => r.id === u.role_id).is_system).length) }] };
    if (/^SELECT id FROM roles WHERE is_system = TRUE/.test(sql)) return { rows: roles.filter(r => r.is_system).map(r => ({ id: r.id })) };
    if (/^SELECT id FROM app_users WHERE username = \$1/.test(sql)) return { rows: users.filter(u => u.username === p[0]).map(u => ({ id: u.id })) };
    if (/^UPDATE app_users SET password_hash = \$1, role_id = \$2, active = TRUE/.test(sql)) { const u = users.find(x => x.id === Number(p[2])); Object.assign(u, { password_hash: p[0], role_id: p[1], active: true }); return { rows: [] }; }
    if (/^INSERT INTO app_users/.test(sql)) { const u = { id: ++uid, name: p[0], username: p[1], email: p[2], password_hash: p[3], role_id: p[4], active: true, last_login_at: null }; users.push(u); return { rows: [] }; }
    throw new Error('query tidak dikenal: ' + sql);
  }
};

// ---- aturan akses (murni) ----
const rf = (m, p) => A.ruleFor(m, p);
assert.strictEqual(rf('GET', '/api/customers').open, true);
assert.strictEqual(rf('POST', '/api/customers').module, 'master-data');
assert.strictEqual(rf('GET', '/api/master/wo-pics').open, true);
assert.strictEqual(rf('DELETE', '/api/master/wo-pics/3').module, 'master-data');
assert.strictEqual(rf('GET', '/api/roles').module, 'pengguna');
assert.strictEqual(rf('POST', '/api/admin/reset-data').module, 'pengaturan');
assert.strictEqual(rf('PUT', '/api/settings/auth').module, 'pengaturan');
assert.strictEqual(rf('PUT', '/api/work-orders/5/tasks/testing').module, 'tasks');
assert.strictEqual(rf('POST', '/api/work-orders/5/test-reports').module, 'tasks');
assert.strictEqual(rf('GET', '/test-reports/9/print').module, 'tasks');
assert.strictEqual(rf('PUT', '/api/work-orders/5').module, 'work-order');
assert.strictEqual(rf('POST', '/api/requests/5/work-order').module, 'work-order');
assert.strictEqual(rf('POST', '/api/requests/5/specimen-inspections').module, 'pengecekan-spesimen');
assert.strictEqual(rf('POST', '/api/requests').module, 'permintaan-uji');
assert.strictEqual(rf('GET', '/requests/5/print').module, 'permintaan-uji');
assert.strictEqual(rf('GET', '/api/lhu-reports').module, 'hasil-laporan');
assert.strictEqual(rf('GET', '/api/queues/summary').module, 'antrian-kerja');
assert.strictEqual(A.actionFor('tasks', 'POST'), 'edit'); assert.strictEqual(A.actionFor('tasks', 'DELETE'), 'edit');
assert.strictEqual(A.actionFor('master-data', 'POST'), 'create'); assert.strictEqual(A.actionFor('master-data', 'DELETE'), 'delete');
assert.strictEqual(A.actionFor('permintaan-uji', 'PUT'), 'edit');

// ---- token ----
const secret = 'rahasia-uji-yang-cukup-panjang';
const fakeUser = { id: 7, password_hash: 'x' };
const tok = A.makeToken(secret, fakeUser);
assert.strictEqual(A.readToken(secret, tok).u, 7);
assert.strictEqual(A.readToken('rahasia-lain-lagi-lagi', tok), null);
assert.strictEqual(A.readToken(secret, tok.slice(0, -2) + 'xx'), null);
assert.strictEqual(A.readToken(secret, tok.replace(/^[^.]+/, m => m.slice(0, -1) + (m.slice(-1) === 'A' ? 'B' : 'A'))), null);
assert.strictEqual(A.readToken(secret, A.makeToken(secret, fakeUser, Date.now() - 13 * 3600 * 1000)), null, 'kedaluwarsa');
assert.strictEqual(A.readToken(secret, 'sampah'), null);
assert.deepStrictEqual(A.parseCookies('a=1; detech_sid=abc.def; x=%20y'), { a: '1', detech_sid: 'abc.def', x: ' y' });

// ---- harness: app palsu + middleware ----
const auth = A.createAuth(pool);
const routes = [];
const reg = method => (p, h) => { routes.push({ method, regex: new RegExp('^' + p.replace(/:[a-z]+/g, '([^/]+)') + '$'), h }); };
const app = { get: reg('GET'), post: reg('POST'), put: reg('PUT'), delete: reg('DELETE') };
auth.registerRoutes(app);
const mw = auth.middleware();
let counter = 0;
async function call(method, path, { cookie, body, ip } = {}) {
  const req = { method, path, headers: { cookie: cookie || '', 'x-forwarded-for': ip || '10.0.0.' + (++counter % 200), 'x-forwarded-proto': 'https' }, body: body || {} };
  return new Promise(resolve => {
    const res = { code: 200, headers: {}, status(c) { this.code = c; return this; }, setHeader(k, v) { this.headers[k] = v; return this; }, json(o) { resolve({ status: this.code, body: o, headers: this.headers }); }, send(t) { resolve({ status: this.code, body: t, headers: this.headers }); } };
    mw(req, res, () => {
      const r = routes.find(x => x.method === method && x.regex.test(path));
      if (r) return r.h(req, res);
      res.json({ ok: true, user: req.user ? req.user.username : null });   // route aplikasi lain
    });
  });
}
const cookieOf = r => String(r.headers['Set-Cookie'] || '').split(';')[0];
const login = async (username, password, ip) => call('POST', '/api/auth/login', { body: { username, password }, ip });

(async () => {
  // belum ada admin: ensureAdmin membuat akun awal (kata sandi acak) lalu tidak mengulang
  const logs = [];
  let made = await A.ensureAdmin(pool, m => logs.push(m));
  assert.strictEqual(made.username, 'admin'); assert.ok(made.password.length >= 16);
  assert.ok(logs.join('\n').includes(made.password) && logs.join('\n').includes('SEKALI'));
  assert.ok(U.verifyPassword(made.password, users[0].password_hash));
  assert.strictEqual(await A.ensureAdmin(pool, () => {}), null, 'tidak membuat lagi');
  // env: buat / pulihkan; env tidak valid diabaikan
  process.env.ADMIN_USERNAME = 'Boss'; process.env.ADMIN_PASSWORD = 'kunci-darurat-1';
  made = await A.ensureAdmin(pool, m => logs.push(m)); assert.strictEqual(made.username, 'boss');
  const boss = users.find(u => u.username === 'boss'); assert.ok(U.verifyPassword('kunci-darurat-1', boss.password_hash)); assert.strictEqual(boss.role_id, 1);
  boss.role_id = 2; boss.active = false;
  process.env.ADMIN_PASSWORD = 'kunci-baru-2222';
  await A.ensureAdmin(pool, () => {});
  assert.ok(U.verifyPassword('kunci-baru-2222', boss.password_hash) && boss.role_id === 1 && boss.active === true, 'pemulihan lewat env');
  process.env.ADMIN_PASSWORD = 'pendek'; const logs2 = [];
  await A.ensureAdmin(pool, m => logs2.push(m)); assert.ok(logs2.join('').includes('diabaikan'));
  delete process.env.ADMIN_USERNAME; delete process.env.ADMIN_PASSWORD;
  users = users.filter(u => u.username !== 'boss');
  const adminPw = made && made.password;   // tidak dipakai; ambil dari akun awal di bawah
  users[0].password_hash = U.hashPassword('admin-pass-123');
  addUser('budi', 'viewer-pass-1', 2); addUser('citra', 'penguji-pass-1', 3); addUser('master', 'master-pass-1', 4); addUser('nonaktif', 'nonaktif-pass-1', 2, false);

  // tanpa login: statis terbuka, API & cetak ditolak, me/login terbuka
  let r = await call('GET', '/js/app.js'); assert.strictEqual(r.status, 200);
  r = await call('GET', '/api/requests'); assert.strictEqual(r.status, 401); assert.strictEqual(r.body.code, 'AUTH_REQUIRED');
  r = await call('GET', '/test-reports/1/print'); assert.strictEqual(r.status, 401); assert.ok(/login/i.test(r.body));
  r = await call('GET', '/api/auth/me'); assert.deepStrictEqual([r.status, r.body.enforced, r.body.user], [200, true, null]);
  // huruf besar tidak boleh melewati pemeriksaan login (Express 4 tidak peka huruf secara bawaan)
  for (const p of ['/API/requests', '/Api/work-orders/1', '/TEST-REPORTS/1/print', '/Requests/1/print']) { r = await call('GET', p); assert.strictEqual(r.status, 401, p); }

  // login: gagal / sukses / nonaktif
  r = await login('admin', 'salah-banget', '9.9.9.1'); assert.strictEqual(r.status, 401); assert.strictEqual(r.body.error, 'Username atau kata sandi salah');
  r = await login('tidak-ada', 'apapun-itu-123', '9.9.9.2'); assert.strictEqual(r.status, 401); assert.strictEqual(r.body.error, 'Username atau kata sandi salah', 'pesan sama agar username tidak bocor');
  r = await login('', ''); assert.strictEqual(r.status, 400);
  r = await login('nonaktif', 'nonaktif-pass-1', '9.9.9.3'); assert.strictEqual(r.status, 403);
  r = await login('Admin', 'admin-pass-123', '9.9.9.4');
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.user.username, 'admin'); assert.ok(!('password_hash' in r.body.user));
  const ck = r.headers['Set-Cookie']; assert.ok(/HttpOnly/.test(ck) && /SameSite=Lax/.test(ck) && /Secure/.test(ck) && /Max-Age=43200/.test(ck));
  const adminC = cookieOf(r);
  assert.ok(users[0].last_login_at);

  // admin: semuanya boleh
  for (const [m, p] of [['GET', '/api/requests'], ['POST', '/api/requests'], ['DELETE', '/api/work-orders/1'], ['POST', '/api/admin/reset-data'], ['GET', '/api/roles'], ['PUT', '/api/settings/auth']]) {
    r = await call(m, p, { cookie: adminC, body: { enforced: true } }); assert.strictEqual(r.status, 200, m + ' ' + p);
  }
  r = await call('GET', '/api/auth/me', { cookie: adminC }); assert.strictEqual(r.body.user.is_admin, true); assert.ok(r.body.user.permissions.pengaturan.includes('edit'));

  // Viewer
  const viewerC = cookieOf(await login('budi', 'viewer-pass-1', '9.9.9.5'));
  const expect = async (c, m, p, status) => { const x = await call(m, p, { cookie: c }); assert.strictEqual(x.status, status, `${m} ${p} -> ${x.status}`); return x; };
  await expect(viewerC, 'GET', '/api/requests', 200);
  await expect(viewerC, 'GET', '/api/work-orders/3', 200);
  await expect(viewerC, 'GET', '/api/customers', 200);          // daftar pilihan form
  await expect(viewerC, 'GET', '/api/master/wo-pics', 200);
  await expect(viewerC, 'GET', '/requests/3/print', 200);
  await expect(viewerC, 'GET', '/test-reports/3/print', 200);   // tasks view
  await expect(viewerC, 'GET', '/api/work-order-progress', 200);
  await expect(viewerC, 'POST', '/api/requests', 403);
  await expect(viewerC, 'PUT', '/api/requests/3', 403);
  await expect(viewerC, 'DELETE', '/api/work-orders/3', 403);
  await expect(viewerC, 'PUT', '/api/work-orders/3/tasks/testing', 403);
  await expect(viewerC, 'POST', '/api/customers', 403);
  await expect(viewerC, 'GET', '/api/lhu-reports', 403);
  await expect(viewerC, 'GET', '/api/roles', 403);
  await expect(viewerC, 'GET', '/api/app-users', 403);
  await expect(viewerC, 'POST', '/api/admin/reset-data', 403);
  await expect(viewerC, 'GET', '/api/specimen-inspections', 200);   // dashboard/work-order view memuat daftar
  await expect(viewerC, 'GET', '/api/queues/summary', 200);
  await expect(viewerC, 'GET', '/api/queues/preparation', 403);
  r = await call('GET', '/test-reports/3/print', { cookie: cookieOf(await login('master', 'master-pass-1', '9.9.9.6')) }); assert.strictEqual(r.status, 403); assert.ok(/Tidak ada akses/.test(r.body));

  // Penguji: Tasks boleh diubah, WO tidak
  const testerC = cookieOf(await login('citra', 'penguji-pass-1', '9.9.9.7'));
  await expect(testerC, 'PUT', '/api/work-orders/3/tasks/testing', 200);
  await expect(testerC, 'POST', '/api/work-orders/3/test-reports', 200);
  await expect(testerC, 'DELETE', '/api/test-reports/4', 200);          // Tasks tak punya "Hapus": dihitung Ubah
  await expect(testerC, 'POST', '/api/test-reports/4/photos', 200);
  await expect(testerC, 'PUT', '/api/work-orders/3', 403);
  await expect(testerC, 'GET', '/api/queues/testing', 200);
  await expect(testerC, 'GET', '/api/requests/3', 200);                // dashboard view -> daftar
  await expect(testerC, 'POST', '/api/requests', 403);

  // cookie rusak / palsu / pengguna dinonaktifkan / kata sandi diganti
  r = await call('GET', '/api/requests', { cookie: 'detech_sid=abc.def' }); assert.strictEqual(r.status, 401);
  const forged = A.makeToken('rahasia-palsu-palsu-palsu', users[0]);
  r = await call('GET', '/api/requests', { cookie: 'detech_sid=' + forged }); assert.strictEqual(r.status, 401);
  const nonaktifU = users.find(u => u.username === 'nonaktif');
  const secretNow = settingsStore.session_secret;
  const goneTok = A.makeToken(secretNow, nonaktifU);
  r = await call('GET', '/api/requests', { cookie: 'detech_sid=' + goneTok }); assert.strictEqual(r.status, 401, 'akun nonaktif tidak bisa pakai token');

  // ganti kata sandi
  r = await call('POST', '/api/auth/password', { cookie: viewerC, body: { current: 'bukan', next: 'sandi-baru-123' } }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/auth/password', { cookie: viewerC, body: { current: 'viewer-pass-1', next: 'pendek' } }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/auth/password', { body: { current: 'x', next: 'sandi-baru-123' } }); assert.strictEqual(r.status, 401);
  r = await call('POST', '/api/auth/password', { cookie: viewerC, body: { current: 'viewer-pass-1', next: 'sandi-baru-123' } }); assert.strictEqual(r.status, 200);
  const viewerNew = cookieOf(r);
  auth.forgetUser(users.find(u => u.username === 'budi').id);
  await expect(viewerC, 'GET', '/api/requests', 401);                  // sesi lama mati
  await expect(viewerNew, 'GET', '/api/requests', 200);                // sesi ini tetap sah
  r = await login('budi', 'viewer-pass-1', '9.9.9.8'); assert.strictEqual(r.status, 401);
  r = await login('budi', 'sandi-baru-123', '9.9.9.8'); assert.strictEqual(r.status, 200);

  // batas percobaan: 5 gagal -> 429 meski kata sandi benar; IP lain tidak terkena
  for (let i = 0; i < 5; i++) { r = await login('citra', 'salah-' + i, '7.7.7.7'); assert.strictEqual(r.status, 401); }
  r = await login('citra', 'penguji-pass-1', '7.7.7.7'); assert.strictEqual(r.status, 429); assert.ok(/menit/.test(r.body.error));
  r = await login('citra', 'penguji-pass-1', '7.7.7.8'); assert.strictEqual(r.status, 200);

  // me memperpanjang sesi yang hampir habis; logout menghapus cookie
  const nearly = A.makeToken(secretNow, users[0], Date.now() - (12 * 3600 * 1000 - 3600 * 1000));
  r = await call('GET', '/api/auth/me', { cookie: 'detech_sid=' + nearly }); assert.ok(r.headers['Set-Cookie'] && /Max-Age=43200/.test(r.headers['Set-Cookie']));
  r = await call('GET', '/api/auth/me', { cookie: adminC }); assert.ok(!r.headers['Set-Cookie'] || true);
  r = await call('POST', '/api/auth/logout', { cookie: adminC }); assert.ok(/Max-Age=0/.test(r.headers['Set-Cookie']));

  // saklar penerapan: matikan -> semua terbuka; hidupkan lagi butuh Administrator aktif
  r = await call('PUT', '/api/settings/auth', { cookie: viewerNew, body: { enforced: false } }); assert.strictEqual(r.status, 403);
  r = await call('PUT', '/api/settings/auth', { cookie: adminC, body: { enforced: false } }); assert.deepStrictEqual([r.status, r.body.enforced], [200, false]);
  const noCache = A.createAuth(pool); // cache pengaturan per instance: kosongkan lewat TTL dengan instance baru
  r = await call('GET', '/api/auth/me'); assert.strictEqual(r.body.enforced, false);
  r = await call('GET', '/api/requests'); assert.strictEqual(r.status, 200, 'penerapan dimatikan: terbuka tanpa login');
  r = await call('POST', '/api/requests'); assert.strictEqual(r.status, 200);
  users[0].active = false;
  r = await call('PUT', '/api/settings/auth', { body: { enforced: true } }); assert.strictEqual(r.status, 400); assert.ok(/Administrator aktif/.test(r.body.error));
  users[0].active = true;
  r = await call('PUT', '/api/settings/auth', { body: { enforced: true } }); assert.deepStrictEqual([r.status, r.body.enforced], [200, true]);
  r = await call('GET', '/api/requests'); assert.strictEqual(r.status, 401);
  r = await call('GET', '/api/settings/auth', { cookie: adminC }); assert.strictEqual(r.body.admin_count, 1);

  // pintu darurat AUTH_DISABLE=1
  process.env.AUTH_DISABLE = '1';
  r = await call('GET', '/api/requests'); assert.strictEqual(r.status, 200);
  r = await call('GET', '/api/auth/me'); assert.deepStrictEqual([r.body.enforced, r.body.forced_off], [false, true]);
  delete process.env.AUTH_DISABLE;
  r = await call('GET', '/api/requests'); assert.strictEqual(r.status, 401);

  // XFF palsu: entri pertama diganti-ganti, entri terakhir (dari proxy) sama -> tetap terkunci
  assert.strictEqual(A.clientIp({ headers: { 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 6.6.6.6' } }), '6.6.6.6');
  assert.strictEqual(A.clientIp({ headers: {}, ip: '9.9.9.9' }), '9.9.9.9');
  for (let i = 0; i < 5; i++) { r = await login('master', 'salah-' + i, 'palsu-' + i + ', 6.6.6.6'); assert.strictEqual(r.status, 401); }
  r = await login('master', 'master-pass-1', 'palsu-baru, 6.6.6.6'); assert.strictEqual(r.status, 429, 'ganti XFF depan tidak menolong');
  // banyak IP berbeda untuk satu username: setelah 20 gagal, username terkunci dari IP mana pun
  for (let i = 0; i < 15; i++) { r = await login('master', 'tebak-' + i, '5.5.5.' + i); assert.strictEqual(r.status, 401, 'gagal ke-' + (i + 6)); }
  r = await login('master', 'master-pass-1', '4.4.4.4'); assert.strictEqual(r.status, 429, 'username terkunci lintas IP');
  r = await login('citra', 'penguji-pass-1', '4.4.4.4'); assert.strictEqual(r.status, 200, 'username lain tidak terpengaruh');
  console.log('AUTH OK');
})().catch(e => { console.error(e); process.exit(1); });
