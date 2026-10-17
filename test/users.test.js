const assert = require('assert');
const http = require('http');
const ROOT = require('path').join(__dirname, '..') + '/';
const U = require(ROOT + 'lib/users.js');

// ---- fungsi murni ----
const h = U.hashPassword('rahasia123');
assert.ok(h.startsWith('scrypt$'));
assert.ok(U.verifyPassword('rahasia123', h));
assert.ok(!U.verifyPassword('salah', h));
assert.ok(!U.verifyPassword('x', ''));
assert.notStrictEqual(U.hashPassword('rahasia123'), h, 'salt harus acak');

const sp = U.sanitizePermissions({
  'work-order': ['view', 'edit', 'bogus'], dashboard: ['view', 'delete'], tasks: ['edit'],   // tasks tanpa view -> dibuang
  'tidak-ada': ['view'], pengaturan: 'view'
});
assert.deepStrictEqual(sp, { 'work-order': ['view', 'edit'], dashboard: ['view'] });
assert.deepStrictEqual(U.sanitizePermissions(null), {});
assert.strictEqual(U.DEFAULT_ROLES[0].name, 'Administrator');
assert.ok(U.DEFAULT_ROLES[0].is_system);
U.DEFAULT_ROLES.forEach(r => assert.deepStrictEqual(U.sanitizePermissions(r.permissions), r.permissions, 'seed role valid: ' + r.name));

// ---- pool palsu ----
let roles = [], users = [], rid = 0, uid = 0;
const dup = () => Object.assign(new Error('dup'), { code: '23505' });
const pool = {
  query: async (sql, p = []) => {
    sql = sql.replace(/\s+/g, ' ').trim();
    if (/^SELECT r\.id, r\.name, r\.description/.test(sql)) return { rows: roles.map(r => ({ ...r, user_count: String(users.filter(u => u.role_id === r.id).length) })) };
    if (/^INSERT INTO roles/.test(sql)) {
      if (roles.some(r => r.name === p[0])) throw dup();
      const r = { id: ++rid, name: p[0], description: p[1], permissions: JSON.parse(p[2]), is_system: false, created_at: 'x' }; roles.push(r); return { rows: [r] };
    }
    if (/^SELECT id, name, is_system FROM roles/.test(sql)) return { rows: roles.filter(r => r.id === Number(p[0])) };
    if (/^UPDATE roles SET/.test(sql)) {
      const r = roles.find(x => x.id === Number(p[3]));
      if (roles.some(x => x.name === p[0] && x.id !== r.id)) throw dup();
      Object.assign(r, { name: p[0], description: p[1], permissions: JSON.parse(p[2]) }); return { rows: [r] };
    }
    if (/^SELECT COUNT\(\*\) AS n FROM app_users WHERE role_id/.test(sql)) return { rows: [{ n: String(users.filter(u => u.role_id === Number(p[0])).length) }] };
    if (/^DELETE FROM roles/.test(sql)) { roles = roles.filter(r => r.id !== Number(p[0])); return { rows: [] }; }
    if (/^SELECT id FROM roles WHERE id/.test(sql)) return { rows: roles.filter(r => r.id === Number(p[0])).map(r => ({ id: r.id })) };
    if (/^SELECT id, is_system FROM roles WHERE id/.test(sql)) return { rows: roles.filter(r => r.id === Number(p[0])) };
    if (/^SELECT COUNT\(\*\) AS n FROM app_users u JOIN roles r/.test(sql)) {
      return { rows: [{ n: String(users.filter(u => roles.find(r => r.id === u.role_id).is_system && u.active && u.id !== Number(p[0])).length) }] };
    }
    if (/^SELECT u\.id, u\.active, r\.is_system FROM app_users/.test(sql)) {
      const u = users.find(x => x.id === Number(p[0])); return { rows: u ? [{ id: u.id, active: u.active, is_system: roles.find(r => r.id === u.role_id).is_system }] : [] };
    }
    if (/^SELECT u\.id, u\.name.*WHERE u\.id = \$1/.test(sql)) {
      const u = users.find(x => x.id === Number(p[0])); const { password_hash, ...rest } = u; return { rows: [{ ...rest, role_name: roles.find(r => r.id === u.role_id).name }] };
    }
    if (/^SELECT u\.id, u\.name/.test(sql)) return { rows: users.map(({ password_hash, ...u }) => ({ ...u, role_name: roles.find(r => r.id === u.role_id).name })) };
    if (/^INSERT INTO app_users/.test(sql)) {
      if (users.some(u => u.username === p[1])) throw dup();
      const u = { id: ++uid, name: p[0], username: p[1], email: p[2], password_hash: p[3], role_id: Number(p[4]), active: p[5] }; users.push(u); return { rows: [{ id: u.id }] };
    }
    if (/^UPDATE app_users SET/.test(sql)) {
      const u = users.find(x => x.id === Number(p[p.length - 1]));
      if (users.some(x => x.username === p[1] && x.id !== u.id)) throw dup();
      Object.assign(u, { name: p[0], username: p[1], email: p[2], role_id: Number(p[3]), active: p[4] });
      if (/password_hash/.test(sql)) u.password_hash = p[5];
      return { rows: [] };
    }
    if (/^DELETE FROM app_users/.test(sql)) { users = users.filter(u => u.id !== Number(p[0])); return { rows: [] }; }
    throw new Error('query tidak dikenal: ' + sql);
  }
};

// seed seperti initSchema
U.DEFAULT_ROLES.forEach(r => roles.push({ id: ++rid, name: r.name, description: r.description, permissions: r.permissions, is_system: r.is_system, created_at: 'x' }));
const adminId = roles[0].id, viewerId = roles.find(r => r.name === 'Viewer').id;

// "app" minimal: daftar route + server http (tanpa express)
const routes = [];
const reg = method => (p, ...handlers) => {
  const keys = [];
  const regex = new RegExp('^' + p.replace(/:([a-z]+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  routes.push({ method, regex, keys, handler: handlers[handlers.length - 1] });
};
const app = { get: reg('GET'), put: reg('PUT'), post: reg('POST'), delete: reg('DELETE') };
U.registerUserRoutes(app, { pool });
app.listen = (port, cb) => {
  const srv = http.createServer((req, res) => {
    const chunks = []; req.on('data', c => chunks.push(c));
    req.on('end', async () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {};
      for (const r of routes) {
        const m = r.method === req.method && r.regex.exec(req.url.split('?')[0]);
        if (!m) continue;
        const params = {}; r.keys.forEach((k, i) => { params[k] = m[i + 1]; });
        const out = { code: 200, status(c) { this.code = c; return this; }, json(o) { res.writeHead(this.code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); } };
        return r.handler({ params, body, query: {} }, out);
      }
      res.writeHead(404); res.end('{}');
    });
  });
  return srv.listen(port, cb);
};

(async () => {
  const srv = await new Promise(ok => { const s = app.listen(0, () => ok(s)); });
  const base = 'http://127.0.0.1:' + srv.address().port;
  const call = async (method, path, body) => {
    const r = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    return { status: r.status, body: await r.json() };
  };

  let r = await call('GET', '/api/roles');
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.modules.length, U.PERMISSION_MODULES.length);
  assert.strictEqual(r.body.roles.length, U.DEFAULT_ROLES.length);
  assert.strictEqual(r.body.roles[0].user_count, 0);

  // role baru
  r = await call('POST', '/api/roles', { name: '' }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/roles', { name: 'QA', description: 'Quality', permissions: { 'work-order': ['view', 'edit'], tasks: ['edit'] } });
  assert.strictEqual(r.status, 201); assert.deepStrictEqual(r.body.permissions, { 'work-order': ['view', 'edit'] });
  const qaId = r.body.id;
  r = await call('POST', '/api/roles', { name: 'QA' }); assert.strictEqual(r.status, 400); assert.match(r.body.error, /sudah dipakai/);

  // Administrator terkunci
  r = await call('PUT', '/api/roles/' + adminId, { name: 'Hacked', permissions: {} });
  assert.strictEqual(r.body.name, 'Administrator'); assert.deepStrictEqual(r.body.permissions, U.allPermissions());
  r = await call('DELETE', '/api/roles/' + adminId); assert.strictEqual(r.status, 400); assert.match(r.body.error, /bawaan sistem/);
  r = await call('PUT', '/api/roles/9999', { name: 'x' }); assert.strictEqual(r.status, 404);

  // pengguna: validasi
  const good = { name: 'Budi Santoso', username: 'Budi.S', email: 'budi@detech.co.id', password: 'password123', role_id: viewerId };
  r = await call('POST', '/api/app-users', { ...good, name: '' }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/app-users', { ...good, username: 'a b' }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/app-users', { ...good, email: 'bukan-email' }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/app-users', { ...good, password: 'pendek' }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/app-users', { ...good, role_id: null }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/app-users', { ...good, role_id: 9999 }); assert.strictEqual(r.status, 400);

  r = await call('POST', '/api/app-users', good);
  assert.strictEqual(r.status, 201); assert.strictEqual(r.body.username, 'budi.s'); assert.strictEqual(r.body.role_name, 'Viewer');
  assert.ok(!('password_hash' in r.body), 'hash tidak boleh bocor');
  assert.ok(U.verifyPassword('password123', users[0].password_hash));
  const budiId = r.body.id;
  r = await call('POST', '/api/app-users', good); assert.strictEqual(r.status, 400); assert.match(r.body.error, /Username sudah/);

  r = await call('GET', '/api/app-users'); assert.strictEqual(r.body.items.length, 1); assert.ok(!('password_hash' in r.body.items[0]));

  // edit: tanpa password -> hash tetap; dengan password -> berganti
  const oldHash = users[0].password_hash;
  r = await call('PUT', '/api/app-users/' + budiId, { ...good, password: '', name: 'Budi S.', role_id: qaId });
  assert.strictEqual(r.status, 200); assert.strictEqual(r.body.role_name, 'QA'); assert.strictEqual(users[0].password_hash, oldHash);
  r = await call('PUT', '/api/app-users/' + budiId, { ...good, password: 'barubaru99', role_id: qaId });
  assert.ok(U.verifyPassword('barubaru99', users[0].password_hash));
  r = await call('PUT', '/api/app-users/' + budiId, { ...good, password: 'pendek' }); assert.strictEqual(r.status, 400);

  // role yang dipakai tidak boleh dihapus
  r = await call('DELETE', '/api/roles/' + qaId); assert.strictEqual(r.status, 400); assert.match(r.body.error, /masih dipakai 1 pengguna/);
  let roleList = await call('GET', '/api/roles'); assert.strictEqual(roleList.body.roles.find(x => x.id === qaId).user_count, 1);

  // Administrator terakhir dilindungi
  r = await call('POST', '/api/app-users', { name: 'Admin', username: 'admin', password: 'adminadmin', role_id: adminId });
  const admin1 = r.body.id; assert.strictEqual(r.status, 201);
  r = await call('PUT', '/api/app-users/' + admin1, { name: 'Admin', username: 'admin', role_id: viewerId });
  assert.strictEqual(r.status, 400); assert.match(r.body.error, /minimal satu Administrator/);
  r = await call('PUT', '/api/app-users/' + admin1, { name: 'Admin', username: 'admin', role_id: adminId, active: false });
  assert.strictEqual(r.status, 400);
  r = await call('DELETE', '/api/app-users/' + admin1); assert.strictEqual(r.status, 400);
  // setelah ada admin kedua, boleh
  r = await call('POST', '/api/app-users', { name: 'Admin2', username: 'admin2', password: 'adminadmin', role_id: adminId });
  r = await call('DELETE', '/api/app-users/' + admin1); assert.strictEqual(r.status, 200);

  // hapus pengguna lalu role kosong boleh dihapus
  r = await call('DELETE', '/api/app-users/' + budiId); assert.strictEqual(r.status, 200);
  r = await call('DELETE', '/api/roles/' + qaId); assert.strictEqual(r.status, 200);
  r = await call('DELETE', '/api/app-users/9999'); assert.strictEqual(r.status, 404);

  srv.close();
  console.log('USERS OK');
})().catch(e => { console.error(e); process.exit(1); });
