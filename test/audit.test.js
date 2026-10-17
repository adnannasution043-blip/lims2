const assert = require('assert');
const { EventEmitter } = require('events');
const ROOT = require('path').join(__dirname, '..') + '/';
const { auditTrail, registerAuditRoutes } = require(ROOT + 'lib/audit.js');
const A = require(ROOT + 'lib/auth.js');

const log = [];
const pool = {
  async query(sql, p = []) {
    sql = sql.replace(/\s+/g, ' ').trim();
    if (/^INSERT INTO audit_log/.test(sql)) { log.push({ id: log.length + 1, user_id: p[0], username: p[1], method: p[2], path: p[3], status: p[4], ip: p[5] }); return { rows: [] }; }
    if (/^SELECT id, at, username, method, path, status, ip FROM audit_log WHERE username ILIKE \$1 OR path ILIKE \$1/.test(sql)) {
      const q = p[0].replace(/%/g, '').toLowerCase();
      return { rows: log.filter(l => l.username.toLowerCase().includes(q) || l.path.toLowerCase().includes(q)).reverse().slice(0, p[1]) };
    }
    if (/^SELECT id, at, username, method, path, status, ip FROM audit_log ORDER BY id DESC LIMIT \$1/.test(sql)) return { rows: log.slice().reverse().slice(0, p[0]) };
    throw new Error('query tidak dikenal: ' + sql);
  }
};

const mw = auditTrail(pool);
const fire = (req, status) => new Promise(resolve => {
  const res = new EventEmitter(); res.statusCode = 200;
  let nexted = false;
  mw({ headers: { 'x-forwarded-for': 'palsu, 10.1.1.1' }, ...req }, res, () => { nexted = true; });
  assert.ok(nexted, 'selalu lanjut');
  res.statusCode = status; res.emit('finish');
  setImmediate(resolve);
});

(async () => {
  const admin = { id: 1, username: 'admin' };
  await fire({ method: 'PUT', path: '/api/requests/5', user: admin }, 200);
  await fire({ method: 'GET', path: '/api/requests/5', user: admin }, 200);          // baca: tidak dicatat
  await fire({ method: 'POST', path: '/api/auth/login', body: { username: ' Budi ', password: 'rahasia-jangan-dicatat' } }, 401);
  await fire({ method: 'DELETE', path: '/api/test-reports/9', user: admin }, 409);
  await fire({ method: 'POST', path: '/index.html' }, 200);                           // bukan API: tidak dicatat
  await fire({ method: 'PUT', path: '/api/work-orders/3/tasks/testing' }, 200);       // login dimatikan: tanpa pengguna
  assert.strictEqual(log.length, 4);
  assert.deepStrictEqual(log[0], { id: 1, user_id: 1, username: 'admin', method: 'PUT', path: '/api/requests/5', status: 200, ip: '10.1.1.1' });
  assert.deepStrictEqual([log[1].username, log[1].user_id, log[1].status], ['budi', null, 401]);
  assert.ok(!JSON.stringify(log).includes('rahasia'), 'kata sandi tidak pernah dicatat');
  assert.strictEqual(log[2].status, 409);
  assert.deepStrictEqual([log[3].username, log[3].user_id], ['', null]);

  // baca: terbaru dulu, batas, pencarian
  const routes = {};
  registerAuditRoutes({ get: (p, h) => { routes[p] = h; } }, { pool });
  const get = query => new Promise(resolve => routes['/api/audit-log']({ query }, { status() { return this; }, json: resolve }));
  let r = await get({}); assert.strictEqual(r.items[0].path, '/api/work-orders/3/tasks/testing');
  r = await get({ limit: '2' }); assert.strictEqual(r.items.length, 2);
  r = await get({ limit: '99999' }); assert.strictEqual(r.items.length, 4, 'batas maksimum tidak membuat galat');
  r = await get({ q: 'budi' }); assert.deepStrictEqual(r.items.map(i => i.username), ['budi']);
  r = await get({ q: 'test-reports' }); assert.strictEqual(r.items.length, 1);

  // hanya hak Pengaturan yang boleh membaca jejak aktivitas
  assert.strictEqual(A.ruleFor('GET', '/api/audit-log').module, 'pengaturan');
  console.log('AUDIT OK');
})().catch(e => { console.error(e); process.exit(1); });
