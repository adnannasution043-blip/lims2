// Master Data > Pola Hardness: validasi susunan titik, sketsa, dan CRUD lewat route (pool palsu).
const assert = require('assert');
const { registerHardnessPatternRoutes, sanitizePatternSnapshot, cleanLayout } = require('../lib/hardnessPatterns');

// ---- validasi susunan ----
assert.deepStrictEqual(cleanLayout({ lines: ['', 'Root'], zones: [{ name: 'BM', points: '3' }, { name: 'x', points: 0 }] }),
  { lines: ['Line 1', 'Root'], zones: [{ name: 'BM', points: 3 }], total: 3 });
assert.ok(cleanLayout({ lines: ['A'], zones: [{ name: 'Z', points: 16 }] }).error, 'lebih dari 15 titik ditolak');
assert.ok(cleanLayout({ lines: [], zones: [{ name: 'Z', points: 2 }] }).error, 'tanpa line ditolak');
assert.strictEqual(cleanLayout({ lines: ['1', '2', '3', '4'], zones: [{ points: 1 }] }).lines.length, 3, 'maks. 3 line');
const png = 'data:image/png;base64,iVBORw0KGgo=';
assert.strictEqual(sanitizePatternSnapshot({ name: 'P', kind: 'material', lines: ['L'], zones: [{ points: 5 }], sketch: png }).sketch, png);
assert.strictEqual(sanitizePatternSnapshot({ name: 'P', lines: ['L'], zones: [{ points: 5 }], sketch: 'javascript:x' }).sketch, '');
assert.strictEqual(sanitizePatternSnapshot({ name: 'P', kind: 'evil', lines: ['L'], zones: [{ points: 5 }] }).kind, 'weld');
assert.strictEqual(sanitizePatternSnapshot(null), null);

// ---- route CRUD ----
const rows = [];
let seq = 0;
const pool = {
  async query(sql, params) {
    if (/^SELECT .* FROM hardness_patterns ORDER BY/s.test(sql)) return { rows: rows.map(({ sketch_image, ...r }) => ({ ...r, has_sketch: !!sketch_image })) };
    if (/^SELECT .*FROM hardness_patterns WHERE id = \$1/s.test(sql)) return { rows: rows.filter(r => r.id === Number(params[0])).map(r => ({ ...r, has_sketch: !!r.sketch_image })) };
    if (/^INSERT INTO hardness_patterns/.test(sql)) {
      if (rows.some(r => r.name === params[0])) { const e = new Error('dup'); e.code = '23505'; throw e; }
      const r = { id: ++seq, name: params[0], kind: params[1], customer: params[2], lines: params[3], zones: params[4], notes: params[5], sketch_image: params[6] };
      rows.push(r);
      return { rows: [r] };
    }
    if (/^UPDATE hardness_patterns/.test(sql)) {
      const r = rows.find(x => x.id === Number(params[8]));
      if (!r) return { rows: [] };
      Object.assign(r, { name: params[0], kind: params[1], customer: params[2], lines: params[3], zones: params[4], notes: params[5] });
      if (params[6]) r.sketch_image = params[7];
      return { rows: [r] };
    }
    if (/^DELETE FROM hardness_patterns/.test(sql)) { const n = rows.length; rows.splice(rows.findIndex(r => r.id === Number(params[0])), 1); return { rowCount: n - rows.length }; }
    throw new Error('unexpected sql ' + sql);
  }
};
const routes = {};
const app = {};
['get', 'post', 'put', 'delete'].forEach(m => { app[m] = (path, h) => { routes[m.toUpperCase() + ' ' + path] = h; }; });
registerHardnessPatternRoutes(app, { pool });
const call = (key, params, body) => new Promise(resolve => {
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(o) { resolve({ status: this.statusCode, body: o }); } };
  routes[key]({ params: params || {}, body, query: {} }, res);
});

(async () => {
  const zones = [{ name: 'Base Metal', points: 3 }, { name: 'HAZ', points: 3 }, { name: 'Weld Metal', points: 3 }, { name: 'HAZ', points: 3 }, { name: 'Base Metal', points: 3 }];
  let r = await call('POST /api/hardness-patterns', {}, { name: 'Pertamina 3 line', kind: 'weld', customer: 'PT Pertamina', lines: ['Cap', 'Mid', 'Root'], zones, sketch: png });
  assert.strictEqual(r.status, 201);
  const id = r.body.id;
  assert.deepStrictEqual(r.body.lines, ['Cap', 'Mid', 'Root']);
  assert.strictEqual(r.body.zones.length, 5);
  assert.strictEqual((await call('POST /api/hardness-patterns', {}, { name: 'Pertamina 3 line', lines: ['A'], zones })).status, 400, 'nama kembar');
  assert.strictEqual((await call('POST /api/hardness-patterns', {}, { name: '', lines: ['A'], zones })).status, 400, 'nama wajib');
  assert.strictEqual((await call('POST /api/hardness-patterns', {}, { name: 'X', lines: ['A'], zones: [...zones, { name: 'Y', points: 1 }] })).status, 400, '16 titik');
  assert.strictEqual((await call('POST /api/hardness-patterns', {}, { name: 'X', lines: ['A'], zones, sketch: 'data:text/html;base64,AA==' })).status, 400, 'sketsa bukan gambar');

  r = await call('GET /api/hardness-patterns/:id', { id: String(id) });
  assert.strictEqual(r.body.sketch, png);
  assert.ok(!('sketch_image' in r.body));
  // ubah tanpa mengirim sketch -> sketsa tetap; kirim '' -> sketsa dihapus
  r = await call('PUT /api/hardness-patterns/:id', { id: String(id) }, { name: 'Pertamina 3 line', kind: 'weld', lines: ['Cap', 'Root'], zones });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(rows[0].sketch_image, png);
  await call('PUT /api/hardness-patterns/:id', { id: String(id) }, { name: 'Pertamina 3 line', lines: ['Cap'], zones, sketch: '' });
  assert.strictEqual(rows[0].sketch_image, null);
  r = await call('GET /api/hardness-patterns', {});
  assert.strictEqual(r.body.items.length, 1);
  assert.strictEqual(r.body.items[0].has_sketch, false);
  assert.strictEqual((await call('DELETE /api/hardness-patterns/:id', { id: String(id) })).status, 200);
  assert.strictEqual((await call('DELETE /api/hardness-patterns/:id', { id: String(id) })).status, 404);
  console.log('HARDNESS PATTERNS OK');
})().catch(e => { console.error(e); process.exit(1); });
