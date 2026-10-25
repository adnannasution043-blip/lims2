// Backup database (.sql): urutan tabel menurut foreign key, nilai ter-escape, BYTEA hex, urutan ID, hak akses.
const assert = require('assert');
const { writeDump, orderTables, registerBackupRoutes } = require('../lib/backup');

assert.deepStrictEqual(orderTables(['work_orders', 'test_requests', 'app_users', 'work_order_files'], [
  { child: 'work_orders', parent: 'test_requests' }, { child: 'work_order_files', parent: 'work_orders' }, { child: 'app_users', parent: 'app_users' }
]), ['app_users', 'test_requests', 'work_orders', 'work_order_files']);

const DATA = {
  test_requests: [{ id: '1', company: "PT O'Neil", fields: '{"a": 1}', note: null }, { id: '2', company: 'PT B', fields: '{}', note: 'baris\nbaru' }],
  work_orders: [{ id: '7', test_request_id: '1' }],
  work_order_files: [{ id: '3', work_order_id: '7', data: '89504e47' }]
};
const COLS = [
  ['test_requests', 'id', 'integer', "nextval('test_requests_id_seq'::regclass)"], ['test_requests', 'company', 'text', null],
  ['test_requests', 'fields', 'jsonb', null], ['test_requests', 'note', 'text', null],
  ['work_orders', 'id', 'integer', "nextval('work_orders_id_seq'::regclass)"], ['work_orders', 'test_request_id', 'integer', null],
  ['work_order_files', 'id', 'integer', "nextval('work_order_files_id_seq'::regclass)"], ['work_order_files', 'work_order_id', 'integer', null], ['work_order_files', 'data', 'bytea', null]
].map(([table_name, column_name, data_type, column_default]) => ({ table_name, column_name, data_type, column_default }));

function fakeClient() {
  let cursor = null;
  const log = [];
  return {
    log,
    async query(sql) {
      log.push(sql);
      if (/FROM information_schema.tables/.test(sql)) return { rows: Object.keys(DATA).map(table_name => ({ table_name })) };
      if (/FROM pg_constraint/.test(sql)) return { rows: [{ child: 'work_orders', parent: 'test_requests' }, { child: 'work_order_files', parent: 'work_orders' }] };
      if (/FROM information_schema.columns/.test(sql)) return { rows: COLS };
      const d = /^DECLARE backup_cur NO SCROLL CURSOR FOR SELECT (.*) FROM "([a-z_]+)"$/.exec(sql);
      if (d) { cursor = { rows: DATA[d[2]].slice(), select: d[1] }; return { rows: [] }; }
      if (/^FETCH 200 FROM backup_cur/.test(sql)) { const out = cursor.rows.splice(0, 200); return { rows: out }; }
      if (/^CLOSE backup_cur/.test(sql)) { cursor = null; return { rows: [] }; }
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql)) return { rows: [] };
      throw new Error('unexpected sql ' + sql);
    },
    release() {}
  };
}

(async () => {
  const client = fakeClient();
  let out = '';
  const counts = await writeDump(client, s => { out += s; }, new Date('2026-10-25T03:00:00Z'));
  assert.deepStrictEqual(counts, { test_requests: 2, work_orders: 1, work_order_files: 1 });
  assert.ok(out.includes('-- Dibuat: 2026-10-25 10:00:00 WIB'));
  assert.ok(out.includes('TRUNCATE TABLE "test_requests", "work_orders", "work_order_files" RESTART IDENTITY CASCADE;'));
  assert.ok(out.indexOf('INSERT INTO "test_requests"') < out.indexOf('INSERT INTO "work_orders"'), 'induk lebih dulu');
  assert.ok(out.includes(`('1', 'PT O''Neil', '{"a": 1}', NULL)`), 'tanda kutip di-escape, NULL tetap NULL');
  assert.ok(out.includes("'baris\nbaru'"));
  assert.ok(out.includes(`('3', '7', '\\x89504e47')`), 'BYTEA sebagai hex');
  assert.ok(client.log.some(q => /encode\("data", 'hex'\) AS "data"/.test(q)) && client.log.some(q => /"company"::text AS "company"/.test(q)));
  assert.ok(out.includes(`SELECT setval('work_orders_id_seq', COALESCE((SELECT MAX("id") FROM "work_orders"), 0) + 1, false);`));
  assert.ok(/BEGIN;[\s\S]*COMMIT;\n$/.test(out));

  // route: hanya Administrator
  const routes = {};
  registerBackupRoutes({ get: (p, h) => { routes[p] = h; } }, { pool: { connect: async () => fakeClient(), query: async () => ({ rows: [] }) } });
  const run = user => new Promise(resolve => {
    let body = '';
    const res = { statusCode: 200, headers: {}, headersSent: false, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); },
      setHeader(k, v) { this.headers[k] = v; this.headersSent = true; }, write(s) { body += s; }, end(s) { if (s) body += s; resolve({ status: this.statusCode, body, headers: this.headers }); } };
    routes['/api/admin/backup']({ user, ip: '1.2.3.4' }, res);
  });
  assert.strictEqual((await run({ id: 2, is_admin: false })).status, 403);
  const ok = await run({ id: 1, username: 'admin', is_admin: true });
  assert.strictEqual(ok.status, 200);
  assert.ok(/attachment; filename="detech-lims-backup-\d{8}-\d{4}\.sql"/.test(ok.headers['Content-Disposition']));
  assert.ok(ok.body.includes('INSERT INTO "work_order_files"'));
  console.log('BACKUP OK');
})().catch(e => { console.error(e); process.exit(1); });
